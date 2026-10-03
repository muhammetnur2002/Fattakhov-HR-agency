# Внешняя проверка «сайт жив».
#
# Сигнал о сбое из кабинета (lib/monitoring/alerts.ts) шлёт сам сервер.
# Если он лёг целиком — машина, Docker, Caddy, — сигнала не будет никакого,
# и о простое узнают от людей. Эта проверка живёт вне сервера: облачная
# функция раз в 10 минут открывает сайт, кабинет и студенческую платформу
# и, если адрес не ответил дважды подряд, пишет на ящик сбоев (ALERT_EMAIL)
# через ту же почту reg.ru — она от нашего сервера не зависит.
#
# Состояния у функции нет: пока адрес лежит, письмо приходит каждые
# 10 минут. Это намеренно — простой не та вещь, о которой достаточно
# напомнить один раз. Укладывается в бесплатный объём Cloud Functions
# (около 4 300 запусков в месяц по секунде-две).
#
# Проверить доставку: yc serverless function invoke --name fhr-uptime
# --data '{"test": true}' — на ящик сбоев придёт проверочное письмо.

locals {
  # Почта и ящик сбоев — из того же prod.env, что уходит на сервер:
  # второй копии пароля почты нигде нет. Кавычки вокруг значения
  # (у SMTP_FROM они есть) снимаются
  prod_env = file(var.env_file)

  uptime_env = {
    URLS = jsonencode([
      ["Сайт", "https://${var.site_domain}/"],
      ["Кабинет", "https://${var.app_domain}/api/health"],
      ["Студенческая платформа", "https://students.${var.site_domain}/api/health"],
    ])
    SMTP_URL    = sensitive(trim(trimspace(regex("(?m)^SMTP_URL=(.*)$", local.prod_env)[0]), "\"'"))
    SMTP_FROM   = trim(trimspace(regex("(?m)^SMTP_FROM=(.*)$", local.prod_env)[0]), "\"'")
    ALERT_EMAIL = trim(trimspace(regex("(?m)^ALERT_EMAIL=(.*)$", local.prod_env)[0]), "\"'")
  }
}

data "archive_file" "uptime" {
  type        = "zip"
  source_dir  = "${path.module}/functions/uptime"
  output_path = "${path.module}/.build/uptime.zip"
}

resource "yandex_function" "uptime" {
  name              = "fhr-uptime"
  description       = "Внешняя проверка: отвечают ли сайт, кабинет и студенческая платформа"
  runtime           = "python312"
  entrypoint        = "index.handler"
  memory            = 128
  execution_timeout = "120"
  user_hash         = data.archive_file.uptime.output_sha256

  content {
    zip_filename = data.archive_file.uptime.output_path
  }

  environment = local.uptime_env
}

# Таймер запускает функцию от имени отдельного аккаунта с единственным
# правом — вызывать эту функцию
resource "yandex_iam_service_account" "uptime" {
  name        = "fhr-uptime${var.sa_suffix}"
  description = "Запускает внешнюю проверку по таймеру. Больше ничего."
}

resource "yandex_function_iam_binding" "uptime" {
  function_id = yandex_function.uptime.id
  role        = "functions.functionInvoker"
  members     = ["serviceAccount:${yandex_iam_service_account.uptime.id}"]
}

resource "yandex_function_trigger" "uptime" {
  name        = "fhr-uptime-every-10m"
  description = "Внешняя проверка раз в 10 минут"

  timer {
    cron_expression = "*/10 * ? * * *"
  }

  function {
    id                 = yandex_function.uptime.id
    service_account_id = yandex_iam_service_account.uptime.id
  }

  depends_on = [yandex_function_iam_binding.uptime]
}
