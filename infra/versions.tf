# Провайдер берётся из зеркала Яндекса: из России реестры недоступны.
#
# Источник указан полным адресом намеренно. Короткое
# "yandex-cloud/yandex" OpenTofu разворачивает в свой реестр
# registry.opentofu.org, а зеркало Яндекса раздаёт провайдер под
# адресом registry.terraform.io - и загрузка молча не находит
# ни одной версии.
terraform {
  # 1.11 — с неё есть use_lockfile (блокировка состояния файлом в бакете).
  # OpenTofu — тоже не ниже 1.11
  required_version = ">= 1.11"

  /*
    Состояние — общее, в Object Storage, а не файл у каждого на диске:
    с двумя локальными копиями операторы молча перетирали друг другу
    сервер и не видели чужих машин (03.10.2026). Как подключиться и чего
    не делать при переходе — infra/README.md, раздел «Общее состояние».

    Ключи доступа к бакету — не здесь, а в окружении: AWS_ACCESS_KEY_ID
    и AWS_SECRET_ACCESS_KEY из ~/.fhr/tfstate.env (учётка fhr-tfstate,
    доступ только к этому бакету). Шифрование — ключом KMS бакета по
    умолчанию, поэтому `encrypt` здесь не ставится.

    use_lockfile: пока идёт plan или apply, рядом с состоянием лежит
    prod/terraform.tfstate.tflock, и второй запуск ждёт или падает
    с «Error acquiring the state lock», а не пишет поверх. Object Storage
    поддерживает нужную для этого условную запись (If-None-Match) —
    проверено 04.10.2026: вторая запись блокировки получает 412.
  */
  backend "s3" {
    bucket       = "fhr-tfstate-b1gip4b12vge7a951hhh"
    key          = "prod/terraform.tfstate"
    region       = "ru-central1"
    use_lockfile = true

    endpoints = {
      s3 = "https://storage.yandexcloud.net"
    }

    # Это не AWS: проверки региона, учётной записи и метаданных EC2
    # здесь бессмысленны и только падают
    skip_region_validation      = true
    skip_credentials_validation = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
  }

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
