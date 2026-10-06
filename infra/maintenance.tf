# Страница «Мы проводим технические работы» (на уровне Caddy, обе машины).
#
# Два режима (подробно — maintenance.caddy и раздел «Страница работ» в README):
#   - автоматический: приложение не отвечает (502/503/504) — страница вместо
#     серой «Bad Gateway». Включён всегда, переменных не требует;
#   - плановый: maintenance_mode = "on" в prod.tfvars -> terraform apply. Страница
#     всем, кроме /api/health* и запросов с заголовком обхода.
#
# Как конфигурация попадает на работающую машину. Caddyfile в cloud-init читается
# один раз, при первой загрузке: правка файла там до пересоздания машины ничего
# не меняет. Поэтому текст Caddyfile уезжает переменной окружения CADDYFILE
# контейнера caddy в составе docker-compose (метаданные меняются обычным apply,
# агент образа пересоздаёт только изменившийся контейнер), а контейнер сам
# кладёт его в файл при старте. Тот же приём у агента метрик (UA_CONFIG).
# Итог: ни правка Caddyfile, ни смена maintenance_mode не требуют пересоздания
# машины — только перезапуска контейнера caddy (секунды без ответа).

variable "maintenance_mode" {
  description = "Плановые работы: \"on\" — страница работ всем (кроме /api/health* и обхода), \"off\" — обычная работа."
  type        = string
  default     = "off"

  validation {
    condition     = contains(["on", "off"], var.maintenance_mode)
    error_message = "maintenance_mode — строка \"on\" или \"off\"."
  }
}

variable "maintenance_bypass" {
  description = "Секрет обхода страницы работ: запрос с заголовком X-Maintenance-Bypass: <значение> проходит к приложению. Пусто — обхода нет."
  type        = string
  default     = ""
  sensitive   = true

  # Значение вставляется в выражение Caddy в кавычках, поэтому только безопасные
  # знаки; от 16 знаков — иначе секрет подбирается. Само значение в сообщении
  # не печатается.
  validation {
    condition     = can(regex("^([A-Za-z0-9_-]{16,128})?$", var.maintenance_bypass))
    error_message = "maintenance_bypass — пустая строка или 16–128 знаков: латинские буквы, цифры, «-» и «_»."
  }
}

locals {
  # Снипеты (maintenance.caddy) идут ПЕРЕД самим Caddyfile: Caddy понимает
  # `import <снипет>` только после его определения. Файлы лежат в репозитории
  # по отдельности, а на машину уезжают одним текстом.
  caddyfile_app      = "${file("${path.module}/maintenance.caddy")}\n${file("${path.module}/Caddyfile")}"
  caddyfile_students = "${file("${path.module}/maintenance.caddy")}\n${file("${path.module}/Caddyfile.students")}"

  # Значение для `environment:` в compose: JSON — корректный YAML. Знак $
  # удваивается: compose подставляет $ИМЯ и ${ИМЯ} из окружения, а в Caddyfile
  # есть {$MAINTENANCE_MODE}; «$$» compose превращает обратно в «$».
  caddyfile_app_compose      = jsonencode(replace(local.caddyfile_app, "$", "$$"))
  caddyfile_students_compose = jsonencode(replace(local.caddyfile_students, "$", "$$"))
  maintenance_mode_compose   = jsonencode(var.maintenance_mode)
  maintenance_bypass_compose = jsonencode(var.maintenance_bypass)
}

# Видно после apply (docker-compose машины в плане скрыт целиком из-за секретов):
# включены ли сейчас плановые работы.
output "maintenance_mode" {
  description = "Плановые работы: on — всем страница работ, off — сайт открыт."
  value       = var.maintenance_mode
}
