/**
 * Нижняя панель разделов прячется при прокрутке вниз и возвращается — кабинет клиента
 * (администратор клиента; вход выбирается по имени файла `client-*.spec.ts`, см. playwright.config.ts).
 * Набор проверок общий с агентством: tests/e2e/fixtures/tabbar-hide.ts.
 */
import { registerTabbarHideTests } from "./fixtures/tabbar-hide";

registerTabbarHideTests({
  role: "клиент",
  listPath: "/candidates",
  shortPath: "/vacancies",
  tabName: "Кандидаты",
  settingsPath: "/settings",
});
