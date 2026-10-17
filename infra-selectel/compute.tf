# Два сервера: fhr-app (кабинет + сайт) и fhr-students (платформа студентов).
#
# Размер согласован: 2 vCPU / 4 ГБ / 40 ГБ сетевой диск, Ubuntu 24.04.
# Docker и compose ставит cloud-init (cloud-init.yaml.tftpl), состав
# контейнеров, Caddyfile и лимиты - те же, что в Яндекс-версии.

# Образ ОС: публичный образ ищется по имени, как в примерах Selectel
data "openstack_images_image_v2" "ubuntu" {
  name        = var.image_name
  most_recent = true
  visibility  = "public"
}

# Конфигурация (flavor). Для сетевого диска disk = 0 - так сказано в примере
# Selectel. ВАЖНО: в таблице «Доступность продуктов по локациям» для пула ru-6
# линия облачных серверов «Standard» не отмечена ни в одной зоне, отмечены
# «Standard с выделенными ядрами», HighFreq и др. Какая линия получится у
# конфигурации, созданной так, и сколько она стоит - проверить в панели до
# apply (RUNBOOK.md, шаг 3); при необходимости задать flavor_id готовой
# конфигурации нужной линии.
resource "openstack_compute_flavor_v2" "server" {
  count     = var.flavor_id == "" ? 1 : 0
  name      = "fhr-${var.vm_vcpus}vcpu-${var.vm_ram_mb}mb-netdisk"
  vcpus     = var.vm_vcpus
  ram       = var.vm_ram_mb
  disk      = 0
  is_public = false

  lifecycle {
    create_before_destroy = true
  }
}

locals {
  flavor_id = var.flavor_id != "" ? var.flavor_id : openstack_compute_flavor_v2.server[0].id

  registry_endpoint = trimprefix(selectel_craas_registry_v1.main.endpoint, "https://")
  registry_host     = split("/", local.registry_endpoint)[0]

  images = {
    crm            = "${local.registry_endpoint}/fhr-crm:${var.crm_tag}"
    crm_tools      = "${local.registry_endpoint}/fhr-crm-tools:${var.crm_tools_tag}"
    students       = "${local.registry_endpoint}/fhr-students:${var.students_tag}"
    students_tools = "${local.registry_endpoint}/fhr-students-migrate:${var.students_tools_tag}"
  }

  # Адрес базы. Ключи карты connections в документации не описаны:
  # берём "master", а если такого ключа нет - первое значение.
  # ПРОВЕРИТЬ после первого apply: terraform output db_connections
  db_connections = selectel_dbaas_postgresql_datastore_v1.main.connections
  db_host        = lookup(local.db_connections, "master", try(values(local.db_connections)[0], ""))
  db_port        = 5432

  s3_common = {
    S3_ENDPOINT = local.s3_endpoint
    S3_REGION   = local.s3_pool
  }

  # DATABASE_URL, S3_* считает Terraform из созданных ресурсов (перекрывают
  # одноимённые ключи из crm_env / students_env)
  crm_env_final = merge(nonsensitive(var.crm_env), local.s3_common, {
    DATABASE_URL         = "postgresql://${selectel_dbaas_user_v1.crm.name}:${urlencode(var.crm_db_password)}@${local.db_host}:${local.db_port}/fhr_crm?sslmode=${var.db_sslmode}"
    S3_BUCKET            = local.bucket_crm
    S3_ACCESS_KEY_ID     = var.s3_access_key
    S3_SECRET_ACCESS_KEY = var.s3_secret_key
  })

  students_env_final = merge(nonsensitive(var.students_env), local.s3_common, {
    DATABASE_URL         = "postgresql://${selectel_dbaas_user_v1.students.name}:${urlencode(var.students_db_password)}@${local.db_host}:${local.db_port}/fhr_students?schema=public&sslmode=${var.db_sslmode}"
    DIRECT_DATABASE_URL  = "postgresql://${selectel_dbaas_user_v1.students.name}:${urlencode(var.students_db_password)}@${local.db_host}:${local.db_port}/fhr_students?schema=public&sslmode=${var.db_sslmode}"
    S3_BUCKET            = local.bucket_students
    S3_ACCESS_KEY_ID     = var.s3_access_key
    S3_SECRET_ACCESS_KEY = var.s3_secret_key
  })

  # Файл окружения для docker compose: KEY='value'. В одинарных кавычках
  # compose не раскрывает $ - значения остаются буквальными (апостроф в
  # значениях запрещён проверкой в variables.tf).
  crm_env_file      = join("\n", [for k in sort(keys(local.crm_env_final)) : "${k}='${local.crm_env_final[k]}'"])
  students_env_file = join("\n", [for k in sort(keys(local.students_env_final)) : "${k}='${local.students_env_final[k]}'"])

  # Caddyfile = снипеты плановых работ + сам Caddyfile (снипет должен быть
  # определён раньше, чем импортируется)
  caddyfile_app      = "${file("${path.module}/maintenance.caddy")}\n${file("${path.module}/Caddyfile")}"
  caddyfile_students = "${file("${path.module}/maintenance.caddy")}\n${file("${path.module}/Caddyfile.students")}"

  compose_app = templatefile("${path.module}/docker-compose.app.yaml.tftpl", {
    app_image               = local.images.crm
    tools_image             = local.images.crm_tools
    caddy_image             = var.caddy_image
    maintenance_mode_json   = jsonencode(var.maintenance_mode)
    maintenance_bypass_json = jsonencode(nonsensitive(var.maintenance_bypass))
  })

  compose_students = templatefile("${path.module}/docker-compose.students.yaml.tftpl", {
    students_app_image      = local.images.students
    students_tools_image    = local.images.students_tools
    caddy_image             = var.caddy_image
    cron_image              = var.cron_image
    maintenance_mode_json   = jsonencode(var.maintenance_mode)
    maintenance_bypass_json = jsonencode(nonsensitive(var.maintenance_bypass))
  })

  servers = {
    app = {
      hostname = "fhr-app"
      compose  = local.compose_app
      caddy    = local.caddyfile_app
      env      = local.crm_env_file
      env_name = "app"
    }
    students = {
      hostname = "fhr-students"
      compose  = local.compose_students
      caddy    = local.caddyfile_students
      env      = local.students_env_file
      env_name = "students"
    }
  }
}

