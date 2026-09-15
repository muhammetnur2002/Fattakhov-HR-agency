/**
 * Внешние адреса.
 *
 * Проверяется не форматирование строк, а то, что ссылки, которые уходят
 * людям в письмах и в календаре, ведут в приложение, а не на сайт.
 * Ошибка здесь не падает и не видна в логе: она проявляется тем, что
 * кандидат открывает согласие на ПДн и попадает на лендинг.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import * as mod from "@/lib/urls";

const KEYS = ["APP_URL", "SITE_URL", "AUTH_URL"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

/**
 * Модуль читать заново не нужно: адреса берутся из окружения в момент
 * вызова, а не на импорте. Это и проверяется заодно, иначе смена
 * переменных на проде требовала бы пересборки.
 */
async function urls() {
  return mod;
}

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("когда домены не разведены", () => {
  it("сайт совпадает с приложением", async () => {
    process.env.APP_URL = "https://hr.example.ru";
    delete process.env.SITE_URL;

    const { appUrl, siteUrl, siteHost } = await urls();
    expect(appUrl("/login")).toBe("https://hr.example.ru/login");
    expect(siteUrl("/")).toBe("https://hr.example.ru/");
    // Прокси не должен пытаться делить хосты, пока делить нечего
    expect(siteHost()).toBeNull();
  });

  it("падает на localhost, если не задано ничего", async () => {
    for (const k of KEYS) delete process.env[k];
    const { appUrl } = await urls();
    expect(appUrl("/invite/abc")).toBe("http://localhost:3000/invite/abc");
  });
});

describe("когда домены разведены", () => {
  it("ссылки для людей ведут в приложение, а не на сайт", async () => {
    process.env.APP_URL = "https://app.fattakhov.ru";
    process.env.SITE_URL = "https://fattakhov.ru";

    const { appUrl, siteUrl, siteHost } = await urls();

    // Приглашение, согласие, выбор времени: всё это приложение
    expect(appUrl("/invite/tok")).toBe("https://app.fattakhov.ru/invite/tok");
    expect(appUrl("/consent/tok")).toBe("https://app.fattakhov.ru/consent/tok");
    expect(appUrl("/schedule/tok")).toBe("https://app.fattakhov.ru/schedule/tok");

    expect(siteUrl()).toBe("https://fattakhov.ru");
    expect(siteHost()).toBe("fattakhov.ru");
  });

  it("хвостовой слэш не удваивается", async () => {
    process.env.APP_URL = "https://app.fattakhov.ru/";
    process.env.SITE_URL = "https://fattakhov.ru///";

    const { appUrl, siteUrl } = await urls();
    expect(appUrl("/login")).toBe("https://app.fattakhov.ru/login");
    expect(siteUrl("/")).toBe("https://fattakhov.ru/");
  });

  it("APP_URL важнее устаревшего AUTH_URL", async () => {
    process.env.AUTH_URL = "https://old.example.ru";
    process.env.APP_URL = "https://app.fattakhov.ru";

    const { appUrl } = await urls();
    expect(appUrl("/login")).toBe("https://app.fattakhov.ru/login");
  });

  it("кривой SITE_URL не роняет прокси, а просто выключает разделение", async () => {
    process.env.APP_URL = "https://app.fattakhov.ru";
    process.env.SITE_URL = "не адрес";

    const { siteHost } = await urls();
    expect(siteHost()).toBeNull();
  });
});

describe("студенческая платформа", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ведёт по STUDENTS_URL без двойного слэша", async () => {
    vi.stubEnv("STUDENTS_URL", "https://students.fattakhov.ru/");

    const { studentsUrl } = await urls();
    expect(studentsUrl("/institutions/rating")).toBe(
      "https://students.fattakhov.ru/institutions/rating",
    );
  });

  it("в разработке без адреса ведёт на соседний dev-сервер", async () => {
    vi.stubEnv("STUDENTS_URL", "");
    vi.stubEnv("NODE_ENV", "development");

    const { studentsUrl } = await urls();
    expect(studentsUrl("/")).toBe("http://localhost:3001/");
  });

  it("на проде без адреса ссылки нет, а не localhost", async () => {
    vi.stubEnv("STUDENTS_URL", "");
    vi.stubEnv("NODE_ENV", "production");

    const { studentsUrl } = await urls();
    expect(studentsUrl("/")).toBeNull();
  });
});
