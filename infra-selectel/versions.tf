# Terraform для переезда на Selectel (каталог infra-selectel/).
#
# Каталог infra/ (Яндекс Облако) не трогаем: он остаётся как есть до тех пор,
# пока Яндекс не вернётся или владелец не решит его удалить.
#
# Провайдеры и их версии взяты из документации Selectel
# (docs.selectel.ru, раздел Terraform): selectel/selectel — ресурсы Selectel
# (проект, сервисные пользователи, ключи, управляемые БД, реестр контейнеров),
# terraform-provider-openstack/openstack — сеть и серверы (облачная платформа
# Selectel построена на OpenStack). hashicorp/aws нужен ТОЛЬКО для создания
# бакетов: в провайдере Selectel ресурса «бакет» нет (список ресурсов в
# документации: cloudbackup, craas, dbaas, dedicated, domains, iam, mks,
# secretsmanager, vpc, global_router), а Object Storage Selectel говорит по
# протоколу S3.
#
# Из России registry.terraform.io бывает недоступен — см. раздел «Провайдеры»
# в RUNBOOK.md (зеркало или скачивание провайдеров вручную).
terraform {
  required_version = ">= 1.5"

  required_providers {
    selectel = {
      source  = "selectel/selectel"
      version = "~> 7.1"
    }
    openstack = {
      source  = "terraform-provider-openstack/openstack"
      version = "2.1.0"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Состояние хранит пароли баз, ключи S3 и токены реестра в открытом виде
  # (документация Selectel это прямо оговаривает). По умолчанию — локальный
  # файл в папке вне git; удалённое хранилище в бакете Selectel — в
  # backend.tf.example и RUNBOOK.md.
}
