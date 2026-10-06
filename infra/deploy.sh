#!/usr/bin/env bash
# Выкатка одной командой — общая для всех операторов:
#
#   ./deploy.sh crm=m17                    кабинет и сайт
#   ./deploy.sh crm=m17 crm-tools=m10      кабинет и служебный образ кабинета
#   ./deploy.sh students=v11               студенческая платформа
#   ./deploy.sh students-tools=v5          служебный образ платформы
#   ./deploy.sh                            без новых тегов: привести облако
#                                          к общим настройкам
#   --yes     не спрашивать перед apply (для запуска без человека)
#   --force   применить, даже если план трогает машину, которую не выкатывали
#
# По шагам:
#   1. ./tfvars.sh pull — свежие общие prod.tfvars и prod.env;
#   2. новые теги — в prod.tfvars, только названные;
#   3. такие образы есть в реестре? Опечатка в теге не дала бы серверу
#      скачать образ — и сайт лёг бы до следующей выкатки;
#   4. terraform plan. Если он трогает машину, которую вы не выкатываете, —
#      остановка: значит, кто-то выкатил её и не загрузил общие настройки,
#      и apply откатил бы его работу (так едва не случилось 04.10.2026);
#   5. какие образы меняются → «yes» → apply сохранённого плана;
#   6. ./tfvars.sh push — новые теги становятся общими. Раньше это был
#      отдельный ручной шаг, и его забывали;
#   7. ждёт, пока сервер переключится: номер сборки кабинета или платформы
#      (вывод build_pages) должен смениться — до этого 200 отдаёт ещё прежняя
#      сборка. Не сменился за 8 минут — ошибка «сервер не переключился».
#      Потом — пока сайт, кабинет, фоновые задачи и платформа ответят 200
#      (те же адреса, что у внешней проверки, — вывод health_urls), не дольше
#      6 минут. Не ответили — выход с ошибкой и списком, что лежит.
#
# Доступ — как у ручного запуска (README.md, «Каждый запуск»): ключ бакета
# состояния (~/.fhr/tfstate.env — подхватывается сам) и доступ к облаку
# (YC_TOKEN или TF_VAR_service_account_key_file). Значения скрипт
# не печатает. Работает в bash 3.2+ (macOS) и Git Bash на Windows.
set -euo pipefail

cd "$(dirname "$0")"

# Что выкатываем → переменная в prod.tfvars, образ в реестре, машина
var_of() {
  case "$1" in
    crm) echo app_image ;;
    crm-tools) echo tools_image ;;
    students) echo students_app_image ;;
    students-tools) echo students_tools_image ;;
    *) return 1 ;;
  esac
}
image_of() {
  case "$1" in
    crm) echo fhr-crm ;;
    crm-tools) echo fhr-crm-tools ;;
    students) echo fhr-students ;;
    students-tools) echo fhr-students-tools ;;
  esac
}
machine_of() {
  case "$1" in
    crm | crm-tools) echo yandex_compute_instance.app ;;
    students | students-tools) echo yandex_compute_instance.students ;;
  esac
}

# Опечатки ловятся сразу, до обращений к облаку
YES=0
FORCE=0
ASSIGNMENTS=()
for arg in "$@"; do
  case "$arg" in
    --yes) YES=1 ;;
    --force) FORCE=1 ;;
    -h | --help)
      awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"
      exit 0
      ;;
    *=*)
      if ! var_of "${arg%%=*}" >/dev/null; then
        echo "не знаю, что такое «${arg%%=*}»: можно crm, crm-tools, students, students-tools" >&2
        exit 2
      fi
      if [[ ! "${arg#*=}" =~ ^[a-z0-9][a-z0-9._-]{0,63}$ ]]; then
        echo "тег «${arg#*=}» — строчная латиница, цифры, точка, дефис: например m17" >&2
        exit 2
      fi
      ASSIGNMENTS+=("$arg")
      ;;
    *)
      echo "непонятный аргумент: $arg (нужно имя=тег, например crm=m17; --help)" >&2
      exit 2
      ;;
  esac
done

