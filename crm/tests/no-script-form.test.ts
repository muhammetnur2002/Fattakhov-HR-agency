/**
 * Приёмник отправки формы без скриптов (`app/api/no-script-form/route.ts`, `lib/forms/no-script.ts`).
 *
 * Он существует, чтобы форма на клиентском коде, отправленная до загрузки скриптов, ушла POST-ом, а не GET-ом с
 * полями в адресе. Поэтому проверяется главное: тело не читается, в ответе ничего из него нет, а уйти можно только
 * на страницу своего же сайта (чужой `Referer` и адреса вида `//чужой.хост` — на главную).
 */
import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/no-script-form/route";
import { noScriptReturnPath } from "@/lib/forms/no-script-return";

const HOST = "my.fattakhovhr.ru";

describe("noScriptReturnPath", () => {
  it("своя страница: обратно на тот же путь с запросом", () => {
    expect(noScriptReturnPath(`https://${HOST}/settings`, HOST)).toBe("/settings");
    expect(noScriptReturnPath(`https://${HOST}/login?callbackUrl=%2Fdashboard&expired=1`, HOST)).toBe(
      "/login?callbackUrl=%2Fdashboard&expired=1",
    );
    expect(noScriptReturnPath(`https://${HOST}/reset/abc.def#form`, HOST)).toBe("/reset/abc.def");
  });

  it("чужой хост, пустой или битый Referer — на главную", () => {
    expect(noScriptReturnPath("https://evil.example/settings", HOST)).toBe("/");
    expect(noScriptReturnPath(null, HOST)).toBe("/");
    expect(noScriptReturnPath(`https://${HOST}/x`, null)).toBe("/");
    expect(noScriptReturnPath("не адрес", HOST)).toBe("/");
    expect(noScriptReturnPath("javascript:alert(1)", HOST)).toBe("/");
  });

  it("путь, который браузер прочёл бы как другой сайт, — на главную", () => {
    for (const path of ["//evil.example/x", "///evil.example", "/\\evil.example", "/%5Cevil.example"]) {
      const result = noScriptReturnPath(`https://${HOST}${path}`, HOST);
      // Допустим либо «/», либо путь, который остаётся на своём сайте
      expect(new URL(result, "https://own.invalid").origin, `${path} → ${result}`).toBe("https://own.invalid");
      expect(result.startsWith("//")).toBe(false);
    }
    expect(noScriptReturnPath(`https://${HOST}//evil.example/x`, HOST)).toBe("/");
  });
});

describe("POST /api/no-script-form", () => {
  const body = "proof=SecretPassw0rd%21&company=%D0%9E%D0%9E%D0%9E+Secret";

  function request(headers: Record<string, string>) {
    return new Request(`https://${HOST}/api/no-script-form`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
      body,
    });
  }

  it("303 на страницу, откуда пришла форма, без единого поля в ответе", async () => {
    const req = request({ referer: `https://${HOST}/settings`, host: HOST });
    const res = await POST(req);

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/settings");
    expect(res.headers.get("cache-control")).toBe("no-store");
    // Поля — телом запроса; ответ их не отражает ни в адресе, ни в заголовках, ни в теле
    const everything = [...res.headers.entries()].flat().join("\n") + (await res.text());
    expect(everything).not.toMatch(/Secret|proof|company/);
  });

  it("тело запроса не читается", async () => {
    const req = request({ referer: `https://${HOST}/onboarding`, host: HOST });
    await POST(req);
    expect(req.bodyUsed).toBe(false);
  });

  it("чужой Referer не выбирает, куда уйдёт человек", async () => {
    const res = await POST(request({ referer: "https://evil.example/phish", host: HOST }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
  });
});
