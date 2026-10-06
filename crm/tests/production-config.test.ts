/**
 * Проверка настроек прода.
 *
 * Смысл этих тестов не в арифметике, а в том, чтобы список требований
 * нельзя было незаметно ослабить: убрал строчку из REQUIREMENTS —
 * и платформа снова радостно поднимается без почты, а узнаёшь об этом
 * от человека, которому не пришло приглашение.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertProductionConfig,
  productionConfigProblems,
} from "@/lib/config/production-check";
import {
  CANDIDATE_CONSENT_VERSION,
  DRAFT_CANDIDATE_CONSENT_VERSION,
} from "@/lib/legal/candidate-consent";
import {
  DRAFT_REGISTRATION_CONSENT_VERSION,
  REGISTRATION_CONSENT_VERSION,
} from "@/lib/legal/registration-consent";

const KEYS = [
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "SMTP_URL",
  "SMTP_FROM",
  "AUTH_SECRET",
  "APP_URL",
  "AUTH_URL",
  "TOTP_ENCRYPTION_KEY",
  "NODE_ENV",
] as const;

const saved = new Map<string, string | undefined>(
  KEYS.map((k) => [k, process.env[k]]),
);

afterEach(() => {
  vi.unstubAllEnvs();
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/** Полный набор боевых настроек. */
function configureEverything() {
  process.env.S3_ENDPOINT = "https://storage.yandexcloud.net";
  process.env.S3_BUCKET = "fhr-files";
  process.env.S3_ACCESS_KEY_ID = "key";
  process.env.S3_SECRET_ACCESS_KEY = "secret";
  process.env.SMTP_URL = "smtp://user:pass@smtp.example.ru:465";
  process.env.SMTP_FROM = "Платформа <noreply@example.ru>";
  process.env.AUTH_SECRET = "secret";
  process.env.APP_URL = "https://app.example.ru";
  process.env.TOTP_ENCRYPTION_KEY = "k".repeat(40);
}

function clearAll() {
  for (const key of KEYS) delete process.env[key];
}

