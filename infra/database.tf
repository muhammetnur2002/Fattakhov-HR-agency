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

    # Диск растёт сам: переполненный кластер встаёт в режим только чтения
    # целиком — и CRM, и студенческая платформа (их базы здесь же),
    # а заметили бы это по отказам у людей. При 80% диск увеличивается
    # в окно обслуживания (воскресенье ночью), при 90% — сразу. Потолок
    # 50 ГБ — граница расходов: дальше решать человеку, а не автомату.
    # Уменьшить диск потом нельзя, поэтому ступени и потолок осторожные.
    # Выросший диск Terraform не трогает (ignore_changes ниже): иначе
    # следующая же выкатка попыталась бы вернуть 20 ГБ и упала.
    disk_size_autoscaling {
      disk_size_limit           = 50
      planned_usage_threshold   = 80
      emergency_usage_threshold = 90
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

  lifecycle {
    # Размер диска после автоувеличения — забота облака (см. выше).
    # Увеличить вручную: убрать эту строку на один apply
    ignore_changes = [config[0].resources[0].disk_size]
  }
}

# Архивная база прежней версии кабинета (hr_platform, пользователь hr_app)
# удалена 05.10.2026 в консоли облака: нынешний кабинет живёт в fhr_crm
# (crm.tf), платформа — в fhr_students (students.tf). Блоки removed убирают
# их из состояния и НИЧЕГО не удаляют в облаке (там их уже нет); без них
# Terraform пытался бы создать пустую hr_platform заново. После apply,
# который их отработает, блоки можно удалить из кода.
removed {
  from = yandex_mdb_postgresql_database.main
  lifecycle {
    destroy = false
  }
}

removed {
  from = yandex_mdb_postgresql_user.app
  lifecycle {
    destroy = false
  }
}
