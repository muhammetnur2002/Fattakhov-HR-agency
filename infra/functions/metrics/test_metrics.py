"""Проверки логики оповещений по метрикам (без сети и без почты).

    python -m unittest infra/functions/metrics/test_metrics.py -v

В архив функции этот файл не попадает (excludes в infra/monitoring.tf).
"""

import math
import os
import sys
import unittest
from datetime import datetime, timezone
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import index  # noqa: E402

CPU = next(c for c in index.CHECKS if c["name"] == "Процессор fhr-app")
MEM = next(c for c in index.CHECKS if c["name"].startswith("Память базы"))
DISK = next(c for c in index.CHECKS if c["name"].startswith("Диск базы"))
NAN = math.nan


class Levels(unittest.TestCase):
    def test_gt_thresholds_include_the_boundary(self):
        self.assertEqual(index.level_of(69.9, CPU), 0)
        self.assertEqual(index.level_of(70, CPU), 1)
        self.assertEqual(index.level_of(89.9, CPU), 1)
        self.assertEqual(index.level_of(90, CPU), 2)

    def test_lt_thresholds_include_the_boundary(self):
        self.assertEqual(index.level_of(40, MEM), 0)
        self.assertEqual(index.level_of(15, MEM), 1)
        self.assertEqual(index.level_of(7, MEM), 2)
        self.assertEqual(index.level_of(3, MEM), 2)


class Decisions(unittest.TestCase):
    def test_quiet_while_everything_is_fine(self):
        self.assertIsNone(index.decide(CPU, 3, 4, remind_window=False))
        self.assertIsNone(index.decide(CPU, 3, 4, remind_window=True))

    def test_goes_over_the_threshold(self):
        kind, title, level = index.decide(CPU, 10, 95, remind_window=False)
        self.assertEqual((kind, level), ("вышел за порог", 2))
        self.assertIn("ТРЕВОГА", title)
        self.assertIn("95.0%", title)

    def test_warning_then_alarm_is_worse(self):
        kind, _, level = index.decide(CPU, 75, 95, remind_window=False)
        self.assertEqual((kind, level), ("ухудшился", 2))

    def test_persisting_problem_stays_quiet_until_the_hourly_window(self):
        self.assertIsNone(index.decide(CPU, 95, 96, remind_window=False))
        kind, _, level = index.decide(CPU, 95, 96, remind_window=True)
        self.assertEqual((kind, level), ("держится", 2))

    def test_recovery_is_reported_once(self):
        kind, title, level = index.decide(CPU, 95, 5, remind_window=False)
        self.assertEqual((kind, level), ("в норме", 0))
        self.assertIn("вернулся в норму", title)
        self.assertIsNone(index.decide(CPU, 5, 4, remind_window=True))

    def test_alarm_easing_to_warning_is_reported(self):
        kind, _, level = index.decide(CPU, 95, 75, remind_window=False)
        self.assertEqual((kind, level), ("ослаб", 1))

    def test_low_memory_direction(self):
        kind, _, level = index.decide(MEM, 60, 5, remind_window=False)
        self.assertEqual((kind, level), ("вышел за порог", 2))


class Buckets(unittest.TestCase):
    def test_last_two_skips_gaps(self):
        self.assertEqual(index.last_two([1, NAN, 2, 3]), (2, 3))
        self.assertEqual(index.last_two([NAN, NAN, 2, NAN]), None)
        self.assertEqual(index.last_two([]), None)

    def test_worst_across_hosts(self):
        series = [[10, 20, NAN], [50, 5, 7]]
        self.assertEqual(index.worst_per_bucket(series, "gt")[:2], [50, 20])
        self.assertEqual(index.worst_per_bucket(series, "lt")[:2], [10, 5])
        self.assertEqual(index.worst_per_bucket(series, "gt")[2], 7)

    def test_number_parsing(self):
        self.assertTrue(math.isnan(index._number("NaN")))
        self.assertTrue(math.isnan(index._number(None)))
        self.assertTrue(math.isnan(index._number("inf")))
        self.assertEqual(index._number("2.5"), 2.5)

    def test_floor_to_bucket(self):
        moment = datetime(2026, 10, 4, 12, 37, 45, tzinfo=timezone.utc)
        self.assertEqual(index.floor_to_bucket(moment), datetime(2026, 10, 4, 12, 30, tzinfo=timezone.utc))


