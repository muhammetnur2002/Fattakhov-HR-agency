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

### Выкатка образов — одной командой

```bash
cd infra
export YC_TOKEN=$(yc iam create-token)    # или TF_VAR_service_account_key_file
./deploy.sh crm=m17                       # кабинет и сайт
./deploy.sh crm=m17 crm-tools=m10         # со служебным образом кабинета
./deploy.sh students=v11                  # студенческая платформа
```

Скрипт сам скачивает общие настройки, ставит теги, проверяет, что такие
образы есть в реестре, строит план, показывает, какие образы меняются,
спрашивает `yes`, применяет и загружает общие настройки обратно. Потом
ждёт, пока сервер **переключится**: номер сборки кабинета или платформы
на странице (вывод `build_pages`) должен смениться — пока сервер
переключается (1–3 минуты), 200 отдаёт ещё прежняя сборка. Не сменился
за 8 минут — ошибка «сервер не переключился на новый образ». После этого
ждёт до 6 минут, пока сайт, кабинет, фоновые задачи и платформа ответят
200, — список тот же, что у внешней проверки (вывод `health_urls`).
Не ответили — выход с ошибкой и перечнем, что лежит.
`~/.fhr/tfstate.env` подхватывает сам.

Две остановки — намеренные:

- **образа нет в реестре** — опечатка в теге или сборка ещё идёт. Без
  этой проверки сервер не скачал бы образ, и сайт лёг бы;
- **план трогает машину, которую вы не выкатываете** — значит, её выкатили
  с другого компьютера и не загрузили общие настройки: apply откатил бы ту
  выкатку (04.10.2026 так едва не откатилась платформа v10 → v8).
  Сверить с живым (`terraform output images`), выровнять `prod.tfvars`;
  `--force` — только если понятно, что меняется.

Остановился до apply — `prod.tfvars` возвращается к общей версии. Другие
переменные (`runtime_env`, пароли и т. п.) — по-прежнему вручную, как ниже.

### Каждый запуск

