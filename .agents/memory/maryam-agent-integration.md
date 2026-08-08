---
name: Maryam agent integration gotchas
description: Non-obvious constraints in the Dastak Maryam voice agent (Uplift AI + LiveKit) integration
---

- `assets/js/maryam-agent.js` is the ONLY agent file; `voice-agent.js` was deleted (Aug 2026). Never reintroduce it or its `#agent-pointer`/`#voice-agent-panel` divs.
- On services.html the class names are swapped vs. meaning: `.apply_online` = **Self Service**, `.apply_self` = **Doorstep Service**. Keep the CAUTION notes in SITE_CONFIG.
- Uplift RPC payloads may wrap args: unwrap via `payload.arguments ? payload.arguments.raw_arguments : payload`.
- `createPublicSession` needs no API key from the browser; `UPLIFT_API_KEY` is server-side-only (assistant config). Session persists across pages via sessionStorage `maryam_session`.
- `point_to_element` must stay cancellable (single active op, DOM-removal watcher, beforeunload) or the assistant's RPC hangs forever. `fill_field` must be select-aware and date-aware (date inputs reject partial values).
- Remote Uplift assistant config is editable via API (GET, and POST to the same resource for updates — PATCH/PUT 404). Browser-registered RPC tools are invisible to the agent unless also declared in the assistant's tool list, and each tool's remote timeout caps how long a point-and-wait RPC may block.
- The browser can push context to the agent over the LiveKit chat text-stream topic; it is treated as user-channel input, so mark such messages as system messages the agent must not read aloud.
- Guided-flow state must be persisted inside the click handler itself — before navigation tears the page down — and pointer ops need a generation token so a stale wait-for-element op can't steal the active cancel slot.
- GitHub origin diverges easily (team pushes via web upload); expect PUSH_REJECTED → merge origin/main keeping local agent files.
