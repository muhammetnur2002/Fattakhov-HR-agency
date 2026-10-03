# Агент метрик и логов на обеих машинах (fhr-app, fhr-students).
#
# Зачем: у машин в Monitoring есть только процессор и сеть — нет памяти и
# свободного места на диске, а логи контейнеров видны только на самой
# машине (входа по SSH нет). На каждой машине рядом с остальными контейнерами
# работает официальный Yandex Unified Agent (контейнер `ua` в compose):
#   - память и диск машины -> Monitoring (проверки на них — в fhr-metrics);
#   - логи всех контейнеров -> Cloud Logging, группа fhr-logs, хранение 7 суток.
# Агент ходит в облако под сервисным аккаунтом машины, ключей в конфиге нет.
# Конфиг — unified-agent.yml.tftpl; в compose он передаётся переменной
# окружения (cloud-init отрабатывает только при первой загрузке, а compose
# обновляется обычным apply).
#
# Как смотреть логи в консоли — infra/README.md, раздел «Метрики и логи машин».

variable "unified_agent_image" {
  description = "Образ Yandex Unified Agent. Закреплён по хэшу, чтобы агент не менялся сам при перезапуске машины."
  type        = string
  default     = "cr.yandex/yc/unified-agent@sha256:ed9fcb75fd3cf9b1abece87ac6dc84e3806998ab937ca145261ff37460d0e5d0"
}

resource "yandex_logging_group" "main" {
  name             = "fhr-logs"
  description      = "Логи контейнеров машин fhr-app и fhr-students"
  retention_period = "168h"
}

# Аккаунт машин получает ровно два права на запись: метрики и логи в каталог
# (на саму группу логов права провайдер выдавать не умеет). Читать и менять
# что-либо ещё агент не может.
resource "yandex_resourcemanager_folder_iam_member" "vm_metrics_writer" {
  folder_id = var.folder_id
  role      = "monitoring.editor"
  member    = "serviceAccount:${yandex_iam_service_account.vm.id}"
}

resource "yandex_resourcemanager_folder_iam_member" "vm_logs_writer" {
  folder_id = var.folder_id
  role      = "logging.writer"
  member    = "serviceAccount:${yandex_iam_service_account.vm.id}"
}

locals {
  unified_agent_config = templatefile("${path.module}/unified-agent.yml.tftpl", {
    folder_id    = var.folder_id
    log_group_id = yandex_logging_group.main.id
  })
}

output "logging_group_id" {
  description = "Группа логов Cloud Logging (логи контейнеров обеих машин)."
  value       = yandex_logging_group.main.id
}
