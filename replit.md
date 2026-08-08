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
- `server.js` — minimal Express static server; `POST /api/session` proxies Uplift session creation so `UPLIFT_API_KEY` never reaches the browser; `/api/config` is a stub.
- Voice: the browser connects to a remote Uplift AI realtime assistant over LiveKit (`dastak-clone/assets/js/maryam-agent.js`). STT/TTS/LLM all run remotely; the browser registers RPC tools the agent calls:
  - `get_page_context` — page config + live DOM/form state
  - `start_service` — begins a guided flow (points at buttons, waits for the citizen's click; never auto-clicks)
  - `guide_next_step` — executes the next guided step
  - `point_to_element`, `fill_field`, `navigate_to_page`, `scroll_to_element`
- **Pointing is semi-blocking.** One engine (`pointAndAwaitClick`) handles every
  pointing step. On a step that stays on the same page it waits up to 20 s for
  the click (30 s for the captcha) and returns the outcome — `clicked`,
  `still_waiting`, `captcha_correct` — in the tool result itself, so the agent
  always has something to say. On a step that loads a new page it returns
  immediately, because the unload destroys the RPC response anyway. `[CLICK: …]`
  text messages are still sent as a redundant secondary signal.
- The captcha step watches the input, not clicks: the citizen clicks the box and
  *then* types, so a click listener can never observe the answer.
- Guided flow state persists in `sessionStorage` (`maryam_flow`) so it survives
  page navigations, and expires after 30 minutes. On reconnect the browser
  pushes a `[PAGE UPDATE]` text message with the current page and flow step,
  after waiting for the remote agent participant to actually join.
- **A fresh Uplift session is created on every page.** The saved token is never
  reused: the agent worker ends its session when the human participant
  disconnects, so a resumed token lands in a room with no agent in it. The
  `[PAGE UPDATE]` re-briefing is what carries the flow across pages.
- Forms are demo-only; nothing is submitted to a real backend.

## Debugging
`window.__maryam` is exposed in the browser console: `room`, `connected`,
`loadFlow()`, `saveFlow()`, `clearFlow()`, `pushPageContext()`,
`executeCurrentFlowStep()`, `getCaptchaState()`, `buildLiveContext()`,
`FLOW_STEPS`. Use it to drive the guided flow without a voice session.

To check whether the remote agent ingests the `lk.chat` text channel:
```js
await __maryam.room.localParticipant.sendText("Salam", { topic: 'lk.chat' })
```
If Maryam replies, `[CLICK]`/`[PAGE UPDATE]` messages are being read. If she is
silent, only the semi-blocking tool results are carrying the flow.

## User preferences
(none recorded yet)
