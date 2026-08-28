"""Contract and WebMCP-boundary tests for the synthetic create_booking write slice."""

from __future__ import annotations

import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app.js"
RUNNER = ROOT / "tests" / "run_create_booking.js"
UI_RUNNER = ROOT / "tests" / "run_create_booking_ui_boundary.js"

UUID_1 = "11111111-1111-4111-8111-111111111111"
UUID_2 = "22222222-2222-4222-8222-222222222222"
UUID_3 = "33333333-3333-4333-8333-333333333333"
UUID_4 = "44444444-4444-4444-8444-444444444444"
NOW = "2099-04-30T00:00:00+03:00"
SLOT = "2099-05-01T09:00:00+03:00"


def payload(**overrides: object) -> dict[str, object]:
    value: dict[str, object] = {
        "service_id": "demo-haircut-30",
        "slot_start": SLOT,
        "timezone": "Asia/Jerusalem",
        "customer_label": "demo-customer-1",
        "confirmation_id": UUID_1,
        "request_id": UUID_2,
    }
    value.update(overrides)
    return value


class CreateBookingContractTests(unittest.TestCase):
    maxDiff = None

    def run_scenario(self, scenario: str) -> dict[str, object]:
        completed = subprocess.run(
            ["node", str(RUNNER), str(APP), scenario, NOW],
            check=True,
            capture_output=True,
            text=True,
        )
        return json.loads(completed.stdout)

    def test_tool_schema_annotations_and_uuid_patterns_are_exact(self) -> None:
        report = self.run_scenario("schema")
        schema = report["inputSchema"]
        self.assertEqual(
            schema["required"],
            ["service_id", "slot_start", "timezone", "customer_label", "confirmation_id", "request_id"],
        )
        self.assertFalse(schema["additionalProperties"])
        self.assertEqual(schema["properties"]["customer_label"]["const"], "demo-customer-1")
        self.assertEqual(schema["properties"]["timezone"]["const"], "Asia/Jerusalem")
        for field in ("confirmation_id", "request_id"):
            pattern = schema["properties"][field]["pattern"]
            self.assertRegex(UUID_1, re.compile(pattern))
            self.assertNotRegex("550e8400-e29b-31d4-a716-446655440000", re.compile(pattern))
        self.assertEqual(
            report["annotations"],
            {"readOnlyHint": False, "untrustedContentHint": False},
        )

    def test_schema_validation_wins_over_all_other_errors(self) -> None:
        report = self.run_scenario("invalid")
        for response in report["responses"]:
            self.assertEqual(response["error"]["code"], "INVALID_INPUT")
        self.assertEqual(report["state"], {"bookings": 0, "idempotency": 0, "confirmations": 0})

    def test_success_consumes_exact_confirmation_and_creates_uuid_booking(self) -> None:
        report = self.run_scenario("success")
        response = report["response"]
        self.assertTrue(response["ok"])
        self.assertRegex(response["data"]["booking_id"], re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"))
        self.assertEqual(report["state"], {"bookings": 1, "idempotency": 1, "confirmations": 1, "consumed": True})

    def test_idempotent_replay_precedes_confirmation_and_returns_saved_success(self) -> None:
        report = self.run_scenario("replay")
        self.assertEqual(report["first"], report["second"])
        self.assertTrue(report["second"]["ok"])
        self.assertEqual(report["state"], {"bookings": 1, "idempotency": 1, "confirmations": 1, "consumed": True})

    def test_same_request_id_with_other_payload_returns_duplicate_before_confirmation(self) -> None:
        report = self.run_scenario("duplicate")
        self.assertEqual(report["response"]["error"]["code"], "DUPLICATE_REQUEST")
        self.assertEqual(report["state"], {"bookings": 1, "idempotency": 1, "confirmations": 1, "consumed": True})

    def test_missing_foreign_and_consumed_confirmation_require_confirmation_without_state_change(self) -> None:
        report = self.run_scenario("confirmations")
        for response in report["responses"]:
            self.assertEqual(response["error"]["code"], "CONFIRMATION_REQUIRED")
        self.assertEqual(report["state"], {"bookings": 1, "idempotency": 1, "confirmations": 2, "consumed": True})

    def test_service_errors_then_past_slot_then_slot_unavailable_do_not_consume_confirmation(self) -> None:
        report = self.run_scenario("service-slot-errors")
        self.assertEqual(
            [response["error"]["code"] for response in report["responses"]],
            ["SERVICE_NOT_FOUND", "SERVICE_UNAVAILABLE", "SLOT_IN_PAST", "SLOT_UNAVAILABLE", "SLOT_UNAVAILABLE"],
        )
        self.assertEqual(report["state"], {"bookings": 1, "idempotency": 1, "confirmations": 6, "unconsumed": 5})

    def test_webmcp_boundary_accepts_object_and_returns_json_string_for_success_replay_duplicate_and_slot_conflict(self) -> None:
        report = self.run_scenario("boundary")
        self.assertTrue(report["success"]["ok"])
        self.assertEqual(report["success"], report["replay"])
        self.assertEqual(report["duplicate"]["error"]["code"], "DUPLICATE_REQUEST")
        self.assertEqual(report["slotConflict"]["error"]["code"], "SLOT_UNAVAILABLE")
        self.assertTrue(report["handlerReceivedObject"])
        self.assertTrue(report["handlerReturnedString"])


class CreateBookingUiBoundaryTests(unittest.TestCase):
    def run_ui(self, confirmation: str) -> dict[str, object]:
        completed = subprocess.run(
            ["node", str(UI_RUNNER), str(APP), confirmation],
            check=True,
            capture_output=True,
            text=True,
        )
        return json.loads(completed.stdout)

    def test_accepted_ui_confirmation_uses_get_tools_then_execute_tool_not_internal_handler(self) -> None:
        report = self.run_ui("accept")
        self.assertEqual(report["confirmCalls"], 1)
        self.assertEqual(report["getToolsCalls"], 1)
        self.assertEqual(report["executeToolCalls"], 1)
        self.assertEqual(report["count"], "1")
        self.assertTrue(report["response"]["ok"])
        self.assertNotIn("createBooking(", report["uiFunctionBody"])

    def test_declined_ui_confirmation_creates_no_confirmation_and_never_calls_execute_tool(self) -> None:
        report = self.run_ui("decline")
        self.assertEqual(report["confirmCalls"], 1)
        self.assertEqual(report["getToolsCalls"], 0)
        self.assertEqual(report["executeToolCalls"], 0)
        self.assertEqual(report["count"], "0")
        self.assertEqual(report["confirmations"], 0)


if __name__ == "__main__":
    unittest.main()
