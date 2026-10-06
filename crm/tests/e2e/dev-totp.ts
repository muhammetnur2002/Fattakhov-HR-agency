import { expect, type Page } from "@playwright/test";

import { totp } from "../../lib/auth/totp";
import { DEV_TOTP_SECRET } from "../../prisma/dev-totp";

/**
 * Вход в кабинет для e2e: почта, пароль и — у сотрудников агентства,
 * где 2FA обязательна, — код из известного тестового секрета seed.
 *
 * Один и тот же код второй раз сервер не принимает (шаг запоминается),
 * а входов одним сотрудником за прогон бывает два (сетап и login.spec).
 * Поэтому второй вход берёт код следующего 30-секундного шага — окно
 * проверки это допускает. Если код всё же отклонили (прогон повторили
 * раньше чем через минуту), ждём следующий шаг и пробуем ещё раз.
 */
export async function loginAs(
  page: Page,
  email: string,
  password: string,
  options: { stepOffset?: number } = {},
): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();

  const code = page.locator("#code");
  const left = page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 10_000 });
  const asksCode = code.waitFor({ state: "visible", timeout: 10_000 });
  const first = await Promise.race([
    left.then(() => "in" as const).catch(() => "wait" as const),
    asksCode.then(() => "code" as const).catch(() => "wait" as const),
  ]);
  if (first === "in") return;

  for (let attempt = 0; attempt < 2; attempt++) {
    const offset = (options.stepOffset ?? 0) + attempt;
    await code.fill(totp(DEV_TOTP_SECRET, Math.floor(Date.now() / 1000) + offset * 30));
    await page.getByRole("button", { name: "Подтвердить" }).click();
    try {
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 8_000 });
      return;
    } catch {
      // Код отклонён: ждём следующий шаг и повторяем
      await page.waitForTimeout(31_000);
    }
  }
  await expect(page).not.toHaveURL(/\/login/);
}
