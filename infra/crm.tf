# CRM и сайт из папки crm/ — основная версия с 30.09.2026, решение
# заказчика (пришла из исходного репозитория разработчика платформы).
#
# Своя база, а не прежняя hr_platform: эта CRM ответвилась от прежней
# 16.09.2026, и истории миграций разошлись (у прежней 10 своих поверх общих,
# у этой 5). На старой базе её миграции не применятся, а прежние данные
# остаются нетронутыми как архив — на случай отката.
#
# Кластер тот же (main): управляемый Postgres с бэкапами, изоляция —
# на уровне базы и пользователя, как у студенческой платформы.

resource "yandex_mdb_postgresql_database" "crm" {
  cluster_id = yandex_mdb_postgresql_cluster.main.id
  name       = "fhr_crm"
  owner      = yandex_mdb_postgresql_user.crm.name
  lc_collate = "ru_RU.UTF-8"
  lc_type    = "ru_RU.UTF-8"
}

resource "yandex_mdb_postgresql_user" "crm" {
  cluster_id = yandex_mdb_postgresql_cluster.main.id
  name       = "fhr_crm"
  password   = var.crm_db_password
}
