"""Offline checks for the stage-0 WebMCP demo; no browser or network required."""

from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class Stage0StructureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.index = (ROOT / "index.html").read_text(encoding="utf-8")
        self.app = (ROOT / "app.js").read_text(encoding="utf-8")

    def test_required_static_files_are_present_and_linked(self) -> None:
        self.assertTrue((ROOT / "index.html").is_file())
        self.assertTrue((ROOT / "styles.css").is_file())
        self.assertTrue((ROOT / "app.js").is_file())
        self.assertTrue((ROOT / "server.py").is_file())
        self.assertIn('href="styles.css"', self.index)
        self.assertIn('src="app.js"', self.index)

    def test_search_services_is_registered_as_a_read_only_tool(self) -> None:
        self.assertIn("document.modelContext.registerTool", self.app)
        self.assertRegex(self.app, r"name\s*:\s*['\"]search_services['\"]")
        self.assertRegex(self.app, r"readOnlyHint\s*:\s*true")
        self.assertRegex(self.app, r"service_id")
        self.assertRegex(self.app, r"duration")
        self.assertRegex(self.app, r"price")
        self.assertRegex(self.app, r"currency")
        self.assertRegex(self.app, r"available")
        self.assertIn("SYNTHETIC_SERVICES", self.app)

    def test_search_services_returns_only_available_catalog_entries(self) -> None:
        self.assertIn(".filter((service) => service.available)", self.app)

    def test_verify_button_uses_discovery_and_webmcp_execution(self) -> None:
        self.assertIn('id="verify-tool"', self.index)
        self.assertIn("document.modelContext.getTools", self.app)
        self.assertIn("document.modelContext.executeTool", self.app)
        self.assertIn("real-execution-count", self.index)
        self.assertIn("JSON.stringify", self.app)

    def test_no_false_fallback_direct_call_from_verification_handler(self) -> None:
        handler = re.search(
            r"async function verifyTool\(\)\s*\{(?P<body>.*?)\n\}",
            self.app,
            re.DOTALL,
        )
        if handler is None:
            self.fail("verification handler must exist")
        body = handler.group("body")
        self.assertNotRegex(body, r"\bsearchServices\s*\(")
        self.assertNotRegex(body, r"\btoolDefinition\.execute\s*\(")

    def test_unavailable_api_path_reports_diagnostic_not_success(self) -> None:
        self.assertIn("WebMCP недоступен", self.app)
        self.assertIn('data-status="pending"', self.index)
        self.assertNotIn("fallback", self.app.lower())

    def test_product_first_journey_precedes_collapsed_technical_proof(self) -> None:
        self.assertIn("Safe Agent-Assisted Booking", self.index)
        self.assertIn("Агент находит услугу и время, человек подтверждает запись.", self.index)
        self.assertIn('id="booking-journey"', self.index)
        self.assertIn('id="start-journey"', self.index)
        self.assertIn("WebMCP technical proof / Техническая проверка", self.index)
        self.assertLess(self.index.index('id="booking-journey"'), self.index.index("WebMCP technical proof / Техническая проверка"))
        self.assertIn("<details", self.index)

    def test_technical_proof_controls_keep_their_ids(self) -> None:
        for element_id in (
            "verify-tool",
            "verify-availability",
            "verify-unavailable-service",
            "create-booking",
            "real-execution-count",
            "availability-execution-count",
            "unavailable-execution-count",
            "confirmed-booking-count",
        ):
            self.assertIn(f'id="{element_id}"', self.index)


if __name__ == "__main__":
    unittest.main()
