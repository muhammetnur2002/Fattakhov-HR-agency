# Скопировать в prod.tfvars и заполнить. prod.tfvars в git не попадает.
service_account_key_file = "/путь/к/authorized_key.json"
folder_id                = "b1g..."
# Пароль базы задавать не здесь, а переменной окружения:
#   export TF_VAR_db_password="..."

# Кому, кроме ALERT_EMAIL, писать об нехватке ресурсов (процессор, диск, память базы)
metrics_alert_extra_emails = ["admin@example.ru"]

# Плановые работы: "on" — всем страница «технические работы» (кроме /api/health*
# и запросов с заголовком X-Maintenance-Bypass). Вернуть "off" после работ.
# maintenance_bypass — секрет обхода, 16–128 знаков [A-Za-z0-9_-]; пусто = обхода нет
# maintenance_mode   = "off"
# maintenance_bypass = "Xk2m9-Qw7pLr4-Tz8vN3"
