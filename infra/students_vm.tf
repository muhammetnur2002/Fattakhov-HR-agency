# Отдельная машина для студенческой платформы.
#
# Раньше на fhr-app жили и CRM, и платформа (два Next-сервера, worker и Caddy
# на двух ядрах и 4 ГБ). Платформу выносим на свою машину: у неё отдельный
# запас ресурсов (чат держит открытое соединение на каждого собеседника),
# а сбой одной системы не задевает другую. База, бакеты, реестр и сервисные
# аккаунты остаются общими — переезжают только контейнеры и вход.
#
# Машина устроена так же, как fhr-app: образ Container Optimized Image, состав
# контейнеров лежит в метаданных docker-compose, секреты платформы приходят
# теми же students_runtime_env. Отличия:
#   - свой статический адрес, на него переключается запись students на Рег.ру;
#   - свой Caddyfile только с доменом платформы;
#   - Caddy и ежедневные напоминания включаются отдельными переключателями
#     (students_vm_caddy, students_vm_cron), чтобы переезд шёл по этапам.
#
# Порядок переезда (подробно — в памятке «Перенос студенческой платформы»):
#   1. apply с обоими переключателями false: машина стартует, платформа работает
#      без внешнего доступа, миграции выполнены;
#   2. запись students на Рег.ру -> students_vm_ip, затем students_vm_caddy = true;
#   3. через 1-2 суток платформа убирается с fhr-app и включается students_vm_cron
#      (две копии крона одновременно рассылали бы напоминания дважды).

variable "students_vm_cores" {
  description = "Число ядер машины студенческой платформы."
  type        = number
  default     = 2
}

variable "students_vm_memory" {
  description = "Память машины студенческой платформы, ГБ."
  type        = number
  default     = 4
}

variable "students_vm_core_fraction" {
  description = "Гарантированная доля ядра, %: 20, 50 или 100."
  type        = number
  default     = 100
}

variable "students_vm_disk_gb" {
  description = "Размер диска машины студенческой платформы, ГБ."
  type        = number
  default     = 30
}

variable "students_vm_caddy" {
  description = "Включить Caddy (HTTPS) на машине платформы. Только после переключения записи students на её адрес."
  type        = bool
  default     = false
}

variable "students_vm_cron" {
  description = "Включить ежедневные напоминания на машине платформы. Только после остановки такого же крона на fhr-app."
  type        = bool
  default     = false
}

resource "yandex_vpc_address" "students" {
  name = "fhr-students-ip"

  external_ipv4_address {
    zone_id = var.zone
  }
}

locals {
  # Состав контейнеров машины платформы. Переменные окружения платформы
  # те же, что и у платформы на fhr-app (local.students_env), поэтому вход,
  # шифрование данных и общие секреты с CRM не меняются.
  students_vm_compose = templatefile("${path.module}/docker-compose.students.yaml.tftpl", {
    students_app_image   = var.students_app_image
    students_tools_image = var.students_tools_image
    students_env_json    = jsonencode(local.students_env)
    enable_caddy         = var.students_vm_caddy
    enable_cron          = var.students_vm_cron

    unified_agent_image       = var.unified_agent_image
    unified_agent_config_json = jsonencode(local.unified_agent_config)
  })
}

resource "yandex_compute_instance" "students" {
  name        = "fhr-students"
  platform_id = "standard-v3"
  zone        = var.zone

  service_account_id = yandex_iam_service_account.vm.id

  # Право скачивать образы должно появиться раньше первой загрузки машины
  # (см. комментарий у yandex_compute_instance.app)
  depends_on = [yandex_container_registry_iam_binding.puller]

  resources {
    cores         = var.students_vm_cores
    memory        = var.students_vm_memory
    core_fraction = var.students_vm_core_fraction
  }

  boot_disk {
    initialize_params {
      image_id = data.yandex_compute_image.container_optimized.id
      size     = var.students_vm_disk_gb
      type     = "network-ssd"
    }
  }

  network_interface {
    subnet_id          = yandex_vpc_subnet.main.id
    nat                = true
    nat_ip_address     = yandex_vpc_address.students.external_ipv4_address[0].address
    security_group_ids = [yandex_vpc_security_group.app.id]
  }

  metadata = {
    docker-compose     = local.students_vm_compose
    ssh-keys           = var.ssh_public_key == "" ? null : "debug:${var.ssh_public_key}"
    serial-port-enable = var.serial_console ? "1" : "0"
    enable-oslogin     = var.serial_console ? "true" : "false"

    # В user-data здесь нет секретов (только Caddyfile и таймер уборки образов),
    # но sensitive оставлен единообразно с fhr-app
    user-data = sensitive(templatefile("${path.module}/cloud-init-students.yaml.tftpl", {
      CADDYFILE_INDENTED = indent(6, file("${path.module}/Caddyfile.students"))
    }))
  }

  scheduling_policy {
    preemptible = false
  }

  allow_stopping_for_update = true

  # Новый образ ОС не повод пересоздавать машину (см. объяснение у fhr-app)
  lifecycle {
    ignore_changes = [boot_disk[0].initialize_params[0].image_id]

    precondition {
      condition     = !strcontains(local.students_vm_compose, "students_app_image") && !strcontains(local.students_vm_compose, "students_env_json")
      error_message = "В составе машины платформы осталась неподставленная метка: проверьте docker-compose.students.yaml.tftpl."
    }
  }
}

output "students_vm_ip" {
  description = "Адрес машины студенческой платформы: на него переключается запись students на Рег.ру."
  value       = yandex_vpc_address.students.external_ipv4_address[0].address
}

output "students_vm_id" {
  description = "Идентификатор машины студенческой платформы (для чтения журнала загрузки)."
  value       = yandex_compute_instance.students.id
}
