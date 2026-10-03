# Сервер приложения.
#
# Одна виртуальная машина на образе, оптимизированном под контейнеры:
# операционную систему обновляет Яндекс, нам остаётся только образ
# приложения. Это снимает часть угрозы T11 - непропатченная система.
#
# На машине три контейнера: обратный прокси с автоматическим TLS,
# приложение и фоновые задачи. Прокси нужен ради сертификатов:
# балансировщик облака стоил бы дороже самой машины, а на одном
# сервере он бессмысленен.

resource "yandex_container_registry" "main" {
  name = "fhr"
}

# Аккаунт машины: только скачивание образов. Из машины, если её
# скомпрометируют, нельзя ни изменить образ, ни тронуть остальное
# облако
resource "yandex_iam_service_account" "vm" {
  name        = "fhr-vm${var.sa_suffix}"
  description = "Виртуальная машина приложения. Только чтение образов."
}

resource "yandex_container_registry_iam_binding" "puller" {
  registry_id = yandex_container_registry.main.id
  role        = "container-registry.images.puller"
  members     = ["serviceAccount:${yandex_iam_service_account.vm.id}"]
}

data "yandex_compute_image" "container_optimized" {
  family = "container-optimized-image"
}

# Состав сервера (docker-compose.yaml) с подставленными образами и
# переменными окружения.
#
# Подстановка — простой поиск строки, поэтому метки обязаны не содержать
# друг друга: раньше у студенческой платформы были STUDENTS_APP_IMAGE_…,
# STUDENTS_TOOLS_IMAGE_… и STUDENTS_RUNTIME_ENV_… — и замена меток CRM
# срабатывала внутри них, отдавая студенческим службам «STUDENTS_<образ
# CRM>» и секреты CRM, а состав целиком становился нечитаемым (поймано
# 30.09.2026 до первого применения). Метки платформы теперь в двойных
# подчёркиваниях, а проверка у ресурса ниже не пропустит план, если после
# подстановки осталась хоть одна метка.
locals {
  # Ключи бакета CRM — из ресурса (storage.tf), а не из /etc/fhr.env:
  # так ключ меняется обычным apply (-replace ключа), без пересоздания
  # машины. Значения в /etc/fhr.env устарели 01.10.2026 и перекрываются
  # этими — environment в compose сильнее env_file.
  crm_env = merge(var.runtime_env, {
    S3_ACCESS_KEY_ID     = yandex_iam_service_account_static_access_key.storage.access_key
    S3_SECRET_ACCESS_KEY = yandex_iam_service_account_static_access_key.storage.secret_key
  })

  # Ключи бакета — из ресурсов студенческой платформы (students.tf), а не
  # из prod.tfvars: создаются тем же apply, заранее их не вписать
  students_env = merge(var.students_runtime_env, {
    S3_ACCESS_KEY_ID     = yandex_iam_service_account_static_access_key.students_storage.access_key
    S3_SECRET_ACCESS_KEY = yandex_iam_service_account_static_access_key.students_storage.secret_key
  })

  # JSON — корректный YAML, поэтому словарь переменных встаёт
  # в `environment:` как есть, без ручной сборки отступов
  docker_compose = replace(replace(replace(replace(replace(replace(
    file("${path.module}/docker-compose.yaml"),
    "APP_IMAGE_PLACEHOLDER", var.app_image),
    "TOOLS_IMAGE_PLACEHOLDER", var.tools_image),
    "RUNTIME_ENV_PLACEHOLDER", jsonencode(local.crm_env)),
    "__STUDENTS_APP_IMAGE__", var.students_app_image),
    "__STUDENTS_TOOLS_IMAGE__", var.students_tools_image),
  "__STUDENTS_ENV__", jsonencode(local.students_env))
}

