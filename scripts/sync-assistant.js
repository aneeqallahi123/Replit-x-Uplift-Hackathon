// Syncs the remote Uplift AI "Maryam" assistant with the guided
// navigation protocol implemented in dastak-clone/assets/js/maryam-agent.js.
//
// - Replaces the assistant's instructions wholesale with maryam-system-prompt.md
//   (the source of truth for the prompt now lives in this repo, not hand-edited
//   on the Uplift dashboard — see that file's own header note)
// - Upserts every RPC tool the browser registers, with descriptions/parameter
//   schemas/timeouts that match the real behavior in maryam-agent.js
//
// Usage: node scripts/sync-assistant.js          (dry run: add --dry-run)
// Requires: UPLIFT_API_KEY env var.

const fs = require('fs');
const path = require('path');

const ASSISTANT_ID = 'e9311394-097b-49c6-a206-fef2569dce2c';
// Keep in step with server.js — same env var, same US default.
const BASE = process.env.UPLIFT_BASE || 'https://api.upliftai.org/v1';
const API_KEY = process.env.UPLIFT_API_KEY;
const DRY_RUN = process.argv.includes('--dry-run');

if (!API_KEY) {
  console.error('UPLIFT_API_KEY is not set.');
  process.exit(1);
}

const PROMPT_PATH = path.join(__dirname, '..', 'maryam-system-prompt.md');
const INSTRUCTIONS = fs.readFileSync(PROMPT_PATH, 'utf8');

// Timeouts must comfortably exceed what the browser can actually spend
// inside a tool call: pointing waits ~20 s, the captcha ~30 s, a file
// upload wait ~60 s (the citizen has to navigate an OS file picker).
const TIMEOUTS = {
  get_page_context: 10000,
  get_service_journey: 10000,
  start_service: 65000,       // covers a file-upload wait inside fill_field's first call
  start_quick_action: 35000,  // no file uploads in any quick action
  guide_next_step: 65000,     // same worst case as start_service
  fill_field: 65000,          // file-type fields wait up to FILE_WAIT_TIMEOUT_MS (60 s)
  point_to_element: 25000,    // hard-capped at 20 s browser-side
  scroll_to_element: 10000,
  navigate_to_page: 10000,
  end_session: 8000,          // returns almost immediately; the grace delay happens client-side
};

