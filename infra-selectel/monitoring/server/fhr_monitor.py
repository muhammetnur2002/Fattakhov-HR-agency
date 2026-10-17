#!/usr/bin/env python3
"""Мониторинг сервера Fattakhov HR: запускается таймером systemd раз в 5 минут на каждом сервере.

Каждый сервер следит:
  - за САЙТАМИ ДРУГОГО сервера (так падение целого сервера заметит соседний, а не молчащая машина);
  - за собой: контейнеры (запущены и здоровы), диск, память, срок сертификатов своих доменов.
Письмо уходит при смене состояния (после двух подряд неудач, чтобы не будить из-за одиночного сбоя),
напоминание — раз в 3 часа, пока проблема не ушла, и письмо «снова в порядке».
Только стандартная библиотека Python. Почта — SMTP_URL из env-файла приложения на сервере.
Секреты не печатаются.
"""
import json, os, shutil, smtplib, socket, ssl, subprocess, sys, time, urllib.parse, urllib.request
from email.message import EmailMessage
from email.utils import formatdate, make_msgid

CONF = json.load(open(os.environ.get("FHR_MONITOR_CONF", "/opt/fhr/monitor.json"), encoding="utf-8"))
STATE_PATH = CONF.get("state", "/var/lib/fhr-monitor/state.json")
REMIND_EVERY = 3 * 3600
FAILS_BEFORE_ALERT = 2


def read_env(path, key):
    for line in open(path, encoding="utf-8"):
        if line.startswith(key + "="):
            v = line.split("=", 1)[1].strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"":
                v = v[1:-1]
            return v
    return None


def http_ok(url):
    for _ in range(2):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "fhr-monitor"})
            with urllib.request.urlopen(req, timeout=15) as r:
                if 200 <= r.status < 400:
                    return True, f"HTTP {r.status}"
        except Exception as e:  # noqa: BLE001
            err = str(e)[:80]
        time.sleep(2)
    return False, err


def cert_days(host):
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, 443), timeout=10) as s:
            with ctx.wrap_socket(s, server_hostname=host) as t:
                exp = ssl.cert_time_to_seconds(t.getpeercert()["notAfter"])
        return int((exp - time.time()) / 86400)
    except Exception:  # noqa: BLE001
        return None


def docker_problems(expected):
    out = subprocess.run(["docker", "ps", "-a", "--format", "{{.Names}}|{{.Status}}"], capture_output=True, text=True, timeout=30).stdout
    seen = {}
    for line in out.splitlines():
        n, _, st = line.partition("|")
        seen[n] = st
    bad = []
    for name in expected:
        st = seen.get(name)
        if st is None:
            bad.append(f"{name}: нет контейнера")
        elif not st.startswith("Up") or "unhealthy" in st or "Restarting" in st:
            bad.append(f"{name}: {st}")
    return bad


def checks():
    res = {}  # ключ -> (ok, описание)
    for name, url in CONF["peer_urls"].items():
        ok, d = http_ok(url)
        res[f"сайт {name}"] = (ok, f"{url} — {d}")
    for host in CONF.get("cert_hosts", []):
        d = cert_days(host)
        res[f"сертификат {host}"] = (d is not None and d > 14, f"осталось дней: {d}")
    du = shutil.disk_usage("/")
    pct = int(du.used * 100 / du.total)
    res["диск"] = (pct < 85, f"занято {pct}%")
    mem = 0
    for line in open("/proc/meminfo"):
        if line.startswith("MemAvailable:"):
            mem = int(line.split()[1]) // 1024
    res["память"] = (mem > 250, f"доступно {mem} МБ")
    bad = docker_problems(CONF["containers"])
    res["контейнеры"] = (not bad, "; ".join(bad) or "все запущены и здоровы")
    return res


def send_mail(subject, body):
    env = CONF["env_file"]
    u = urllib.parse.urlparse(read_env(env, "SMTP_URL"))
    frm = read_env(env, "SMTP_FROM")
    msg = EmailMessage()
    msg["From"], msg["To"] = frm, CONF["alert_to"]
    msg["Subject"] = f"[FHR {CONF['server']}] {subject}"
    msg["Date"], msg["Message-ID"] = formatdate(localtime=True), make_msgid(domain="fattakhovhr.ru")
    msg.set_content(body)
    user, pwd = urllib.parse.unquote(u.username), urllib.parse.unquote(u.password)
    if u.scheme == "smtps":
        s = smtplib.SMTP_SSL(u.hostname, u.port, timeout=30, context=ssl.create_default_context())
    else:
        s = smtplib.SMTP(u.hostname, u.port, timeout=30)
        s.starttls(context=ssl.create_default_context())
    s.login(user, pwd)
    s.send_message(msg)
    s.quit()


def main():
    if "--test-mail" in sys.argv:
        send_mail("мониторинг подключён", f"Это проверочное письмо: мониторинг сервера {CONF['server']} работает и умеет писать вам. Письма будут приходить при проблемах и при восстановлении.")
        print("тестовое письмо отправлено")
        return
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    try:
        state = json.load(open(STATE_PATH, encoding="utf-8"))
    except Exception:  # noqa: BLE001
        state = {}
    now = time.time()
    problems, recovered = [], []
    for key, (ok, desc) in checks().items():
        st = state.setdefault(key, {"fails": 0, "alerted": 0, "since": 0})
        if ok:
            if st["alerted"]:
                recovered.append(f"{key}: {desc}")
            st.update(fails=0, alerted=0, since=0)
        else:
            st["fails"] += 1
            if not st["since"]:
                st["since"] = now
            if st["fails"] >= FAILS_BEFORE_ALERT and (not st["alerted"] or now - st["alerted"] >= REMIND_EVERY):
                st["alerted"] = now
                mins = int((now - st["since"]) / 60)
                problems.append(f"{key}: {desc} (с {time.strftime('%H:%M', time.localtime(st['since']))}, уже {mins} мин)")
    try:
        if problems:
            send_mail("ПРОБЛЕМА: " + problems[0].split(":")[0], "Что не так:\n- " + "\n- ".join(problems) + f"\n\nПроверяет сервер {CONF['server']}, время {time.strftime('%d.%m.%Y %H:%M')}.")
        if recovered:
            send_mail("снова в порядке", "Восстановилось:\n- " + "\n- ".join(recovered))
    except Exception as e:  # noqa: BLE001
        print("не удалось отправить письмо:", str(e)[:100])
        for st in state.values():  # попробуем снова на следующем запуске
            if st.get("alerted") == now:
                st["alerted"] = 0
    json.dump(state, open(STATE_PATH, "w", encoding="utf-8"))
    print("проблем:", len(problems), "восстановлено:", len(recovered))


if __name__ == "__main__":
    main()
