import { prismaRaw as db } from "@/lib/db/prisma";
import type { AuthEventKind } from "@/lib/generated/prisma/enums";
import { reportSecurity } from "@/lib/monitoring/alerts";

/**
 * Оповещения о взломе: правила поверх журнала входов.
 *
 * Журнал (lib/services/auth-events.ts) пишет всё, но смотрят в него только
 * по поводу. Перебор пароля за ночь или вход с нового устройства у владельца
 * замечают через день. Здесь события из журнала проверяются по нескольким
 * простым правилам, и при срабатывании владельцу уходит сообщение
 * (monitoring/alerts.ts, reportSecurity).
 *
 * Правила нарочно простые и читаются с листа. Умные модели «аномалий» на
 * десятке пользователей дают то шум, то тишину; порог «5 неудач за 10 минут»
 * ложно срабатывает редко и всегда объясним.
 *
 * Не бросает и не тормозит вход: вызывается из recordAuthEvent после записи
 * события, уже в фоне.
 */

/** Окно, в котором считаются неудачи. */
export const ALERT_WINDOW_MS = 10 * 60_000;

/** Пороги. Меняются здесь, в одном месте, и сразу видны в тестах. */
export const ALERT_THRESHOLDS = {
  /** Неудач (пароль или код 2FA) на одну учётку или один неизвестный адрес. */
  failsPerAccount: 5,
  /** Неудач с одного IP. */
  failsPerIp: 15,
  /** Разных адресов почты, на которые стучались с одного IP: перебор по списку. */
  distinctAccountsPerIp: 5,
} as const;

/** Роли, чьи действия с доступом важны сами по себе: ключи к агентству. */
const PRIVILEGED_ROLES = ["OWNER", "HEAD"] as const;

const FAILED: AuthEventKind[] = ["LOGIN_FAIL", "TWO_FACTOR_FAIL"];

export type SecurityEventInput = {
  kind: AuthEventKind;
  userId: string | null;
  emailHash: string | null;
  ip: string | null;
  /** Человекочитаемое устройство («Chrome, Windows»); сырой User-Agent сюда не нужен. */
  device: string | null;
  details: Record<string, unknown> | null;
  newDevice: boolean;
};

/** Адрес для письма: только он, чтобы по нему можно было что-то сделать. */
function ipText(ip: string | null): string {
  return ip ?? "неизвестен";
}

async function describeUser(userId: string): Promise<{
  label: string;
  role: string;
  privileged: boolean;
} | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { fullName: true, role: true, organization: { select: { name: true } } },
  });
  if (!user) return null;
  return {
    label: `${user.fullName} (${user.organization.name}, роль ${user.role})`,
    role: user.role,
    privileged: (PRIVILEGED_ROLES as readonly string[]).includes(user.role),
  };
}

async function failuresForAccount(
  userId: string | null,
  emailHash: string | null,
  since: Date,
): Promise<number> {
  const who = [
    ...(userId ? [{ userId }] : []),
    ...(emailHash ? [{ emailHash }] : []),
  ];
  if (who.length === 0) return 0;
  return db.authEvent.count({
    where: {
      kind: { in: FAILED },
      createdAt: { gte: since },
      OR: who,
    },
  });
}

/**
 * Проверить новое событие по правилам. Никогда не бросает.
 *
 * Возвращает список сработавших правил (для тестов); отправка уже сделана.
 */
