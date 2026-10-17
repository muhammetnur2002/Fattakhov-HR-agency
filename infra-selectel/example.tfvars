# Скопировать в prod.tfvars (ВНЕ git, например ~/.fhr-selectel/prod.tfvars) и заполнить.
# Пароли и ключи не коммитить. Чувствительное можно задавать и переменными
# окружения TF_VAR_<имя>, например TF_VAR_selectel_admin_password.
# Подробно - RUNBOOK.md.

# --- Доступ к Selectel ---
selectel_account_id     = "123456"          # номер аккаунта
selectel_admin_username = "terraform-admin" # сервисный пользователь (создаётся в панели)
# selectel_admin_password: export TF_VAR_selectel_admin_password=...
project_id = "00000000-0000-0000-0000-000000000000" # из адреса my.selectel.ru/vpc/<project>/...

# --- Где живёт (по умолчанию как у проекта владельца) ---
region = "ru-6"
zone   = "ru-6c"
# s3_pool = "ru-6"          # пусто = как region

# --- Серверы ---
ssh_public_key    = "ssh-ed25519 AAAA... owner@example"
ssh_allowed_cidrs = [] # SSH закрыт. На время выкатки: ["203.0.113.7/32"]
# flavor_id = ""            # пусто = Terraform создаёт конфигурацию 2 vCPU / 4 ГБ
# volume_type = "universal2"  # в ru-6: basic, universal2, fast2

# --- База ---
# crm_db_password / students_db_password: TF_VAR_crm_db_password, TF_VAR_students_db_password
# db_node_count = 1

# --- Образы (теги из GitHub Actions «Образы для выкатки (Selectel)») ---
crm_tag            = "m1"
crm_tools_tag      = "m1"
students_tag       = "v1"
students_tools_tag = "v1"

# --- Плановые работы ---
# maintenance_mode   = "on"
# maintenance_bypass = "Xk2m9-Qw7pLr4-Tz8vN3"

# --- Переменные приложений: значения-заглушки, реальные - только в файле вне git ---
# DATABASE_URL и S3_* Terraform добавляет сам.
crm_env = {
  AUTH_SECRET = "change-me"
  APP_URL     = "https://my.fattakhovhr.ru"
  SMTP_URL    = "smtps://user:password@smtp.example.ru:465"
  SMTP_FROM   = "Fattakhov HR Agency <noreply@fattakhovhr.ru>"
  ALERT_EMAIL = "bugs@example.ru"
  # VK_BOT_TOKEN, VK_GROUP_ID, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT ...
}

students_env = {
  APP_URL            = "https://students.fattakhovhr.ru"
  CRON_SECRET        = "change-me"
  PII_ENCRYPTION_KEY = "change-me"
  SMTP_URL           = "smtps://user:password@smtp.example.ru:465"
  SMTP_FROM          = "Fattakhov HR Agency <noreply@fattakhovhr.ru>"
  # остальное - по platform-for-students/.env.example и deploy/.env.example
}
