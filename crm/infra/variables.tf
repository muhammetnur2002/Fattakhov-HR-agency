variable "service_account_key_file" {
  description = "Путь к авторизованному ключу сервисного аккаунта. В репозиторий не попадает."
  type        = string
}

variable "folder_id" {
  description = "Каталог Yandex Cloud, в котором живёт вся инфраструктура."
  type        = string
}

variable "zone" {
  description = "Зона размещения. Только российские: требование локализации ПДн (BR-32)."
  type        = string
  default     = "ru-central1-a"
}

variable "site_domain" {
  description = "Домен сайта."
  type        = string
  default     = "fattakhovhr.ru"
}

variable "app_domain" {
  description = "Домен кабинета."
  type        = string
  default     = "my.fattakhovhr.ru"
}

variable "db_password" {
  description = "Пароль пользователя базы. Задаётся переменной окружения, в файлы не пишется."
  type        = string
  sensitive   = true
}

variable "env_file" {
  description = "Путь к файлу боевых настроек. Содержимое уезжает в метаданные ВМ; в репозиторий файл не попадает."
  type        = string
}

variable "app_image" {
  description = "Полное имя образа приложения в реестре."
  type        = string
}

variable "tools_image" {
  description = "Образ с полным набором зависимостей: миграции и фоновые задачи."
  type        = string
}

variable "ssh_allowed_ips" {
  description = "Адреса, которым открыт SSH. Пустой список - порт закрыт совсем."
  type        = list(string)
  default     = []
}

variable "ssh_public_key" {
  description = "Открытый ключ для отладочного входа. Пусто - вход по ключу не настроен."
  type        = string
  default     = ""
}

variable "serial_console" {
  description = "Доступ к последовательной консоли. Включать только на время разбора."
  type        = bool
  default     = false
}
