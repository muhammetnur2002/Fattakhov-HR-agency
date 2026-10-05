"""Проверки внешней проверки «сайт жив» (без сети и почты).

    python -m unittest infra/functions/uptime/test_uptime.py -v

В архив функции этот файл не попадает (excludes в infra/monitoring.tf).
"""

import io
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import index  # noqa: E402


class Check(unittest.TestCase):
    """Причина в письме: «HTTP 503» само по себе не говорит, что смотреть."""

    def _check_with(self, code, body):
        def fake_urlopen(request, timeout=0):
            raise index.urllib.error.HTTPError(request.full_url, code, "x", {}, io.BytesIO(body))

        with mock.patch.object(index.urllib.request, "urlopen", fake_urlopen):
            return index.check("https://my.example.ru/api/health/worker")

    def test_reason_from_worker_health_goes_into_detail(self):
        ok, detail = self._check_with(503, '{"ok":false,"reason":"проходов нет: процесс остановлен"}'.encode())
        self.assertFalse(ok)
        self.assertEqual(detail, "HTTP 503 — проходов нет: процесс остановлен")

    def test_foreign_error_page_is_not_copied(self):
        ok, detail = self._check_with(502, b"<html><body>Bad Gateway</body></html>")
        self.assertFalse(ok)
        self.assertEqual(detail, "HTTP 502")

    def test_4xx_is_still_alive(self):
        ok, _ = self._check_with(404, b"")
        self.assertTrue(ok)


if __name__ == "__main__":
    unittest.main()
