# Образы платформы для студентов.
#
#   docker build --target runner -t fhr-students-app .
#   docker build --target tools  -t fhr-students-tools .
#
# Два образа, а не один. `runner` — только то, что нужно для работы:
# собранный standalone-сервер без исходников, dev-зависимостей и
# Prisma CLI. `tools` — полный набор для миграций и служебных команд.
# Смешать их значит тащить компилятор и CLI базы в каждый рабочий
# контейнер, а заодно дать ему больше, чем нужно для обслуживания
# запросов.
#
# Debian slim, а не Alpine: движок Prisma на musl собирается под
# отдельную цель и ломается при малейшем расхождении версий OpenSSL.
# Выигрыш в размере того не стоит.

ARG NODE_IMAGE=node:20-bookworm-slim

# ---------- База: общая для всех стадий ----------
FROM ${NODE_IMAGE} AS base
# OpenSSL нужен движку Prisma, сертификаты — исходящим HTTPS-запросам
# (синхронизация с CRM)
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# Корневой сертификат Яндекс Облака — в системное хранилище: им подписан
# сертификат управляемой базы Postgres, а движок Prisma проверяет его по
# системному набору (sslmode=require&sslaccept=strict). Без него остаётся
# только шифрование без проверки, с кем говоришь. Сумма зафиксирована:
# подмена файла в сети сорвёт сборку. Действует до 20.06.2027.
ADD --chmod=644 --checksum=sha256:6d148f85b5213445b23ad22ff45e47e1aa2be968f183f9bd6ff39de54d47a8ef \
    https://storage.yandexcloud.net/cloud-certs/CA.pem /usr/local/share/ca-certificates/yandex-cloud-ca.crt
RUN update-ca-certificates
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---------- Зависимости ----------
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
# Клиент генерируется здесь, внутри Linux-образа: сгенерированный на
# машине разработчика содержит движок под его ОС и в контейнере не
# запустится
RUN npx prisma generate

# ---------- Сборка ----------
FROM deps AS build
COPY . .
# Адреса нужны уже при сборке: часть страниц статические и запоминают адрес
# навсегда. Передаются так:
#   docker build --build-arg AGENCY_SITE_URL=https://my.example.ru ...
ARG AGENCY_SITE_URL=""
ARG APP_URL=""
ENV AGENCY_SITE_URL=$AGENCY_SITE_URL
ENV APP_URL=$APP_URL
# Номер счётчика Яндекс.Метрики вшивается в код при сборке (NEXT_PUBLIC_*).
# По умолчанию — счётчик сайта; другой номер — параметром сборки, пустой — счётчик выключен:
#   docker build --build-arg NEXT_PUBLIC_YANDEX_METRIKA_ID=12345678 ...
ARG NEXT_PUBLIC_YANDEX_METRIKA_ID="95422358"
ENV NEXT_PUBLIC_YANDEX_METRIKA_ID=$NEXT_PUBLIC_YANDEX_METRIKA_ID
ENV NODE_ENV=production
RUN npm run build
# Словарь распространённых паролей читается с диска, а не импортируется — трассировка
# кладёт его в standalone только благодаря outputFileTracingIncludes в next.config.mjs.
# Без файла проверка пароля молча слабеет до урезанного списка, поэтому сборка падает здесь
RUN test -s .next/standalone/lib/security/common-passwords.txt

# ---------- Рабочий образ ----------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/data/uploads

# Не root: уязвимость в приложении не должна давать права на весь
# контейнер. Каталог загрузок заранее принадлежит пользователю
# приложения — иначе первая же загрузка фото упадёт с EACCES.
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs \
  && mkdir -p /data/uploads \
  && chown -R nextjs:nodejs /data

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# В slim-образе нет ни curl, ни wget — проверяем тем, что есть
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

# ---------- Служебный образ ----------
# Миграции, заведение администратора, коды работодателей, ротация ключа.
FROM deps AS tools
COPY . .
USER node
CMD ["npx", "prisma", "migrate", "deploy"]
