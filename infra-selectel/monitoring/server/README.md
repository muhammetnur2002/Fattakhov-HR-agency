# Мониторинг и копии базы на серверах Selectel

Ставятся скриптами оператора (см. C:\fhr-tf\tmp\install_monitor.py и install_backup.py), на новых серверах — повторить.

**Мониторинг** (`fhr_monitor.py`, таймер раз в 5 минут): каждый сервер следит за сайтами соседа и за собой
(контейнеры, диск >85%, память <250 МБ, срок сертификатов <14 дней). Письмо на nuryagdyyewmuhammetnur@gmail.com
после двух подряд неудач, напоминание раз в 3 часа, письмо о восстановлении. Почта — SMTP_URL из env-файла приложения.
Проверка: `python3 /opt/fhr/fhr_monitor.py --test-mail`.

**Копии базы** (`fhr_backup.py`, таймер 03:30 МСК): pg_dump через контейнер postgres:16-alpine, gzip, шифрование
AES-256 ключом /opt/fhr/backup.key (копия ключа — в папке секретов владельца, файл db-backup.key). Хранится 7 копий в
/var/backups/fhr. Вне Selectel копии забирает на компьютер владельца pull-db-backups.sh (папка секретов\backups-db, 14 штук).
Восстановление: `openssl enc -d -aes-256-cbc -pbkdf2 -pass file:ключ -in копия.sql.gz.enc | gzip -dc | psql …`.
