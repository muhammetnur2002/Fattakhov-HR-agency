# Инфраструктура (Terraform)

Боевое окружение: Яндекс Облако, облако `fattakhovhr`, каталог `fhr-prod`
(`b1gip4b12vge7a951hhh`). Машины: `fhr-app` (кабинет и сайт; пока ещё
копия студенческой платформы) и `fhr-students` (студенческая платформа,
см. `students_vm.tf`).

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
6. `terraform plan -var-file=prod.tfvars` — в плане допустимо только
   известное изменение из раздела ниже. Если там что-то ещё —
   ничего не применять, сверить `prod.tfvars`.

### prod.tfvars

В git его нет, у каждого оператора своя копия, и значения в них
обязаны совпадать — иначе apply одного откатит выкатку другого
(план это покажет: изменится `images`). На 04.10.2026:

| Переменная | Значение |
| --- | --- |
| `app_image` | `fhr-crm:m13` |
| `tools_image` | `fhr-crm-tools:m8` |
| `students_app_image` | `fhr-students:v5` |
| `students_tools_image` | `fhr-students-tools:v3` |
| `students_vm_caddy` | `true` |
| `students_vm_cron` | `false` |

Выкатили новый тег — сообщить второму оператору, чтобы он поправил
свою копию до своего следующего запуска.

### Известное изменение в плане (04.10.2026)

`yandex_compute_instance.app` will be updated in-place: копия
студенческой платформы на `fhr-app` переходит на те же `v5`/`v3`, что
уже стоят на `fhr-students` (переменная у обеих машин общая). Это
безвредно и уйдёт вместе со следующей выкаткой; саму копию с `fhr-app`
уберёт шаг 3 переезда (`students_vm.tf`).

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
