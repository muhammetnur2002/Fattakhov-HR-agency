#!/usr/bin/env bash
# Выкатка на серверы Selectel по SSH.
#
#   ./deploy.sh [app|students|all]
#
# Что делает: берёт из Terraform (вывод server_files) актуальные docker-compose,
# Caddyfile и файл окружения, кладёт их в /opt/fhr на сервере и перезапускает
# контейнеры (docker compose pull + up -d). Порядок выкатки нового тега:
#   1. образ собран и лежит в реестре (GitHub Actions: «Образы для выкатки (Selectel)»);
#   2. тег записан в prod.tfvars (crm_tag и т. д.);
#   3. terraform apply (серверы при этом НЕ пересоздаются: user_data игнорируется);
#   4. ./deploy.sh app   (или students)
#
# Условия: SSH открыт с вашего адреса (ssh_allowed_cidrs в prod.tfvars), ключ
# для пользователя SSH_USER (по умолчанию root: на образе Selectel другого
# пользователя нет; заведёте своего — укажите SSH_USER, sudo подставится сам) — SSH_KEY (по умолчанию ~/.ssh/id_ed25519), на
# компьютере есть python3 и ssh/scp. Секреты скрипт не печатает; временные
# файлы создаются с правами 600 и удаляются.
set -euo pipefail
cd "$(dirname "$0")"

TARGET="${1:-all}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
SSH_USER="${SSH_USER:-root}"
SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)

case "$TARGET" in
  app | students | all) ;;
  *) echo "использование: $0 [app|students|all]" >&2; exit 2 ;;
esac

WORK=$(mktemp -d "${TMPDIR:-/tmp}/fhr-deploy.XXXXXX")
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT

terraform output -json server_files >"$WORK/files.json"
chmod 600 "$WORK/files.json"

# Раскладываем вывод по файлам: $WORK/<сервер>/{docker-compose.yaml,Caddyfile,<сервер>.env}
python3 - "$WORK" <<'PY'
import json, os, sys
work = sys.argv[1]
data = json.load(open(os.path.join(work, "files.json"), encoding="utf-8"))
for name, f in data.items():
    d = os.path.join(work, name)
    os.makedirs(d, mode=0o700, exist_ok=True)
    for fname, key in (("docker-compose.yaml", "compose"), ("Caddyfile", "caddy"), (name + ".env", "env")):
        path = os.path.join(d, fname)
        with open(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as out:
            out.write(f[key] + ("\n" if not f[key].endswith("\n") else ""))
PY

deploy_one() {
  local name="$1" ip
  ip=$(terraform output -raw "${name}_ip")
  echo "== $name ($ip)"
  scp "${SSH_OPTS[@]}" -q "$WORK/$name/docker-compose.yaml" "$WORK/$name/Caddyfile" "$WORK/$name/$name.env" "$SSH_USER@$ip:/tmp/"
  ssh "${SSH_OPTS[@]}" "$SSH_USER@$ip" "NAME=$name bash -s" <<'REMOTE'
set -euo pipefail
SUDO=""; [ "$(id -u)" = 0 ] || SUDO="sudo"
$SUDO install -m 600 -o root -g root /tmp/docker-compose.yaml /opt/fhr/docker-compose.yaml
$SUDO install -m 644 -o root -g root /tmp/Caddyfile /opt/fhr/Caddyfile
$SUDO install -m 600 -o root -g root "/tmp/$NAME.env" "/opt/fhr/$NAME.env"
rm -f /tmp/docker-compose.yaml /tmp/Caddyfile "/tmp/$NAME.env"
export DOCKER_CONFIG=/root/.docker
$SUDO ${SUDO:+-E} docker compose -f /opt/fhr/docker-compose.yaml pull
$SUDO systemctl restart fhr-stack.service
$SUDO docker compose -f /opt/fhr/docker-compose.yaml ps
REMOTE
}

[[ "$TARGET" == app || "$TARGET" == all ]] && deploy_one app
[[ "$TARGET" == students || "$TARGET" == all ]] && deploy_one students

echo
echo "Проверка: подождите 1-3 минуты и откройте адреса из 'terraform output health_urls'."
