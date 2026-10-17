/**
 * Нижняя панель разделов прячется при прокрутке вниз и возвращается — кабинет агентства
 * (рекрутёр). Набор проверок общий с клиентом: tests/e2e/fixtures/tabbar-hide.ts.
 */
import { registerTabbarHideTests } from "./fixtures/tabbar-hide";

registerTabbarHideTests({
  role: "агентство",
  listPath: "/a/candidates",
  shortPath: "/a/vacancies",
  tabName: "Кандидаты",
  settingsPath: "/a/settings",
});
