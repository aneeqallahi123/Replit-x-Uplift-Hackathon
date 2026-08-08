---
name: Maryam agent integration gotchas
description: Non-obvious constraints in the Dastak Maryam voice agent (Uplift AI + LiveKit) integration
---

- `assets/js/maryam-agent.js` is the ONLY agent file; `voice-agent.js` was deleted (Aug 2026). Never reintroduce it or its `#agent-pointer`/`#voice-agent-panel` divs.
- On services.html the class names are swapped vs. meaning: `.apply_online` = **Self Service**, `.apply_self` = **Doorstep Service**. Keep the CAUTION notes in SITE_CONFIG.
- Uplift RPC payloads may wrap args: unwrap via `payload.arguments ? payload.arguments.raw_arguments : payload`.
- `createPublicSession` needs no API key from the browser; `UPLIFT_API_KEY` is server-side-only (assistant config). Session persists across pages via sessionStorage `maryam_session`.
- `point_to_element` must stay cancellable (single active op, DOM-removal watcher, beforeunload) or the assistant's RPC hangs forever. `fill_field` must be select-aware and date-aware (date inputs reject partial values).
- Remote Uplift assistant config is editable via API (GET, and POST to the same resource for updates — PATCH/PUT 404). Browser-registered RPC tools are invisible to the agent unless also declared in the assistant's tool list, and each tool's remote timeout caps how long a point-and-wait RPC may block. Sync via `scripts/sync-assistant.js` (idempotent, --dry-run).
- Guided-flow RPCs must be NON-BLOCKING: point → return immediately with `presentationInstructions` → browser click listener fires `[CLICK: stepId]` text message → agent speaks and calls guide_next_step. Blocking RPCs cause silence (agent frozen waiting for tool result) and lose the response on page navigation.
- `[CLICK]` notifications for navigating steps are stored in `sessionStorage('maryam_pending_click')` and replayed by pushPageContext after reconnect — the WebSocket is torn down before sendText() can flush on native link navigation.
- Audio autoplay is blocked after navigation (no user gesture on new page). `attachAudioTrack` now registers retry handlers for click/touchstart/keydown and calls `window._maryamRetryAudio` on ActiveSpeakersChanged (user speaking = in-tab gesture context). Shows "Tap to hear" badge after 3 s if still blocked.
- pushPageContext sends a full self-contained briefing (service, mode, completed steps, what to say) so the agent can resume even without prior [CLICK] context. Always sends pending [CLICK] first, then [PAGE UPDATE — ACTION REQUIRED].
- Uplift session TTL is 1200 s (20 min); conversation context IS preserved across navigation reconnects — the agent stays in the same room.
- GitHub origin diverges easily (team pushes via web upload); expect PUSH_REJECTED → merge origin/main keeping local agent files.
