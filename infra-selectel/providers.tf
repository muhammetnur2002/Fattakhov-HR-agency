# Вход администратора Terraform: сервисный пользователь с правами создавать
# сервисных пользователей и ключи (его заводит владелец в панели Selectel,
# RUNBOOK.md, шаг 1). Параметры provider "selectel" — из документации
# (Аутентификация, провайдер версии 6.0.0 и новее).
provider "selectel" {
  domain_name = var.selectel_account_id
  username    = var.selectel_admin_username
  password    = var.selectel_admin_password
  auth_region = var.region
  auth_url    = var.selectel_auth_url
}

# Сеть, серверы, диски — от имени отдельного сервисного пользователя проекта
# (project.tf), как в примерах Selectel. Чтобы он существовал к моменту, когда
# провайдер настраивается, первый apply идёт в два шага (RUNBOOK.md, шаг 4).
provider "openstack" {
  auth_url    = var.selectel_auth_url
  domain_name = var.selectel_account_id
  tenant_id   = var.project_id
  user_name   = var.selectel_admin_username
  password    = var.selectel_admin_password
  region      = var.region
}

# Только бакеты. Адрес S3 — s3.<пул>.storage.selcloud.ru, регион в запросах —
# имя пула (docs.selectel.ru: «Настройка S3», раздел про адреса). Остальное —
# отключение проверок, которые имеют смысл только для настоящего AWS.
provider "aws" {
  region     = local.s3_pool
  access_key = var.s3_access_key
  secret_key = var.s3_secret_key

  endpoints {
    s3 = local.s3_endpoint
  }

  s3_use_path_style           = true
  skip_credentials_validation = true
  skip_region_validation      = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
}
