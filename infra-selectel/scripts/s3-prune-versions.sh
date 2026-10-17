#!/usr/bin/env bash
# Удаление НЕактуальных версий и маркеров удаления в бакете Selectel S3.
#
# Зачем. В S3 Selectel нет правил жизненного цикла (Lifecycle в списке
# неподдерживаемых операций документации), а бакеты версионируются. Значит,
# файл, удалённый по требованию субъекта персональных данных (152-ФЗ, угроза
# T19 модели угроз), остаётся прежней версией навсегда. Этот скрипт заменяет
# правило «удалять старые версии через N дней».
#
#   ./s3-prune-versions.sh <бакет> [дней=30] [--apply]
#
# Без --apply только показывает, что было бы удалено. Нужен aws cli и ключи в
# переменных AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY, а также
# S3_ENDPOINT (https://s3.ru-6.storage.selcloud.ru) и S3_REGION (ru-6).
# Удаляются версии, которые перестали быть актуальными дольше N дней назад, и
# маркеры удаления, под которыми не осталось версий. Актуальные версии файлов
# не трогаются. ОСТОРОЖНО: срок считается от создания версии, а не от того
# момента, когда её заменила новая (у API списка версий нет даты замены), так
# что заменённая вчера версия двухмесячной давности будет удалена сразу.
# Запускать по расписанию (cron на любой машине с ключом,
# лучше раз в сутки) и после отдельного запроса на удаление ПДн.
set -euo pipefail

BUCKET="${1:?бакет}"
DAYS="${2:-30}"
APPLY=0
[[ "${3:-}" == "--apply" || "${2:-}" == "--apply" ]] && APPLY=1
[[ "$DAYS" == "--apply" ]] && DAYS=30
: "${S3_ENDPOINT:?задайте S3_ENDPOINT}"
: "${S3_REGION:?задайте S3_REGION}"

AWS=(aws --endpoint-url "$S3_ENDPOINT" --region "$S3_REGION" s3api)
CUTOFF=$(date -u -d "-${DAYS} days" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-"${DAYS}"d +%Y-%m-%dT%H:%M:%SZ)

echo "Бакет $BUCKET: неактуальные версии старше $CUTOFF (apply=$APPLY)"

# Неактуальные версии старше срока
"${AWS[@]}" list-object-versions --bucket "$BUCKET" --output json \
  --query "Versions[?IsLatest==\`false\` && LastModified<\`$CUTOFF\`].[Key,VersionId]" |
  python3 -c '
import json, sys
for key, vid in json.load(sys.stdin) or []:
    print(key + "\t" + vid)
' |
  while IFS=$'\t' read -r key vid; do
    echo "версия: $key ($vid)"
    if [[ $APPLY -eq 1 ]]; then
      "${AWS[@]}" delete-object --bucket "$BUCKET" --key "$key" --version-id "$vid" >/dev/null
    fi
  done

# Маркеры удаления: актуальные маркеры старше срока (файл удалён давно)
"${AWS[@]}" list-object-versions --bucket "$BUCKET" --output json \
  --query "DeleteMarkers[?IsLatest==\`true\` && LastModified<\`$CUTOFF\`].[Key,VersionId]" |
  python3 -c '
import json, sys
for key, vid in json.load(sys.stdin) or []:
    print(key + "\t" + vid)
' |
  while IFS=$'\t' read -r key vid; do
    echo "маркер удаления: $key ($vid)"
    if [[ $APPLY -eq 1 ]]; then
      "${AWS[@]}" delete-object --bucket "$BUCKET" --key "$key" --version-id "$vid" >/dev/null
    fi
  done
echo "Готово."
