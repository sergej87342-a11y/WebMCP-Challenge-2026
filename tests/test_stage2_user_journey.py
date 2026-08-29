"""End-to-end WebMCP boundary tests for the product-first booking journey."""

from __future__ import annotations

import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "public" / "app.js"
RUNNER = ROOT / "tests" / "run_stage2_user_journey_boundary.js"


class Stage2UserJourneyTests(unittest.TestCase):
    def run_journey(self, scenario: str) -> dict[str, object]:
        completed = subprocess.run(
            ["node", str(RUNNER), str(APP), scenario],
            check=True,
            capture_output=True,
            text=True,
        )
        return json.loads(completed.stdout)

    def test_accept_runs_the_three_existing_tools_in_product_order(self) -> None:
        report = self.run_journey("accept")
        calls = report["calls"]
        self.assertEqual([call["name"] for call in calls], ["search_services", "check_availability", "create_booking"])
        self.assertEqual(calls[1]["input"], {
            "service_id": calls[0]["result"]["services"][0]["service_id"],
            "date": "2099-05-01",
            "timezone": "Asia/Jerusalem",
        })
        self.assertEqual(calls[2]["input"]["service_id"], calls[1]["result"]["data"]["service"]["service_id"])
        self.assertEqual(calls[2]["input"]["slot_start"], calls[1]["result"]["data"]["slots"][0]["slot_start"])
        self.assertTrue(report["result"]["ok"])
        self.assertEqual(report["successCount"], "1")
        self.assertEqual(report["confirmations"], 1)

    def test_declining_human_confirmation_never_creates_confirmation_or_calls_create_booking(self) -> None:
        report = self.run_journey("decline")
        self.assertEqual([call["name"] for call in report["calls"]], ["search_services", "check_availability"])
        self.assertEqual(report["confirmCalls"], 1)
        self.assertEqual(report["confirmations"], 0)
        self.assertEqual(report["successCount"], "0")
        self.assertIn("cancelled", report["status"].lower())

    def test_slot_conflict_is_human_readable_and_does_not_create_false_success(self) -> None:
        report = self.run_journey("conflict")
        self.assertEqual(
            [call["name"] for call in report["calls"]],
            ["search_services", "check_availability", "create_booking", "create_booking"],
        )
        self.assertTrue(report["firstResult"]["ok"])
        self.assertEqual(report["secondResult"]["error"]["code"], "SLOT_UNAVAILABLE")
        self.assertEqual(report["successCount"], "1")
        self.assertIn("just taken", report["status"].lower())

    def test_journey_does_not_directly_call_internal_handlers(self) -> None:
        source = APP.read_text(encoding="utf-8")
        start = source.index("async function startBookingJourney()")
        end = source.index("async function verifyTool()", start)
        journey = source[start:end]
        self.assertNotIn("searchServices(", journey)
        self.assertNotIn("checkAvailability(", journey)
        self.assertNotIn("createBooking(", journey)
        self.assertIn("document.modelContext.getTools()", journey)
        self.assertIn("document.modelContext.executeTool(", journey)


if __name__ == "__main__":
    unittest.main()
