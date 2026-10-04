"""Проверки дублирования в Telegram у «сайт жив» (без сети и почты).

    python -m unittest infra/functions/uptime/test_uptime.py -v

В архив функции этот файл не попадает (excludes в infra/monitoring.tf).
"""

import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import index  # noqa: E402

ENV = {"TELEGRAM_BOT_TOKEN": "123:abc", "TELEGRAM_CHAT_IDS": "111, 222"}


class Notify(unittest.TestCase):
    def test_only_mail_without_telegram_settings(self):
        with mock.patch.dict(os.environ, {}, clear=True), mock.patch.object(index, "send_mail") as mail, mock.patch.object(
            index, "send_telegram"
        ) as tg:
            index.notify("тема", "текст")
        mail.assert_called_once_with("тема", "текст")
        tg.assert_not_called()

    def test_both_channels(self):
        with mock.patch.dict(os.environ, ENV), mock.patch.object(index, "send_mail") as mail, mock.patch.object(
            index, "send_telegram"
        ) as tg:
            index.notify("тема", "текст")
        mail.assert_called_once()
        tg.assert_called_once()

    def test_one_channel_failing_is_tolerated(self):
        with mock.patch.dict(os.environ, ENV), mock.patch.object(index, "send_mail", side_effect=OSError("smtp")), mock.patch.object(
            index, "send_telegram"
        ) as tg:
            index.notify("тема", "текст")
        tg.assert_called_once()
        with mock.patch.dict(os.environ, ENV), mock.patch.object(index, "send_mail") as mail, mock.patch.object(
            index, "send_telegram", side_effect=RuntimeError("403")
        ):
            index.notify("тема", "текст")
        mail.assert_called_once()

    def test_error_when_nothing_delivered(self):
        with mock.patch.dict(os.environ, ENV), mock.patch.object(index, "send_mail", side_effect=OSError("x")), mock.patch.object(
            index, "send_telegram", side_effect=RuntimeError("403")
        ):
            with self.assertRaises(RuntimeError):
                index.notify("тема", "текст")

    def test_every_chat_gets_it_and_token_is_not_in_errors(self):
        calls = []

        def fake_urlopen(request, timeout=0):
            calls.append(request.full_url)
            raise index.urllib.error.HTTPError(request.full_url, 403, "Forbidden", {}, None)

        with mock.patch.dict(os.environ, ENV), mock.patch.object(index.urllib.request, "urlopen", fake_urlopen):
            with self.assertRaises(RuntimeError) as ctx:
                index.send_telegram("тема", "текст")
        self.assertEqual(len(calls), 2)
        self.assertNotIn("123:abc", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
