# Управляемый PostgreSQL 16 (Selectel Managed Databases).
#
# Один кластер, две базы и два пользователя с РАЗНЫМИ паролями; каждый
# пользователь владеет своей базой и получает права (selectel_dbaas_grant_v1)
# только на неё. Кластер подключён к частной подсети и группе безопасности
# fhr-db (доступ только из подсети), публичный адрес не выдаётся.
#
# Пулер соединений (блок pooler) НЕ включаем: по документации режим по умолчанию
# - transaction, а миграциям Prisma и подготовленным запросам нужны обычные
# соединения. Подключаемся напрямую на 5432. TODO: порт 5432 - по умолчанию
# PostgreSQL; в документации ресурса порт не назван, сверить по строке
# подключения в панели после создания.

data "selectel_dbaas_datastore_type_v1" "postgres" {
  project_id = var.project_id
  region     = var.region

  filter {
    engine  = "postgresql"
    version = var.db_version_filter
  }
}

resource "selectel_dbaas_postgresql_datastore_v1" "main" {
  name       = "fhr-postgres"
  project_id = var.project_id
  region     = var.region
  type_id    = data.selectel_dbaas_datastore_type_v1.postgres.datastore_types[0].id
  subnet_id  = openstack_networking_subnet_v2.main.id
  node_count = var.db_node_count

  # Готовая конфигурация из списка Selectel (flavor_id) надёжнее своей: кластер со
  # своими параметрами в ru-6 ушёл в ERROR сразу после создания (16.10.2026).
  flavor_id = var.db_flavor_id != "" ? var.db_flavor_id : null

  dynamic "flavor" {
    for_each = var.db_flavor_id == "" ? [1] : []
    content {
      vcpus     = var.db_vcpus
      ram       = var.db_ram_mb
      disk      = var.db_disk_gb
      disk_type = var.db_disk_type
    }
  }

  security_groups       = [openstack_networking_secgroup_v2.db.id]
  backup_retention_days = var.db_backup_retention_days

  depends_on = [openstack_networking_router_interface_v2.main]
}

resource "selectel_dbaas_user_v1" "crm" {
  project_id   = var.project_id
  region       = var.region
  datastore_id = selectel_dbaas_postgresql_datastore_v1.main.id
  name         = "fhr_crm"
  password     = var.crm_db_password
}

resource "selectel_dbaas_user_v1" "students" {
  project_id   = var.project_id
  region       = var.region
  datastore_id = selectel_dbaas_postgresql_datastore_v1.main.id
  name         = "fhr_students"
  password     = var.students_db_password
}

# lc_collate / lc_ctype: в Яндекс-версии были ru_RU.UTF-8; значения, которые
# принимает Selectel, в документации не перечислены (по умолчанию C). Для
# приложений это не критично (сортировка строк - в приложении), поэтому
# оставляем умолчание. TODO: если нужна русская сортировка в БД - проверить
# допустимые значения.
resource "selectel_dbaas_postgresql_database_v1" "crm" {
  project_id   = var.project_id
  region       = var.region
  datastore_id = selectel_dbaas_postgresql_datastore_v1.main.id
  owner_id     = selectel_dbaas_user_v1.crm.id
  name         = "fhr_crm"
}

resource "selectel_dbaas_postgresql_database_v1" "students" {
  project_id   = var.project_id
  region       = var.region
  datastore_id = selectel_dbaas_postgresql_datastore_v1.main.id
  owner_id     = selectel_dbaas_user_v1.students.id
  name         = "fhr_students"
}

# Права: каждый пользователь - только на свою базу
resource "selectel_dbaas_grant_v1" "crm" {
  project_id   = var.project_id
  region       = var.region
  datastore_id = selectel_dbaas_postgresql_datastore_v1.main.id
  database_id  = selectel_dbaas_postgresql_database_v1.crm.id
  user_id      = selectel_dbaas_user_v1.crm.id
}

resource "selectel_dbaas_grant_v1" "students" {
  project_id   = var.project_id
  region       = var.region
  datastore_id = selectel_dbaas_postgresql_datastore_v1.main.id
  database_id  = selectel_dbaas_postgresql_database_v1.students.id
  user_id      = selectel_dbaas_user_v1.students.id
}
