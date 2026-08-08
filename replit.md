# Dastak Voice Agent

## Overview
A demo recreation of the Dastak (Punjab government services) portal with "Maryam", a bilingual (Urdu/English) voice agent that guides citizens through services — currently the driving-license renewal flow.

## How to run
- Workflow "Start application" runs `node server.js` (Express, port 5000).
- Frontend is static, served from `dastak-clone/` (index.html, services.html, apply.html).
- Dependencies: `npm install` (express only).

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
