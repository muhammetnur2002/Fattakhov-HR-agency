"""Внешняя проверка «сайт жив» (облачная функция, см. infra/monitoring.tf).

Сигнал о сбое из кабинета (lib/monitoring/alerts.ts) шлёт сам сервер, и если
он лёг целиком, сигнала нет. Эта функция живёт вне сервера: открывает адреса
и, если какой-то не ответил дважды подряд, пишет на ящик сбоев через ту же
почту reg.ru, которая от сервера не зависит.

Только стандартная библиотека Python: у функции нет сборки зависимостей,
и чем меньше в ней частей, тем меньше причин не сработать в нужный момент.
"""

import json
import os
import smtplib
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

TIMEOUT_SECONDS = 10
RETRY_AFTER_SECONDS = 10
# Время в письме — по Екатеринбургу (+05), как у заказчика
LOCAL_TZ = timezone(timedelta(hours=5))


def check(url: str) -> tuple[bool, str]:
    """Отвечает ли адрес. Любой ответ, кроме 5xx, — сервер жив."""
    request = urllib.request.Request(url, headers={"User-Agent": "fhr-uptime/1"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return response.status < 500, f"HTTP {response.status}"
    except urllib.error.HTTPError as error:
        return error.code < 500, f"HTTP {error.code}"
    except Exception as error:  # таймаут, отказ соединения, ошибка TLS
        return False, f"{type(error).__name__}: {str(error)[:200]}"


def check_twice(url: str) -> tuple[bool, str]:
    """Один сбой сети — ещё не простой: перепроверяем через 10 секунд."""
    ok, detail = check(url)
    if ok:
        return ok, detail
    time.sleep(RETRY_AFTER_SECONDS)
    return check(url)


def send_mail(subject: str, body: str) -> None:
    smtp = urllib.parse.urlsplit(os.environ["SMTP_URL"])
    host = smtp.hostname or ""
    user = urllib.parse.unquote(smtp.username or "")
    password = urllib.parse.unquote(smtp.password or "")

    message = EmailMessage()
    message["From"] = os.environ["SMTP_FROM"]
    message["To"] = os.environ["ALERT_EMAIL"]
    message["Subject"] = subject
    message.set_content(body)

    context = ssl.create_default_context()
    if smtp.scheme == "smtps":
        server = smtplib.SMTP_SSL(host, smtp.port or 465, context=context, timeout=20)
    else:
        server = smtplib.SMTP(host, smtp.port or 587, timeout=20)
        server.ehlo()
        if server.has_extn("starttls"):
            server.starttls(context=context)
            server.ehlo()
        elif host not in ("127.0.0.1", "localhost"):
            # Пароль почты открытым текстом по сети не отправляем
            raise RuntimeError(f"{host} не предлагает STARTTLS")
    try:
        if user:
            server.login(user, password)
        server.send_message(message)
    finally:
        server.quit()


def handler(event, context):
    targets = json.loads(os.environ["URLS"])
    now = datetime.now(LOCAL_TZ).strftime("%d.%m.%Y %H:%M")

    # Ручной запуск с {"test": true} — проверить, что письмо доходит
    if isinstance(event, dict) and event.get("test"):
        send_mail(
            "Проверка внешнего мониторинга",
            f"{now} (+05). Письмо пришло — значит, о простое сайта сюда тоже придёт.",
        )
        return {"statusCode": 200, "body": json.dumps({"test": "sent"})}

    failures = []
    for name, url in targets:
        ok, detail = check_twice(url)
        if not ok:
            failures.append((name, url, detail))

    if failures:
        lines = [f"{now} (+05). Не отвечают дважды подряд, с перерывом в 10 секунд:", ""]
        lines += [f"— {name}: {url}\n  {detail}" for name, url, detail in failures]
        lines += [
            "",
            "Проверка повторяется каждые 10 минут; пока адрес не ответит,",
            "письмо будет приходить снова. Что смотреть: журнал загрузки машины",
            "в консоли облака и последнюю выкатку (terraform apply).",
        ]
        send_mail(
            "⚠️ Не отвечает: " + ", ".join(name for name, _, _ in failures),
            "\n".join(lines),
        )

    return {
        "statusCode": 200,
        "body": json.dumps({"down": [name for name, _, _ in failures]}, ensure_ascii=False),
    }
