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
# postinstall (prisma generate) нужен Vercel, а здесь на этом шаге ещё нет
# схемы — установка падала бы. Клиент Prisma генерируется ниже, в builder,
# отдельной командой. Скрипт убирается только из копии внутри образа:
# в builder и tools package.json приходит заново из репозитория.
RUN npm pkg delete scripts.postinstall && npm ci

# ============ Клиент базы ============
# Отдельно от builder: образу tools нужен только сгенерированный клиент
# Prisma, а не сборка сайта. Пока клиент брался из builder, каждая сборка
# tools заново собирала весь Next — лишние минуты, — и ошибка в сайте
# не давала выкатить фоновые задачи
FROM deps AS prisma-client
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN npx prisma generate

# ============ Сборка ============
FROM node:24-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Адреса нужны уже при сборке: часть страниц (сайт, ссылки «Студентам»)
# собирается статически и запоминает адрес навсегда. Передаются так:
#   docker build --build-arg STUDENTS_URL=https://students.example.ru ...
# SITE_URL — адрес сайта (fattakhovhr.ru): без него ссылки-оригиналы
# (canonical) и карта сайта в готовых страницах указывали бы на кабинет.
ARG STUDENTS_URL=""
ARG APP_URL=""
ARG SITE_URL=""
ENV STUDENTS_URL=$STUDENTS_URL
ENV APP_URL=$APP_URL
ENV SITE_URL=$SITE_URL

# Номер счётчика Яндекс.Метрики. Переменная NEXT_PUBLIC_* вшивается в код при сборке,
# поэтому задать её в /etc/fhr.env на сервере уже поздно: передаётся только так:
#   docker build --build-arg NEXT_PUBLIC_YANDEX_METRIKA_ID=12345678 ...
# По умолчанию — боевой счётчик сайта. Другой номер — параметром сборки;
# пустой (--build-arg NEXT_PUBLIC_YANDEX_METRIKA_ID=) отключает счётчик.
ARG NEXT_PUBLIC_YANDEX_METRIKA_ID="95422358"
ENV NEXT_PUBLIC_YANDEX_METRIKA_ID=$NEXT_PUBLIC_YANDEX_METRIKA_ID

# Клиент Prisma генерируется до сборки: Next собирает серверные
# компоненты, которые его импортируют
RUN npx prisma generate
RUN npm run build

# ============ Сторож: в готовых страницах нет localhost ============
# Адреса сайта и кабинета (APP_URL, SITE_URL выше) вписываются в страницы
# сайта при сборке. Сборка без --build-arg запомнила бы запасной
# http://localhost:3000 из lib/urls.ts — в кнопке «Войти», canonical и карте
# сайта. Сайт выглядел бы рабочим, а вёл бы в никуда; так было 19.09.2026
# в прежней версии CRM агентства. Здесь такая сборка останавливается,
# и образ не попадает в реестр.
#
# Смотрим готовые страницы, а не исходники: в серверном коде запасной
# адрес нужен для разработки и вреда не несёт, пока адреса переданы.
#
# Отдельный этап, а не шаг в builder: образ tools берёт из builder
# только клиент Prisma и собирается без адресов — сторож внутри builder
# остановил бы и его.
FROM builder AS checked
RUN found=$(find .next/server/app -type f \
      \( -name '*.html' -o -name '*.rsc' -o -name '*.body' -o -name '*.meta' \) \
      -exec grep -l "http://localhost" {} + || true); \
    if [ -n "$found" ]; then \
      echo "ОШИБКА: в готовых страницах зашит localhost — образ собран без адресов." >&2; \
      echo "Нужны --build-arg APP_URL=... SITE_URL=... STUDENTS_URL=... (как в .github/workflows/images.yml)." >&2; \
      echo "$found" | head -20 >&2; \
      exit 1; \
    fi

