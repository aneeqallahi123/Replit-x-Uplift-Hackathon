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
- Guided-flow state must be persisted inside the click handler itself (before navigation tears the page down). Use `[PAGE UPDATE — ACTION REQUIRED]` prefix in page-context pushes so the agent calls guide_next_step immediately without preamble.
- GitHub origin diverges easily (team pushes via web upload); expect PUSH_REJECTED → merge origin/main keeping local agent files.