class Run(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 4, 12, 5, tzinfo=timezone.utc)  # в окне напоминаний

    def fake(self, values_by_name):
        def check_values(token, folder, check, now):
            value = values_by_name[check["name"]]
            if isinstance(value, Exception):
                raise value
            return value

        return mock.patch.object(index, "check_values", side_effect=check_values)

    def quiet(self):
        return {c["name"]: ([NAN, 5, 6] if c["direction"] == "gt" else [NAN, 80, 81]) for c in index.CHECKS}

    def test_everything_fine_sends_nothing(self):
        with self.fake(self.quiet()):
            events, errors = index.run("t", "f", self.now)
        self.assertEqual((events, errors), ([], []))

    def test_one_problem_one_event(self):
        values = self.quiet()
        values["Процессор fhr-app"] = [10, 20, 95]
        with self.fake(values):
            events, errors = index.run("t", "f", self.now)
        self.assertEqual([e[0]["name"] for e in events], ["Процессор fhr-app"])
        self.assertEqual(errors, [])

    def test_read_failure_is_reported_not_swallowed(self):
        values = self.quiet()
        values["Диск базы данных (занято)"] = PermissionError("403")
        values["Процессор fhr-students"] = [NAN, NAN, NAN]
        with self.fake(values):
            events, errors = index.run("t", "f", self.now)
        self.assertEqual(events, [])
        self.assertEqual(len(errors), 2)
        self.assertTrue(any("PermissionError" in e for e in errors))
        self.assertTrue(any("нет данных" in e for e in errors))


class MailText(unittest.TestCase):
    now = datetime(2026, 10, 4, 12, 5, tzinfo=timezone.utc)

    def test_alarm_mail(self):
        decision = index.decide(CPU, 10, 95, remind_window=False)
        subject, body = index.build_mail(self.now, [(CPU, *decision)], [])
        self.assertTrue(subject.startswith("🔴"))
        self.assertIn("Процессор fhr-app", subject)
        self.assertIn("Что делать", body)
        self.assertIn("17:05 (+05)", body)  # 12:05 UTC = 17:05 по Екатеринбургу

    def test_warning_mail_is_not_marked_as_alarm(self):
        decision = index.decide(CPU, 10, 75, remind_window=False)
        subject, _ = index.build_mail(self.now, [(CPU, *decision)], [])
        self.assertTrue(subject.startswith("⚠️"))

    def test_recovery_mail(self):
        decision = index.decide(CPU, 95, 5, remind_window=False)
        subject, body = index.build_mail(self.now, [(CPU, *decision)], [])
        self.assertTrue(subject.startswith("✅"))
        self.assertNotIn("Что делать", body)

    def test_errors_only_mail(self):
        subject, body = index.build_mail(self.now, [], ["Диск: PermissionError: 403"])
        self.assertIn("не читает метрики", subject)
        self.assertIn("PermissionError", body)

    def test_recipients_include_extra_addresses(self):
        with mock.patch.dict(os.environ, {"ALERT_EMAIL": "bugs@x.ru", "EXTRA_RECIPIENTS": " a@x.ru, ,b@x.ru "}):
            self.assertEqual(index.recipients(), ["bugs@x.ru", "a@x.ru", "b@x.ru"])
        with mock.patch.dict(os.environ, {"ALERT_EMAIL": "bugs@x.ru"}, clear=True):
            self.assertEqual(index.recipients(), ["bugs@x.ru"])


class Handler(unittest.TestCase):
    def test_errors_are_mailed_only_in_the_first_ten_minutes_of_an_hour(self):
        context = mock.Mock(token={"access_token": "t"})
        env = {"FOLDER_ID": "f", "ALERT_EMAIL": "x@x.ru", "SMTP_URL": "smtp://u:p@h:587", "SMTP_FROM": "n@x.ru"}
        broken = mock.patch.object(index, "check_values", side_effect=PermissionError("403"))
        for minute, expected_mails in ((5, 1), (25, 0)):
            fake_now = datetime(2026, 10, 4, 12, minute, tzinfo=timezone.utc)
            with mock.patch.dict(os.environ, env), broken, mock.patch.object(index, "send_mail") as send, mock.patch.object(
                index, "datetime"
            ) as dt:
                dt.now.return_value = fake_now
                index.handler({}, context)
                self.assertEqual(send.call_count, expected_mails, f"минута {minute}")


if __name__ == "__main__":
    unittest.main()