# ---- Доступ ----
if [[ -z "${AWS_ACCESS_KEY_ID:-}" && -f "$HOME/.fhr/tfstate.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  . "$HOME/.fhr/tfstate.env"
  set +a
fi
if [[ -z "${AWS_ACCESS_KEY_ID:-}" || -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
  echo "нет ключа к бакету состояния: положите tfstate.env в ~/.fhr/ или source его сами" >&2
  exit 1
fi
if [[ -z "${YC_TOKEN:-}" && -z "${TF_VAR_service_account_key_file:-}" ]]; then
  echo "нет доступа к облаку: export YC_TOKEN=\$(yc iam create-token) или TF_VAR_service_account_key_file" >&2
  exit 1
fi

PLAN=".deploy.tfplan"
NEW=".deploy-new.tfvars"
ORIG=".deploy-orig.tfvars"
KEEP=0
cleanup() {
  # В сохранённом плане пароли открытым текстом — не оставлять его на диске
  rm -f "$PLAN" "$NEW"
  # Остановились до apply — вернуть общую версию: несостоявшийся тег
  # в prod.tfvars подхватил бы следующий ручной план
  if [[ $KEEP -eq 0 && -f "$ORIG" ]]; then
    cat "$ORIG" >prod.tfvars
  fi
  rm -f "$ORIG"
}
trap cleanup EXIT

# ---- 1. Общие настройки ----
./tfvars.sh pull
cp prod.tfvars "$ORIG"
chmod 600 "$ORIG"

# ---- 2. Новые теги ----
EXPECTED=""
for a in ${ASSIGNMENTS[@]+"${ASSIGNMENTS[@]}"}; do
  name="${a%%=*}"
  tag="${a#*=}"
  var=$(var_of "$name")
  image=$(image_of "$name")
  # Заменяется только тег в конце адреса образа; права файла (600) остаются
  sed -E "s#^(${var}[[:space:]]*=[[:space:]]*\"[^\"]*/${image}):[^\"]*\"#\1:${tag}\"#" prod.tfvars >"$NEW"
  if ! grep -qE "^${var}[[:space:]]*=[[:space:]]*\"[^\"]*/${image}:${tag}\"" "$NEW"; then
    echo "в prod.tfvars нет строки ${var} с образом ${image} — правьте руками" >&2
    exit 1
  fi
  cat "$NEW" >prod.tfvars
  EXPECTED="$EXPECTED $(machine_of "$name")"
  echo "${name}: ${image}:${tag}"
done

# ---- 3. Образы есть в реестре ----
registry_code() { # $1 = cr.yandex/<реестр>/<образ>:<тег> → HTTP-код манифеста
  local ref="${1#cr.yandex/}" auth
  if [[ -n "${YC_TOKEN:-}" ]]; then
    auth="iam:${YC_TOKEN}"
  else
    auth="json_key:$(tr -d '\n' <"${TF_VAR_service_account_key_file/#\~/$HOME}")"
  fi
  # Учётные данные — через stdin (-K -), а не аргументом: аргументы видны
  # в списке процессов. В строке конфига curl \ и " экранируются
  auth="${auth//\\/\\\\}"
  auth="${auth//\"/\\\"}"
  curl -s -o /dev/null -w '%{http_code}' -K - \
    -H 'Accept: application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json' \
    "https://cr.yandex/v2/${ref%:*}/manifests/${ref##*:}" <<<"user = \"${auth}\""
}
for var in app_image tools_image students_app_image students_tools_image; do
  ref=$(sed -nE "s#^${var}[[:space:]]*=[[:space:]]*\"([^\"]+)\".*#\1#p" prod.tfvars | head -1)
  [[ -n "$ref" ]] || continue
  code=$(registry_code "$ref")
  case "$code" in
    200) ;;
    404)
      echo "образа ${ref#*/} нет в реестре — сервер не смог бы его скачать. Тег с опечаткой или сборка не закончилась." >&2
      exit 1
      ;;
    401 | 403)
      echo "реестр не пустил (HTTP ${code}): токен облака истёк? export YC_TOKEN=\$(yc iam create-token)" >&2
      exit 1
      ;;
    *)
      echo "реестр не ответил про ${ref#*/} (HTTP ${code}) — проверить не удалось, остановлено" >&2
      exit 1
      ;;
  esac
done
echo "образы в реестре есть"

# ---- 4. План ----
terraform plan -input=false -var-file=prod.tfvars -lock-timeout=120s -out="$PLAN" >/dev/null
SHOW=$(terraform show -no-color "$PLAN")

if grep -q "^No changes\." <<<"$SHOW" || ! grep -q "^Plan: " <<<"$SHOW"; then
  echo "Изменений нет: облако уже такое, как в prod.tfvars."
  # Названные теги и так на серверах — они правда; если в общих
  # настройках их не было, загрузить
  KEEP=1
  # Сначала весь вывод, потом поиск: grep -q закрыл бы канал раньше
  # времени, и с pipefail «не совпадает» выходило бы всегда
  if [[ ${#ASSIGNMENTS[@]} -gt 0 ]]; then
    state=$(./tfvars.sh diff)
    if ! grep -q "^prod.tfvars: совпадает с общим" <<<"$state"; then
      ./tfvars.sh push
    fi
  fi
  exit 0
fi

# Ресурсы, которые план меняет; чтение источников данных — не изменение
CHANGED=$(sed -nE 's/^  # ([^ ]+) (will be (created|updated|destroyed|replaced)|must be replaced).*/\1/p' <<<"$SHOW" | sort -u)
echo
grep "^Plan: " <<<"$SHOW"
sed 's/^/  меняется: /' <<<"$CHANGED"
# Какие образы меняются — вывод images (сами метаданные в плане скрыты)
sed -n '/^Changes to Outputs:/,/^$/p' <<<"$SHOW" | grep -E '"|images' | sed 's/^/  /' || true

UNEXPECTED=""
for r in $CHANGED; do
  case " $EXPECTED " in
    *" $r "*) ;;
    *) UNEXPECTED="$UNEXPECTED $r" ;;
  esac
done
if [[ -n "$UNEXPECTED" ]]; then
  echo
  echo "План трогает то, что вы не выкатываете:${UNEXPECTED}" >&2
  echo "Скорее всего, это выкатили с другого компьютера и не загрузили общие" >&2
  echo "настройки — apply откатил бы ту выкатку. Сверьте с живым" >&2
  echo "(terraform output images, сервер) и выровняйте prod.tfvars; применить" >&2
  echo "всё равно — с --force, только если понимаете, что меняется." >&2
  [[ $FORCE -eq 1 ]] || exit 1
fi

# ---- 5. Apply ----
if [[ $YES -ne 1 ]]; then
  if [[ ! -t 0 ]]; then
    echo "нужно подтверждение: запустите в терминале или с --yes" >&2
    exit 1
  fi
  read -r -p "Применить? Введите yes: " answer
  [[ "$answer" == "yes" ]] || { echo "не применено"; exit 1; }
fi
# curl к сайтам. При плановых работах (maintenance_mode = "on", infra/maintenance.tf)
# прокси отвечает 503 со страницей работ, и проверки ниже не дождались бы выкатки.
# Если задан MAINTENANCE_BYPASS (значение maintenance_bypass из prod.tfvars),
# запросы уходят с заголовком обхода. Через stdin (-K -), а не аргументом:
# аргументы видны в списке процессов.
site_curl() {
  if [[ -n "${MAINTENANCE_BYPASS:-}" ]]; then
    curl -K - "$@" <<<"header = \"X-Maintenance-Bypass: ${MAINTENANCE_BYPASS}\""
  else
    curl "$@" </dev/null
  fi
}

# Номер сборки Next на странице — \"b\":\"<номер>\" в разметке. Пусто, если
# страница не ответила
build_id() {
  site_curl -s --max-time 15 "$1" 2>/dev/null |
    grep -oE '\\"b\\":\\"[^\\"]+\\"' | head -1 |
    sed -E 's/.*:\\"([^\\]+)\\"$/\1/' || true
}

# Номер сборки до выкатки — у тех приложений, чей образ выкатываем. Только
# служебный образ (crm-tools, students-tools) страниц не меняет — его не ждём
PAGES=$(terraform output -json build_pages 2>/dev/null || true)
TRACK=""
for a in ${ASSIGNMENTS[@]+"${ASSIGNMENTS[@]}"}; do
  case "${a%%=*}" in
    crm) key=app label="Кабинет" ;;
    students) key=students label="Студенческая платформа" ;;
    *) continue ;;
  esac
  page=$(sed -nE "s/.*\"${key}\":\"(https:[^\"]+)\".*/\1/p" <<<"$PAGES")
  [[ -n "$page" ]] || continue
  TRACK="${TRACK}${label}|${page}|$(build_id "$page")"$'\n'
