/**
 * Форма, отправленная после окончания сессии, не должна кончаться «Что-то пошло не так».
 *
 * Серверное действие ждёт ответ в формате Next; на HTML страницы входа оно падает.
 * Прокси отвечает ему заголовком перехода, как отвечает само действие при redirect().
 */
import { describe, expect, it } from "vitest";

import { actionLoginResponse, isServerActionRequest, loginPathFor } from "@/lib/auth/login-redirect";

const req = (method: string, headers: Record<string, string> = {}) => ({ method, headers: new Headers(headers) });

describe("запрос серверного действия", () => {
  it("узнаётся по POST и заголовку next-action", () => {
    expect(isServerActionRequest(req("POST", { "next-action": "abc123" }))).toBe(true);
  });

  it("обычные запросы страницы и POST без заголовка — не действие", () => {
    expect(isServerActionRequest(req("GET"))).toBe(false);
    expect(isServerActionRequest(req("GET", { "next-action": "abc123" }))).toBe(false);
    expect(isServerActionRequest(req("POST"))).toBe(false);
  });
});

describe("переход на вход", () => {
  it("возвращает на ту же страницу и помечает, что сессия закончилась", () => {
    expect(loginPathFor("/a/candidates/42", true)).toBe("/login?callbackUrl=%2Fa%2Fcandidates%2F42&expired=1");
    expect(loginPathFor("/dashboard", false)).toBe("/login?callbackUrl=%2Fdashboard");
  });

  it("ответ действию: 200 с заголовком перехода, не редирект и не страница", () => {
    const res = actionLoginResponse("/login?callbackUrl=%2Fdashboard&expired=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-action-redirect")).toBe("/login?callbackUrl=%2Fdashboard&expired=1;push");
    // Не поток Next: тело пустое, поэтому клиент делает обычный переход, а не разбирает данные
    expect(res.headers.get("content-type")).toBe("text/plain");
  });
});
