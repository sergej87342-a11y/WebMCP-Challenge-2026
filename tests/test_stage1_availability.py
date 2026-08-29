"""Contract tests for the read-only stage-1 check_availability tool."""

from __future__ import annotations

import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "public" / "app.js"
RUNNER = ROOT / "tests" / "run_check_availability.js"
BOUNDARY_RUNNER = ROOT / "tests" / "run_webmcp_boundary.js"
UNAVAILABLE_UI_RUNNER = ROOT / "tests" / "run_unavailable_ui_boundary.js"


class CheckAvailabilityContractTests(unittest.TestCase):
    """Exercise app.js directly with a minimal DOM stub and fixed local date."""

    def call_tool(self, payload: object, today: str = "2099-04-30") -> dict[str, object]:
        completed = subprocess.run(
            ["node", str(RUNNER), str(APP), json.dumps(payload), today],
            check=True,
            capture_output=True,
            text=True,
        )
        return json.loads(completed.stdout)

    def assert_error(self, payload: object, code: str) -> None:
        response = self.call_tool(payload)
        self.assertEqual(response["ok"], False)
        self.assertEqual(response["error"]["code"], code)

    def test_success_returns_contract_shape_and_synthetic_slots(self) -> None:
        response = self.call_tool(
            {
                "service_id": "demo-haircut-30",
                "date": "2099-05-01",
                "timezone": "Asia/Jerusalem",
            }
        )

        self.assertEqual(response["ok"], True)
        self.assertEqual(
            response["data"],
            {
                "service": {
                    "service_id": "demo-haircut-30",
                    "name": "Демо-стрижка",
                    "duration_minutes": 30,
                },
                "date": "2099-05-01",
                "timezone": "Asia/Jerusalem",
                "slots": [
                    {
                        "slot_start": "2099-05-01T09:00:00+03:00",
                        "local_time": "09:00",
                        "timezone": "Asia/Jerusalem",
                    },
                    {
                        "slot_start": "2099-05-01T10:00:00+03:00",
                        "local_time": "10:00",
                        "timezone": "Asia/Jerusalem",
                    },
                ],
            },
        )

    def test_webmcp_boundary_passes_object_to_handler_and_returns_stringified_result(self) -> None:
        raw_input = json.dumps(
            {
                "service_id": "demo-haircut-30",
                "date": "2099-05-01",
                "timezone": "Asia/Jerusalem",
            }
        )
        completed = subprocess.run(
            ["node", str(BOUNDARY_RUNNER), str(APP), raw_input],
            check=True,
            capture_output=True,
            text=True,
        )
        result = json.loads(completed.stdout)
        self.assertTrue(result["ok"])
        self.assertEqual(result["data"]["slots"][0]["local_time"], "09:00")

    def test_unavailable_service_ui_boundary_uses_webmcp_and_confirms_error_contract(self) -> None:
        completed = subprocess.run(
            ["node", str(UNAVAILABLE_UI_RUNNER), str(APP)],
            check=True,
            capture_output=True,
            text=True,
        )
        report = json.loads(completed.stdout)
        self.assertEqual(
            json.loads(report["executeInput"]),
            {
                "service_id": "demo-consultation-15",
                "date": "2099-05-01",
                "timezone": "Asia/Jerusalem",
            },
        )
        self.assertEqual(report["count"], "1")
        result = json.loads(report["result"])
        self.assertEqual(result["ok"], False)
        self.assertEqual(result["error"]["code"], "SERVICE_UNAVAILABLE")

    def test_requires_service_id_date_and_timezone(self) -> None:
        valid = {
            "service_id": "demo-haircut-30",
            "date": "2099-05-01",
            "timezone": "Asia/Jerusalem",
        }
        for missing_key in valid:
            payload = {key: value for key, value in valid.items() if key != missing_key}
            with self.subTest(missing_key=missing_key):
                self.assert_error(payload, "INVALID_INPUT")

    def test_rejects_additional_properties(self) -> None:
        self.assert_error(
            {
                "service_id": "demo-haircut-30",
                "date": "2099-05-01",
                "timezone": "Asia/Jerusalem",
                "unexpected": True,
            },
            "INVALID_INPUT",
        )

    def test_rejects_invalid_calendar_date_format(self) -> None:
        self.assert_error(
            {
                "service_id": "demo-haircut-30",
                "date": "2099/05/01",
                "timezone": "Asia/Jerusalem",
            },
            "INVALID_INPUT",
        )
        self.assert_error(
            {
                "service_id": "demo-haircut-30",
                "date": "2099-02-30",
                "timezone": "Asia/Jerusalem",
            },
            "INVALID_INPUT",
        )

    def test_rejects_timezone_other_than_asia_jerusalem(self) -> None:
        self.assert_error(
            {
                "service_id": "demo-haircut-30",
                "date": "2099-05-01",
                "timezone": "UTC",
            },
            "INVALID_INPUT",
        )

    def test_unknown_service_returns_service_not_found(self) -> None:
        self.assert_error(
            {
                "service_id": "demo-not-found",
                "date": "2099-05-01",
                "timezone": "Asia/Jerusalem",
            },
            "SERVICE_NOT_FOUND",
        )

    def test_existing_unavailable_service_returns_service_unavailable(self) -> None:
        self.assert_error(
            {
                "service_id": "demo-consultation-15",
                "date": "2099-05-01",
                "timezone": "Asia/Jerusalem",
            },
            "SERVICE_UNAVAILABLE",
        )

    def test_past_date_is_compared_to_injected_jerusalem_date(self) -> None:
        self.assert_error(
            {
                "service_id": "demo-haircut-30",
                "date": "2099-04-29",
                "timezone": "Asia/Jerusalem",
            },
            "DATE_IN_PAST",
        )

    def test_no_slots_is_an_error_not_success_with_empty_slots(self) -> None:
        self.assert_error(
            {
                "service_id": "demo-haircut-30",
                "date": "2099-05-02",
                "timezone": "Asia/Jerusalem",
            },
            "NO_SLOTS",
        )

    def test_repeated_read_only_calls_return_identical_result(self) -> None:
        payload = {
            "service_id": "demo-haircut-30",
            "date": "2099-05-01",
            "timezone": "Asia/Jerusalem",
        }
        self.assertEqual(self.call_tool(payload), self.call_tool(payload))


class CheckAvailabilityWebMCPStructureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.app = APP.read_text(encoding="utf-8")
        self.index = (ROOT / "public" / "index.html").read_text(encoding="utf-8")

    def test_webmcp_definition_is_strict_and_read_only(self) -> None:
        self.assertRegex(self.app, r'name\s*:\s*["\']check_availability["\']')
        self.assertRegex(self.app, r"additionalProperties\s*:\s*false")
        self.assertRegex(self.app, r"readOnlyHint\s*:\s*true")
        for field in ("service_id", "date", "timezone"):
            self.assertIn(field, self.app)

    def test_demo_verification_uses_discovery_and_execute_tool(self) -> None:
        self.assertIn('id="verify-availability"', self.index)
        self.assertIn("document.modelContext.getTools", self.app)
        self.assertIn("document.modelContext.executeTool", self.app)
        self.assertIn("check_availability", self.app)

    def test_availability_verification_does_not_call_the_internal_function(self) -> None:
        match = re.search(
            r"async function verifyAvailabilityTool\(\)\s*\{(?P<body>.*?)\n\}",
            self.app,
            re.DOTALL,
        )
        if match is None:
            self.fail("verifyAvailabilityTool must exist")
        self.assertNotRegex(match.group("body"), r"\bcheckAvailability\s*\(")


if __name__ == "__main__":
    unittest.main()
