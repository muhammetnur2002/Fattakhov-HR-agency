# Объектное хранилище для резюме и документов (BR-32).
#
# Отдельный сервисный аккаунт с правами только на этот бакет:
# ключ от хранилища лежит на сервере приложения, и если сервер
# скомпрометируют, этот ключ не должен открывать доступ ни к чему
# ещё в облаке.

# Ключ шифрования данных в хранилище.
#
# Требование раздела 20 юридического пакета: шифрование хранилища
# входит в обязательный внутренний стандарт. Ротация раз в год -
# компромисс: чаще означает больше версий ключа и больше шансов
# потерять доступ к старым объектам, реже теряет смысл.
resource "yandex_kms_symmetric_key" "storage" {
  name              = "fhr-storage-key"
  default_algorithm = "AES_256"
  rotation_period   = "8760h"

  lifecycle {
    prevent_destroy = true
  }
}

resource "yandex_iam_service_account" "storage" {
  name        = "fhr-storage"
  description = "Доступ приложения к бакету с файлами. Больше ничего."
}

resource "yandex_resourcemanager_folder_iam_member" "storage_editor" {
  folder_id = var.folder_id
  role      = "storage.editor"
  member    = "serviceAccount:${yandex_iam_service_account.storage.id}"
}

# Право расшифровывать объекты бакета. Без него приложение положит
# файл, но прочитать его обратно не сможет
resource "yandex_kms_symmetric_key_iam_binding" "storage" {
  symmetric_key_id = yandex_kms_symmetric_key.storage.id
  role             = "kms.keys.encrypterDecrypter"
  members          = ["serviceAccount:${yandex_iam_service_account.storage.id}"]
}

resource "yandex_iam_service_account_static_access_key" "storage" {
  service_account_id = yandex_iam_service_account.storage.id
  description        = "Статический ключ для S3-совместимого доступа"
}

# Бакет создаётся от имени deploy, а не от имени сервисного аккаунта
# приложения. Разница принципиальная: настройка бакета (версионирование,
# шифрование, правила жизненного цикла) требует прав администратора
# хранилища, а приложению такие права давать незачем - ему нужно
# только класть и читать объекты.
#
# Раньше здесь стоял ключ аккаунта приложения, и настройка падала
# с отказом в доступе.
resource "yandex_storage_bucket" "files" {
  bucket = "fhr-files-${var.folder_id}"

  # Публичный бакет с резюме - это угроза T14 модели угроз в чистом
  # виде, поэтому анонимный доступ выключен явно по всем трём осям
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
    # Версии защищают от случайного затирания файла, но их надо
    # чистить: иначе удалённое по требованию субъекта резюме
    # останется жить прошлой версией (угроза T19)
    enabled = true
  }

  lifecycle_rule {
    id      = "expire-old-versions"
    enabled = true

    noncurrent_version_expiration {
      days = 30
    }
  }
}
