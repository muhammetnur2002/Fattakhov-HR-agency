#!/usr/bin/env python3
"""Проверка конфигурации, которая уезжает на сервер.

Собирает cloud-init ровно так же, как это делает Terraform, и
разбирает результат. Смысл в том, что ошибку формата иначе видно
только в журнале загрузки машины: cloud-init молча отвергает
документ целиком, и на сервере не появляется ни одного файла.

Ловилось этим уже один раз: табуляция в конфиге веб-сервера.
"""
import sys, pathlib

try:
    import yaml
except ImportError:
    sys.exit("нужен pyyaml: pip3 install pyyaml")

infra = pathlib.Path(__file__).resolve().parent.parent / "infra"
env_file = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "~/.fhr/prod.env").expanduser()

def indent6(text: str) -> str:
    """Повторяет функцию indent из Terraform.

    Тонкость, на которой проверка однажды соврала: indent добавляет
    отступ всем строкам, КРОМЕ первой. Первую отступом снабжает сам
    шаблон. Если сымитировать иначе, проверка пройдёт, а cloud-init
    на сервере отвергнет документ - ровно это и случилось.
    """
    lines = text.split("\n")
    return "\n".join(
        [lines[0]] + [("      " + l) if l.strip() else l for l in lines[1:]]
    )

rendered = (
    (infra / "cloud-init.yaml.tftpl").read_text(encoding="utf-8")
    .replace("${CADDYFILE_INDENTED}", indent6((infra / "Caddyfile").read_text(encoding="utf-8")))
    .replace("${ENVFILE_INDENTED}", indent6(env_file.read_text(encoding="utf-8")))
)

try:
    doc = yaml.safe_load(rendered)
except yaml.YAMLError as e:
    sys.exit(f"cloud-init не разбирается: {e}")

paths = [f["path"] for f in doc.get("write_files", [])]
for нужен in ("/etc/caddy/Caddyfile", "/etc/fhr.env"):
    if нужен not in paths:
        sys.exit(f"в cloud-init нет файла {нужен}")

for f in doc["write_files"]:
    if not f.get("content", "").strip():
        sys.exit(f"файл {f['path']} пустой")

print(f"cloud-init в порядке: {len(paths)} файла — " + ", ".join(paths))
