# Инфраструктура (Terraform)

Боевое окружение: Яндекс Облако, облако `fattakhovhr`, каталог `fhr-prod`
(`b1gip4b12vge7a951hhh`). Машины: `fhr-app` (кабинет и сайт) и `fhr-students` (студенческая
платформа, см. `students_vm.tf`; с 04.10.2026 — только там).

## Общее состояние

С 04.10.2026 состояние Terraform — одно на всех, в Object Storage, а не
файл `terraform.tfstate` у каждого на диске. До этого операторов было
двое, и каждый работал со своей копией: машина одного не была видна
другому (его apply пытался бы создать её второй раз), а выкатка одного
откатывалась бы следующим apply другого.

| Что | Где |
| --- | --- |
| Состояние | бакет `fhr-tfstate-b1gip4b12vge7a951hhh`, файл `prod/terraform.tfstate` |
| Блокировка | `prod/terraform.tfstate.tflock` рядом с ним — пока идёт plan или apply |
| Доступ | учётка `fhr-tfstate`, ключ — `~/.fhr/tfstate.env` (выдаёт владелец, как остальное из `.fhr`) |
| Шифрование | ключ KMS `fhr-tfstate-key`, защита от удаления включена |
| История | версии бакета; прошлые версии состояния хранятся 180 дней |

Учётке `fhr-tfstate` выдан доступ только к этому бакету и ключу (ACL
бакета и роль на ключ, ролей на каталог нет): с её ключом не прочитать
ни резюме, ни другие бакеты. В самом состоянии лежат пароли баз
и ключи — поэтому бакет закрыт и шифрован, и файл с ключом доступа
хранится так же, как остальные секреты.

Нужен Terraform не ниже 1.11 (или OpenTofu не ниже 1.11): блокировка
сделана через `use_lockfile`.

### Каждый запуск

```bash
cd infra
source ~/.fhr/tfstate.env                 # доступ к бакету состояния
export YC_TOKEN=$(yc iam create-token)    # или ключ fhr-terraform в prod.tfvars
export TF_VAR_db_password=$(cat ~/.fhr/db_password)
export TF_VAR_students_db_password=$(cat ~/.fhr/students_db_password)
export TF_VAR_crm_db_password=$(cat ~/.fhr/crm_db_password)

terraform plan -var-file=prod.tfvars -out=prod.plan
terraform apply prod.plan
```

- Сначала план, потом apply сохранённого плана. Читать строку `Plan:`
  и вывод `images`: в плане должно быть только то, что вы выкатываете.
- Второй запуск, пока идёт первый, падает с `Error acquiring the state
  lock` — так и задумано. Не обходить `-lock=false`. Если запуск упал
  и блокировка осталась, `terraform force-unlock <ID>` — только убедившись,
  что больше никто не запускает.
- `-target` — только на свои ресурсы и только когда понимаете, зачем.

### Переход для того, у кого было своё локальное состояние (один раз)

1. До слияния PR с этим разделом Terraform не запускать.
2. `git pull` — взять main.
3. Свои `infra/terraform.tfstate` и `infra/terraform.tfstate.backup`
   **перенести из папки** (оставить как архив). **Не переносить их
   в бакет**: общее состояние уже собрано и содержит обе машины, а
   локальная копия устарела (например, кабинет там `m12`, на сервере `m13`).
4. Положить `tfstate.env` от владельца в `~/.fhr/` и подключить:
   `source ~/.fhr/tfstate.env`.
5. `terraform init -reconfigure` — именно `-reconfigure`. Обычный `init`
   или `-migrate-state` при найденном локальном состоянии предложит
   скопировать его в бакет; согласие перезапишет общее состояние
   устаревшим.
6. Сверить теги в своём `prod.tfvars` с `terraform output images`
   (раздел ниже), затем `terraform plan -var-file=prod.tfvars` —
   он обязан показать `No changes`. Если нет — ничего не применять.

### prod.tfvars

