# Карта проекта Fattakhov HR Agency

Актуально на 30.09.2026. Две связанные системы: **CRM агентства** (она же сайт) и **студенческая платформа**. Работают как два отдельных приложения на Vercel и общаются друг с другом по защищённым служебным вызовам.

## 1. Где что лежит

| Что | Рабочая папка (разработка) | Монорепо (то, что уходит на Vercel) | Vercel-проект |
|---|---|---|---|
| CRM + сайт агентства | `Desktop\Fattakhov HR agency\fattakhov-hr-platform-main` (не git) | `Desktop\Fattakhov-HR-agency\crm` | `fattakhov-hr-agency-a7o3` |
| Студенческая платформа | `Desktop\Fattakhov HR agency\platform_for_students` (свой git) | `Desktop\Fattakhov-HR-agency\platform-for-students` | `fattakhov-hr-agency-96ge` |

Монорепо: `github.com/muhammetnur2002/Fattakhov-HR-agency`, ветка `main`; пуш в неё сам запускает обе сборки. Копирование из рабочих папок — вручную (см. `OPERATIONS.md`). Папки «Fattakhov HR agency» (с пробелом) и «Fattakhov-HR-agency» (с дефисом) — разные.

## 2. Как системы связаны

```
            ┌─────────── студенты ───────────┐
            │                                │
   Студенческая платформа (Next 16, Prisma 5, PostgreSQL)
            │   ▲
   CRM_SERVICE_SECRET (Bearer)  │ /api/webhooks/students-event (события: отклик, сообщение, решение по вакансии)
   /api/service/*               │
            ▼   │
   CRM агентства (Next 16, Prisma 7, Auth.js v5, PostgreSQL)
            │
   сотрудники агентства (/a)     клиенты (кабинет клиента)
```

Три общих секрета (значения одинаковые в обеих системах, см. `ENV_KEYS.md`):
- `CRM_SERVICE_SECRET` — служебные вызовы CRM → платформа и webhook платформа → CRM.
- `STUDENTS_SSO_SECRET` — билет входа сотрудника CRM на студенческую платформу (кнопка «Студентам»).
- `CRM_ENTRY_SECRET` — билет входа клиента со студенческой платформы в CRM.

Клиент CRM (компания) на платформе — это `Employer` с полем `crmClientId`. Платформа заводит его автоматически (`/api/service/employer/ensure`). Пока у клиента нет действующего договора (`crmActive = false`), вакансии идут на модерацию, а поиск и приглашение студентов закрыты.

## 3. CRM (`fattakhov-hr-platform-main` → `crm/`)

Стек: Next 16 (App Router, server actions), Prisma 7, Auth.js v5 (credentials), vitest (тесты на реальной тестовой БД), Playwright (e2e).

**Разделы (`app/`)**
- `(marketing)` — публичный сайт: главная, тарифы, кейсы, приватность, аудит.
- `(public)` — вход, регистрация клиента, приглашение, сброс пароля, согласие, выбор времени встречи кандидатом (`schedule/<токен>`).
- `(agency)/a` — кабинет сотрудников агентства: заявки и вакансии, кандидаты и воронка (канбан), встречи и календарь, клиенты и договоры, финансы (счета), лиды, аналитика, команда и доступы, **студенты** (модерация компаний и вакансий, проверка справок, заявки на привязку, пилотные метрики), сообщения, уведомления, настройки (у владельца — шаблон договора).
- `(client)` — кабинет клиента: дашборд, вакансии, кандидаты, отклики, встречи, аналитика, сообщения, документы (шаблон договора, загрузка подписанного), профиль компании, студенческая платформа (`/students`: вакансии, отклики, чат, поиск студентов), настройки и команда, удаление аккаунта.
- `api/` — `auth` (Auth.js и вход со студенческой платформы `from-students`), `files` (подписанные ссылки на файлы), `company-logo`, `students-file`, `students-applicant-file`, `students-vacancy-cover`, `calendar` (лента iCal), `reports` (выгрузки CSV), `webhooks/students-event`, `health`.

**Слои (`lib/`)**
- `access/` — матрица прав ролей (OWNER, HEAD, RECRUITER, ACCOUNT, CLIENT_ADMIN, CLIENT_HIRING, CLIENT_VIEWER), фильтры видимости (порог BR-3: клиент видит кандидата только после представления).
- `services/` — бизнес-логика: вакансии, отклики, встречи, комментарии, клиенты и договоры (`agreements`, `contract-documents`), счета, приглашения, пароли, 2FA (`two-factor`), удаление аккаунта, профиль компании, регистрация клиентов, лиды.
- `students-service.ts` — все служебные вызовы на платформу; `students-entry.ts`, `students-sso.ts` — билеты входа.
- `security/` — лимиты запросов, блокировка перебора входа (`login-throttle`), проверка источника запросов.
- `auth/` — пароли (argon2), TOTP, сессии. `storage/` — S3/диск. `notifications/` — почта, Telegram. `config/production-check.ts` — проверка обязательных ключей при старте.
- `jobs/` — фоновые задачи (дайджест, напоминания), `infra/` — развёртывание на собственном сервере (Terraform, Caddy, docker-compose) как запасной вариант.

