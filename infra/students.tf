# Студенческая платформа. Отдельное приложение (Next 14, свой код
# в чужом репозитории), но своя база и свой бакет в НАШЕМ облаке —
# 152-ФЗ требует, чтобы персональные данные студентов не лежали на
# Vercel в США. Код и его тесты — не наша зона, инфраструктура вокруг
# него — да.
#
# Кластер Postgres переиспользуется тот же (main): это управляемая
# база с бэкапами, заводить вторую ради одного приложения смысла нет.
# Изоляция — на уровне базы и пользователя внутри кластера, не кластера
# целиком.

resource "yandex_mdb_postgresql_database" "students" {
  cluster_id = yandex_mdb_postgresql_cluster.main.id
  name       = "fhr_students"
  owner      = yandex_mdb_postgresql_user.students.name
  lc_collate = "ru_RU.UTF-8"
  lc_type    = "ru_RU.UTF-8"
}

resource "yandex_mdb_postgresql_user" "students" {
  cluster_id = yandex_mdb_postgresql_cluster.main.id
  name       = "fhr_students"
  password   = var.students_db_password
}

# Бакет под фото, резюме, справки и видео студентов — отдельный от
# бакета CRM (fhr-files-*), с отдельным сервисным аккаунтом и отдельным
# статическим ключом: скомпрометированный ключ одного приложения не
# должен открывать файлы другого. Шифрование — тем же ключом KMS, что
# и у CRM (storage.tf): это только шифрование хранилища, не граница
# доступа, отдельный ключ здесь ничего дополнительно не изолирует.
resource "yandex_iam_service_account" "students_storage" {
  name        = "fhr-students-storage${var.sa_suffix}"
  description = "Доступ студенческой платформы к её бакету. Больше ничего."
}

resource "yandex_resourcemanager_folder_iam_member" "students_storage_editor" {
  folder_id = var.folder_id
  role      = "storage.editor"
  member    = "serviceAccount:${yandex_iam_service_account.students_storage.id}"
}

# Роль на ключ шифрования для этого аккаунта — в общей привязке ключа
# (storage.tf): вторая авторитетная привязка той же роли снимала бы права
# у CRM. Прежний ресурс забыт без удаления, чтобы роль не отозвалась.
removed {
  from = yandex_kms_symmetric_key_iam_binding.students_storage

  lifecycle {
    destroy = false
  }
}

resource "yandex_iam_service_account_static_access_key" "students_storage" {
  service_account_id = yandex_iam_service_account.students_storage.id
  description        = "Статический ключ для S3-совместимого доступа студенческой платформы"
}

resource "yandex_storage_bucket" "students_files" {
  bucket = "fhr-students-files-${var.folder_id}"

  anonymous_access_flags {
    read        = false
    list        = false
    config_read = false
  }

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        kms_master_key_id = yandex_kms_symmetric_key.storage.id
        sse_algorithm     = "aws:kms"
      }
    }
  }

  versioning {
    enabled = true
  }

  # Видео студенты загружают браузером прямо в бакет по подписанной
  # ссылке (app/api/upload/presign), минуя сервер. Без этого правила
  # браузер запрос с другого адреса не отправит, и загрузка молча падает.
  # ETag наружу — для составной загрузки больших файлов.
  cors_rule {
    allowed_methods = ["PUT", "GET", "HEAD"]
    allowed_origins = ["https://students.fattakhovhr.ru"]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }

  lifecycle_rule {
    id      = "expire-old-versions"
    enabled = true

    noncurrent_version_expiration {
      days = 30
    }
  }
}
