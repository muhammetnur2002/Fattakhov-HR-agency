# Сеть.
#
# База и хранилище публичных адресов не получают: наружу смотрит
# только приложение. Это не паранойя, а прямая мера против угрозы
# T14 модели угроз - ошибочно открытая наружу база или бакет.

resource "yandex_vpc_network" "main" {
  name        = "fhr-network"
  description = "Сеть платформы Fattakhov HR"
}

resource "yandex_vpc_subnet" "main" {
  name           = "fhr-subnet"
  zone           = var.zone
  network_id     = yandex_vpc_network.main.id
  v4_cidr_blocks = ["10.10.0.0/24"]
}

# Группа безопасности приложения: наружу только веб, внутрь ничего,
# кроме HTTP и HTTPS. SSH намеренно не открыт в интернет - вход
# на машину идёт через Serial Console облака, у которой есть
# собственная аутентификация и журнал.
resource "yandex_vpc_security_group" "app" {
  name       = "fhr-app"
  network_id = yandex_vpc_network.main.id

  ingress {
    protocol       = "TCP"
    description    = "HTTP: нужен для выпуска сертификата и редиректа на HTTPS"
    v4_cidr_blocks = ["0.0.0.0/0"]
    port           = 80
  }

  ingress {
    protocol       = "TCP"
    description    = "HTTPS"
    v4_cidr_blocks = ["0.0.0.0/0"]
    port           = 443
  }

  # Отладочный доступ по SSH с одного адреса.
  #
  # Открывается только на время разбора: без него не видно, что
  # происходит с контейнерами, а гадать вслепую дороже, чем ненадолго
  # приоткрыть порт одному адресу. Список пуст - правила нет вовсе.
  dynamic "ingress" {
    for_each = var.ssh_allowed_ips
    content {
      protocol       = "TCP"
      description    = "SSH для отладки, один адрес"
      v4_cidr_blocks = [ingress.value]
      port           = 22
    }
  }

  egress {
    protocol       = "ANY"
    description    = "Исходящие: база, хранилище, SMTP, обновления"
    v4_cidr_blocks = ["0.0.0.0/0"]
  }
}

# Группа безопасности базы: подключиться можно только из подсети
# приложения. Публичного доступа у кластера нет вовсе.
resource "yandex_vpc_security_group" "db" {
  name       = "fhr-db"
  network_id = yandex_vpc_network.main.id

  ingress {
    protocol       = "TCP"
    description    = "PostgreSQL только изнутри подсети"
    v4_cidr_blocks = ["10.10.0.0/24"]
    port           = 6432
  }

  egress {
    protocol       = "ANY"
    v4_cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "yandex_vpc_address" "app" {
  name = "fhr-app-ip"

  external_ipv4_address {
    zone_id = var.zone
  }
}
