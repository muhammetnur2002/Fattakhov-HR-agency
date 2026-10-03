# Сборка образов в GitHub Actions (.github/workflows/images.yml).
#
# Раньше образы собирались на ноутбуке владельца: эмуляция amd64 на
# ARM-процессоре — по 5–10 минут на образ под полной нагрузкой, и ноутбук
# перегревался на каждой выкатке. Теперь сборка — на машинах GitHub.
#
# Учётка с одним правом: загружать образы в наш реестр. Ни серверов, ни
# баз, ни бакетов она не видит. Её ключ лежит в секрете YC_REGISTRY_KEY
# репозитория и в состояние Terraform не попадает: создаётся командой yc
# и сразу уходит в GitHub, не касаясь диска (infra/README.md, «Сборка
# образов на GitHub»).
resource "yandex_iam_service_account" "ci" {
  name        = "fhr-ci-images${var.sa_suffix}"
  description = "GitHub Actions: только загрузка образов в реестр fhr. Больше ничего."
}

# Привязка авторитетная по роли pusher на этом реестре: других держателей
# этой роли здесь нет и быть не должно — загрузка образов идёт только
# через сборку на GitHub. Владелец облака грузит и без неё (роль на облако)
resource "yandex_container_registry_iam_binding" "pusher" {
  registry_id = yandex_container_registry.main.id
  role        = "container-registry.images.pusher"
  members     = ["serviceAccount:${yandex_iam_service_account.ci.id}"]
}
