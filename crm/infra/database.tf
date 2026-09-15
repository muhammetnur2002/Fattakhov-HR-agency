# Управляемый PostgreSQL.
#
# Управляемый, а не свой на машине, ровно ради одного: резервные копии
# делаются и хранятся без нашего участия. Юридический пакет требует
# окно в 30 дней и проверенное восстановление (раздел 20), и строить
# это руками означало бы однажды обнаружить, что копии не снимались
# третий месяц.
#
# Публичного доступа у кластера нет. Подключение только из подсети
# приложения - см. группу безопасности в network.tf.

resource "yandex_mdb_postgresql_cluster" "main" {
  name        = "fhr-postgres"
  environment = "PRODUCTION"
  network_id  = yandex_vpc_network.main.id

  security_group_ids  = [yandex_vpc_security_group.db.id]
  deletion_protection = true

  config {
    version = "16"

    resources {
      resource_preset_id = "b2.medium"
      disk_type_id       = "network-ssd"
      disk_size          = 20
    }

    # Окно резервного копирования - ночь по Москве: в это время
    # нагрузки нет, а снятие копии её всё-таки создаёт
    backup_window_start {
      hours   = 2
      minutes = 0
    }

    backup_retain_period_days = 30

    access {
      # Ни консоль облака, ни аналитические сервисы к базе
      # с персональными данными доступа не получают
      web_sql    = false
      data_lens  = false
      serverless = false
    }
  }

  host {
    zone             = var.zone
    subnet_id        = yandex_vpc_subnet.main.id
    assign_public_ip = false
  }

  maintenance_window {
    type = "WEEKLY"
    day  = "SUN"
    hour = 3
  }
}

resource "yandex_mdb_postgresql_database" "main" {
  cluster_id = yandex_mdb_postgresql_cluster.main.id
  name       = "hr_platform"
  owner      = yandex_mdb_postgresql_user.app.name
  lc_collate = "ru_RU.UTF-8"
  lc_type    = "ru_RU.UTF-8"
}

resource "yandex_mdb_postgresql_user" "app" {
  cluster_id = yandex_mdb_postgresql_cluster.main.id
  name       = "hr_app"
  password   = var.db_password
}
