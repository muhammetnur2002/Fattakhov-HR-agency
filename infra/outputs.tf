output "app_ip" {
  description = "Публичный адрес приложения. Его прописывать в DNS."
  value       = yandex_vpc_address.app.external_ipv4_address[0].address
}

output "db_host" {
  description = "Адрес хоста базы внутри сети."
  value       = yandex_mdb_postgresql_cluster.main.host[0].fqdn
}

output "bucket" {
  description = "Имя бакета с файлами."
  value       = yandex_storage_bucket.files.bucket
}

output "s3_access_key" {
  description = "Ключ доступа к бакету."
  value       = yandex_iam_service_account_static_access_key.storage.access_key
  sensitive   = true
}

output "s3_secret_key" {
  value     = yandex_iam_service_account_static_access_key.storage.secret_key
  sensitive = true
}

output "students_bucket" {
  description = "Имя бакета студенческой платформы."
  value       = yandex_storage_bucket.students_files.bucket
}

output "students_s3_access_key" {
  value     = yandex_iam_service_account_static_access_key.students_storage.access_key
  sensitive = true
}

output "students_s3_secret_key" {
  value     = yandex_iam_service_account_static_access_key.students_storage.secret_key
  sensitive = true
}

output "students_db_host" {
  description = "Адрес хоста базы внутри сети — тот же кластер, что у CRM."
  value       = yandex_mdb_postgresql_cluster.main.host[0].fqdn
}

output "registry_id" {
  description = "Реестр образов: туда выкатывается приложение."
  value       = yandex_container_registry.main.id
}

/*
  Какие образы стоят на машине — отдельным выводом.

  docker-compose в метаданных теперь несёт и секреты (var.runtime_env),
  и Terraform прячет его разницу в плане целиком. Строки «v22 → v23»
  оттуда пропали бы, а по ним перед подтверждением сверяют, что
  выкатывается то, что собирали. Здесь они видны всегда.
*/
output "images" {
  description = "Образы приложения и служебный — сверять в плане перед apply."
  value = {
    app            = var.app_image
    tools          = var.tools_image
    students_app   = var.students_app_image
    students_tools = var.students_tools_image
  }
}
