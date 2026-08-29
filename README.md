# WebMCP Salon Booking Demo

> **Live Demo:** `TBD — not deployed yet`
>
> **Demo Video:** `TBD — not recorded yet`

A small, synthetic-only booking demo that shows how a person and an agent can complete a clear service-booking flow together through WebMCP.

## The problem

A booking flow often asks someone to browse services, check a time, and confirm a state-changing action. An agent that only guesses its way through a graphical interface can be fragile and can blur the boundary between reading information and creating a booking.

This demo exposes the important steps as structured WebMCP tools. In the provided UI flow, the write step requires explicit human confirmation before the UI issues a one-time confirmation token and calls `create_booking`.

## Why this is useful

The demo makes the booking path explicit and inspectable:

1. An agent can discover available services.
2. It can ask for available times for a selected service.
3. The person chooses a time and explicitly approves the booking in the UI.
4. Only then can the agent-facing write tool create a synthetic booking.

The result is a small example of a human-agent experience where structured tools provide reliable intent boundaries instead of relying on UI scraping or hidden fallback behavior.

## Why WebMCP

WebMCP lets the page define structured tools that an agent can discover and invoke directly. In this project, that is important because each tool has a clear contract, schema, and read/write boundary:

- the read tools return synthetic catalog and availability data without changing state;
- the write tool has a strict input schema and requires a UI-issued, one-time confirmation;
- the page uses the WebMCP path (`getTools()` then `executeTool()`) rather than treating a direct internal handler call as proof of agent execution.

## End-to-end journey

The product flow is intentionally narrow:

```text
search_services
  → select a service
  → check_availability
  → select a time
  → explicit human confirmation in the UI
  → create_booking
```

A successful booking returns a synthetic UUID v4 `booking_id`. A second confirmed attempt for the same slot returns `SLOT_UNAVAILABLE`; it does not create a second booking.

## WebMCP tools

| Tool | Purpose | State boundary |
|---|---|---|
| `search_services` | Returns available services from the synthetic catalog. | Read-only. It does not reserve a slot or change state. |
| `check_availability` | Returns synthetic open slots for a service, date, and `Asia/Jerusalem` timezone. | Read-only. It does not reserve a slot or change state. |
| `create_booking` | Creates one synthetic booking for a valid selected slot after UI confirmation. | Write. It changes only in-memory state in the current page. |

The tool contracts are described in [CONTRACTS.md](CONTRACTS.md).

## Safety and integrity boundaries

This is a synthetic demo, not a production booking system.

- **Synthetic-only data:** no real customers, names, phone numbers, email addresses, addresses, salon records, or payment data are accepted or stored.
- **Explicit human approval:** in the provided UI flow, the UI creates a `confirmation_id` only after the user accepts the confirmation dialog. At the `create_booking` tool boundary, generating or substituting an arbitrary UUID is not sufficient: the value must match an unconsumed token previously issued by that UI flow for the same normalized payload.
- **One-time confirmation:** each UUID v4 `confirmation_id` is bound to the normalized booking payload and is consumed only after a successful booking. A missing, foreign, or consumed token returns `CONFIRMATION_REQUIRED`.
- **Idempotency:** `request_id` is a UUID v4 key. A repeat with the same normalized payload returns the saved successful response and the same `booking_id`; the same `request_id` with another payload returns `DUPLICATE_REQUEST`.
- **Slot conflict protection:** before writing, the tool verifies the service, time, and slot state. An unavailable or already-booked slot returns `SLOT_UNAVAILABLE` without creating a partial booking.
- **Strict schemas:** the write tool requires six fields and rejects unknown fields. `customer_label` is a closed synthetic value (`demo-customer-1`), not a free-form personal-data field.

## Run locally

Requirements:

- Python 3
- Google Chrome 149+ with WebMCP testing enabled, or ChatGPT's in-app browser

Start the local server from the repository root:

```bash
python3 server.py --host 127.0.0.1 --port 8080
```

Then open:

```text
http://127.0.0.1:8080/
```

The bundled server is for local demonstration only. It serves the repository directory and must not be exposed directly on a public network.

## Test with Chrome and WebMCP

1. Use Google Chrome 149 or later.
2. Open `chrome://flags/#enable-webmcp-testing`.
3. Enable **WebMCP for testing** and restart Chrome.
4. Start the local server with the command above.
5. Open `http://127.0.0.1:8080/` in Chrome.
6. Use the product flow on the page:
   - select **Find available services**;
   - select a returned service;
   - choose an available time;
   - approve the explicit confirmation dialog to create a synthetic booking.
7. Repeat the confirmed attempt for the same slot to observe the honest conflict result instead of a false success.

The page also contains a technical-proof section that exercises discovery and invocation through `document.modelContext.getTools()` and `document.modelContext.executeTool()`.

## Automated checks

Run the complete test suite:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v
```

Run static syntax checks:

```bash
node --check app.js
python3 -m py_compile server.py tests/*.py
```

Check documentation/code whitespace before a commit:

```bash
git diff --check
```

## MVP limitations

- The catalog, schedule, and bookings are synthetic.
- State is module-level in-memory state for one page only; reloading the page clears bookings, idempotency records, and confirmations.
- There is no database and no guarantee of atomicity between browser tabs or processes.
- There is no authentication, payment, notification, real salon integration, or Telegram integration.
- The only supported timezone is `Asia/Jerusalem`.
- This repository currently has no public deployment, public license file, or demo video. The placeholders at the top will be updated only after those separate decisions are approved.

## Repository scope

This is an independent contest demo. It does not connect to, read from, or modify `ManicureBookingBot-HE`, `HairBookingBot-HE`, or `FleetOfBots`.
