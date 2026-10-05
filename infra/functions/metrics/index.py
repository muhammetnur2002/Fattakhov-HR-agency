"""Оповещения по метрикам: процессор, память и диск машин; диск, память и
процессор базы (облачная функция, см. infra/monitoring.tf).

Зачем не алерты Monitoring. В публичном API нет ни алертов, ни каналов
уведомлений: их заводят руками в консоли, там же они и живут, вне
репозитория. Эта функция делает то же самое кодом — пороги видны в git,
меняются через terraform apply, письма идут тем же путём, что и у проверки
«сайт жив» (fhr-uptime): через почту reg.ru, от сервера не зависящую.

Состояния у функции нет, и оно ей не нужно: метрики сами хранят историю.
Раз в 10 минут она берёт по каждому показателю десятиминутные отрезки
(средние, минимумы или максимумы — как задано в CHECKS) и сравнивает два
последних завершённых отрезка:

  было нормально, стало хуже     — письмо «вышло за порог»;
  стало хуже, чем было           — письмо «ухудшилось»;
  плохо и там и там              — напоминание раз в час, не чаще;
  было плохо, стало нормально    — письмо «вернулось в норму».

Письмо одно на запуск и собирает всё, что изменилось. Если метрики не
читаются совсем (нет прав, нет данных), раз в час приходит письмо об
этом: молчащий мониторинг хуже, чем его отсутствие.

Только стандартная библиотека Python (как и у fhr-uptime): у функции нет
сборки зависимостей, и чем меньше в ней частей, тем меньше причин не
сработать в нужный момент.
"""

import json
import math
import os
import smtplib
import ssl
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

# Отрезок, по которому считается значение, и сколько отрезков брать. Шесть —
# час истории: хватает на два последних завершённых и на запас, если свежий
# ещё не пришёл (метрики доезжают с задержкой до минуты-двух).
BUCKET_SECONDS = 600
BUCKETS = 6
# Напоминание о затянувшейся проблеме — в первые десять минут каждого часа
# (функция запускается раз в 10 минут, так что это ровно один запуск)
REMIND_MINUTE_LIMIT = 10

# Время в письме — по Екатеринбургу (+05), как у заказчика
LOCAL_TZ = timezone(timedelta(hours=5))

API = "https://monitoring.api.cloud.yandex.net/monitoring/v2/data/read"

# Память и диск машин пишет агент на самой машине (infra/agent.tf, метрики
# sys.memory.* и sys.filesystem.*). У них метка host — идентификатор машины,
# а не имя: в запросах пишется <vm:имя>, подставляется из переменной VM_IDS
# (JSON {"fhr-app": "fhm…", ...}, её задаёт monitoring.tf).
VM_TOKEN = "<vm:"

LEVEL_NAMES = {0: "норма", 1: "предупреждение", 2: "ТРЕВОГА"}

