"""HTTP surface tests for the isolated public WebMCP document root."""

from __future__ import annotations

import functools
import http.client
import threading
import unittest
from pathlib import Path

import server


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_ASSETS = ("/", "/index.html", "/app.js", "/styles.css")
PRIVATE_PATHS = (
    "/.git/HEAD",
    "/.git/config",
    "/.env",
    "/server.py",
    "/README.md",
    "/DEVPOST_SUBMISSION.md",
    "/CHECKPOINT.md",
    "/CONTRACTS.md",
    "/SECURITY.md",
    "/MEMORY.md",
    "/tests/test_create_booking.py",
    "/_headers",
    "/../server.py",
    "/%2e%2e/server.py",
    "/%2E%2E%2Fserver.py",
)


class PublicServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        handler = functools.partial(server.WebMCPDemoHandler, directory=str(server.PUBLIC_ROOT))
        cls.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.httpd.server_address[1]

    @classmethod
    def tearDownClass(cls) -> None:
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=5)

    def request(self, path: str) -> tuple[int, dict[str, str], bytes]:
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        connection.request("GET", path)
        response = connection.getresponse()
        body = response.read()
        headers = {key.lower(): value for key, value in response.getheaders()}
        connection.close()
        return response.status, headers, body

    def test_public_assets_are_available_with_required_headers(self) -> None:
        for path in PUBLIC_ASSETS:
            with self.subTest(path=path):
                status, headers, body = self.request(path)
                self.assertEqual(status, 200)
                self.assertTrue(body)
                self.assertEqual(headers.get("origin-agent-cluster"), "?1")
                self.assertEqual(headers.get("permissions-policy"), "tools=(self)")

    def test_private_paths_and_traversal_are_not_served(self) -> None:
        for path in PRIVATE_PATHS:
            with self.subTest(path=path):
                status, _, _ = self.request(path)
                self.assertIn(status, (403, 404))

    def test_cloudflare_headers_file_is_exact(self) -> None:
        self.assertEqual(
            (server.PUBLIC_ROOT / "_headers").read_text(encoding="utf-8").splitlines(),
            [
                "/*",
                "  Origin-Agent-Cluster: ?1",
                "  Permissions-Policy: tools=(self)",
                "  Cache-Control: no-store",
            ],
        )

    def test_public_directory_has_only_deployment_assets_and_cloudflare_headers(self) -> None:
        self.assertEqual(
            sorted(path.relative_to(server.PUBLIC_ROOT).as_posix() for path in server.PUBLIC_ROOT.rglob("*") if path.is_file()),
            ["_headers", "app.js", "index.html", "styles.css"],
        )
        for filename in ("index.html", "app.js", "styles.css"):
            self.assertFalse((ROOT / filename).exists(), filename)


if __name__ == "__main__":
    unittest.main()