describe("настройки прода", () => {
  it("полный набор переменных не даёт замечаний по переменным", () => {
    clearAll();
    configureEverything();

    // Про заглушку согласия — отдельный тест ниже; здесь важно, что
    // по переменным окружения замечаний не осталось
    expect(productionConfigProblems().filter((p) => /Не заданы/.test(p))).toEqual(
      [],
    );
  });

  it("пустое окружение даёт замечание на каждое требование", () => {
    clearAll();
    // Пять блоков: файлы, почта, ключ подписи, адрес приложения и ключ
    // шифрования секретов 2FA. Плюс по замечанию на каждое согласие, которое ещё
    // черновик (кандидата, компании при регистрации): их число — правило,
    // а не константа, иначе тест ломается в день, когда юрист дал текст
    const черновиков =
      Number(CANDIDATE_CONSENT_VERSION === DRAFT_CANDIDATE_CONSENT_VERSION) +
      Number(REGISTRATION_CONSENT_VERSION === DRAFT_REGISTRATION_CONSENT_VERSION);
    expect(productionConfigProblems()).toHaveLength(5 + черновиков);
  });

  /*
    Текст согласия кандидата в репозитории — заглушка с пометкой
    «не юридический документ». Она не выглядит поломкой: форма
    открывается, галочка ставится, согласие пишется в базу. Отличить
    такое согласие от настоящего можно только по версии внутри записи,
    то есть уже при разборе обращения — поэтому выкатка должна падать,
    а не предупреждать.

    Тест держит само правило, а не текущее значение версии: когда
    юрист даст текст и версия сменится, замечание исчезнет само.
  */
  it("заглушка текста согласия не пускает в прод", () => {
    clearAll();
    configureEverything();

    const problems = productionConfigProblems();
    const проСогласие = problems.filter((p) => /согласи/i.test(p));
    const ожидаемых =
      Number(CANDIDATE_CONSENT_VERSION === DRAFT_CANDIDATE_CONSENT_VERSION) +
      Number(REGISTRATION_CONSENT_VERSION === DRAFT_REGISTRATION_CONSENT_VERSION);
    expect(проСогласие).toHaveLength(ожидаемых);

    if (CANDIDATE_CONSENT_VERSION === DRAFT_CANDIDATE_CONSENT_VERSION) {
      expect(проСогласие.some((p) => p.includes(DRAFT_CANDIDATE_CONSENT_VERSION))).toBe(true);
    }
    if (REGISTRATION_CONSENT_VERSION === DRAFT_REGISTRATION_CONSENT_VERSION) {
      expect(проСогласие.some((p) => p.includes(DRAFT_REGISTRATION_CONSENT_VERSION))).toBe(true);
    }
  });

  it("почта без SMTP_FROM считается ненастроенной", () => {
    clearAll();
    configureEverything();
    delete process.env.SMTP_FROM;

    const problems = productionConfigProblems().filter((p) =>
      /Не заданы/.test(p),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("SMTP_FROM");
    // Половина настроек хуже, чем ноль: письма молча уйдут в лог
    expect(problems[0]).not.toContain("SMTP_URL,");
  });

  it("S3 наполовину — тоже ненастроен", () => {
    clearAll();
    configureEverything();
    delete process.env.S3_SECRET_ACCESS_KEY;

    expect(productionConfigProblems()[0]).toContain("S3_SECRET_ACCESS_KEY");
  });

  it("AUTH_URL заменяет APP_URL", () => {
    clearAll();
    configureEverything();
    delete process.env.APP_URL;
    process.env.AUTH_URL = "https://app.example.ru";

    expect(
      productionConfigProblems().filter((p) => /Не заданы/.test(p)),
    ).toEqual([]);
  });

  it("пробелы вместо значения не считаются заданной переменной", () => {
    clearAll();
    configureEverything();
    process.env.AUTH_SECRET = "   ";

    expect(productionConfigProblems()[0]).toContain("AUTH_SECRET");
  });

  /*
    Двухфакторная обязательна всему агентству, а секрет без ключа в проде
    не сохраняется (lib/auth/totp-secret.ts): без годного ключа сотрудники
    не смогут настроить вход. Выкатка должна упасть, а не ждать первого,
    кого не пустили.
  */
  it("без ключа шифрования секретов 2FA прод не стартует", () => {
    clearAll();
    configureEverything();
    delete process.env.TOTP_ENCRYPTION_KEY;

    const problems = productionConfigProblems().filter((p) => /TOTP_ENCRYPTION_KEY/.test(p));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/Не заданы/);
  });

  it("ключ короче 32 символов — тоже незаданный: он тихо не применяется", () => {
    clearAll();
    configureEverything();
    process.env.TOTP_ENCRYPTION_KEY = "коротко";

    expect(productionConfigProblems().some((p) => /TOTP_ENCRYPTION_KEY/.test(p))).toBe(true);
  });

  it("при заданном годном ключе замечаний про него нет", () => {
    clearAll();
    configureEverything();

    expect(productionConfigProblems().some((p) => /TOTP_ENCRYPTION_KEY/.test(p))).toBe(false);
  });

  it("вне прода не бросает, даже когда не задано ничего", () => {
    clearAll();
    vi.stubEnv("NODE_ENV", "development");
    expect(() => assertProductionConfig()).not.toThrow();
  });

  it("в проде бросает, и в тексте видно, что именно не задано", () => {
    clearAll();
    vi.stubEnv("NODE_ENV", "production");
    expect(() => assertProductionConfig()).toThrow(/SMTP_URL/);
  });

  it("в проде с полным набором молчит", () => {
    clearAll();
    configureEverything();
    vi.stubEnv("NODE_ENV", "production");
    // Пока текст согласия — заглушка, старт в проде не разрешён даже
    // при полном наборе переменных: это не настройка, а незакрытая работа
    const ожидаем =
      CANDIDATE_CONSENT_VERSION === DRAFT_CANDIDATE_CONSENT_VERSION ? "toThrow" : "not.toThrow";
    if (ожидаем === "toThrow") {
      expect(() => assertProductionConfig()).toThrow(/согласи/i);
    } else {
      expect(() => assertProductionConfig()).not.toThrow();
    }
  });
});
