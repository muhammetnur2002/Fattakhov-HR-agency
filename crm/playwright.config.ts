import { defineConfig, devices } from "@playwright/test";

/**
 * Сквозные тесты через настоящий браузер и настоящий сервер.
 *
 * Отдельно от Vitest (vitest.config.mts) намеренно: там — сервисы
 * и рендер компонентов в jsdom без вёрстки и без реального DOM-движка,
 * здесь — то, что jsdom не умеет и не должно уметь: реальная раскладка,
 * реальные клики, переход между страницами кабинета.
 *
 * Работает поверх обычного dev-сервера (`npm run dev`) и той же базы
 * разработки с seed-данными — отдельной базы под e2e в проекте нет.
 * Тесты поэтому заводят себе данные с явным префиксом и убирают их за
 * собой, тем же приёмом, что и интеграционные тесты в tests/*.test.ts.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],

  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  // Сервер, скорее всего, уже поднят (панель предпросмотра в редакторе,
  // либо npm run dev в соседнем терминале) — переиспользуем его всегда,
  // а не только вне CI: второй процесс на том же порту не поднимется
  // всё равно, а честная ошибка от Next тут ничего не объясняет.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },

  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/recruiter.json",
      },
      dependencies: ["setup"],
      testIgnore: /client-.*\.spec\.ts/,
    },
    {
      name: "chromium-client",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/client-admin.json",
      },
      dependencies: ["setup"],
      testMatch: /client-.*\.spec\.ts/,
    },
  ],
});