resource "yandex_compute_instance" "app" {
  name        = "fhr-app"
  platform_id = "standard-v3"
  zone        = var.zone

  service_account_id = yandex_iam_service_account.vm.id

  # Право скачивать образы обязано существовать до первой загрузки.
  #
  # Машина ссылается на сервисный аккаунт, но не на привязку прав к нему,
  # поэтому без этой строки terraform вправе создавать их параллельно -
  # и машина успеет попросить образ из приватного реестра раньше, чем
  # ей разрешат его брать. На первой выкатке повезло: привязка появилась
  # за те сорок секунд, что шла загрузка. Полагаться на это нельзя,
  # а пересоздавать машину придётся (смена настроек уезжает в неё только
  # через cloud-init, то есть при первой загрузке).
  depends_on = [yandex_container_registry_iam_binding.puller]

  # Было 2 ядра/20%/2 ГБ — хватало на один Next.js под низкой нагрузкой
  # (медиана CPU 0,4% по замеру 22.09.2026). Второе приложение — это
  # второй процесс Node тех же примерно размеров, и 2 ГБ на два
  # Next-сервера плюс worker и Caddy уже впритык. Поднято до 4 ГБ
  # и до 50% доли процессора; allow_stopping_for_update ниже (было
  # задано ещё раньше) переживает это как обычный резайз — диск,
  # IP и cloud-init не трогаются, это не то же самое, что -replace.
  resources {
    cores         = 2
    memory        = 4
    core_fraction = 50
  }

  boot_disk {
    initialize_params {
      image_id = data.yandex_compute_image.container_optimized.id
      size     = 20
      type     = "network-ssd"
    }
  }

  network_interface {
    subnet_id          = yandex_vpc_subnet.main.id
    nat                = true
    nat_ip_address     = yandex_vpc_address.app.external_ipv4_address[0].address
    security_group_ids = [yandex_vpc_security_group.app.id]
  }

  # Метаданные машины.
  #
  # Сюда уезжают и состав контейнеров, и файл настроек с секретами.
  # Метаданные видит тот, у кого есть право читать ВМ в этом каталоге,
  # то есть владелец облака и аккаунт выкатки - тот же круг, что имеет
  # доступ ко всему остальному. Более строгий вариант - хранилище
  # секретов Lockbox с выдачей по токену при загрузке; он в планах,
  # но требует отдельной отладки, а отлаживать загрузку без SSH дорого.
  metadata = {
    # JSON — корректный YAML, поэтому словарь переменных встаёт
    # в `environment:` как есть, без ручной сборки отступов
    docker-compose = local.docker_compose

    ssh-keys = var.ssh_public_key == "" ? null : "debug:${var.ssh_public_key}"

    # Доступ к последовательной консоли через API облака.
    #
    # Нужен, потому что прямое соединение с машиной из среды
    # разработчика ненадёжно: промежуточный узел принимает любое
    # подключение и не доводит его до сервера. Консоль идёт другим
    # путём - через API Яндекса, который работает.
    serial-port-enable = var.serial_console ? "1" : "0"

    # Вход по учётным записям облака: без него консоль не пускает
    # даже по ключу
    enable-oslogin = var.serial_console ? "true" : "false"

    # sensitive: внутри /etc/fhr.env — пароль базы, AUTH_SECRET, ключи
    # хранилища, SMTP, токен бота. Без него план печатал user-data
    # целиком при каждом пересоздании машины и правке prod.env — все
    # секреты на экране и в любом сохранённом выводе плана. Значение
    # то же, скрыт только вывод
    user-data = sensitive(templatefile("${path.module}/cloud-init.yaml.tftpl", {
      # Отступ в шесть пробелов: содержимое вставляется внутрь
      # блока content: | и обязано быть с ним выровнено, иначе
      # cloud-init молча пропустит файл
      CADDYFILE_INDENTED = indent(6, file("${path.module}/Caddyfile"))
      ENVFILE_INDENTED   = indent(6, file(var.env_file))
    }))
  }

  scheduling_policy {
    preemptible = false
  }

  allow_stopping_for_update = true

  /*
    Новый образ ОС не повод пересоздавать машину.

    Образ берётся как «последний в семействе» (data.yandex_compute_image),
    а Яндекс выпускает новые версии сам. 21.09.2026 в 21:23 по Москве
    вышла очередная, и с этой минуты план любой обычной выкатки —
    даже смены тега приложения — показывал «1 добавить, 1 удалить»:
    смена image_id принуждает пересоздание. Итог для человека: простой
    на минуты и выпуск сертификата Let's Encrypt (пять в неделю на имя)
    вместо перезапуска контейнеров за секунды. Вчерашние планы были ещё
    чистыми — образ вышел позже — и заметить это можно было только
    прочитав план, а не по «apply прошёл».

    Машина остаётся на образе, с которого создана; обновляется он там,
    где пересоздание и так нужно: правка prod.env или Caddyfile идёт
    через -replace, и новая машина возьмёт свежий образ (ignore_changes
    касается только существующей машины, не создания новой). Так обновление
    ОС — осознанное решение, а не побочный эффект выкатки тега.
  */
  lifecycle {
    ignore_changes = [boot_disk[0].initialize_params[0].image_id]

    precondition {
      condition     = !strcontains(local.docker_compose, "PLACEHOLDER") && !strcontains(local.docker_compose, "__STUDENTS_")
      error_message = "В составе сервера осталась неподставленная метка: проверьте docker-compose.yaml и local.docker_compose."
    }
  }
}