```bash
cd infra
source ~/.fhr/tfstate.env                 # доступ к бакету состояния
export YC_TOKEN=$(yc iam create-token)    # или ключ: TF_VAR_service_account_key_file

./tfvars.sh pull                          # общие prod.tfvars и prod.env (пароли баз — в них)
terraform plan -var-file=prod.tfvars -out=prod.tfplan
terraform apply prod.tfplan
./tfvars.sh push                          # если меняли значения
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

### Общие настройки: prod.tfvars и prod.env (с 04.10.2026)

Копия одна на всех, в том же бакете, что и состояние (закрыт, шифрован,
с историей версий):

| В бакете | У себя | Что внутри |
| --- | --- | --- |
| `prod/prod.tfvars` | `infra/prod.tfvars` | теги образов, переменные, **пароли баз** (`db_password`, `crm_db_password`, `students_db_password`) |
| `prod/prod.env` | `~/.fhr/prod.env` (или `TF_VAR_env_file`) | настройки сервера кабинета, уходят в cloud-init |

Раньше у каждого оператора были свои копии, и за одни сутки они разошлись
трижды: теги образов, ключи пуш-уведомлений платформы и пароли баз. Apply
со своей копией откатывал чужую выкатку, стирал чужие переменные — а со
старыми паролями оставил бы приложения без доступа к базам.

```bash
cd infra
source ~/.fhr/tfstate.env      # или: export YC_TOKEN=$(yc iam create-token)
./tfvars.sh pull               # перед каждым планом
./tfvars.sh diff               # чем свои отличаются от общих (только имена, без значений)
./tfvars.sh push               # сразу после apply, если меняли значения
```

- `pull` сохраняет свои прежние файлы копиями `*.local-<время>`, если они
  отличались, — ничего не теряется молча.
- `push` не перезапишет чужую правку: если общий файл менялся после вашего
  `pull`, загрузка остановится целиком — `pull`, перенести правку, apply,
  `push`.
- Пароли баз — строками в общем `prod.tfvars`, а не `TF_VAR_*_password`
  из своих файлов: сменил один — увидели все.
- На Windows — Git Bash (bash и curl 7.76+), на Mac работает и системный
  bash 3.2.

Своё у каждого — не в файлах, а в окружении:

| Что | Как |
| --- | --- |
| Путь к `prod.env` | по умолчанию `~/.fhr/prod.env` на любой машине; лежит иначе — `TF_VAR_env_file` |
| Доступ к облаку | `export YC_TOKEN=$(yc iam create-token)` или ключ: `TF_VAR_service_account_key_file` |

Строк `env_file` и `service_account_key_file` в общем `prod.tfvars` быть
не должно: путь у каждого свой.

Что выкачено, по-прежнему показывает само состояние —
`terraform output images`. Сразу после `pull` план обязан показать
`No changes`; иначе — ничего не применять, сначала разобраться.

Переключатели машины платформы: `students_vm_caddy = true`,
`students_vm_cron = true` — с шага 3 переезда (04.10.2026) напоминания
студентам идут с `fhr-students`, копии платформы на `fhr-app` больше нет.

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

## Проверки на GitHub

На каждый PR и на каждый push в main — `.github/workflows/checks.yml`:
типы, линтер и тесты кабинета (с временной базой Postgres), то же для
студенческой платформы, формат и корректность Terraform, разметка
cloud-init. Секретов не нужно, серверы не трогаются. Красная проверка
в PR — сначала починить, потом сливать.

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

## Проверка восстановления из резервной копии

Требование юридического пакета (раздел 20): резервная копия, которую ни разу
не восстанавливали, — не копия, а надежда. Копии базы (`fhr-postgres`: базы
`fhr_crm`, `fhr_students`, архивная `hr_platform`) снимаются каждую ночь
около 02:00 UTC и хранятся 30 дней. Проверять — раз в квартал и после крупных
изменений схемы; результат — строкой в журнал ниже.

Порядок (боевую базу он не трогает — копия разворачивается отдельным кластером):

1. Последняя копия: `yc managed-postgresql cluster list-backups --id <кластер>`.
2. Временное правило доступа — только со своего адреса
   (`curl -s https://api.ipify.org`) и только к порту базы:
   `yc vpc security-group create --name fhr-restore-check-sg --network-id <сеть>
   --rule "direction=ingress,port=6432,protocol=tcp,v4-cidrs=[<адрес>/32]"
   --rule "direction=egress,from-port=1,to-port=65535,protocol=any,v4-cidrs=[0.0.0.0/0]"`.
3. Восстановление на момент сразу после копии:
   `yc managed-postgresql cluster restore --backup-id <копия> --time <конец копии + 10 мин>
   --postgresql-version 16 --name fhr-restore-check-<дата> --environment production
   --network-id <сеть> --host zone-id=ru-central1-a,subnet-id=<подсеть>,assign-public-ip=true
   --resource-preset b2.medium --disk-size 20 --disk-type network-ssd
   --security-group-ids <правило> --async`. Без `--postgresql-version` команда
   отказывается.
4. Проверка — только количество строк, сами данные не читаются: подключение
   `sslmode=verify-full` с корневым сертификатом облака (тот же файл и сумма,
   что в `crm/Dockerfile`), пароли пользователей — из общего `prod.tfvars`,
   запрос по всем таблицам `public` через `query_to_xml(format('select count(*)
   …'))`. Сверить `_prisma_migrations`: последняя миграция должна быть той,
   что была выкачена к моменту копии.
5. Сразу после — убрать входящее правило (`yc vpc security-group update-rules
   --delete-rule-id`): копия с реальными данными не должна оставаться открытой.
6. Копию удаляет владелец: `yc managed-postgresql cluster delete --name
   fhr-restore-check-<дата>`; затем правило доступа: `yc vpc security-group delete
   --name fhr-restore-check-sg`. Кластер копии платный почасово, пока существует.

| Дата | Копия (UTC) | Восстановлено на | Длительность | Результат |
| --- | --- | --- | --- | --- |
| 04.10.2026 | `c9qrg66kb46shfbhscsk:mdbsbpp3cubvhg6userq`, 02:09–03:47 | 04:00 UTC | 8,5 мин | ✅ все три базы; кабинет — 29 таблиц, 27 миграций (последняя `20261003064133_sourcing_lead`, как в проде к тому часу), платформа — 19 таблиц, 21 миграция, архив — 28 таблиц; данные на месте. Доступ закрыт сразу после проверки |
