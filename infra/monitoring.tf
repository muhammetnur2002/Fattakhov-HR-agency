# Внешняя проверка «сайт жив».
#
# Сигнал о сбое из кабинета (lib/monitoring/alerts.ts) шлёт сам сервер.
# Если он лёг целиком — машина, Docker, Caddy, — сигнала не будет никакого,
# и о простое узнают от людей. Эта проверка живёт вне сервера: облачная
# функция раз в 10 минут открывает сайт, кабинет, студенческую платформу
# и отметку фоновых задач кабинета и, если адрес не ответил дважды подряд,
# пишет на ящик сбоев (ALERT_EMAIL) через ту же почту reg.ru — она от нашего
# сервера не зависит.
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
  prod_env = file(pathexpand(var.env_file))

  # Что считается «живым». Один список на двоих: его опрашивает функция
  # fhr-uptime раз в 10 минут, и его же ждёт deploy.sh после выкатки
  # (вывод health_urls в outputs.tf) — новый адрес не забудется ни там, ни там
  uptime_targets = [
    ["Сайт", "https://${var.site_domain}/"],
    ["Кабинет", "https://${var.app_domain}/api/health"],
    ["Студенческая платформа", "https://students.${var.site_domain}/api/health"],
    # Фоновый процесс кабинета (письма, напоминания, очередь уничтожения
    # ПДн): 503, если удачного прохода не было дольше 10 минут
    # (crm/lib/monitoring/worker-heartbeat.ts). Сайт при этом открывается,
    # и без этой строки его остановку не увидел бы никто
    ["Фоновые задачи кабинета", "https://${var.app_domain}/api/health/worker"],
  ]

  uptime_env = {
    URLS        = jsonencode(local.uptime_targets)
    SMTP_URL    = sensitive(trim(trimspace(regex("(?m)^SMTP_URL=(.*)$", local.prod_env)[0]), "\"'"))
    SMTP_FROM   = trim(trimspace(regex("(?m)^SMTP_FROM=(.*)$", local.prod_env)[0]), "\"'")
    ALERT_EMAIL = trim(trimspace(regex("(?m)^ALERT_EMAIL=(.*)$", local.prod_env)[0]), "\"'")
  }
}

data "archive_file" "uptime" {
  type        = "zip"
  source_dir  = "${path.module}/functions/uptime"
  output_path = "${path.module}/.build/uptime.zip"
  # Права файлов внутри архива — одни на всех компьютерах. Без этого Windows
  # кладёт в архив 0666, macOS — 0644, сумма архива (user_hash) выходит разной,
  # и каждый apply с другой системы заново выкладывает ту же функцию. 0666 —
  # как уже выложено 04.10.2026: с этой строкой план «изменений нет» у всех
  output_file_mode = "0666"
  # Проверки логики нужны разработчику, в облаке им делать нечего
  excludes = ["test_uptime.py", "__pycache__"]
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

# ---------------------------------------------------------------------
# Оповещения по ресурсам: процессор машин, диск/память/процессор базы
# ---------------------------------------------------------------------
#
# Алерты и каналы уведомлений Monitoring в публичном API не заведены: их
# создают руками в консоли, и живут они вне репозитория. Поэтому та же
# работа сделана кодом — по образцу проверки «сайт жив» выше. Функция
# fhr-metrics раз в 10 минут читает метрики (Monitoring API, право
# monitoring.viewer на каталог) и пишет на ящик сбоев через почту reg.ru.
# Пороги и подсказки — в functions/metrics/index.py (CHECKS); как работает
# и когда пишет — в docstring там же.
#
# Проверить доставку: yc serverless function invoke --name fhr-metrics
# --data '{"test": true}'

variable "metrics_alert_extra_emails" {
  description = "Дополнительные получатели оповещений по ресурсам (кроме ALERT_EMAIL из prod.env)."
  type        = list(string)
  default     = []
}

locals {
  metrics_env = {
    FOLDER_ID = var.folder_id
    # Идентификаторы машин: память и диск пишет агент (agent.tf) с меткой host = id
    VM_IDS = jsonencode({
      "fhr-app"      = yandex_compute_instance.app.id
      "fhr-students" = yandex_compute_instance.students.id
    })
    EXTRA_RECIPIENTS = join(",", var.metrics_alert_extra_emails)
    SMTP_URL         = local.uptime_env.SMTP_URL
    SMTP_FROM        = local.uptime_env.SMTP_FROM
    ALERT_EMAIL      = local.uptime_env.ALERT_EMAIL
  }
}

data "archive_file" "metrics" {
  type        = "zip"
  source_dir  = "${path.module}/functions/metrics"
  output_path = "${path.module}/.build/metrics.zip"
  # Права файлов в архиве — одни на всех системах (см. archive_file "uptime")
  output_file_mode = "0666"
  # Проверки логики нужны разработчику, в облаке им делать нечего
  excludes = ["test_metrics.py", "__pycache__"]
}

# Аккаунт, от имени которого функция читает метрики: только чтение метрик
# каталога, ничего изменить он не может
resource "yandex_iam_service_account" "metrics" {
  name        = "fhr-metrics${var.sa_suffix}"
  description = "Читает метрики для оповещений по ресурсам. Только чтение."
}

resource "yandex_resourcemanager_folder_iam_member" "metrics_viewer" {
  folder_id = var.folder_id
  role      = "monitoring.viewer"
  member    = "serviceAccount:${yandex_iam_service_account.metrics.id}"
}

resource "yandex_function" "metrics" {
  name               = "fhr-metrics"
  description        = "Оповещения по ресурсам: процессор, память и диск машин; диск, память и процессор базы"
  runtime            = "python312"
  entrypoint         = "index.handler"
  memory             = 128
  execution_timeout  = "120"
  user_hash          = data.archive_file.metrics.output_sha256
  service_account_id = yandex_iam_service_account.metrics.id

  content {
    zip_filename = data.archive_file.metrics.output_path
  }

  environment = local.metrics_env

  depends_on = [yandex_resourcemanager_folder_iam_member.metrics_viewer]
}

# Запускает тот же таймерный аккаунт, что и проверку «сайт жив»: у него
# по-прежнему единственное право — вызывать функции из этого файла
resource "yandex_function_iam_binding" "metrics" {
  function_id = yandex_function.metrics.id
  role        = "functions.functionInvoker"
  members     = ["serviceAccount:${yandex_iam_service_account.uptime.id}"]
}

resource "yandex_function_trigger" "metrics" {
  name        = "fhr-metrics-every-10m"
  description = "Оповещения по ресурсам раз в 10 минут"

  timer {
    cron_expression = "*/10 * ? * * *"
  }

  function {
    id                 = yandex_function.metrics.id
    service_account_id = yandex_iam_service_account.uptime.id
  }

  depends_on = [yandex_function_iam_binding.metrics]
}