# ============ Готовый образ ============
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Корневой сертификат облака: им подписан сертификат управляемой базы
# Postgres в Яндекс Облаке (внутренний CA Яндекса). Его нет ни в публичных
# наборах, ни во встроенном хранилище Node, а системное хранилище Node не
# читает — без этого файла подключение с sslmode=verify-full падает с
# ошибкой сертификата, и единственный обход — проверку отключить.
# --chmod обязателен: ADD по URL кладёт файл правами 0600 от root, и
# процесс от nextjs его бы не прочитал. Сумма зафиксирована: подмена файла
# в сети сорвёт сборку. Сертификат действует до 20.06.2027 — меняя его,
# обновить и сумму. Так же сделано в CRM агентства.
ADD --chmod=644 --checksum=sha256:6d148f85b5213445b23ad22ff45e47e1aa2be968f183f9bd6ff39de54d47a8ef \
    https://storage.yandexcloud.net/cloud-certs/CA.pem /etc/ssl/certs/yandex-cloud-ca.pem
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/yandex-cloud-ca.pem

# Не от root: если приложение скомпрометируют, злоумышленник
# получит права обычного пользователя, а не хозяина контейнера
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Standalone-сборка Next: только фактически используемый код.
# Из checked, а не из builder: так сборка образа сайта не может
# пройти мимо сторожа localhost
COPY --from=checked --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=checked --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=checked --chown=nextjs:nodejs /app/public ./public

# Словарь слабых паролей (lib/auth/common-passwords.ts читает его с диска по
# пути от корня процесса). Next трассирует только то, что нашёл в импортах, а
# текстовый файл, который читают через fs, мог бы не попасть в standalone —
# и проверка паролей молча сузилась бы до запасного списка. Копируем явно и
# проверяем, что он целый: десять тысяч строк, а не пустой файл
COPY --from=checked --chown=nextjs:nodejs /app/lib/auth/common-passwords.txt ./lib/auth/common-passwords.txt
RUN test "$(wc -l < lib/auth/common-passwords.txt)" -gt 9000

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]

# ============ Зависимости без девелоперских ============
# Пакеты для образа tools — те же, что в deps, без devDependencies.
# prune убирает лишнее на месте, без второго скачивания всего дерева из
# сети: повторный `npm ci --omit=dev` срывался на сетевых таймаутах, хотя
# те же пакеты уже лежали в deps. Набор тот же — оба по одному локу.
FROM deps AS prod-deps
RUN npm prune --omit=dev

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

# Тот же сертификат облака, что в runner: миграции и фоновые задачи
# ходят в ту же управляемую базу.
ADD --chmod=644 --checksum=sha256:6d148f85b5213445b23ad22ff45e47e1aa2be968f183f9bd6ff39de54d47a8ef \
    https://storage.yandexcloud.net/cloud-certs/CA.pem /etc/ssl/certs/yandex-cloud-ca.pem
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/yandex-cloud-ca.pem

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 worker

COPY --from=prod-deps --chown=worker:nodejs /app/node_modules ./node_modules
# Клиент базы — из своего этапа, не из builder: tools не ждёт сборки сайта
COPY --from=prisma-client --chown=worker:nodejs /app/lib/generated ./lib/generated
COPY --chown=worker:nodejs package.json prisma.config.ts tsconfig.json ./
COPY --chown=worker:nodejs prisma ./prisma
COPY --chown=worker:nodejs jobs ./jobs
COPY --chown=worker:nodejs lib ./lib

# Первая настройка боевой базы: организация и приглашение владельцу
# (служба owner-bootstrap в docker-compose сервера вызывает `ensure`).
# Только этот файл, не вся папка: setup-real.ts стирает базу целиком,
# а test-accounts.ts заводит временные учётки — на системе с
# персональными данными им делать нечего. dotenv в боевой образ не
# попадает, настройки приходят переменными окружения.
COPY --chown=worker:nodejs scripts/bootstrap-owner.ts ./scripts/bootstrap-owner.ts

USER worker

# Команда задаётся при запуске: миграции или планировщик
CMD ["npx", "tsx", "jobs/scheduler.ts"]