export async function evaluateSecurityAlerts(event: SecurityEventInput): Promise<string[]> {
  const fired: string[] = [];
  try {
    const now = new Date();
    const since = new Date(now.getTime() - ALERT_WINDOW_MS);
    const minutes = Math.round(ALERT_WINDOW_MS / 60_000);

    if (FAILED.includes(event.kind)) {
      // 1. Перебор по одной учётке или одному адресу
      const accountKey = event.userId ?? event.emailHash;
      if (accountKey) {
        const fails = await failuresForAccount(event.userId, event.emailHash, since);
        if (fails >= ALERT_THRESHOLDS.failsPerAccount) {
          const user = event.userId ? await describeUser(event.userId) : null;
          fired.push("account-bruteforce");
          await reportSecurity({
            key: `account-bruteforce|${accountKey}`,
            title: user
              ? "Подбор пароля к учётной записи"
              : "Подбор пароля к несуществующему адресу",
            lines: [
              user ? `Учётная запись: ${user.label}` : "Адреса такой почты в системе нет.",
              `Неудачных попыток за ${minutes} минут: ${fails}.`,
              `Последняя попытка: с адреса ${ipText(event.ip)}, ${event.device ?? "устройство неизвестно"}.`,
            ],
          });
        }
      }

      // 2. Перебор с одного IP: много неудач или много разных адресов
      if (event.ip) {
        const rows = await db.authEvent.findMany({
          where: { ip: event.ip, kind: { in: FAILED }, createdAt: { gte: since } },
          select: { userId: true, emailHash: true },
          take: 500,
        });
        const accounts = new Set(rows.map((r) => r.userId ?? r.emailHash ?? "?"));
        if (
          rows.length >= ALERT_THRESHOLDS.failsPerIp ||
          accounts.size >= ALERT_THRESHOLDS.distinctAccountsPerIp
        ) {
          fired.push("ip-bruteforce");
          await reportSecurity({
            key: `ip-bruteforce|${event.ip}`,
            title: "Перебор паролей с одного адреса",
            lines: [
              `Адрес: ${event.ip}`,
              `Неудачных попыток за ${minutes} минут: ${rows.length}, на ${accounts.size} разных учётных записей и адресов.`,
              "Если это вуз или общежитие, где за одним адресом много людей, ничего делать не нужно.",
              "Иначе адрес стоит закрыть на уровне сервера.",
            ],
          });
        }
      }
      return fired;
    }

    if (event.kind === "LOGIN_OK" && event.userId) {
      // 3. Успешный вход сразу после серии неудач: пароль могли подобрать
      const fails = await failuresForAccount(event.userId, event.emailHash, since);
      if (fails >= ALERT_THRESHOLDS.failsPerAccount) {
        const user = await describeUser(event.userId);
        fired.push("login-after-failures");
        await reportSecurity({
          key: `login-after-failures|${event.userId}`,
          title: "Вход после серии неудачных попыток",
          lines: [
            `Учётная запись: ${user?.label ?? "неизвестна"}`,
            `Неудачных попыток за ${minutes} минут до входа: ${fails}.`,
            `Вход выполнен с адреса ${ipText(event.ip)}, ${event.device ?? "устройство неизвестно"}.`,
            "Возможно, пароль подобран. Проверьте у владельца учётки, что это он, и при сомнении завершите все её сессии.",
          ],
        });
      }

      // 4. Вход ключевого сотрудника с устройства, которого раньше не было
      if (event.newDevice) {
        const user = await describeUser(event.userId);
        if (user?.privileged) {
          fired.push("privileged-new-device");
          await reportSecurity({
            key: `privileged-new-device|${event.userId}`,
            title: "Вход руководителя с нового устройства",
            lines: [
              `Учётная запись: ${user.label}`,
              `Вход с адреса ${ipText(event.ip)}, ${event.device ?? "устройство неизвестно"}.`,
              "Самому человеку письмо об этом уже отправлено.",
            ],
          });
        }
      }
      return fired;
    }

    // 5. Изменения доступа у ключевых сотрудников
    const accessEvents: Partial<Record<AuthEventKind, string>> = {
      PASSWORD_RESET: "Сброс пароля",
      TWO_FACTOR_RESET: "Сброшена двухфакторная защита",
      TWO_FACTOR_ENABLED: "Включена двухфакторная защита",
      SESSIONS_REVOKED: "Завершены все сессии",
    };
    const label = accessEvents[event.kind];
    if (label && event.userId) {
      const user = await describeUser(event.userId);
      if (user?.privileged) {
        fired.push("privileged-access-change");
        await reportSecurity({
          key: `privileged-access-change|${event.userId}|${event.kind}`,
          title: `${label} у руководителя`,
          lines: [
            `Учётная запись: ${user.label}`,
            `С адреса ${ipText(event.ip)}, ${event.device ?? "устройство неизвестно"}.`,
            "Если это сделали не вы и не сам сотрудник, это повод для проверки.",
          ],
        });
      }
    }
  } catch (error) {
    console.error("[безопасность] правила не отработали", error);
  }
  return fired;
}