В git его нет, у каждого оператора своя копия, и теги образов в них
обязаны совпадать с тем, что выкачено, — иначе apply одного откатит
выкатку другого. Что выкачено сейчас, показывает само общее состояние —
ему, а не памяти или таблице в документе, и верить:

```bash
terraform output images
```

Перед своим планом сверить с ним `app_image`, `tools_image`,
`students_app_image`, `students_tools_image` в своём `prod.tfvars`.
В плане чужая выкатка видна так: `images` меняется на старый тег.
Выкатили новый тег — сообщить второму оператору.

Переключатели машины платформы: `students_vm_caddy = true`,
`students_vm_cron = true` — с шага 3 переезда (04.10.2026) напоминания
студентам идут с `fhr-students`, копии платформы на `fhr-app` больше нет.

Сразу после перехода `terraform plan` обязан показать `No changes`.
Иначе — ничего не применять, сверить `prod.tfvars`.

### Как это создано (вне состояния, вручную через yc)

Бакет, ключ и учётка — опора для самого состояния, поэтому они не в нём:

```bash
F=b1gip4b12vge7a951hhh
yc kms symmetric-key create --name fhr-tfstate-key --default-algorithm aes-256 \
  --rotation-period 8760h --deletion-protection --folder-id $F
yc iam service-account create --name fhr-tfstate --folder-id $F
yc kms symmetric-key add-access-binding --name fhr-tfstate-key --folder-id $F \
  --role kms.keys.encrypterDecrypter --service-account-name fhr-tfstate
yc storage bucket create --name fhr-tfstate-$F --folder-id $F --max-size 1073741824
yc storage bucket update --name fhr-tfstate-$F --versioning versioning-enabled \
  --encryption key-id=<id ключа> \
  --grants grant-type=grant-type-account,grantee-id=<id учётки>,permission=permission-full-control
# прошлые версии — 180 дней: --lifecycle-rules-from-file с noncurrent_expiration
```

Новый ключ доступа (например, если старый утёк):
`yc iam access-key create --service-account-name fhr-tfstate --folder-id $F`,
раздать новый `tfstate.env`, затем удалить старый ключ
(`yc iam access-key list --service-account-name fhr-tfstate`).

### Если состояние испортили

Прошлые версии `prod/terraform.tfstate` лежат в бакете (консоль →
Object Storage → бакет → «Версии»). Скачать нужную и вернуть
`terraform state push <файл>` — только когда никто не запускает
Terraform. Копии на момент перехода — у владельца в
`~/.fhr/terraform.tfstate.bak-20261004-*`.

## Сборка образов на GitHub

С 04.10.2026 образы собираются в GitHub Actions, а не на ноутбуке:
Actions → «Образы для выкатки» → Run workflow → ветка (обычно `main`),
образ (`fhr-crm`, `fhr-crm-tools`, `fhr-students`, `fhr-students-tools`)
и **новый** тег. Занятый тег сборка не перезапишет — упадёт. В итоге
запуска: образ, digest и коммит, из которого он собран.

Сборка на серверах ничего не меняет. Выкатка — тег в `prod.tfvars`,
затем план и apply, как выше.

Загружает образы учётка `fhr-ci-images-prod` (`infra/ci.tf`): у неё
одно право — загрузка в наш реестр. Её ключ — в секрете `YC_REGISTRY_KEY`
репозитория; в состояние Terraform и на диск он не попадает. Создать
или заменить ключ (затем удалить старый — `yc iam key list
--service-account-name fhr-ci-images-prod`):

```bash
yc iam key create --service-account-name fhr-ci-images-prod --output /dev/stdout \
  | gh secret set YC_REGISTRY_KEY --repo goalkeeperkaa-ctrl/fattakhov-hr-platform
```

## Оповещения по ресурсам

