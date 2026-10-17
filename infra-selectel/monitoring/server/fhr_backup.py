#!/usr/bin/env python3
"""Ежедневная копия базы данных на сервере (таймер systemd 03:30 по Москве).

Берёт DATABASE_URL из env-файла приложения, разбирает адрес на части (libpq не понимает
параметры schema=… и uselibpqcompat=…), делает pg_dump через контейнер postgres:16-alpine,
сжимает и шифрует ключом из /opt/fhr/backup.key (тот же ключ лежит у владельца в папке секретов:
без него копию не открыть). Хранит последние 7 копий в /var/backups/fhr.
Секреты не печатаются.
"""
import glob, gzip, json, os, subprocess, sys, time, urllib.parse

CONF = json.load(open(os.environ.get("FHR_BACKUP_CONF", "/opt/fhr/backup.json"), encoding="utf-8"))
OUT = CONF.get("out", "/var/backups/fhr")
KEEP = 7


def read_env(path, key):
    for line in open(path, encoding="utf-8"):
        if line.startswith(key + "="):
            v = line.split("=", 1)[1].strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"":
                v = v[1:-1]
            return v
    return None


def main():
    os.makedirs(OUT, exist_ok=True)
    os.chmod(OUT, 0o700)
    u = urllib.parse.urlparse(read_env(CONF["env_file"], "DATABASE_URL"))
    stamp = time.strftime("%Y%m%d-%H%M")
    name = f"{CONF['name']}-{stamp}.sql.gz.enc"
    tmp = os.path.join(OUT, name + ".part")
    env = {
        "PGHOST": u.hostname, "PGPORT": str(u.port or 5432), "PGUSER": urllib.parse.unquote(u.username),
        "PGPASSWORD": urllib.parse.unquote(u.password), "PGDATABASE": u.path.lstrip("/"), "PGSSLMODE": "require",
    }
    dump = subprocess.Popen(
        ["docker", "run", "--rm", "-i", "-e", "PGHOST", "-e", "PGPORT", "-e", "PGUSER", "-e", "PGPASSWORD", "-e", "PGDATABASE", "-e", "PGSSLMODE",
         "postgres:16-alpine", "pg_dump", "--no-owner", "--no-privileges", "--format=plain"],
        stdout=subprocess.PIPE, env={**os.environ, **env})
    enc = subprocess.Popen(["openssl", "enc", "-aes-256-cbc", "-pbkdf2", "-salt", "-pass", "file:/opt/fhr/backup.key", "-out", tmp],
                           stdin=subprocess.PIPE)
    size = 0
    with gzip.GzipFile(fileobj=enc.stdin, mode="wb", compresslevel=6) as gz:
        for chunk in iter(lambda: dump.stdout.read(1 << 20), b""):
            size += len(chunk)
            gz.write(chunk)
    enc.stdin.close()
    dump.wait()
    enc.wait()
    if dump.returncode != 0 or enc.returncode != 0 or size < 1000:
        if os.path.exists(tmp):
            os.remove(tmp)
        print(f"ОШИБКА копии {CONF['name']}: pg_dump={dump.returncode}, openssl={enc.returncode}, байт={size}")
        sys.exit(1)
    final = os.path.join(OUT, name)
    os.rename(tmp, final)
    os.chmod(final, 0o600)
    for old in sorted(glob.glob(os.path.join(OUT, CONF["name"] + "-*.sql.gz.enc")))[:-KEEP]:
        os.remove(old)
    print(f"копия {name}: {os.path.getsize(final) // 1024} КБ (исходный дамп {size // 1024} КБ)")


if __name__ == "__main__":
    main()
