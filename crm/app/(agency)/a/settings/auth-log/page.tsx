import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authorize, requireAgencyActor } from "@/lib/auth/session";
import {
  AUTH_EVENT_LABELS,
  describeUserAgent,
  FAILED_AUTH_KINDS,
  listAuthEvents,
  type AuthEventRow,
} from "@/lib/services/auth-events";

export const metadata = { title: "Журнал входов" };

const REASONS: Record<string, string> = {
  bad_credentials: "неверный пароль или почта",
  blocked: "вход временно закрыт: слишком много неудач",
  bad_code: "неверный код из SMS",
  code_already_used: "код из SMS уже использован",
  bad_ticket: "недействительный билет",
  ticket_reused: "билет уже использован",
  second_factor_enabled: "у учётной записи включена 2FA",
  wrong: "код не подошёл",
  wrong_or_blocked: "код не подошёл или попыток не осталось",
};

const METHODS: Record<string, string> = {
  password: "пароль",
  phone: "SMS",
  "students-entry": "вход из студенческой платформы",
  link: "по ссылке из письма",
  by_admin: "задал администратор",
  totp: "приложение",
};

/** Время по Москве: агентство работает в одном часовом поясе, и журнал сверяют с рабочим днём. */
function formatMoscow(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

/** Способ и причина из деталей — одной короткой строкой. */
function describeDetails(details: unknown): string | null {
  if (typeof details !== "object" || details === null) return null;
  const d = details as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof d.method === "string") parts.push(METHODS[d.method] ?? d.method);
  if (d.secondFactor === true) parts.push("с кодом 2FA");
  if (typeof d.reason === "string") parts.push(REASONS[d.reason] ?? d.reason);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function who(row: AuthEventRow): { name: string; sub: string | null } {
  if (row.user) return { name: row.user.fullName, sub: row.user.email };
  return {
    name: "Неизвестный адрес",
    sub: row.emailHashShort ? `отпечаток ${row.emailHashShort}` : null,
  };
}

/**
 * Журнал входов — только владелец (право auth.log): здесь видно, кто и
 * откуда входил, кто пытался и не смог, когда менялись пароли и включалась
 * двухфакторная. Хранится 90 дней, почта — только отпечатком.
 */
export default async function AuthLogPage({
  searchParams,
}: {
  searchParams: Promise<{ failed?: string }>;
}) {
  const actor = await requireAgencyActor();
  authorize(actor, "auth.log");

  const onlyFailed = (await searchParams).failed === "1";
  const events = await listAuthEvents(actor, { onlyFailed, limit: 200 });

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Журнал входов</h1>
        <p className="text-sm text-muted-foreground">
          Последние 200 событий. Время московское, записи хранятся 90 дней.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                {onlyFailed ? "Только неудачные" : "Все события"}
              </CardTitle>
              <CardDescription>
                Вход, неудачные попытки, неверные коды 2FA, сброс пароля и
                включение 2FA.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button asChild size="sm" variant={onlyFailed ? "outline" : "default"}>
                <Link href="/a/settings/auth-log">Все</Link>
              </Button>
              <Button asChild size="sm" variant={onlyFailed ? "default" : "outline"}>
                <Link href="/a/settings/auth-log?failed=1">Только неудачные</Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {onlyFailed ? "Неудачных попыток нет." : "Записей пока нет."}
            </p>
          ) : (
            <ol className="divide-y text-sm">
              {events.map((event) => {
                const person = who(event);
                const detail = describeDetails(event.details);
                const failed = FAILED_AUTH_KINDS.includes(event.kind);
                return (
                  <li
                    key={event.id}
                    className="grid gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[9.5rem_11rem_1fr]"
                  >
                    <time
                      dateTime={event.createdAt.toISOString()}
                      className="text-xs text-muted-foreground tabular-nums sm:pt-0.5"
                    >
                      {formatMoscow(event.createdAt)}
                    </time>
                    <div>
                      <Badge variant={failed ? "destructive" : "secondary"}>
                        {AUTH_EVENT_LABELS[event.kind]}
                      </Badge>
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="font-medium break-words">{person.name}</div>
                      {person.sub && (
                        <div className="text-xs break-all text-muted-foreground">{person.sub}</div>
                      )}
                      {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
                      <div className="text-xs text-muted-foreground">
                        {event.ip ?? "адрес неизвестен"} · {describeUserAgent(event.userAgent)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