Алерты и каналы уведомлений Monitoring в публичном API не заведены (только
панели), поэтому оповещения сделаны облачной функцией `fhr-metrics`
(`functions/metrics/index.py`, ресурсы — в `monitoring.tf`). Она раз в 10
минут читает метрики и пишет на `ALERT_EMAIL` из `prod.env` плюс адреса из
переменной `metrics_alert_extra_emails` (в `prod.tfvars`, список строк).

Что проверяет (пороги — в `CHECKS` в коде, меняются через `terraform apply`):

| Показатель | Предупреждение | Тревога |
| --- | --- | --- |
| процессор `fhr-app`, `fhr-students` (среднее за 10 мин) | ≥ 70% | ≥ 90% |
| диск базы, занято | ≥ 70% | ≥ 85% |
| память базы, свободно | ≤ 15% | ≤ 7% |
| процессор базы, свободно | ≤ 30% | ≤ 15% |
| память `fhr-app`, `fhr-students`, свободно (минимум за 10 мин) | ≤ 15% | ≤ 7% |
| диск `fhr-app`, `fhr-students`, занято (максимум за 10 мин) | ≥ 75% | ≥ 90% |

Письмо приходит, когда показатель вышел за порог или ухудшился, раз в час
напоминает, пока проблема держится, и пишет «в норме», когда всё вернулось.
Состояния у функции нет: она сравнивает два последних десятиминутных отрезка
самих метрик. Если метрики не читаются совсем, раз в час приходит письмо об
этом. Аккаунт функции (`fhr-metrics`) может только читать метрики каталога.

Проверка логики без облака: `python -m unittest infra/functions/metrics/test_metrics.py`.
Проверка доставки и прав чтения (после деплоя), вызов по HTTP с токеном:
`POST https://functions.yandexcloud.net/<id>?integration=raw` с телом
`{"test": true}` шлёт проверочное письмо, с пустым `{}` — настоящий запуск
(ответ `{"events": [], "errors": []}` значит, что метрики прочитаны и всё в норме).

## Метрики и логи машин

На каждой машине (`fhr-app`, `fhr-students`) рядом с остальными работает
контейнер `ua` — официальный Yandex Unified Agent (`agent.tf`, конфиг
`unified-agent.yml.tftpl`, образ закреплён по хэшу переменной
`unified_agent_image`). Потолок памяти агента 256 МБ. Он ходит в облако под
аккаунтом машины (`fhr-vm`): ему выданы `monitoring.editor` и `logging.writer`
на каталог, больше ничего.

- **Метрики** — память и диск машины раз в минуту, `service=custom`, метка
  `host` = идентификатор машины (`terraform output students_vm_id`; у `fhr-app`
  — в консоли). Имена: `sys.memory.MemAvailable`, `sys.memory.MemTotal`,
  `sys.filesystem.UsedB`, `sys.filesystem.SizeB` (диск — `mountpoint="/"`).
  Проверки на них — в `fhr-metrics` (раздел выше).
- **Логи** — всё, что контейнеры пишут в stdout/stderr (crm, worker, students,
  caddy, migrate…), в группу Cloud Logging `fhr-logs`, хранение 7 суток.
  Каждая запись — строка JSON из файла Docker: сам текст в поле `log`, имя
  службы — в `"com.docker.compose.service":"<имя>"`.

**Как посмотреть логи в консоли:** console.yandex.cloud → каталог `fhr-prod` →
Cloud Logging → группа `fhr-logs` → вкладка «Записи». Вверху выбрать период
(например, «1 час») и в строке фильтра ввести, например:

- `message: "ERROR"` — все ошибки;
- `message: "compose.service\":\"students"` — только студенческая платформа
  (вместо `students`: `app`, `worker`, `caddy`, `students-migrate`, `ua`).

**Как посмотреть память и диск:** Monitoring → «Метрики» → в запросе
`"sys.memory.MemAvailable"{service="custom"}` (или `"sys.filesystem.UsedB"{...}`).

Состав контейнеров обновляется обычным `apply`; правка логирования или агента
пересоздаёт контейнеры машины (несколько секунд простоя), поэтому делайте её
ночью и сначала на `fhr-students`.
