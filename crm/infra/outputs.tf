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

output "registry_id" {
  description = "Реестр образов: туда выкатывается приложение."
  value       = yandex_container_registry.main.id
}
