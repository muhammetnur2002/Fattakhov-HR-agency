# Скопировать в prod.tfvars и заполнить. prod.tfvars в git не попадает.
service_account_key_file = "/путь/к/authorized_key.json"
folder_id                = "b1g..."
# Пароль базы задавать не здесь, а переменной окружения:
#   export TF_VAR_db_password="..."
