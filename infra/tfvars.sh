#!/usr/bin/env bash
# Общие настройки выкатки — одни на всех операторов, в бакете состояния:
#
#   prod.tfvars  ↔ infra/prod.tfvars    теги образов, переменные, пароли баз
#   prod.env     ↔ ~/.fhr/prod.env      настройки сервера кабинета (cloud-init),
#                                       или путь из TF_VAR_env_file
#
#   ./tfvars.sh pull   скачать оба файла (перед каждым планом)
#   ./tfvars.sh push   загрузить свои как общие (сразу после apply с новыми
#                      значениями — тегом образа, переменной, паролем)
#   ./tfvars.sh diff   чем свои отличаются от общих — только имена
#                      переменных, без значений
#
# Зачем: у каждого оператора были свои копии, и они расходились — 03–04.10.2026
# трижды за сутки: теги образов, ключи пуш-уведомлений платформы, пароли баз.
# Apply со своей устаревшей копией молча откатывал чужую выкатку, стирал чужие
# переменные или вернул бы старые пароли баз — приложения потеряли бы доступ
# к базам. Теперь копия одна, в том же закрытом бакете, что и состояние:
# шифрование и история версий (infra/README.md).
#
# Доступ — ключ учётки fhr-tfstate из ~/.fhr/tfstate.env (как у состояния)
# или токен своей учётной записи облака (YC_TOKEN). Работает в bash 3.2+
# (macOS) и Git Bash на Windows, нужен curl 7.76+. Значения скрипт не печатает
# никогда.
#
# push не перезапишет чужую правку: если общий файл изменился после вашего
# последнего pull, загрузка отказывается целиком — сначала pull, перенести
# свою правку, apply, push.
set -euo pipefail

cd "$(dirname "$0")"

# Вход — ключом учётки fhr-tfstate (~/.fhr/tfstate.env) или токеном своей
# учётной записи облака: export YC_TOKEN=$(yc iam create-token)
if [[ -n "${AWS_ACCESS_KEY_ID:-}" && -n "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
  AUTH=(--aws-sigv4 "aws:amz:ru-central1:s3" --user "$AWS_ACCESS_KEY_ID:$AWS_SECRET_ACCESS_KEY"
        -H "x-amz-content-sha256: UNSIGNED-PAYLOAD")
elif [[ -n "${YC_TOKEN:-}" ]]; then
  AUTH=(-H "X-YaCloud-SubjectToken: $YC_TOKEN")
else
  echo "нет доступа к бакету: source ~/.fhr/tfstate.env или export YC_TOKEN=\$(yc iam create-token)" >&2
  exit 1
fi

BASE="https://storage.yandexcloud.net/fhr-tfstate-b1gip4b12vge7a951hhh/${TFVARS_PREFIX:-prod}"
ENV_LOCAL="${TF_VAR_env_file:-$HOME/.fhr/prod.env}"
ENV_LOCAL="${ENV_LOCAL/#\~/$HOME}"

NAMES="prod.tfvars prod.env"

# Свой файл и отметка версии последнего pull — для каждого общего
local_of() {
  case "$1" in
    prod.tfvars) echo "prod.tfvars" ;;
    prod.env) echo "$ENV_LOCAL" ;;
  esac
}
mark_of() {
  case "$1" in
    prod.tfvars) echo ".tfvars.etag" ;;
    prod.env) echo ".prodenv.etag" ;;
  esac
}

s3() {
  curl -sS --fail-with-body "${AUTH[@]}" "$@"
}

# ETag общего файла сейчас; пусто — файла ещё нет
remote_etag() {
  local headers
  if ! headers=$(s3 -I "$BASE/$1" 2>/dev/null); then
    echo ""
    return
  fi
  tr -d '\r' <<<"$headers" | awk -F': ' 'tolower($1)=="etag" {print $2}'
}

