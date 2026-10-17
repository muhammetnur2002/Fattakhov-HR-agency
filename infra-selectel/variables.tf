# ---------------------------------------------------------------------
# Доступ к Selectel
# ---------------------------------------------------------------------

variable "selectel_account_id" {
  description = "Номер аккаунта Selectel (в документации — domain_name / OS_DOMAIN_NAME)."
  type        = string
}

variable "selectel_admin_username" {
  description = "Сервисный пользователь-администратор Terraform (заводится в панели вручную)."
  type        = string
}

variable "selectel_admin_password" {
  description = "Пароль этого пользователя. Только через TF_VAR_selectel_admin_password или файл секретов вне git."
  type        = string
  sensitive   = true
}

variable "selectel_auth_url" {
  description = "Адрес Keystone (по документации Selectel)."
  type        = string
  default     = "https://cloud.api.selcloud.ru/identity/v3/"
}

variable "project_id" {
  description = "ID уже созданного проекта Selectel (в адресе консоли: my.selectel.ru/vpc/<project>/...)."
  type        = string
}

# ---------------------------------------------------------------------
# Где живёт
# ---------------------------------------------------------------------

variable "region" {
  description = "Пул (регион) Selectel. По документации ru-6 — мультизональный пул в Москве."
  type        = string
  default     = "ru-6"
}

variable "zone" {
  description = "Зона доступности (сегмент пула) для серверов и дисков."
  type        = string
  default     = "ru-6c"
}

variable "s3_pool" {
  description = "Пул Object Storage. Пусто — тот же, что region (в таблице доступности Selectel у ru-6 есть S3 Standard)."
  type        = string
  default     = ""
}

# ---------------------------------------------------------------------
# Домены
# ---------------------------------------------------------------------

variable "site_domain" {
  description = "Домен сайта (записи на Рег.ру переключаются вручную)."
  type        = string
  default     = "fattakhovhr.ru"
}

variable "app_domain" {
  description = "Домен кабинета."
  type        = string
  default     = "my.fattakhovhr.ru"
}

variable "students_domain" {
  description = "Домен студенческой платформы."
  type        = string
  default     = "students.fattakhovhr.ru"
}

# ---------------------------------------------------------------------
# Серверы
# ---------------------------------------------------------------------

variable "image_name" {
  description = "Имя публичного образа ОС. ПРОВЕРИТЬ в панели или через openstack image list: имя собрано по образцу из документации (Ubuntu 20.04 LTS 64-bit)."
  type        = string
  default     = "Ubuntu 24.04 LTS 64-bit"
}

variable "vm_vcpus" {
  description = "Число vCPU каждого сервера."
  type        = number
  default     = 2
}

variable "vm_ram_mb" {
  description = "Память каждого сервера, МБ."
  type        = number
  default     = 4096
}

variable "vm_disk_gb" {
  description = "Размер загрузочного сетевого диска, ГБ."
  type        = number
  default     = 40
}

variable "volume_type" {
  description = "Тип сетевого диска без зоны. В ru-6 по документации есть только basic, universal2 и fast2 (имя тома — <тип>.<зона>, например universal2.ru-6c)."
  type        = string
  default     = "universal2"
}

variable "flavor_id" {
  description = "ID готовой конфигурации. Пусто — Terraform создаёт свою (vCPU и RAM из переменных выше, disk = 0 для сетевого диска, как в примере Selectel). Линия (Standard, с выделенными ядрами, HighFreq) определяется конфигурацией: сверить в панели, см. RUNBOOK."
  type        = string
  default     = ""
}

variable "ssh_public_key" {
  description = "Открытый ключ OpenSSH для входа на серверы (пользователь ubuntu). Вход по паролю выключен."
  type        = string
}

variable "ssh_allowed_cidrs" {
  description = "С каких адресов открыт SSH, например [\"203.0.113.7/32\"]. Пустой список: порт 22 закрыт совсем."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for c in var.ssh_allowed_cidrs : can(cidrhost(c, 0)) && !contains(["0.0.0.0/0", "::/0"], c)])
    error_message = "ssh_allowed_cidrs: нужны корректные адреса вида 203.0.113.7/32; открывать SSH всему интернету (0.0.0.0/0) нельзя."
  }
}

# ---------------------------------------------------------------------
# База данных
# ---------------------------------------------------------------------

variable "db_version_filter" {
  description = "Версия PostgreSQL."
  type        = string
  default     = "16"
}

variable "db_vcpus" {
  type    = number
  default = 2
}

variable "db_ram_mb" {
  type    = number
  default = 4096
}

variable "db_disk_gb" {
  description = "Диск кластера, ГБ (для network-ultra минимум 32, проверено на живом аккаунте)."
  type        = number
  default     = 32
}

variable "db_disk_type" {
  description = "Тип диска кластера: local или network-ultra (по документации ресурса). Какой доступен в ru-6 - проверить при создании."
  type        = string
  default     = "network-ultra"
}

variable "db_node_count" {
  description = "Узлов в кластере (1-6). Один узел: SLA Selectel действует только для кластеров с репликами, при отказе мастера база недоступна до его восстановления."
  type        = number
  default     = 1
}

variable "db_backup_retention_days" {
  description = "Срок хранения резервных копий, дней (на тарифе проекта допустимо только 7, проверено на живом аккаунте)."
  type        = number
  default     = 7
}

variable "db_sslmode" {
  description = "Параметр sslmode в строках подключения. Какой режим подходит - решается при первом подключении (RUNBOOK, раздел про TLS к базе)."
  type        = string
  default     = "require"
}