done

# С этого места новые теги могут оказаться на серверах — оставить их
# в prod.tfvars, даже если apply упадёт на середине
KEEP=1
terraform apply -input=false -lock-timeout=120s "$PLAN"

# ---- 6. Новые теги — общими ----
if ! ./tfvars.sh push; then
  echo "Выкачено, но общие настройки НЕ загружены: кто-то изменил их, пока шла" >&2
  echo "выкатка. ./tfvars.sh pull, перенести свои теги, ./tfvars.sh push." >&2
  exit 1
fi

# ---- 7. Переключился ли сервер ----
# Сервер переключается 1–3 минуты (скачать образ, миграции, запуск), и всё это
# время 200 отдаёт прежняя сборка. Ждём, пока номер сборки сменится; не сменился —
# новый образ не запустился, и «все 200» было бы неправдой
if [[ -n "$TRACK" ]]; then
  echo "Жду, пока сервер переключится на новую сборку (до 8 минут)…"
  switch_deadline=$((SECONDS + ${DEPLOY_SWITCH_WAIT:-480}))
  while IFS='|' read -r label page before; do
    [[ -n "$label" ]] || continue
    while :; do
      now=$(build_id "$page")
      if [[ -n "$now" && "$now" != "$before" ]]; then
        echo "  ${label}: новая сборка ${now} (была ${before:-—})"
        break
      fi
      if ((SECONDS >= switch_deadline)); then
        echo "Выкачено, но ${label} всё ещё на прежней сборке ${before:-—}:" >&2
        echo "сервер не переключился на новый образ. Смотреть журнал машины в консоли" >&2
        echo "облака; откат — ./deploy.sh с прежним тегом." >&2
        exit 1
      fi
      sleep 10
    done
  done <<<"$TRACK"
