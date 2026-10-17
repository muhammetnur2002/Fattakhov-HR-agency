#!/usr/bin/env python3
"""Запуск внешней проверки «сайт жив» вне облака (из GitHub Actions или cron).

Это та же логика, что была облачной функцией в Яндексе (infra/functions/uptime):
открывает адреса из URLS, при двойной неудаче пишет на ALERT_EMAIL через SMTP_URL.

Переменные окружения: URLS (JSON [["Название","адрес"],...]), SMTP_URL, SMTP_FROM,
ALERT_EMAIL. Ключ --test шлёт проверочное письмо. Код возврата 1, если что-то лежит:
тогда упавший запуск в GitHub Actions сам по себе тоже сигнал.
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent / "uptime"))
import index  # noqa: E402

result = index.handler({"test": "--test" in sys.argv}, None)
print(result["body"])
body = json.loads(result["body"])
sys.exit(1 if body.get("down") else 0)
