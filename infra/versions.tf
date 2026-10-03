# Провайдер берётся из зеркала Яндекса: из России реестры недоступны.
#
# Источник указан полным адресом намеренно. Короткое
# "yandex-cloud/yandex" OpenTofu разворачивает в свой реестр
# registry.opentofu.org, а зеркало Яндекса раздаёт провайдер под
# адресом registry.terraform.io - и загрузка молча не находит
# ни одной версии.
terraform {
  required_version = ">= 1.8"

  required_providers {
    yandex = {
      source  = "registry.terraform.io/yandex-cloud/yandex"
      version = ">= 0.140"
    }
    # Упаковка кода облачной функции внешней проверки (monitoring.tf).
    # Полный адрес — по той же причине, что у yandex выше
    archive = {
      source  = "registry.terraform.io/hashicorp/archive"
      version = ">= 2.4"
    }
  }
}

provider "yandex" {
  service_account_key_file = var.service_account_key_file
  folder_id                = var.folder_id
  zone                     = var.zone
}