# Системный диск - сетевой, создаётся из образа. Тип тома в ru-6 -
# <тип>.<зона>, например universal2.ru-6c (таблица типов в документации).
resource "openstack_blockstorage_volume_v3" "boot" {
  for_each             = local.servers
  name                 = "${each.value.hostname}-boot"
  size                 = var.vm_disk_gb
  image_id             = data.openstack_images_image_v2.ubuntu.id
  volume_type          = "${var.volume_type}.${var.zone}"
  availability_zone    = var.zone
  enable_online_resize = true

  lifecycle {
    ignore_changes = [image_id]
  }
}

resource "openstack_compute_instance_v2" "server" {
  for_each          = local.servers
  name              = each.value.hostname
  flavor_id         = local.flavor_id
  key_pair          = openstack_compute_keypair_v2.main.name
  availability_zone = var.zone

  network {
    port = openstack_networking_port_v2.server[each.key].id
  }

  block_device {
    uuid             = openstack_blockstorage_volume_v3.boot[each.key].id
    source_type      = "volume"
    destination_type = "volume"
    boot_index       = 0
  }

  # sensitive: внутри пароль базы, ключи S3, токен реестра
  user_data = sensitive(templatefile("${path.module}/cloud-init.yaml.tftpl", {
    hostname       = each.value.hostname
    env_name       = each.value.env_name
    compose_gz     = base64gzip(each.value.compose)
    caddyfile_gz   = base64gzip(each.value.caddy)
    env_gz         = base64gzip(each.value.env)
    registry_host  = local.registry_host
    registry_user  = selectel_craas_token_v2.server.username
    registry_token = selectel_craas_token_v2.server.token
  }))

  vendor_options {
    ignore_resize_confirmation = true
  }

  # cloud-init отрабатывает один раз; правки состава и окружения после
  # создания идут через deploy.sh, а не пересозданием сервера (иначе
  # потеряются выпущенные сертификаты Caddy: у Let's Encrypt лимит на выпуск).
  lifecycle {
    ignore_changes = [image_id, user_data]
  }

  depends_on = [openstack_networking_floatingip_associate_v2.server]
}