# Имена переменных без значений: «ИМЯ = …», «ИМЯ=…», «export ИМЯ=…»;
# ключи карт tfvars — «карта.ИМЯ»
names() {
  awk '
    /^[a-z_]+[[:space:]]*=[[:space:]]*\{/ { map=$1; next }
    /^\}/ { map=""; next }
    /^[[:space:]]*#/ { next }
    map != "" && /^[[:space:]]+[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=/ { sub(/^[[:space:]]+/, ""); split($0, a, /[[:space:]]*=/); print map "." a[1]; next }
    /^(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=/ { sub(/^export[[:space:]]+/, ""); split($0, a, /[[:space:]]*=/); print a[1] }
  ' "$1" | sort -u
}

# Имена, у которых значение отличается или которых нет с одной стороны.
# Печатаются только строки вида «ИМЯ = …» — значение не попадёт на экран
# ни при каком формате файла
changed_names() {
  diff <(grep -vE '^\s*(#|$)' "$1" | sort) <(grep -vE '^\s*(#|$)' "$2" | sort) \
    | grep -E '^[<>]\s*(export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=' \
    | sed -E 's/^[<>]\s*(export\s+)?//; s/\s*=.*//' | sort -u || true
}

WORK=$(mktemp -d "${TMPDIR:-/tmp}/tfvars.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

case "${1:-}" in
  pull)
    for name in $NAMES; do
      local_file=$(local_of "$name")
      tmp="$WORK/$name"
      if ! s3 -o "$tmp" "$BASE/$name" >/dev/null 2>&1; then
        echo "$name: общего ещё нет — свой не тронут"
        continue
      fi
      if [[ -f "$local_file" ]] && ! cmp -s "$tmp" "$local_file"; then
        backup="$local_file.local-$(date +%Y%m%d-%H%M%S)"
        cp -p "$local_file" "$backup"
        chmod 600 "$backup"
        echo "$name: свой отличался — сохранён как $backup"
      fi
      mkdir -p "$(dirname "$local_file")"
      install -m 600 "$tmp" "$local_file"
      remote_etag "$name" >"$(mark_of "$name")"
      echo "$name — общий, версия $(cat "$(mark_of "$name")") → $local_file"
    done
    ;;

  push)
    # Сначала проверить оба, потом грузить: не оставить общий набор наполовину новым
    for name in $NAMES; do
      local_file=$(local_of "$name")
      [[ -f "$local_file" ]] || { echo "нет $local_file" >&2; exit 1; }
      current=$(remote_etag "$name")
      pulled=$(cat "$(mark_of "$name")" 2>/dev/null || true)
      if [[ -n "$current" && "$current" != "$pulled" ]]; then
        echo "$name: общий менялся после вашего pull — загрузка остановлена." >&2
        echo "Сделайте ./tfvars.sh pull (ваши файлы сохранятся копиями), перенесите свою правку, apply, push." >&2
        exit 1
      fi
    done
    for name in $NAMES; do
      s3 -T "$(local_of "$name")" "$BASE/$name" >/dev/null
      remote_etag "$name" >"$(mark_of "$name")"
      echo "$name — загружен как общий, версия $(cat "$(mark_of "$name")")"
    done
    ;;

  diff)
    for name in $NAMES; do
      local_file=$(local_of "$name")
      tmp="$WORK/$name"
      if ! s3 -o "$tmp" "$BASE/$name" >/dev/null 2>&1; then
        echo "$name: общего ещё нет"
        continue
      fi
      if [[ ! -f "$local_file" ]]; then
        echo "$name: своего нет ($local_file)"
        continue
      fi
      if cmp -s "$tmp" "$local_file"; then
        echo "$name: совпадает с общим"
        continue
      fi
      echo "$name: отличается от общего"
      echo "  только в общем: $(comm -23 <(names "$tmp") <(names "$local_file") | tr '\n' ' ')"
      echo "  только в своём: $(comm -13 <(names "$tmp") <(names "$local_file") | tr '\n' ' ')"
      echo "  другие значения: $(changed_names "$tmp" "$local_file" | tr '\n' ' ')"
    done
    ;;

  *)
    echo "использование: $0 pull | push | diff" >&2
    exit 2
    ;;
esac