**Данные (`prisma/schema.prisma`, 25 моделей, 19 миграций):** Organization, User, Invitation, Client, Agreement, Vacancy, PipelineStage, Candidate, Application, StageTransition, Comment, CommentRead, DirectMessage, Interview, InterviewSlot, Attachment, Invoice, Notification, ActivityLog, PersonalDataAccessLog, Lead, PasswordReset, RecoveryCode, PendingClientRegistration, AuthFailure. Удаление мягкое (расширение Prisma, `deletedAt`).

**Проверки:** `npm run typecheck`, `npx eslint .`, `npm test` (742 теста).

## 4. Студенческая платформа (`platform_for_students` → `platform-for-students/`)

Стек: Next 16 (App Router, React 19), Prisma 5, PostgreSQL, JWT-сессии, bcrypt, framer-motion. Без `DATABASE_URL` запускается в демо-режиме в памяти (на проде не допускается).

**Разделы (`app/`)**
- Студент `(student)`: лента вакансий (свайп), отклики, пропущенные, сообщения, профиль; регистрация мастером с подтверждением почты; справка об обучении.
- Работодатель `employer`: вакансии, отклики, кандидаты, сообщения, профиль компании. Клиенты CRM работают из CRM, а эти страницы отправляют их туда.
- Администратор `admin`: модерация, справки, студенты, пилотные метрики. Вход сотрудников агентства — билетом из CRM.
- Публичное: вузы и рейтинг (`institutions`), компании (`companies`), помощь, юридические тексты, вход, сброс пароля.
- `api/`: `auth`, `students`, `feed`, `swipes`, `applications`, `messages` (чат и поток событий), `employer`, `upload`, `files`, `cron/notify` (ежедневно 06:00), `service/*` (служебный интерфейс для CRM: `employer/*`, `companies`, `crm-links`, `moderation`, `study`, `pilot`), `crm` (вход сотрудников).

**Слои (`lib/`)**: `services.ts` (основная логика), `db/` (Prisma-хранилище и копия в памяти для демо, фикстуры), `security/` (сессии, шифрование персональных данных `crypto.ts`, лимиты `rate-limit.ts`, защита служебных вызовов `service-auth.ts` и `service-employer.ts`, билеты), `mail/`, `validation.ts`, `storage.ts` (S3/диск, проверка файлов), `notify*.ts`.

**Данные (17 моделей, 20 миграций):** Account, AuthToken, NotificationLog, StaffTicket, Student, Employer, AccessCode, Vacancy, Swipe, Application, Message, SyncRun, AuditLog, Institution, AnalyticsEvent, StudentNotification, RateLimitHit. Персональные данные студентов (ФИО, телефон, дата рождения) хранятся зашифрованными ключом `PII_ENCRYPTION_KEY`.

**Проверки:** `npx tsc --noEmit`, `npx next lint`, `npx tsx tests/unit.ts` (39), `npm run smoke` (327 сквозных проверок на запущенном сервере, затем `npm run db:clean-test -- --apply`).

## 5. Боевое окружение

- Обе системы на Vercel, сборка выполняет `prisma migrate deploy` (CRM — с `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1`, см. `vercel.json`).
- База — управляемый PostgreSQL в Yandex Cloud без публичного доступа: с локальной машины к ней не подключаться, dev, seed и тесты — только на локальной базе (seed теперь сам отказывается работать на чужой).
- Файлы: S3-совместимое хранилище (у платформы настроено на Vercel).
- Почта: SMTP (`SMTP_URL`).

## 6. Безопасность (итоги аудита 30.09.2026)

Сделано: закрыт поиск и приглашение студентов для клиентов без договора; общий счётчик лимитов в базе; блокировка перебора пароля и кода 2FA в самой проверке входа; защита служебных адресов от подмены пути; строгие ссылки на файлы; проверка содержимого загружаемых файлов; одноразовый код 2FA; вход билетом не обходит 2FA; права на оценку встречи, выгрузку счетов, комментарии и вложения; CSP; шифрование секрета 2FA (включается ключом `TOTP_ENCRYPTION_KEY`).

Осталось на решение владельца: срок сессии (30 дней), отзыв ссылок календаря, вынос файла с секретами из синхронизируемых папок.
