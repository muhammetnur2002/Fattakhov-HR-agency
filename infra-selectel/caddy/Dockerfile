# Caddy с модулем ограничения запросов по IP (mholt/caddy-ratelimit).
# В обычном образе caddy:2 такого модуля нет: без него один адрес мог бы забить
# приложение запросами (проверено нагрузочным тестом 17.10.2026: ~200 запросов
# в секунду - потолок, при 400 одновременных ответ растёт до 2-8 секунд для всех).
# Сборка: docker buildx build --platform linux/amd64 -t cr.selcloud.ru/fhr/caddy-rl:1 --push infra-selectel/caddy
FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/mholt/caddy-ratelimit --replace golang.org/x/net=golang.org/x/net@v0.60.0

FROM caddy:2-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy

# Обновления безопасности пакетов Alpine (curl, openssl, c-ares в базовом образе
# давали 23 HIGH в trivy, аудит 17.10.2026). После правки образ нужно пересобрать
# и выложить под новым тегом (caddy_image в prod.tfvars).
RUN apk upgrade --no-cache
