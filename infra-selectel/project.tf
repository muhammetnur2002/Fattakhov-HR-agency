# Проект Selectel уже создан владельцем (ID - в переменной project_id).
# Сервисного пользователя и ключи S3 владелец создал в панели (IAM): Terraform
# входит от его имени и ходит в S3 его ключами. Отдельные пользователи на
# каждое приложение и политики бакетов - задача после запуска (RUNBOOK, раздел 14).

locals {
  s3_pool     = var.s3_pool != "" ? var.s3_pool : var.region
  s3_endpoint = "https://s3.${local.s3_pool}.storage.selcloud.ru"
}

# Ключ для входа по SSH (проектная пара OpenStack).
resource "openstack_compute_keypair_v2" "main" {
  name       = "fhr-keypair"
  public_key = var.ssh_public_key
}
