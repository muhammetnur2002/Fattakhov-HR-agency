output "app_ip" {
  description = "Публичный адрес fhr-app: на него в Рег.ру ведут fattakhovhr.ru, www и my."
  value       = openstack_networking_floatingip_v2.server["app"].address
}

output "students_ip" {
  description = "Публичный адрес fhr-students: на него в Рег.ру ведёт students."
  value       = openstack_networking_floatingip_v2.server["students"].address
}

output "db_connections" {
  description = "Адреса подключения к кластеру (карта connections от Selectel). Проверить имена ключей после первого apply."
  value       = selectel_dbaas_postgresql_datastore_v1.main.connections
}

output "crm_database_url" {
  description = "Строка подключения CRM (внутри частной сети)."
  value       = local.crm_env_final["DATABASE_URL"]
  sensitive   = true
}

output "students_database_url" {
  description = "Строка подключения платформы студентов."
  value       = local.students_env_final["DATABASE_URL"]
  sensitive   = true
}

output "s3_endpoint" {
  value = local.s3_endpoint
}

output "s3_region" {
  value = local.s3_pool
}

output "bucket_crm" {
  value = local.bucket_crm
}

output "bucket_students" {
  value = local.bucket_students
}

output "crm_s3_access_key" {
  value     = var.s3_access_key
  sensitive = true
}

output "crm_s3_secret_key" {
  value     = var.s3_secret_key
  sensitive = true
}

output "students_s3_access_key" {
  value     = var.s3_access_key
  sensitive = true
}

output "students_s3_secret_key" {
  value     = var.s3_secret_key
  sensitive = true
}

output "registry_endpoint" {
  description = "Адрес реестра образов (cr.selcloud.ru/<имя>)."
  value       = local.registry_endpoint
}

output "registry_ci_username" {
  description = "Логин реестра для GitHub Actions (секрет SELECTEL_REGISTRY_USER)."
  value       = selectel_craas_token_v2.ci.username
  sensitive   = true
}

output "registry_ci_token" {
  description = "Токен записи в реестр для GitHub Actions (секрет SELECTEL_REGISTRY_TOKEN)."
  value       = selectel_craas_token_v2.ci.token
  sensitive   = true
}

output "images" {
  description = "Какие образы стоят на серверах - сверять перед выкаткой."
  value       = local.images
}

output "health_urls" {
  description = "Пары [название, адрес] для внешней проверки и проверки после выкатки."
  value = [
    ["Сайт", "https://${var.site_domain}/"],
    ["Кабинет", "https://${var.app_domain}/api/health"],
    ["Студенческая платформа", "https://${var.students_domain}/api/health"],
    ["Фоновые задачи кабинета", "https://${var.app_domain}/api/health/worker"],
  ]
}

output "maintenance_mode" {
  value = var.maintenance_mode
}

# Файлы серверов для deploy.sh (загрузка по SSH): compose, Caddyfile и
# окружение того состава, который описывает Terraform сейчас.
output "server_files" {
  description = "Содержимое /opt/fhr на серверах; читает deploy.sh."
  sensitive   = true
  value = {
    for k, v in local.servers : k => {
      compose = v.compose
      caddy   = v.caddy
      env     = v.env
    }
  }
}
