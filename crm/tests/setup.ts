/**
 * Тесты работают с ОТДЕЛЬНОЙ базой `hr_platform_test`, а не с базой
 * разработки: часть тестов пишет данные, и делать это в базе, которой
 * пользуешься руками, — верный способ однажды удивиться.
 *
 * Подготовка базы: `npm run db:test:reset` (миграции + seed).
 * Подмена переменной обязана произойти до импорта lib/db/prisma —
 * setupFiles выполняются раньше тестовых модулей, поэтому это работает.
 *
 * Этот файл общий для двух родов тестов (см. vitest.config.ts):
 * сервисных, что ходят в реальный Postgres, и компонентных — они рендерят
 * React в jsdom и в базу не заглядывают вовсе. Требовать DATABASE_URL_TEST
 * от вторых значило бы заставлять человека поднимать Postgres только ради
 * того, чтобы проверить, что кнопка отключается в нужный момент.
 * Различить их можно по среде: jsdom кладёт в глобальную область `document`,
 * node — нет.
 */
import "dotenv/config";
import { vi } from "vitest";

const isDomEnvironment = typeof document !== "undefined";

if (!isDomEnvironment) {
  if (!process.env.DATABASE_URL_TEST) {
    throw new Error(
      "DATABASE_URL_TEST не задан. Скопируйте .env.example в .env и создайте базу: createdb hr_platform_test",
    );
  }

  // Тот же флаг, что у миграций и seed — выбор базы живёт в lib/db/prisma
  process.env.USE_TEST_DB = "1";
} else {
  // Матчеры вроде toBeDisabled()/toHaveTextContent() — только там, где
  // они вообще могут сработать: extend не трогает document, безопасен
  // даже при импорте в node-среде, но незачем нагружать сервисные тесты
  // тем, что им не понадобится
  await import("@testing-library/jest-dom/vitest");

  /*
    jsdom не реализует IntersectionObserver вовсе — а CountUp (число
    на плитке дашборда, components/motion/count-up.tsx) заводит его
    в каждом рендере, чтобы досчитывать значение только когда плитка
    реально попала в кадр. Без стаба любой тест, рендерящий StatCard,
    падал бы на "IntersectionObserver is not defined" ещё до того,
    как дошёл бы до самой проверки.

    Стаб ничего не эмулирует по-настоящему: callback ни разу не
    вызывается, потому что в jsdom нет ни вьюпорта, ни компоновки,
    чтобы решить, пересеклось ли что-то с чем-то. CountUp в таком
    случае просто остаётся на «0» — то же самое поведение, что и
    в реальном браузере при prefers-reduced-motion, ветку для которого
    компонент уже умеет обрабатывать.
  */
  class IntersectionObserverStub implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: ReadonlyArray<number> = [];
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);

  // testing-library чистит DOM после каждого теста только если находит
  // глобальные afterEach/afterAll — а этот проект их не регистрирует
  // (test.globals не включён нигде, каждый файл сам импортирует свои
  // функции из vitest). Без явного вызова разметка одного теста
  // оставалась бы в document для следующего.
  const { afterEach } = await import("vitest");
  const { cleanup } = await import("@testing-library/react");
  afterEach(cleanup);
}