const TOOLS = [
  {
    name: 'get_page_context',
    description:
      'Returns what page the citizen is on and, when a guided service or ' +
      'quick-action flow is already active, its current step and progress. ' +
      'Call at the start of the session and whenever the page changes or ' +
      'you are unsure what is on screen. This is NOT where field details ' +
      'come from — use get_service_journey for that.',
    parameters: { type: 'object', required: [], properties: {} },
  },
  {
    name: 'get_service_journey',
    description:
      'Returns the complete script for one service or quick action: its ' +
      'exact ordered field list (name, type, validation), whether it has a ' +
      'captcha, and which fields need the citizen\'s own manual action ' +
      '(file uploads). ALWAYS call this once — with the service_key or ' +
      'action_key the citizen wants — before start_service or ' +
      'start_quick_action. Never assume one service\'s form looks like ' +
      'another\'s.',
    parameters: {
      type: 'object',
      required: ['key'],
      properties: {
        key: {
          type: 'string',
          description:
            'A service_key (e.g. "renewal_driving_license", ' +
            '"learner_driving_license") or a quick-action action_key ' +
            '(e.g. "track_application", "e_license", "verify_license").',
        },
      },
    },
  },
  {
    name: 'start_service',
    description:
      'Begins the guided flow for one of the six license services. ' +
      'SEMI-BLOCKING: on a step that stays on the current page it points ' +
      'at the element the citizen must click (or field to answer) and ' +
      'waits — up to ~20 s for a click, ~30 s for the captcha, ~60 s for a ' +
      'file upload — then returns the outcome. On a step that loads a new ' +
      'page it returns immediately. Always speak the ' +
      'presentationInstructions field from the result in the same turn.',
    parameters: {
      type: 'object',
      required: ['service_key'],
      properties: {
        service_key: {
          type: 'string',
          enum: [
            'learner_driving_license',
            'renewal_learner_driving_license',
            'renewal_driving_license',
            'duplicate_driving_license',
            'international_driving_license_duplicate',
            'international_driving_license',
          ],
          description: 'The license service to guide the citizen through.',
        },
        mode: {
          type: 'string',
          enum: ['online', 'doorstep'],
          description:
            'How the citizen wants to apply: "online" = Self Service, "doorstep" = Doorstep Service.',
        },
      },
    },
  },
  {
    name: 'start_quick_action',
    description:
      'The equivalent of start_service for the three quick actions (Track ' +
      'Application, e-License, Verify License). These never navigate to a ' +
      'new page — they open a panel on the Services page. Same ' +
      'semi-blocking behavior and presentationInstructions convention as ' +
      'start_service.',
    parameters: {
      type: 'object',
      required: ['action_key'],
      properties: {
        action_key: {
          type: 'string',
          enum: ['track_application', 'e_license', 'verify_license'],
          description: 'Which quick-action panel to guide the citizen through.',
        },
      },
    },
  },
  {
    name: 'guide_next_step',
    description:
      'Advances whichever flow is currently active (service or quick ' +
      'action) to its next step. Call again whenever the result carries ' +
      'still_waiting: true, immediately after start_service/' +
      'start_quick_action return, and immediately upon a ' +
      '[PAGE UPDATE — ACTION REQUIRED] message — before speaking anything ' +
      'else. Always speak the presentationInstructions field.',
    parameters: { type: 'object', required: [], properties: {} },
  },
  {
    name: 'fill_field',
    description:
      'Fills one field from the active journey\'s field list, in the ' +
      'order get_service_journey gave you. Confirm the value verbally ' +
      'before calling this, except for file-upload fields — there is no ' +
      'value to confirm; the tool itself points at the upload box and ' +
      'waits (up to ~60 s) for the citizen to pick a real file. Never ' +
      'invent a value, and never claim a file is uploaded before the tool ' +
      'confirms it.',
    parameters: {
      type: 'object',
      required: ['field_name'],
      properties: {
        field_name: {
          type: 'string',
          description: 'The field_id exactly as given by get_service_journey.',
        },
        value: {
          type: 'string',
          description:
            'The confirmed value to fill. Omit for file-upload fields — ' +
            'there is nothing to pass, the tool waits for a manual pick.',
        },
      },
    },
  },
  {
    name: 'point_to_element',
    description:
      'A standalone pointer for situations OUTSIDE an active guided flow. ' +
      'Do NOT use during an active start_service/start_quick_action flow — ' +
      'that flow already owns every pointing step, including the captcha ' +
      'and the submit button. Capped at ~20 s.',
    parameters: {
      type: 'object',
      required: ['element_id'],
      properties: {
        element_id: {
          type: 'string',
          description: 'CSS selector of the element to point at and wait for a click on.',
        },
      },
    },
  },
  {
    name: 'scroll_to_element',
    description:
      'Scrolls something into view without pointing at it or waiting for ' +
      'a click. Use for orientation, e.g. when the citizen says they ' +
      'cannot see what you are describing.',
    parameters: {
      type: 'object',
      required: ['element_id'],
      properties: {
        element_id: {
          type: 'string',
          description: 'CSS selector of the element to scroll into view.',
        },
      },
    },
  },
  {
    name: 'navigate_to_page',
    description:
      'Jumps directly to a page. Only use where a real link/button does ' +
      'not work, or the citizen explicitly asks to go somewhere outside ' +
      'an active flow. Never use during an active guided flow — the ' +
      'citizen must click every navigating step themselves.',
    parameters: {
      type: 'object',
      required: ['page'],
      properties: {
        page: {
          type: 'string',
          enum: ['homepage', 'services', 'apply'],
          description: 'The page to navigate to.',
        },
      },
    },
  },
  {
    name: 'end_session',
    description:
      'Ends the voice session. Call this ONLY in the same turn right ' +
      'after you have already spoken a farewell line (e.g. "Allah ' +
      'Hafiz") — never before saying goodbye, and never silently. Use it ' +
      'once the conversation has naturally concluded: the workflow is ' +
      'complete and the citizen has nothing else, or they explicitly say ' +
      'goodbye / want to stop. Do not speak anything after calling this.',
    parameters: { type: 'object', required: [], properties: {} },
  },
];

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + API_KEY,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

(async () => {
  console.log('Uplift base URL:', BASE);
  console.log('Prompt file:', PROMPT_PATH, `(${INSTRUCTIONS.length} chars)`);
  console.log('Fetching assistant config...');
  const assistant = await api('GET', `/realtime-assistants/${ASSISTANT_ID}`);
  const config = assistant.config;

  // ── Tools ─────────────────────────────────────────────────
  const tools = config.agent.tools;
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

  console.log('\nSyncing tools:');
  for (const spec of TOOLS) {
    const { name, ...rest } = spec;
    const timeout = TIMEOUTS[name];
    const existing = byName[name];
    if (existing) {
      existing.description = rest.description;
      existing.parameters = rest.parameters;
      existing.timeout = timeout;
      console.log(`  [ok]   updated ${name} (timeout ${timeout}ms)`);
    } else {
      tools.push({ name, ...rest, timeout });
      byName[name] = tools[tools.length - 1];
      console.log(`  [ok]   added ${name} (timeout ${timeout}ms)`);
    }
  }

  // ── Instructions ──────────────────────────────────────────
  // The prompt was restructured (persona/voice sections, no more numbered
  // "Phase" anchors), so it is replaced wholesale rather than patched —
  // anchor-based patching only made sense against the old phase-based
  // document this one replaces.
  const instructionsChanged = config.agent.instructions !== INSTRUCTIONS;
  config.agent.instructions = INSTRUCTIONS;
  console.log(
    instructionsChanged
      ? '\n[ok]   instructions replaced with maryam-system-prompt.md'
      : '\n[skip] instructions already match maryam-system-prompt.md'
  );

  if (DRY_RUN) {
    console.log('\n--dry-run: not saving.');
    console.log('Tools:', tools.map((t) => `${t.name}(${t.timeout}ms)`).join(', '));
    return;
  }

  console.log('\nSaving assistant config...');
  await api('POST', `/realtime-assistants/${ASSISTANT_ID}`, { config });
  console.log('Done. Assistant synced with maryam-system-prompt.md and the current tool set.');
})().catch((err) => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