# unit: «percent» — 0..100; «ratio_percent» — доля от второго запроса в процентах.
# direction: «gt» — плохо, когда больше; «lt» — плохо, когда меньше.
# agg — как сворачивать отрезок: AVG, MIN или MAX.
CHECKS = [
    {
        "name": "Процессор fhr-app",
        "query": '"cpu_usage"{service="compute", resource_id="fhr-app"}',
        "agg": "AVG",
        "direction": "gt",
        "warn": 70,
        "alarm": 90,
        "unit": "percent",
        "hint": "Машина с CRM упирается в процессор: смотрите, какой контейнер "
        "грузит (docker stats в журнале машины) и не идёт ли выкатка.",
    },
    {
        "name": "Процессор fhr-students",
        "query": '"cpu_usage"{service="compute", resource_id="fhr-students"}',
        "agg": "AVG",
        "direction": "gt",
        "warn": 70,
        "alarm": 90,
        "unit": "percent",
        "hint": "Машина студенческой платформы упирается в процессор.",
    },
    {
        "name": "Память fhr-app (свободно)",
        "query": '"sys.memory.MemAvailable"{service="custom", host="<vm:fhr-app>"}',
        "total_query": '"sys.memory.MemTotal"{service="custom", host="<vm:fhr-app>"}',
        "agg": "MIN",
        "direction": "lt",
        "warn": 15,
        "alarm": 7,
        "unit": "ratio_percent",
        "hint": "На машине с CRM почти не осталось памяти: контейнеры могут начать "
        "падать. Логи — в консоли Cloud Logging (группа fhr-logs); при постоянной "
        "нехватке поднимите память машины в Terraform (resources.memory).",
    },
    {
        "name": "Память fhr-students (свободно)",
        "query": '"sys.memory.MemAvailable"{service="custom", host="<vm:fhr-students>"}',
        "total_query": '"sys.memory.MemTotal"{service="custom", host="<vm:fhr-students>"}',
        "agg": "MIN",
        "direction": "lt",
        "warn": 15,
        "alarm": 7,
        "unit": "ratio_percent",
        "hint": "На машине студенческой платформы почти не осталось памяти. Логи — "
        "в Cloud Logging (группа fhr-logs); при постоянной нехватке поднимите "
        "students_vm_memory в Terraform.",
    },
    {
        "name": "Диск fhr-app (занято)",
        "query": '"sys.filesystem.UsedB"{service="custom", host="<vm:fhr-app>", mountpoint="/"}',
        "total_query": '"sys.filesystem.SizeB"{service="custom", host="<vm:fhr-app>", mountpoint="/"}',
        "agg": "MAX",
        "direction": "gt",
        "warn": 75,
        "alarm": 90,
        "unit": "ratio_percent",
        "hint": "Диск машины с CRM заполняется (образы Docker, логи). Старые образы "
        "чистятся раз в сутки; если место не освобождается — увеличьте диск "
        "(boot_disk.size в compute.tf).",
    },
    {
        "name": "Диск fhr-students (занято)",
        "query": '"sys.filesystem.UsedB"{service="custom", host="<vm:fhr-students>", mountpoint="/"}',
        "total_query": '"sys.filesystem.SizeB"{service="custom", host="<vm:fhr-students>", mountpoint="/"}',
        "agg": "MAX",
        "direction": "gt",
        "warn": 75,
        "alarm": 90,
        "unit": "ratio_percent",
        "hint": "Диск машины студенческой платформы заполняется (образы Docker, логи). "
        "Если место не освобождается — увеличьте students_vm_disk_gb в Terraform.",
    },
    {
        "name": "Диск базы данных (занято)",
        "query": '"disk.used_bytes"{service="managed-postgresql", resource_id="fhr-postgres"}',
        "total_query": '"disk.total_bytes"{service="managed-postgresql", resource_id="fhr-postgres"}',
        "agg": "MAX",
        "direction": "gt",
        "warn": 70,
        "alarm": 85,
        "unit": "ratio_percent",
        "hint": "Диск базы заполняется. Увеличить его можно в консоли без остановки "
        "(Managed PostgreSQL → кластер → изменить размер диска); при 100% база "
        "перестанет принимать записи.",
    },
    {
        "name": "Память базы данных (свободно)",
        "query": '"mem.available_bytes"{service="managed-postgresql", resource_id="fhr-postgres"}',
        "total_query": '"mem.total_bytes"{service="managed-postgresql", resource_id="fhr-postgres"}',
        "agg": "MIN",
        "direction": "lt",
        "warn": 15,
        "alarm": 7,
        "unit": "ratio_percent",
        "hint": "Базе не хватает памяти: возможны сбои и перезапуски. Подумайте о более "
        "крупном классе кластера.",
    },
    {
        "name": "Процессор базы данных (свободно)",
        "query": '"cpu.idle"{service="managed-postgresql", resource_id="fhr-postgres"}',
        "agg": "MIN",
        "direction": "lt",
        "warn": 30,
        "alarm": 15,
        "unit": "percent",
        "hint": "Процессор базы занят почти полностью: ищите тяжёлые запросы, "
        "миграции и массовые операции; при постоянной нагрузке нужен класс повыше.",
    },
]


# ---------------------------------------------------------------------
# Чтение метрик
# ---------------------------------------------------------------------


def floor_to_bucket(moment: datetime) -> datetime:
    seconds = int(moment.timestamp())
    return datetime.fromtimestamp(seconds - seconds % BUCKET_SECONDS, tz=timezone.utc)


def resolve_query(query: str) -> str:
    """Подставить идентификаторы машин: <vm:fhr-app> -> id из VM_IDS.

    Неизвестное имя — ошибка (её увидит письмо «не удалось прочитать
    метрики»), а не запрос без фильтра, который показал бы чужие машины.
    """
    while VM_TOKEN in query:
        start = query.index(VM_TOKEN)
        end = query.index(">", start)
        name = query[start + len(VM_TOKEN) : end]
        ids = json.loads(os.environ.get("VM_IDS", "{}"))
        if name not in ids:
            raise KeyError(f"нет идентификатора машины {name} в VM_IDS")
        query = query[:start] + ids[name] + query[end + 1 :]
    return query


