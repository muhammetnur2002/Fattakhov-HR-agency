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
  name        = "fhr-vm"
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

resource "yandex_compute_instance" "app" {
  name        = "fhr-app"
  platform_id = "standard-v3"
  zone        = var.zone

  service_account_id = yandex_iam_service_account.vm.id

  resources {
    cores         = 2
    memory        = 2
    core_fraction = 20
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
    docker-compose = replace(
      replace(
        file("${path.module}/docker-compose.yaml"),
        "APP_IMAGE_PLACEHOLDER",
        var.app_image,
      ),
      "TOOLS_IMAGE_PLACEHOLDER",
      var.tools_image,
    )

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

    user-data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
      # Отступ в шесть пробелов: содержимое вставляется внутрь
      # блока content: | и обязано быть с ним выровнено, иначе
      # cloud-init молча пропустит файл
      CADDYFILE_INDENTED = indent(6, file("${path.module}/Caddyfile"))
      ENVFILE_INDENTED   = indent(6, file(var.env_file))
    })
  }

  scheduling_policy {
    preemptible = false
  }

  allow_stopping_for_update = true
}