elif [[ ${#ASSIGNMENTS[@]} -gt 0 ]]; then
  echo "Номер сборки не сверяю: выкатывается служебный образ или нет вывода build_pages."
fi

# ---- 8. Всё ли живо ----
# Фоновые задачи отмечаются после первого прохода. Ждём 200 от каждого адреса
# из того же списка, что у внешней проверки. JSON вывода разбирается без jq
# и python: на Windows их может не быть
TARGETS=$(terraform output -json health_urls 2>/dev/null | tr -d '\n' |
  grep -oE '\[[[:space:]]*"[^"]*"[[:space:]]*,[[:space:]]*"https://[^"]*"[[:space:]]*\]' |
  sed -E 's/^\[[[:space:]]*"([^"]*)"[[:space:]]*,[[:space:]]*"([^"]*)"[[:space:]]*\]$/\1|\2/' || true)
if [[ -z "$TARGETS" ]]; then
  echo "Выкачено. Список адресов для проверки не найден (вывод health_urls) — проверьте сайт сами." >&2
  exit 0
fi
echo "Жду, пока всё ответит 200 (до 6 минут)…"
deadline=$((SECONDS + ${DEPLOY_HEALTH_WAIT:-360}))
while :; do
  down=""
  while IFS='|' read -r name url; do
    code=$(site_curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" || true)
    [[ "$code" == "200" ]] || down="${down}  ${name}: HTTP ${code} — ${url}"$'\n'
  done <<<"$TARGETS"
  if [[ -z "$down" ]]; then
    echo "Готово: все адреса отвечают 200."
    exit 0
  fi
  if ((SECONDS >= deadline)); then
    echo "Выкачено, но не отвечают дольше 6 минут:" >&2
    printf '%s' "$down" >&2
    echo "Смотреть журнал машины в консоли облака и последнюю выкатку; откат —" >&2
    echo "./deploy.sh с прежним тегом." >&2
    exit 1
  fi
  sleep 15
done
