# HR Platform

Рабочее место рекрутингового агентства и кабинет его клиентов: вакансии,
воронка кандидатов, представление клиенту, интервью, счета, ПДн-контур
(согласия, сроки хранения, удаление).

Однотенантная система: один деплой обслуживает одно агентство и его
клиентов, а не множество агентств на одной инсталляции. Это осознанный
выбор архитектуры, а не ограничение, которое предстоит снять.

## Стек

- **Next.js 16** (App Router, Turbopack, Server Actions), React 19
- **Prisma 7** + PostgreSQL (`@prisma/adapter-pg`), клиент — генерируемый
  код в `lib/generated/prisma`, в git не лежит
- **Auth.js v5** (`next-auth`), Credentials-провайдер, опциональная 2FA
- **Tailwind v4** (CSS-first конфиг, `@theme` в `app/globals.css`)
- **Vitest** (интеграционные тесты против реального Postgres + компонентные
  на jsdom) и **Playwright** (e2e через настоящий браузер)

## Быстрый старт

Нужны Node 24 и локальный PostgreSQL.

```bash
npm install
npx prisma generate

createdb hr_platform
createdb hr_platform_test        # для тестов, см. ниже

cp .env.example .env             # заполнить DATABASE_URL, DATABASE_URL_TEST, AUTH_SECRET
npm run db:migrate
npm run db:seed

npm run dev
```

`.env.example` разбирает каждую переменную подробно — что за что отвечает,
что обязательно только на проде (S3, SMTP — без них приложение при
`NODE_ENV=production` не поднимется, см. `instrumentation.ts`), что можно
оставить пустым в разработке (письма в этом случае пишутся в лог).

После `db:seed` в консоли будут выведены тестовые учётки (пароль у всех
один — `demo1234`, это dev-фикстура, а не чей-то реальный пароль).

## Скрипты

| Команда | Что делает |
| --- | --- |
| `npm run dev` | dev-сервер (Turbopack) |
| `npm run build` / `npm start` | прод-сборка и её запуск |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` / `npm run test:watch` | Vitest (интеграционные + компонентные) |
| `npm run test:e2e` | Playwright — нужен запущенный `npm run dev` или он поднимется сам |
| `npm run db:migrate` | новая миграция в базу разработки |
| `npm run db:seed` | пересоздать демо-данные (идемпотентно) |
| `npm run db:test:reset` | миграции + seed в `hr_platform_test` |
| `npm run db:studio` | Prisma Studio |
| `npm run worker` / `npm run worker:once` | фоновые задачи — напоминания, просрочки, сводки (`jobs/`) |
| `npm run setup:real` | первичная настройка прод-базы: только организация и приглашение владельцу, без демо-данных |

## Тесты

Юнит и интеграционные тесты (`tests/*.test.ts`) идут в **отдельную** базу
`hr_platform_test`, не в базу разработки — часть из них пишет данные, и
делать это в базе, которой пользуешься руками, не стоит. Часть проверяется
против реального seed'а (например `tests/recipients.test.ts` — против
`vac_1`/`vac_2`), поэтому `db:test:reset` обязателен перед прогоном.
Компонентные тесты (`tests/components/**`) рендерят React в jsdom и в базу
не ходят вовсе — среда переключается построчным `// @vitest-environment
jsdom` в начале файла (см. комментарий в `vitest.config.mts`, почему не
`environmentMatchGlobs`).

Playwright (`tests/e2e/**`), в отличие от Vitest, работает поверх **той
же базы, что и `npm run dev`** — отдельной базы под e2e нет, она не
оправданна для проекта этого размера. Тесты заводят себе данные
с префиксом `E2E ` и убирают их за собой в `afterAll`/`finally` (см.
`tests/e2e/fixtures/`). Сессии агентства и клиента логинятся один раз
в `setup`-проекте (`tests/e2e/auth.setup.ts`) и переиспользуются остальными
спеками через `storageState`.

Прямой `import { prisma }` в `*.spec.ts` не работает: Playwright Test
компилирует спеки в CJS, а сгенерированный клиент Prisma — чистый ESM
(`import.meta`). Обход — `tests/e2e/fixtures/db-fixture.ts`, отдельный
процесс под `tsx`, тем же приёмом, что и `npm run smoke` /
`npm run setup:real`; спек вызывает его через `fixtures/db-client.ts`.

## CI

`.github/workflows/ci.yml` — на каждый push и pull request: типы, линт,
Vitest и сборка (джоба `checks`), затем Playwright на отдельной свежей
базе (джоба `e2e`).

## Мониторинг ошибок

`@sentry/nextjs` подключён (`instrumentation.ts`, `instrumentation-client.ts`,
`app/error.tsx`, `app/global-error.tsx`), но без `NEXT_PUBLIC_SENTRY_DSN`
не активируется вовсе — падения без него уходят только в лог процесса,
как и раньше. Завести свой проект в Sentry (или сходном сервисе) и
вписать DSN в `.env` — весь код уже на месте, добавлять больше нечего.
Source maps на сборку не настроены осознанно: это отдельный шаг с
токеном авторизации Sentry, добавлять который раньше появления
настоящего DSN нет смысла.

## Структура

```
app/
  (agency)/a/…      кабинет агентства
  (client)/…        кабинет клиента
  (marketing)/…     лендинг и лид-магниты (открыты без входа)
  (public)/…        публичные ссылки по токену — согласие, выбор
                     интервью, приглашение, сброс пароля
  (onboarding)/…    первый вход владельца агентства
  actions/          Server Actions, общие для нескольких кабинетов
lib/
  access/           единая матрица прав (canDo) — все проверки идут через неё
  services/         бизнес-логика, работает с Prisma напрямую
  notifications/    email + Telegram, ссылки разводятся по получателю
                     (agency vs client, см. lib/notifications/links.ts)
  security/         rate-limiting для форм без сессии
jobs/                фоновые задачи вне HTTP-цикла (напоминания, просрочки,
                     дайджесты) — отдельный процесс, npm run worker
proxy.ts             edge-middleware (в Next 16 middleware.ts переименован)
                     — разведение по доменам и кабинетам, без бизнес-правил
```

Бизнес-правила пронумерованы (`BR-1`, `BR-33`, …) и упоминаются в
комментариях рядом с кодом, который их реализует — это единственное
формальное описание требований в проекте, отдельного документа с
перечнем нет.

## Деплой

`Dockerfile` — три стадии (зависимости → сборка → рантайм), собранный
образ — Next в режиме `standalone`, без исходников и dev-зависимостей,
процесс от непривилегированного пользователя. Тот же образ обслуживает
и веб (`node server.js`), и фоновые задачи (`npm run worker`) — разница
только в команде запуска контейнера.