variable "crm_db_password" {
  description = "Пароль пользователя fhr_crm."
  type        = string
  sensitive   = true
}

variable "students_db_password" {
  description = "Пароль пользователя fhr_students (другой, чем у CRM)."
  type        = string
  sensitive   = true
}

# ---------------------------------------------------------------------
# Хранилище файлов
# ---------------------------------------------------------------------

variable "manage_buckets" {
  description = "Создавать бакеты Terraform-ом через провайдер aws. false: бакеты созданы руками в панели (запасной путь, RUNBOOK.md), Terraform знает только имена."
  type        = bool
  default     = true
}

variable "bucket_crm_name" {
  description = "Имя бакета CRM. Пусто: fhr-files-<8 первых знаков ID проекта>. Имя уникально среди всех пользователей пула."
  type        = string
  default     = ""
}

variable "bucket_students_name" {
  description = "Имя бакета платформы. Пусто: fhr-students-files-<8 знаков ID проекта>."
  type        = string
  default     = ""
}

variable "bucket_versioning" {
  description = "Версионирование бакетов. ВНИМАНИЕ: правил жизненного цикла в S3 Selectel нет (Lifecycle в списке неподдерживаемых операций), старые версии сами не удаляются - см. RUNBOOK, раздел про удаление ПДн."
  type        = bool
  default     = true
}

# ---------------------------------------------------------------------
# Образы и приложение
# ---------------------------------------------------------------------

variable "registry_name" {
  description = "Имя реестра контейнеров (до 20 знаков, строчные латинские, цифры, дефис)."
  type        = string
  default     = "fhr"
}

variable "crm_tag" {
  description = "Тег образа fhr-crm."
  type        = string
}

variable "crm_tools_tag" {
  description = "Тег образа fhr-crm-tools (миграции, фоновые задачи)."
  type        = string
}

variable "students_tag" {
  description = "Тег образа fhr-students (--target runner)."
  type        = string
}

variable "students_tools_tag" {
  description = "Тег образа fhr-students-tools (--target tools, миграции)."
  type        = string
}

variable "caddy_image" {
  description = "Образ Caddy. Docker Hub из России бывает нестабилен - при необходимости переложить в наш реестр (RUNBOOK)."
  type        = string
  default     = "cr.selcloud.ru/fhr/caddy-rl:1"
}

variable "cron_image" {
  description = "Образ для ежедневного напоминания платформы."
  type        = string
  default     = "alpine:3.20"
}

# Секреты приложений - в отдельных картах, как runtime_env и
# students_runtime_env в версии для Яндекса: у платформы не должно быть
# секретов CRM. DATABASE_URL и S3_* добавляет сам Terraform из созданных
# ресурсов; задавать их здесь не нужно (если заданы - побеждают значения
# Terraform).
variable "crm_env" {
  description = "Переменные окружения CRM (AUTH_SECRET, SMTP_URL, SMTP_FROM, APP_URL, ALERT_EMAIL, VK_*, VAPID_* и т. д. по crm/.env.example). Значения без апострофа и перевода строки."
  type        = map(string)
  sensitive   = true

  validation {
    condition     = alltrue([for v in values(nonsensitive(var.crm_env)) : !strcontains(v, "'") && !strcontains(v, "\n")])
    error_message = "В значениях crm_env не должно быть апострофа и перевода строки: файл окружения собирается в одинарных кавычках."
  }
}

variable "students_env" {
  description = "Переменные окружения платформы студентов (по platform-for-students/.env.example и deploy/.env.example: CRON_SECRET, PII_ENCRYPTION_KEY, SMTP_*, ...)."
  type        = map(string)
  sensitive   = true

  validation {
    condition     = alltrue([for v in values(nonsensitive(var.students_env)) : !strcontains(v, "'") && !strcontains(v, "\n")])
    error_message = "В значениях students_env не должно быть апострофа и перевода строки: файл окружения собирается в одинарных кавычках."
  }
}

# ---------------------------------------------------------------------
# Плановые работы (как в infra/maintenance.tf)
# ---------------------------------------------------------------------

variable "maintenance_mode" {
  description = "on: страница работ всем (кроме /api/health* и обхода), off: обычная работа."
  type        = string
  default     = "off"

  validation {
    condition     = contains(["on", "off"], var.maintenance_mode)
    error_message = "maintenance_mode - строка on или off."
  }
}

variable "maintenance_bypass" {
  description = "Секрет обхода страницы работ (заголовок X-Maintenance-Bypass). Пусто: обхода нет."
  type        = string
  default     = ""
  sensitive   = true

  validation {
    condition     = can(regex("^([A-Za-z0-9_-]{16,128})?$", var.maintenance_bypass))
    error_message = "maintenance_bypass - пустая строка или 16-128 знаков: латинские буквы, цифры, дефис и подчёркивание."
  }
}

variable "s3_access_key" {
  description = "Ключ доступа S3 (создаётся в панели Selectel для сервисного пользователя)"
  type        = string
  sensitive   = true
}

variable "s3_secret_key" {
  description = "Секрет ключа S3"
  type        = string
  sensitive   = true
}

variable "db_flavor_id" {
  description = "ID готовой конфигурации кластера БД из списка Selectel (GET /v1/flavors). Пусто = конфигурация из db_vcpus/db_ram_mb/db_disk_gb."
  type        = string
  default     = ""
}
