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

variable "sa_suffix" {
  description = <<-DESC
    Добавка к именам сервисных аккаунтов.

    Нужна потому, что имена сервисных аккаунтов уникальны в пределах
    облака, а не каталога - в отличие от сетей, подсетей, реестра, ключа
    KMS и кластера базы, которые спокойно тезки в разных каталогах.
    Наступали: выкатка во второй каталог того же облака упала на
    `Service account 'fhr-storage' already exists`, когда первый каталог
    был ещё жив.

    Пустая строка - имена как раньше. Задавать, только когда в облаке
    уже есть другая выкатка.
  DESC
  type        = string
  default     = ""
}

/*
  Настройки контейнеров, которые меняются без пересоздания машины.

  prod.env доезжает до машины только через cloud-init, а он работает
  один раз — при первой загрузке. Значит любая новая переменная там
  стоила пересоздания ВМ: несколько минут простоя и выпуск сертификата
  Let's Encrypt, которых пять в неделю. Эти же значения уходят в
  метаданные docker-compose, а их агент COI перечитывает при обычном
  apply и перезапускает контейнеры.

  Секретность та же, что у prod.env: он и так лежит в метаданных
  машины (user-data). Помечено sensitive, чтобы значения не печатались
  в плане; какие образы едут, план показывает отдельным output «images».

  Если ключ есть и здесь, и в prod.env, побеждает этот — так docker
  compose трактует environment поверх env_file.
*/
variable "runtime_env" {
  description = "Доп. переменные окружения app и worker, меняются обычным apply"
  type        = map(string)
  default     = {}
  sensitive   = true
}

variable "crm_db_password" {
  description = "Пароль пользователя базы CRM (версия Мухаммеда, crm.tf). Задаётся переменной окружения TF_VAR_crm_db_password из ~/.fhr/crm_db_password, в файлы не пишется."
  type        = string
  sensitive   = true
}

variable "students_db_password" {
  description = "Пароль пользователя базы студенческой платформы. Задаётся переменной окружения, в файлы не пишется."
  type        = string
  sensitive   = true
}

variable "students_app_image" {
  description = "Образ студенческой платформы в нашем реестре (--target runner их Dockerfile)."
  type        = string
}

variable "students_tools_image" {
  description = "Образ с миграциями студенческой платформы (--target tools их Dockerfile)."
  type        = string
}

/*
  Отдельная от runtime_env карта — намеренно, не общая.

  DATABASE_URL у CRM и у студенческой платформы — одно и то же имя
  переменной, но разные строки подключения (разные база и пользователь).
  Если бы оба приложения читали общий блок environment, они бы либо
  столкнулись на одном ключе, либо студенческое приложение получило
  бы вдобавок секреты CRM (VK_BOT_TOKEN и т.п.), которые ему не нужны
  и не должны быть видны. Секреты студенческой платформы (включая
  PII_ENCRYPTION_KEY — его нельзя терять и нельзя менять на живой базе)
  живут здесь же ради того же самого свойства runtime_env: меняются
  обычным apply, без пересоздания машины и траты сертификата.
*/
variable "students_runtime_env" {
  description = "Переменные окружения students/students-migrate/students-cron, меняются обычным apply"
  type        = map(string)
  default     = {}
  sensitive   = true
}
