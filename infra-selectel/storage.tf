# Объектное хранилище для файлов (резюме, документы, фото, видео студентов).
#
# Приложения подключаются к S3 только переменными окружения: S3_ENDPOINT,
# S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (код менять не
# нужно: адресация "по пути" включена в коде всегда, а Selectel её поддерживает
# и по документации API использует по умолчанию). Регион в запросах - имя
# пула (ru-6), не ru-central1.
#
# Что НЕ поддерживается S3 Selectel (документация «S3 API»), и что из этого
# следует:
#   - Lifecycle: правила «удалять старые версии через 30 дней» из Яндекс-версии
#     перенести нельзя. С включённым версионированием удалённый файл
#     остаётся предыдущей версией навсегда (см. RUNBOOK, раздел про удаление
#     ПДн, - там же скрипт scripts/s3-prune-versions.sh);
#   - серверное шифрование (SSE-KMS) - блока encryption нет, шифрование
#     хранилища на стороне Selectel надо уточнить для 152-ФЗ;
#   - Public Access Block и ACL: все запросы приватные по умолчанию;
#   - CORS и Versioning - поддерживаются.

locals {
  bucket_crm      = var.bucket_crm_name != "" ? var.bucket_crm_name : "fhr-files-${substr(var.project_id, 0, 8)}"
  bucket_students = var.bucket_students_name != "" ? var.bucket_students_name : "fhr-students-files-${substr(var.project_id, 0, 8)}"
}

resource "aws_s3_bucket" "crm" {
  count  = var.manage_buckets ? 1 : 0
  bucket = local.bucket_crm
}

resource "aws_s3_bucket" "students" {
  count  = var.manage_buckets ? 1 : 0
  bucket = local.bucket_students
}

resource "aws_s3_bucket_versioning" "crm" {
  count  = var.manage_buckets && var.bucket_versioning ? 1 : 0
  bucket = aws_s3_bucket.crm[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_versioning" "students" {
  count  = var.manage_buckets && var.bucket_versioning ? 1 : 0
  bucket = aws_s3_bucket.students[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

# Видео студенты грузят браузером прямо в бакет по подписанной ссылке
# (app/api/upload/presign): без этого правила браузер запрос не отправит.
resource "aws_s3_bucket_cors_configuration" "students" {
  count  = var.manage_buckets ? 1 : 0
  bucket = aws_s3_bucket.students[0].id

  cors_rule {
    allowed_methods = ["PUT", "GET", "HEAD"]
    allowed_origins = ["https://${var.students_domain}"]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}
