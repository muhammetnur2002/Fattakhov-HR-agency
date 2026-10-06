/**
 * Страж: маршруты (route.ts) не берут актора голым getActor().
 *
 * У маршрутов нет макета /a, который отправляет сотрудника без включённой
 * 2FA на настройку, и getActor() этих ворот не знает — файлы, выгрузки и
 * вход на студенческую платформу открывались бы для сессии без второго
 * фактора. Маршруты берут getGatedActor() (или requireActor /
 * requireAgencyActor / requireClientActor). Голый getActor нужен только тому,
 * кому нужна просто сессия: пульс «в сети» — он ничего не отдаёт.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/** Маршруты, которым голая сессия нужна по делу. Каждая запись — осознанное исключение. */
const ALLOWED = new Set(["app/api/presence/route.ts"]);

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return /^route\.tsx?$/.test(name) ? [full] : [];
  });
}

const files = routeFiles("app").map((f) => f.split(path.sep).join("/"));

describe("маршруты и ворота 2FA", () => {
  it("маршрутов нашлось достаточно, чтобы проверка что-то значила", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("getActor напрямую берут только маршруты из белого списка", () => {
    const offenders = files.filter((file) => {
      if (ALLOWED.has(file)) return false;
      const source = readFileSync(file, "utf8");
      return /\bgetActor\b/.test(source);
    });
    expect(offenders).toEqual([]);
  });

  it("белый список не устарел: каждый разрешённый маршрут существует", () => {
    for (const file of ALLOWED) expect(files).toContain(file);
  });

  it("маршруты кабинета берут актора с воротами", () => {
    for (const file of [
      "app/api/files/route.ts",
      "app/api/reports/agency/route.ts",
      "app/api/reports/client/route.ts",
      "app/api/reports/invoices/route.ts",
      "app/api/company-logo/[clientId]/route.ts",
      "app/(agency)/a/students/open/route.ts",
    ]) {
      expect(readFileSync(file, "utf8"), file).toMatch(/getGatedActor\(\)/);
    }
  });
});
