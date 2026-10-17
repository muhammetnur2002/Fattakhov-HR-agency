# Реестр контейнеров Selectel (Container Registry as a Service).
#
# Адрес образов - вывод endpoint ресурса, по документации вида
# cr.selcloud.ru/<имя реестра>. Два токена доступа:
#   - серверы: только чтение (mode_rw = false), docker login на самом сервере;
#   - CI (GitHub Actions): чтение и запись, кладётся в секреты репозитория.
# Токены лежат в состоянии Terraform открытым текстом - состояние закрытое.
#
# Срок токена задан явно: с is_set = false провайдер падает на разборе пустой даты
# (проверено на живом аккаунте 16.10.2026).
#
# TODO: доступность Container Registry в ru-6 в таблице «Доступность продуктов
# по локациям» не указана (в таблице этой услуги нет). Адрес cr.selcloud.ru
# общий, регион в нём не участвует; если реестр в проекте не создастся -
# запасной вариант: RUNBOOK.md, раздел «Если реестра Selectel нет».

resource "selectel_craas_registry_v1" "main" {
  name       = var.registry_name
  project_id = var.project_id
}

resource "selectel_craas_token_v2" "server" {
  project_id     = var.project_id
  name           = "fhr-servers-pull"
  mode_rw        = false
  is_set         = true
  expires_at     = "2031-01-01T00:00:00Z"
  all_registries = false
  registry_ids   = [selectel_craas_registry_v1.main.id]
}

resource "selectel_craas_token_v2" "ci" {
  project_id     = var.project_id
  name           = "fhr-ci-push"
  mode_rw        = true
  is_set         = true
  expires_at     = "2031-01-01T00:00:00Z"
  all_registries = false
  registry_ids   = [selectel_craas_registry_v1.main.id]
}
