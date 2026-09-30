# Инструкция по эксплуатации

## 1. Локальный запуск

Локальный PostgreSQL на `localhost:5432`: базы `hr_platform`, `hr_platform_test` (CRM) и `fhr_students` (платформа). Проверять доступность лучше подключением к порту, а не статусом службы Windows.

**Порты строго такие**: CRM — `3000`, платформа — `3001` (на них завязаны ссылки и служебные вызовы между системами).

```bash
# Студенческая платформа
cd "Desktop/Fattakhov HR agency/platform_for_students"
npx next dev -p 3001

# CRM
cd "Desktop/Fattakhov HR agency/fattakhov-hr-platform-main"
npm run dev
```

- Не запускать второй `next dev` в той же папке (общий `.next`).
- Коды подтверждения почты локально не отправляются: они печатаются в консоли сервера как `[письмо] → … Код: NNNNNN`.
- Остановка сервера — только по PID нужного порта; `taskkill /T` не использовать.
- `prisma generate` при работающем сервере падает с EPERM на файле движка — остановить свой сервер, затем повторить.
- Демо-данные платформы: `npm run db:seed` (работает только на локальной базе).

## 2. Проверки перед выкладкой

**CRM** (`fattakhov-hr-platform-main`)
```bash
npx tsc --noEmit
npx eslint . --quiet
npx vitest run          # 742 теста, на базе hr_platform_test
```
После добавления миграции применить её к обеим локальным базам: `npx prisma migrate deploy` и `USE_TEST_DB=1 npx prisma migrate deploy`, затем `npx prisma generate`.

**Студенческая платформа** (`platform_for_students`)
```bash
npx tsc --noEmit
npx next lint
npx tsx tests/unit.ts                                   # 39
# при запущенном сервере на 3001:
SMOKE_URL=http://localhost:3001 npx tsx --env-file=.env tests/smoke.ts   # 327
npm run db:clean-test -- --apply                        # убрать тестовые данные
```
Перед смоуком прогреть маршруты (первая компиляция в dev долгая): `/`, `/login`, `/register`, `/api/messages/stream`. В Git Bash перед смоуком выставить `MSYS_NO_PATHCONV=1`, иначе пути вида `/api/files/...` портятся.

## 3. Выкладка на Vercel

Обе системы выкладываются из монорепо `Fattakhov-HR-agency` (ветка `main`).

1. Платформа: закоммитить в `platform_for_students`, затем в монорепо стереть `platform-for-students/` и заново распаковать `git archive HEAD | tar -x -C platform-for-students`.
2. CRM: `robocopy <fattakhov-hr-platform-main> <Fattakhov-HR-agency\crm> /MIR` с исключениями `node_modules .next out build .git .storage lib\generated\prisma tests\e2e\.auth test-results playwright-report blob-report coverage .vercel` и файлов `.env .env.local .env.*.local *.tsbuildinfo next-env.d.ts`. Код возврата robocopy `1–3` — успех.
3. В монорепо: `git add -A` (из-за `autocrlf` `git status` до этого показывает почти все файлы изменёнными), проверить `git status`, коммиты отдельно для `crm/` и `platform-for-students/`, `git push origin main`.
4. Следить за статусами `https://api.github.com/repos/muhammetnur2002/Fattakhov-HR-agency/commits/<sha>/status` (контексты `…96ge` и `…a7o3`). Иногда статус платформы долго «pending», хотя деплой уже готов: проверить `npx vercel ls <проект>`.
5. Логи сборки и миграций: `npx vercel inspect <адрес деплоя> --logs`. Сборка сама применяет `prisma migrate deploy`.

Правки делать **в рабочих папках**, а не в копиях монорепо: там нет сгенерированного клиента Prisma и изменения затрутся при следующей синхронизации.

## 4. Резервные копии и база

- Боевая база — управляемый PostgreSQL в Yandex Cloud без публичного доступа. Не подключать к ней dev, seed и тесты.
- Бэкап локальной базы платформы: `npm run` скрипт `scripts/db-backup.mjs`; файл `fhr_students-backup.sql` на рабочем столе — старая копия.
- Ключ `PII_ENCRYPTION_KEY` нужно хранить отдельно от бэкапов: без него зашифрованные поля в копии не прочитать.

## 5. Что происходит по расписанию

- Платформа: Vercel Cron `0 6 * * *` → `/api/cron/notify` (напоминания и сводки). Защита — `CRON_SECRET` (пока не задан на проде).
- CRM: фоновые задачи (`jobs/`) на Vercel не запускаются; дайджесты и напоминания работают при запуске воркера (`npm run worker`) на собственном сервере.

## 6. Частые проблемы

| Симптом | Причина и решение |
|---|---|
| Сборка CRM падает с `P1002` (таймаут advisory lock) | Нужна `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1` — уже в `vercel.json`. |
| Смоук: «поток событий…» не отвечает | Холодная компиляция `/api/messages/stream`, прогреть маршрут и повторить. |
| Смоук: «профиль компании из CRM» упал | Остались данные прошлого прогона: `npm run db:clean-test -- --apply` и повторить. |
| Тест CRM не видит `server-only` | В тесте добавить `vi.mock("server-only", () => ({}))`. |
| `Cannot find module nodemailer/lib/nodemailer.js` в dev после обновления пакета | Перезапустить dev-сервер. |

## 7. Что ждёт решения владельца

1. Включить `TOTP_ENCRYPTION_KEY` на Vercel (CRM), если нужно шифрование секретов 2FA.
2. Задать `CRON_SECRET` на Vercel (платформа).
3. Решить про переход платформы на Next 15/16 (закрывает известные уязвимости Next 14, но это отдельная переделка).
4. Решить про срок сессии и отзыв ссылок календаря.
5. Вынести файл с секретами из папок проекта в менеджер паролей.
6. Убрать `ALLOW_DRAFT_CONSENT` после утверждения юридического текста согласия.
