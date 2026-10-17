# Сеть.
#
# Схема - из примеров Selectel: частная сеть и подсеть, роутер во внешнюю сеть,
# порт на каждый сервер, плавающий IP на порт. Базе публичный адрес не
# выдаётся (floating_ips в кластере не задаём): наружу смотрят только
# два сервера и только на 80/443.

locals {
  subnet_cidr = "10.10.0.0/24"
}

resource "openstack_networking_network_v2" "main" {
  name           = "fhr-network"
  admin_state_up = "true"
}

resource "openstack_networking_subnet_v2" "main" {
  name       = "fhr-subnet"
  network_id = openstack_networking_network_v2.main.id
  cidr       = local.subnet_cidr
}

# Внешняя сеть - так ищется в документации Selectel (external = true)
data "openstack_networking_network_v2" "external" {
  external = true
}

resource "openstack_networking_router_v2" "main" {
  name                = "fhr-router"
  external_network_id = data.openstack_networking_network_v2.external.id
}

resource "openstack_networking_router_interface_v2" "main" {
  router_id = openstack_networking_router_v2.main.id
  subnet_id = openstack_networking_subnet_v2.main.id
}

# ---- Группа безопасности серверов: снаружи только 80 и 443 ----------
resource "openstack_networking_secgroup_v2" "app" {
  name        = "fhr-app"
  description = "Серверы приложений: снаружи только HTTP и HTTPS"
}

resource "openstack_networking_secgroup_rule_v2" "http" {
  security_group_id = openstack_networking_secgroup_v2.app.id
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "tcp"
  port_range_min    = 80
  port_range_max    = 80
  remote_ip_prefix  = "0.0.0.0/0"
  description       = "HTTP: выпуск сертификата и переход на HTTPS"
}

resource "openstack_networking_secgroup_rule_v2" "https" {
  security_group_id = openstack_networking_secgroup_v2.app.id
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "tcp"
  port_range_min    = 443
  port_range_max    = 443
  remote_ip_prefix  = "0.0.0.0/0"
  description       = "HTTPS"
}

# SSH - только с перечисленных адресов; список пуст - правила нет вовсе
resource "openstack_networking_secgroup_rule_v2" "ssh" {
  for_each          = toset(var.ssh_allowed_cidrs)
  security_group_id = openstack_networking_secgroup_v2.app.id
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "tcp"
  port_range_min    = 22
  port_range_max    = 22
  remote_ip_prefix  = each.value
  description       = "SSH для выкатки и отладки, только с этого адреса"
}

# ---- Группа безопасности базы: только из частной подсети ------------
resource "openstack_networking_secgroup_v2" "db" {
  name        = "fhr-db"
  description = "Управляемый PostgreSQL: доступ только из частной подсети"
}

resource "openstack_networking_secgroup_rule_v2" "db" {
  security_group_id = openstack_networking_secgroup_v2.db.id
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "tcp"
  port_range_min    = 5432
  port_range_max    = 5432
  remote_ip_prefix  = local.subnet_cidr
  description       = "PostgreSQL изнутри подсети"
}

# ---- Порты и плавающие адреса ---------------------------------------
resource "openstack_networking_port_v2" "server" {
  for_each           = toset(["app", "students"])
  name               = "fhr-${each.key}-port"
  network_id         = openstack_networking_network_v2.main.id
  security_group_ids = [openstack_networking_secgroup_v2.app.id]

  fixed_ip {
    subnet_id = openstack_networking_subnet_v2.main.id
  }
}

# Адрес выдаётся отдельным шагом ДО серверов: его нужно прописать в DNS
# заранее, иначе Caddy не выпустит сертификат (RUNBOOK.md, шаг 5).
# Пул плавающих адресов в документации Selectel называется external-network.
resource "openstack_networking_floatingip_v2" "server" {
  for_each = toset(["app", "students"])
  pool     = "external-network"
}

resource "openstack_networking_floatingip_associate_v2" "server" {
  for_each    = toset(["app", "students"])
  port_id     = openstack_networking_port_v2.server[each.key].id
  floating_ip = openstack_networking_floatingip_v2.server[each.key].address

  depends_on = [openstack_networking_router_interface_v2.main]
}