def read_series(token: str, folder_id: str, query: str, agg: str, now: datetime) -> list[list[float]]:
    """Ряды по запросу: на каждый ряд (хост, диск) — список значений по отрезкам.

    Пропуски (метрика не пришла) — float('nan'): отрезков столько же у всех
    рядов, потому что запрос идёт с одной и той же сеткой.
    """
    end = floor_to_bucket(now)
    start = end - timedelta(seconds=BUCKET_SECONDS * BUCKETS)
    body = {
        "query": resolve_query(query),
        "fromTime": start.isoformat().replace("+00:00", "Z"),
        "toTime": end.isoformat().replace("+00:00", "Z"),
        "downsampling": {"gridInterval": BUCKET_SECONDS * 1000, "gridAggregation": agg},
    }
    request = urllib.request.Request(
        f"{API}?folderId={urllib.parse.quote(folder_id)}",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)

    series = []
    for metric in payload.get("metrics", []):
        raw = metric.get("timeseries", {}).get("doubleValues", [])
        series.append([_number(v) for v in raw][-BUCKETS:])
    return series


def _number(value) -> float:
    """Значение из ответа: число, строка вроде "NaN" или пусто."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return math.nan
    return number if math.isfinite(number) else math.nan


def worst_per_bucket(series: list[list[float]], direction: str) -> list[float]:
    """Свести несколько рядов (хостов) к худшему значению в каждом отрезке."""
    if not series:
        return []
    length = max(len(s) for s in series)
    padded = [[math.nan] * (length - len(s)) + s for s in series]
    pick = max if direction == "gt" else min
    result = []
    for values in zip(*padded):
        known = [v for v in values if not math.isnan(v)]
        result.append(pick(known) if known else math.nan)
    return result


def check_values(token: str, folder_id: str, check: dict, now: datetime) -> list[float]:
    """Значение показателя по отрезкам (в единицах check['unit'])."""
    used = read_series(token, folder_id, check["query"], check["agg"], now)
    if check["unit"] == "percent":
        return worst_per_bucket(used, check["direction"])

    # Доля от общего: свободное считаем от общего того же отрезка
    total = read_series(token, folder_id, check["total_query"], "MAX", now)
    used_worst = worst_per_bucket(used, check["direction"])
    total_worst = worst_per_bucket(total, "gt")
    length = min(len(used_worst), len(total_worst))
    result = []
    for u, t in zip(used_worst[-length:], total_worst[-length:]):
        result.append(100.0 * u / t if not math.isnan(u) and not math.isnan(t) and t > 0 else math.nan)
    return result


# ---------------------------------------------------------------------
# Оценка
# ---------------------------------------------------------------------


def level_of(value: float, check: dict) -> int:
    """0 — норма, 1 — предупреждение, 2 — тревога."""
    if check["direction"] == "gt":
        if value >= check["alarm"]:
            return 2
        return 1 if value >= check["warn"] else 0
    if value <= check["alarm"]:
        return 2
    return 1 if value <= check["warn"] else 0


def last_two(values: list[float]) -> tuple[float, float] | None:
    """Два последних завершённых отрезка с данными: (предыдущий, нынешний)."""
    known = [v for v in values if not math.isnan(v)]
    if len(known) < 2:
        return None
    return known[-2], known[-1]


def describe(check: dict, value: float) -> str:
    """Значение для человека: проценты — с одним знаком."""
    return f"{value:.1f}%"


def threshold_text(check: dict) -> str:
    sign = "≥" if check["direction"] == "gt" else "≤"
    return f"предупреждение {sign} {check['warn']}%, тревога {sign} {check['alarm']}%"


def decide(check: dict, previous: float, current: float, remind_window: bool) -> tuple[str, str, int] | None:
    """Что сказать о показателе: (вид, заголовок, уровень) или None — молчать."""
    before, now = level_of(previous, check), level_of(current, check)
    if now > before:
        kind = "вышел за порог" if before == 0 else "ухудшился"
        return kind, f"{check['name']} — {LEVEL_NAMES[now]} ({describe(check, current)})", now
    if now == 0 and before > 0:
        return "в норме", f"{check['name']} вернулся в норму ({describe(check, current)})", 0
    if now > 0 and now == before and remind_window:
        return "держится", f"{check['name']} — по-прежнему {LEVEL_NAMES[now]} ({describe(check, current)})", now
    if 0 < now < before:
        return "ослаб", f"{check['name']} ослаб до уровня «{LEVEL_NAMES[now]}» ({describe(check, current)})", now
    return None


# ---------------------------------------------------------------------
# Письмо
# ---------------------------------------------------------------------


def recipients() -> list[str]:
    extra = [a.strip() for a in os.environ.get("EXTRA_RECIPIENTS", "").split(",") if a.strip()]
    return [os.environ["ALERT_EMAIL"], *extra]


def send_mail(subject: str, body: str) -> None:
    smtp = urllib.parse.urlsplit(os.environ["SMTP_URL"])
    host = smtp.hostname or ""
    user = urllib.parse.unquote(smtp.username or "")
    password = urllib.parse.unquote(smtp.password or "")

    message = EmailMessage()
    message["From"] = os.environ["SMTP_FROM"]
    message["To"] = ", ".join(recipients())
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


def notify(subject: str, body: str) -> None:
    """Оповещение уходит письмом: на ящик сбоев и дополнительным получателям."""
    send_mail(subject, body)


def build_mail(now: datetime, events: list[tuple[dict, str, str, int]], errors: list[str]) -> tuple[str, str]:
    stamp = now.astimezone(LOCAL_TZ).strftime("%d.%m.%Y %H:%M")
    worst = 0
    lines = [f"{stamp} (+05). Мониторинг ресурсов Fattakhov HR.", ""]
    for check, kind, title, level in events:
        lines.append(f"— {title}")
        lines.append(f"  Пороги: {threshold_text(check)}.")
        if kind in ("вышел за порог", "ухудшился", "держится"):
            lines.append(f"  Что делать: {check['hint']}")
        lines.append("")
        worst = max(worst, level)
    if errors:
        lines.append("Не удалось прочитать метрики:")
        lines += [f"— {e}" for e in errors]
        lines += ["", "Пока это так, оповещения по ресурсам не работают.", ""]
    lines += [
        "Проверка идёт раз в 10 минут. Письмо приходит при изменении, а если",
        "проблема не проходит — напоминанием раз в час. Пороги — в",
        "infra/functions/metrics/index.py (CHECKS), правятся через terraform apply.",
    ]

    names = ", ".join(check["name"] for check, _, _, _ in events)
    if errors and not events:
        subject = "⚠️ Мониторинг ресурсов не читает метрики"
    elif all(kind == "в норме" for _, kind, _, _ in events):
        subject = f"✅ В норме: {names}"
    else:
        subject = ("🔴 " if worst == 2 else "⚠️ ") + names
    return subject, "\n".join(lines)


# ---------------------------------------------------------------------
# Точка входа
# ---------------------------------------------------------------------


def run(token: str, folder_id: str, now: datetime) -> tuple[list, list]:
    remind_window = now.minute < REMIND_MINUTE_LIMIT
    events, errors = [], []
    for check in CHECKS:
        try:
            values = check_values(token, folder_id, check, now)
        except Exception as error:  # нет прав, сеть, сбой ответа
            errors.append(f"{check['name']}: {type(error).__name__}: {str(error)[:160]}")
            continue
        pair = last_two(values)
        if pair is None:
            errors.append(f"{check['name']}: нет данных за последние {BUCKETS * BUCKET_SECONDS // 60} минут")
            continue
        decision = decide(check, pair[0], pair[1], remind_window)
        if decision:
            events.append((check, *decision))
    return events, errors


def handler(event, context):
    now = datetime.now(timezone.utc)

    # Ручной запуск с {"test": true} — проверить, что письмо доходит
    if isinstance(event, dict) and event.get("test"):
        notify(
            "Проверка мониторинга ресурсов",
            f"{now.astimezone(LOCAL_TZ).strftime('%d.%m.%Y %H:%M')} (+05). "
            "Письмо пришло — значит, о нехватке ресурсов сюда тоже придёт.",
        )
        return {"statusCode": 200, "body": json.dumps({"test": "sent"})}

    token = context.token["access_token"]
    events, errors = run(token, os.environ["FOLDER_ID"], now)

    # Об ошибках чтения — не чаще раза в час, иначе поломка прав превращается в спам
    if errors and now.minute >= REMIND_MINUTE_LIMIT:
        errors = []
    if events or errors:
        subject, body = build_mail(now, events, errors)
        notify(subject, body)

    return {
        "statusCode": 200,
        "body": json.dumps(
            {"events": [title for _, _, title, _ in events], "errors": errors}, ensure_ascii=False
        ),
    }
