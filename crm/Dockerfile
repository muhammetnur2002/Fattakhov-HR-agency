# Сборка образа платформы.
#
# Три стадии вместо одной: в готовый образ не должны попасть ни
# исходники, ни инструменты сборки, ни девелоперские зависимости.
# Всё это - лишние сотни мегабайт и лишняя поверхность атаки
# на сервере, где лежат персональные данные.
#
# Один и тот же образ обслуживает и веб, и фоновые задачи: разница
# только в команде запуска. Держать два образа значит однажды
# выкатить их разных версий и ловить необъяснимое расхождение.

# ============ Зависимости ============
FROM node:24-alpine AS deps
WORKDIR /app

# Ставим по локу, а не по package.json: в проде версии обязаны быть
# ровно те, на которых прогнаны тесты
COPY package.json package-lock.json ./
RUN npm ci

# ============ Сборка ============
FROM node:24-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Клиент Prisma генерируется до сборки: Next собирает серверные
# компоненты, которые его импортируют
RUN npx prisma generate
RUN npm run build

# ============ Готовый образ ============
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Не от root: если приложение скомпрометируют, злоумышленник
# получит права обычного пользователя, а не хозяина контейнера
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Standalone-сборка Next: только фактически используемый код
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]

# ============ Зависимости без девелоперских ============
FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ============ Инструменты: миграции и фоновые задачи ============
#
# Отдельный образ, а не команда в основном.
#
# Первая попытка была скопировать в готовый слой только prisma и tsx.
# Не работает: tsx тянет esbuild, prisma CLI тянет свои движки,
# и обе команды падают на сервере, где их уже не отладишь.
#
# Вторая попытка была взять стадию сборки целиком - работает,
# но образ вышел 3,9 ГБ: туда уехали девелоперские зависимости
# и результат сборки Next, который здесь не нужен вовсе.
#
# Здесь только то, что действительно требуется: зависимости без
# девелоперских, схема, задачи и общий код.
FROM node:24-alpine AS tools
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 worker

COPY --from=prod-deps --chown=worker:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=worker:nodejs /app/lib/generated ./lib/generated
COPY --chown=worker:nodejs package.json prisma.config.ts tsconfig.json ./
COPY --chown=worker:nodejs prisma ./prisma
COPY --chown=worker:nodejs jobs ./jobs
COPY --chown=worker:nodejs lib ./lib

USER worker

# Команда задаётся при запуске: миграции или планировщик
CMD ["npx", "tsx", "jobs/scheduler.ts"]
