"""Contract tests for the minimal Cloudflare Workers Static Assets config."""

from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "wrangler.jsonc"


class WranglerConfigTests(unittest.TestCase):
    def test_config_is_exact_minimal_static_assets_configuration(self) -> None:
        config = json.loads(CONFIG.read_text(encoding="utf-8"))
        self.assertEqual(
            config,
            {
                "name": "webmcp-challenge-2026",
                "compatibility_date": "2026-08-29",
                "assets": {"directory": "./public/"},
            },
        )
        forbidden = {"main", "script", "account_id", "routes", "secrets", "bindings"}
        self.assertTrue(forbidden.isdisjoint(config))


if __name__ == "__main__":
    unittest.main()
