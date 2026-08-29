# CHECKPOINT — verified production demo

Date: 2026-08-29 UTC.
Status: `VERIFIED`.
Decision: `GO` for production demo recording.

## Current repository state

- Current HEAD: `612b3a65237d56aeee92245495b2b5c74dd053aa` (`docs: record verified production deployment`).
- Repository: `sergej87342-a11y/WebMCP-Challenge-2026`.
- Visibility: `PRIVATE`.
- The source repository has not been made public.
- Git history has been rewritten to remove the personal email from reachable commit metadata.
- Reachable commits use the GitHub noreply identity; the author and committer name remains `Sergej`.
- An external history backup bundle was created, checksum-verified, and retained outside the repository.
- `LICENSE` contains the MIT License.

## Live deployment

Live URL:

```text
https://webmcp-challenge-2026.sergej87342.workers.dev/
```

Hosting:

- Cloudflare Workers Static Assets.
- The Cloudflare GitHub integration is limited to this `WebMCP-Challenge-2026` repository.
- Deployment serves the `public/` static asset directory only.

Production verification completed:

- HTTPS and TLS work without certificate errors.
- Required response headers are present:
  - `Origin-Agent-Cluster: ?1`
  - `Permissions-Policy: tools=(self)`
  - `Cache-Control: no-store`
- Live `index.html`, `app.js`, and `styles.css` match local `public/` assets by SHA-256.
- Internal files, source documents, test files, Git metadata, deployment configuration, and directory listings are not served.
- `public/_headers` configures the required Cloudflare response headers; it is not publicly served.

## Verified public WebMCP journey

The public scenario was completed successfully on the live URL:

1. `search_services` returned synthetic available services.
2. `check_availability` returned available times for the selected service.
3. The user selected `09:00` in `Asia/Jerusalem`.
4. The user explicitly accepted the confirmation dialog.
5. `create_booking` created a synthetic booking with a UUID v4 `booking_id`.
6. The confirmed booking counter became `1`.
7. A repeated confirmed attempt for the same slot was rejected with the honest conflict result.
8. The counter remained `1`; no false success or second booking was created.

## Product and safety boundaries

- The demo uses only synthetic services, schedule data, and booking state.
- No real customer names, phone numbers, email addresses, addresses, payments, or salon records are accepted or stored.
- `search_services` and `check_availability` are read-only.
- `create_booking` requires a UI-issued one-time `confirmation_id` after explicit human approval.
- `request_id` provides idempotent replay for the same normalized payload.
- State is module-level in-memory state for one page; reload clears bookings, confirmations, and idempotency records.
- No cross-tab or cross-process atomicity guarantee is claimed.

## Current verification suite

The following checks completed successfully at this checkpoint:

```text
42 tests — OK
node --check public/app.js — OK
PYTHONDONTWRITEBYTECODE=1 python3 -m py_compile server.py tests/*.py — OK
git diff --check — OK
```

## Contest documentation

- `README.md` and `DEVPOST_SUBMISSION.md` have been updated with the live URL and verified production deployment facts.
- The live URL is recorded in both documents.
- The Demo Video URL remains `TBD`.
- The demo video must remain below three minutes, include a clear working-project demonstration, and include English audio.

## Exact continuation point — demo video recording

The English video scenario is ready:

- Voice-over length: `286` words.
- Target finished duration: `2:25–2:30`.
- The script demonstrates the live public WebMCP journey, explicit human confirmation, and the honest slot-conflict result.

Next step:

1. Open Clipchamp and create a new video.
2. Record a clean screen of the public scenario at the live URL.
3. Add the prepared English synthetic voice-over.
4. Before recording, close Gmail, Cloudflare, and unrelated browser tabs.
5. Reload the site until the booking counter is `0`.
6. Enable full-screen mode with `F11` before capturing the journey.
7. Do not show personal data, email, other projects, dashboards, credentials, or terminal windows.

## Deferred work

- Record and publish the public demo video.
- Decide separately whether and when to make the source repository public for contest submission.
- Do not add production booking features without a separate request and privacy/security review.
