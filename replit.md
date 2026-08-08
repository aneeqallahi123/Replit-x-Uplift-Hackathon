# Dastak Voice Agent

## Overview
A demo recreation of the Dastak (Punjab government services) portal with "Maryam", a bilingual (Urdu/English) voice agent that guides citizens through services — currently the driving-license renewal flow.

## How to run
- Workflow "Start application" runs `node server.js` (Express, port 5000).
- Frontend is static, served from `dastak-clone/` (index.html, services.html, apply.html).
- Dependencies: `npm install` (express only).
- On boot the server logs the resolved Uplift base URL. Set the `UPLIFT_BASE`
  Replit Secret to `https://ap-southeast-1.api.upliftai.org/v1` to use the
  Singapore region (lower latency from Pakistan); unset it to fall back to the
  US default. The assistant ID has not been verified to resolve in Singapore —
  if `/api/session` starts 404ing, remove the secret and restart.

### Syncing the remote assistant
The agent's system prompt and tool declarations live on the remote Uplift
assistant, not in this repo. After changing the guided flow, run — from Replit,
where `UPLIFT_API_KEY` exists in Secrets:

```bash
node scripts/sync-assistant.js --dry-run   # review the diff first
node scripts/sync-assistant.js             # apply it
```

The script is idempotent. Anchor mismatches are warnings, not failures — if it
warns, review that section by hand in the Uplift dashboard.

## Architecture
- `server.js` — minimal Express static server; `/api/config` is a stub.
- Voice: the browser connects to a remote Uplift AI realtime assistant over LiveKit (`dastak-clone/assets/js/maryam-agent.js`). STT/TTS/LLM all run remotely; the browser registers RPC tools the agent calls:
  - `get_page_context` — page config + live DOM/form state
  - `start_service` — begins a guided flow (points at buttons, waits for the citizen's click; never auto-clicks)
  - `guide_next_step` — executes the next guided step
  - `point_to_element`, `fill_field`, `navigate_to_page`
- Guided flow state persists in `sessionStorage` (`maryam_flow`) so it survives page navigations; on reconnect the browser pushes a `[PAGE UPDATE]` text message to the agent with the current page and flow step.
- Forms are demo-only; nothing is submitted to a real backend.

## User preferences
(none recorded yet)
