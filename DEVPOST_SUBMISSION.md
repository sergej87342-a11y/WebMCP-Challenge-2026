# Devpost Submission Draft — WebMCP Salon Booking Demo

> This is the verified English draft for the submission form. The live deployment, public source repository, and public demo video are ready.

## Project name

WebMCP Salon Booking Demo

## Tagline

A synthetic booking flow where agents can search and check availability, while the demo UI requires explicit human approval before the final booking.

## Live demo

https://webmcp-challenge-2026.sergej87342.workers.dev/

## Demo video

https://youtu.be/5AZqA2jZ_Ao

## Inspiration

Booking is a useful test case for agent-ready web experiences because it combines discovery, availability, and a consequential action. A person may want help finding a service and an open time, but the final booking should not happen silently.

This project explores a narrow alternative to UI guessing: the page exposes structured WebMCP tools for the information-gathering steps and preserves a deliberate human approval boundary for the write step.

## What it does

WebMCP Salon Booking Demo is a small, synthetic-only web application with one complete journey:

1. `search_services` returns available services from a synthetic catalog.
2. `check_availability` returns open synthetic slots for a selected service and date.
3. The person selects a slot and explicitly accepts a confirmation dialog in the UI.
4. `create_booking` creates one synthetic booking only after that explicit approval.

The app returns a UUID v4 booking ID after a successful synthetic booking. A repeated confirmed attempt for the same slot returns `SLOT_UNAVAILABLE` rather than pretending that a second booking succeeded.

## How we built it

The project is a dependency-free HTML, CSS, and JavaScript application. Cloudflare Workers Static Assets serves only the `public/` deployment directory; the bundled Python standard-library server remains for local verification.

The three tools are registered with `document.modelContext.registerTool()`. The interface uses `document.modelContext.getTools()` to discover tools and `document.modelContext.executeTool()` to invoke them. The tool handlers return structured JSON strings at the WebMCP execution boundary.

Automated tests cover the tool contracts, strict input validation, read/write boundaries, idempotency, confirmation behavior, slot conflicts, the WebMCP execution boundary, the product journey, public asset isolation, Cloudflare response-header configuration, and the Workers static-assets configuration. The current suite contains 42 tests.

## How we used WebMCP

WebMCP is the integration boundary for all three capabilities:

- `search_services` is read-only and returns only available entries from the synthetic catalog.
- `check_availability` is read-only and returns synthetic slots without reserving them.
- `create_booking` is a write tool with `readOnlyHint: false` and `untrustedContentHint: false`.

The write tool uses a strict six-field input schema with `additionalProperties: false`. It accepts only the fixed synthetic customer label, a selected slot, and UUID v4 `confirmation_id` and `request_id` values. There is no hidden fallback that turns an invalid request into another action.

## Human-agent experience

The agent can help with the repetitive, structured parts of the journey: discover services and retrieve available times. The person retains control over the consequential step.

In the provided UI flow, the UI issues a one-time `confirmation_id` only after an explicit human confirmation. That token is bound to the normalized booking payload. At the `create_booking` tool boundary, generating or substituting an arbitrary UUID is not sufficient: the value must match an unconsumed token previously issued by that UI flow for the same normalized payload. If confirmation is declined, no token is issued and `create_booking` is not invoked.

This produces a visible handoff: the agent helps the person reach a specific choice, and the person authorizes the state change.

## Challenges we ran into

The main technical challenge was the WebMCP execution boundary. `executeTool()` is called with JSON text, while the registered handler receives a parsed argument object. An initial handler incorrectly parsed the object a second time and returned `INVALID_INPUT`.

We corrected the handler to validate the object directly and added regression tests covering `registerTool → getTools → executeTool(JSON string) → handler(object) → JSON result` for successful and error scenarios.

The other challenge was making the write operation honest in a demo. The project does not use a vague `confirmed: true` flag. It requires a UI-issued, one-time confirmation token, request idempotency, and a final slot check before writing the synthetic booking.

## Accomplishments that we are proud of

- A complete, small WebMCP journey instead of a standalone tool demonstration.
- Clear separation between read-only discovery/availability tools and a human-approved write tool.
- Synthetic-only data with no real customer records or personal data.
- One-time confirmation bound to the exact normalized payload.
- Idempotent booking requests that replay the original successful response without creating duplicates.
- A truthful conflict result when a selected slot has already been taken.
- A verified public deployment on Cloudflare Workers Static Assets: HTTPS and TLS passed, the required response headers were present, deployed browser assets matched `public/` by SHA-256, and service paths were not served.
- A manual public WebMCP run completed the full journey: one UUID v4 booking was created after explicit human confirmation; a repeated confirmed attempt for the same slot was rejected and the counter remained `1`.
- Manual verification in Chrome with WebMCP enabled, plus 42 automated tests.

## What we learned

Agent-ready web experiences need more than exposing functions. The contracts, schemas, error ordering, and confirmation boundary shape whether an agent can act predictably and whether a person can understand and control the outcome.

We also learned that an apparently healthy no-input WebMCP call does not prove an input-bearing tool is wired correctly. Testing the full invocation boundary is necessary.

## What’s next

This contest MVP intentionally stops before production booking features. Future work would require separate product, privacy, security, and deployment decisions before adding a database, authentication, real customer data, payments, notifications, or integration with a real salon system.

The public demo video and source repository are ready for contest submission alongside the verified live deployment.

## Testing instructions

### Local setup

```bash
python3 server.py --host 127.0.0.1 --port 8080
```

Open `http://127.0.0.1:8080/`.

### Production URL

Open `https://webmcp-challenge-2026.sergej87342.workers.dev/` in Chrome with WebMCP enabled. The verified public run completed the full journey: `search_services`, `check_availability`, explicit human confirmation, then `create_booking`. A repeated confirmed attempt for the same slot was rejected and did not increase the booking counter.

### Chrome with WebMCP

1. Use Google Chrome 149 or later.
2. Open `chrome://flags/#enable-webmcp-testing`.
3. Enable **WebMCP for testing** and restart Chrome.
4. Open the local URL.
5. Follow the product flow: find available services, select a service, choose a time, and approve the explicit confirmation dialog.
6. Repeat a confirmed attempt for the same slot; the app should return `SLOT_UNAVAILABLE` and should not create a second synthetic booking.

### Automated checks

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v
node --check public/app.js
python3 -m py_compile server.py tests/*.py
```

## Technology list

- HTML
- CSS
- JavaScript
- WebMCP (`document.modelContext`)
- Python 3 standard library (`http.server`)
- Python `unittest`
- Node.js syntax check (`node --check`)

## Important MVP limitations

- This is a synthetic demo, not a production booking system.
- No real names, phone numbers, email addresses, addresses, salon records, payment data, or external services are used.
- Bookings, idempotency records, and confirmation tokens exist only in module-level in-memory state for one page and are cleared on reload.
- There is no database and no cross-tab or cross-process atomicity guarantee.
- The only supported timezone is `Asia/Jerusalem`.
- The live URL is deployed on Cloudflare Workers Static Assets, and the source repository is public under the MIT License.
- The public demo video is available at https://youtu.be/5AZqA2jZ_Ao.
