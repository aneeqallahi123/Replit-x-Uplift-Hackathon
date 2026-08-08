// Syncs the remote Uplift AI "Maryam" assistant with the guided
// navigation protocol implemented in dastak-clone/assets/js/maryam-agent.js.
//
// - Upserts the start_service, guide_next_step and scroll_to_element tools
// - Sets tool timeouts that match what the browser can actually spend
//   inside a call (pointing waits ~20 s, the captcha ~30 s)
// - Rewrites the navigation phases of the instructions to describe the
//   SEMI-BLOCKING guided flow ([PAGE UPDATE] messages, still_waiting,
//   recovery)
//
// Anchor mismatches are reported as warnings, never fatal: a half-updated
// assistant is worse than a clearly-reported skip.
//
// Usage: node scripts/sync-assistant.js          (dry run: add --dry-run)
// Requires: UPLIFT_API_KEY env var.

const ASSISTANT_ID = 'e9311394-097b-49c6-a206-fef2569dce2c';
// Keep in step with server.js — same env var, same US default.
const BASE = process.env.UPLIFT_BASE || 'https://api.upliftai.org/v1';
const API_KEY = process.env.UPLIFT_API_KEY;
const DRY_RUN = process.argv.includes('--dry-run');

if (!API_KEY) {
  console.error('UPLIFT_API_KEY is not set.');
  process.exit(1);
}

const GUIDED_NAV_SECTION = `## Phase 0\u20132: Guided Navigation (start_service + guide_next_step)

Navigation to the application form is fully guided, one click at a
time. You never click anything for the user; they make every click
themselves on the highlighted element.

### How the tools work (IMPORTANT \u2014 read carefully)

\`start_service\` and \`guide_next_step\` are SEMI-BLOCKING. They point a
green dot at exactly one element, then:

- **On a step that stays on the same page** (choosing a service card,
  choosing Self/Doorstep, the captcha, the submit button) the tool WAITS
  up to about 20 seconds for the citizen's click and returns the outcome:
  - \`clicked: true\` \u2014 they clicked. Speak \`presentationInstructions\`
    and call \`guide_next_step()\` again straight away.
  - \`still_waiting: true\` \u2014 they have not clicked yet. Speak
    \`presentationInstructions\` (a gentle reminder to tap the highlighted
    element) and then call \`guide_next_step()\` AGAIN. The dot is still on
    screen; this is normal, not an error. Repeat as long as it takes.
  - \`captcha_correct: true\` \u2014 the security answer is right. Say so and
    call \`guide_next_step()\` to move on to submit.
  - \`debounced: true\` \u2014 you called twice too quickly. Just call
    \`guide_next_step()\` once more.

- **On a step that loads a new page** (the hero Apply button, the Apply
  button on the service page) the tool returns IMMEDIATELY, because the
  page navigation destroys any pending tool response. Speak
  \`presentationInstructions\`, then stay quiet and wait for the
  \`[PAGE UPDATE \u2014 ACTION REQUIRED]\` message.

ALWAYS speak the \`presentationInstructions\` field from the tool result.
It is the single source of truth for what to say next. Never end a turn
silently after one of these tools returns.

### System messages (not from the user \u2014 never read them aloud)
- \`[CLICK: <stepId>]\` \u2014 a redundant backup signal that the citizen
  clicked. If the tool result already told you the same thing and you
  have acted on it, ignore this message; do not repeat yourself.
- \`[PAGE UPDATE \u2014 ACTION REQUIRED]\` \u2014 a new page loaded. Call
  \`guide_next_step()\` FIRST, before speaking anything, then tell the
  citizen what to do.

### Starting the flow

When the user wants license renewal:
1. Ask (if not already known): Self Service or Doorstep Service?
2. Call \`start_service("renewal_driving_license", mode)\` where
   mode is "online" (Self Service) or "doorstep" (Doorstep).
3. Speak the \`presentationInstructions\` from the tool result.
4. Follow whatever that result told you \u2014 call again on
   \`still_waiting\`, or wait for \`[PAGE UPDATE]\` on a navigating step.

### Apply-mode meanings
- Self Service (mode "online") \u2014 apply online; collect final documents
  from the office in person.
- Doorstep Service (mode "doorstep") \u2014 a facilitator visits the
  user's home to collect and deliver documents.

### If things go wrong
- User navigated manually or clicked the wrong thing: the next
  \`guide_next_step()\` call re-anchors and recovers automatically.
- A result carries an \`error\` field: speak its
  \`presentationInstructions\`, help the citizen verbally, and continue.
- Never use \`point_to_element\` during a guided flow, and never on the
  application form page. The guided flow owns every pointing step,
  including the captcha and the submit button.

### While waiting for a click \u2014 stay conversational

You are NEVER required to be silent just because you are waiting for a
click. If the citizen speaks to you while the pointer is on screen
(e.g. asks "what do I do?", "where?", or anything else), respond
naturally in one short sentence and then remind them to click the
highlighted element. Example: "Woh green circle wali jagah par click
karein \u2014 woh aapka agla qadam hai."

Do NOT ignore user speech in order to "stay in character" as a
pointing tool. A brief conversational reply is always appropriate.

`;

const PHASE4_OLD = `1. Tell the user there is one last quick step before submitting — a
   simple security question they need to answer themselves on screen
2. Call \`guide_next_step()\` — it points at the captcha and waits for
   the user to complete it
3. Wait for that tool to resolve before proceeding to Phase 5`;

const PHASE4_NEW_V1 = `1. Tell the user there is one last quick step \u2014 a simple security
   question they need to answer themselves on screen
2. Call \`guide_next_step()\` \u2014 it points at the captcha and returns
   immediately. Speak whatever \`presentationInstructions\` says.
3. Wait for a \`[CLICK: captcha]\` message confirming the citizen
   interacted with the captcha, then call \`guide_next_step()\` to
   check whether the answer is correct before proceeding to Phase 5`;

const PHASE4_NEW = `1. Tell the user there is one last quick step \u2014 a simple security
   question they need to answer themselves on screen
2. Call \`guide_next_step()\` \u2014 it highlights the captcha and then WAITS
   (up to about 30 seconds) for the citizen to type the correct answer.
   Speak its \`presentationInstructions\` while they work on it.
3. Read the result:
   - \`captcha_correct: true\` \u2014 the answer is right. Say so warmly and
     call \`guide_next_step()\` to move on to Phase 5.
   - \`still_waiting: true\` \u2014 not solved yet. Encourage them and call
     \`guide_next_step()\` again. Repeat as long as it takes.
   NEVER say the captcha answer out loud, and never type it for them.
   Typing the correct answer is enough on its own \u2014 they do not need
   to click anything else`;

const PHASE5_OLD = `3. Only after explicit confirmation, call \`guide_next_step()\` — it
   points at the submit button and waits for the user to click it.
4. After the click, call \`guide_next_step()\` one final time — it
   verifies the success screen appeared. If it reports success, tell
   the user warmly that their renewal request has been submitted and
   read out the Application ID shown on screen. If it reports
   validation errors instead, explain them and help the user fix the
   affected fields before trying again.`;

const PHASE5_NEW_V1 = `3. Only after explicit confirmation, call \`guide_next_step()\` \u2014 it
   points at the submit button and returns immediately. Speak
   \`presentationInstructions\`, then wait for a \`[CLICK: submit]\`
   message confirming the click.
4. When \`[CLICK: submit]\` arrives, call \`guide_next_step()\` \u2014 it
   verifies the success screen. If it reports success, tell the user
   warmly that their renewal request has been submitted and read out
   the Application ID shown on screen digit by digit. If it reports
   validation errors, explain them and help fix the fields before
   trying again.`;

const PHASE5_NEW = `3. Only after explicit confirmation, call \`guide_next_step()\` \u2014 it
   points at the submit button and WAITS up to about 20 seconds for the
   click. Speak its \`presentationInstructions\`. If it comes back with
   \`still_waiting: true\`, remind them gently and call it again.
4. Once it reports \`clicked: true\`, call \`guide_next_step()\` one more
   time \u2014 it verifies the success screen. If it reports success, tell
   the user warmly that their renewal request has been submitted and
   read out the Application ID digit by digit. If it reports validation
   errors, explain them and help fix the fields before trying again.`;

const NAVTOOL_DOC_OLD = `- **\`start_service(service_key, mode)\`** — Begins the guided flow for
  a service. Points at the first element the user must click and waits
  for their real click. Use "renewal_driving_license" as service_key.
  mode is "online" (Self Service) or "doorstep" (Doorstep Service).

- **\`guide_next_step()\`** — Continues the guided flow: points at the
  next element and waits for the user's click. Call it whenever a tool
  result or a [PAGE UPDATE] message tells you to, and to verify final
  submission. Its result always says what to do next.

- **\`navigate_to_page(page)\`** — Directly navigates to a named page.
  AVOID during a guided flow — the user must click everything
  themselves. Only use it if the user explicitly asks to jump
  somewhere outside the guided flow.`;

const NAVTOOL_DOC_NEW_V1 = `- **\`start_service(service_key, mode)\`** \u2014 Begins the guided flow.
  Returns IMMEDIATELY after pointing (non-blocking). Speak the
  \`presentationInstructions\` field right away, then wait for a
  \`[CLICK]\` or \`[PAGE UPDATE]\` system message. Never call another
  tool until one of those messages arrives.

- **\`guide_next_step()\`** \u2014 Advances the guided flow to the next
  step. Also returns immediately after pointing. Speak
  \`presentationInstructions\`, then wait. On \`[PAGE UPDATE \u2014 ACTION
  REQUIRED]\`, call this tool FIRST before speaking anything.

- **\`navigate_to_page(page)\`** \u2014 Directly navigates to a named page.
  AVOID during a guided flow \u2014 the user must click everything
  themselves. Only use it if the user explicitly asks to jump
  somewhere outside the guided flow.`;

const NAVTOOL_DOC_NEW = `- **\`start_service(service_key, mode)\`** \u2014 Begins the guided flow.
  SEMI-BLOCKING: on a same-page step it waits up to ~20 s for the
  citizen's click and returns the outcome; on a step that loads a new
  page it returns immediately. Always speak the
  \`presentationInstructions\` field from the result.

- **\`guide_next_step()\`** \u2014 Advances the guided flow. Same
  semi-blocking behaviour. Always speak \`presentationInstructions\`.
  Call it AGAIN whenever the result carries \`still_waiting: true\`
  (the citizen has not clicked yet \u2014 remind them gently and retry),
  \`clicked: true\`, \`captcha_correct: true\`, or \`debounced: true\`.
  On \`[PAGE UPDATE \u2014 ACTION REQUIRED]\`, call this tool FIRST before
  speaking anything. These tools never leave you with nothing to say:
  every result carries \`presentationInstructions\`.

- **\`point_to_element(element_id)\`** \u2014 Standalone pointer, capped at
  ~20 s. Do NOT use it during a guided flow or on the application form
  page; \`guide_next_step()\` owns every pointing step there, including
  the captcha and the submit button.

- **\`scroll_to_element(element_id)\`** \u2014 Scrolls something into view
  without pointing at it. Useful when the citizen says they cannot see
  what you are describing.

- **\`navigate_to_page(page)\`** \u2014 Directly navigates to a named page.
  AVOID during a guided flow \u2014 the user must click everything
  themselves. Only use it if the user explicitly asks to jump
  somewhere outside the guided flow.`;

// Applies a replacement, accepting several possible "from" anchors so a
// previously-synced (older) version of the same block is still matched.
// A missing anchor is NOT fatal: the remote instructions may have been
// edited by hand, and half-updating the assistant is worse than skipping
// one block and saying so loudly.
function replaceOnce(text, marker, from, to) {
  if (text.includes(to)) {
    console.log(`  [skip] ${marker}: already applied`);
    return text;
  }
  const candidates = Array.isArray(from) ? from : [from];
  for (const candidate of candidates) {
    if (text.includes(candidate)) {
      console.log(`  [ok]   ${marker}`);
      return text.replace(candidate, to);
    }
  }
  console.warn(
    `  [WARN] ${marker}: anchor not found — the remote instructions have ` +
    `drifted from what this script expects. Leaving that block unchanged; ` +
    `review the "${marker}" section by hand in the Uplift dashboard.`
  );
  return text;
}

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
  console.log('Fetching assistant config...');
  const assistant = await api('GET', `/realtime-assistants/${ASSISTANT_ID}`);
  const config = assistant.config;

  // ── Tools ─────────────────────────────────────────────────
  const tools = config.agent.tools;
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

  // Timeouts must comfortably exceed what the browser can spend inside a
  // tool call: pointing waits ~20 s, the captcha waits ~30 s.
  const TIMEOUTS = {
    point_to_element: 25000,   // hard-capped at 20 s browser-side
    scroll_to_element: 10000,
    start_service: 30000,      // 20 s in-tool wait + overhead
    guide_next_step: 30000,    // 30 s captcha wait + overhead
  };

  const DESCRIPTIONS = {
    start_service:
      'Begins the guided flow for a service: points a GREEN dot at the first ' +
      'element the citizen must click and, on a same-page step, waits up to ' +
      '~20 s for their real click before returning the outcome. Never clicks ' +
      'for them. Always speak the presentationInstructions from the result.',
    guide_next_step:
      'Continues the guided flow: points a GREEN dot at the next element. ' +
      'Semi-blocking — on a same-page step it waits up to ~20 s (30 s for the ' +
      'captcha) and returns clicked / still_waiting / captcha_correct; on a ' +
      'step that loads a new page it returns immediately. Call it again ' +
      'whenever the result says still_waiting. Also used to verify final ' +
      'submission. Always speak the presentationInstructions from the result.',
    scroll_to_element:
      'Scrolls an element into view without pointing at it. Use when the ' +
      'citizen says they cannot see what you are describing.',
  };

  function upsertTool(name, spec) {
    const existing = byName[name];
    if (existing) {
      if (spec.description) existing.description = spec.description;
      if (spec.parameters) existing.parameters = spec.parameters;
      existing.timeout = spec.timeout;
      console.log(`  [ok]   updated ${name} (timeout ${spec.timeout}ms)`);
      return;
    }
    tools.push({ name, ...spec });
    console.log(`  [ok]   added ${name} tool`);
  }

  // point_to_element is now hard-capped at 20 s browser-side; the old
  // 120 s ceiling was a two-minute silent freeze waiting to happen.
  if (byName.point_to_element) {
    byName.point_to_element.timeout = TIMEOUTS.point_to_element;
    console.log(`  [ok]   point_to_element timeout -> ${TIMEOUTS.point_to_element}ms`);
  } else {
    console.warn('  [WARN] point_to_element not declared remotely — skipping timeout bump');
  }

  upsertTool('start_service', {
    description: DESCRIPTIONS.start_service,
    parameters: {
      type: 'object',
      required: ['service_key'],
      properties: {
        service_key: {
          type: 'string',
          description:
            'The service to guide, e.g. "renewal_driving_license" (the only fully supported one).',
        },
        mode: {
          type: 'string',
          enum: ['online', 'doorstep'],
          description:
            'How the citizen wants to apply: "online" = Self Service, "doorstep" = Doorstep Service.',
        },
      },
    },
    timeout: TIMEOUTS.start_service,
  });

  upsertTool('guide_next_step', {
    description: DESCRIPTIONS.guide_next_step,
    parameters: { type: 'object', required: [], properties: {} },
    timeout: TIMEOUTS.guide_next_step,
  });

  // Registered in the browser but never declared remotely, so the agent
  // could not see it at all.
  upsertTool('scroll_to_element', {
    description: DESCRIPTIONS.scroll_to_element,
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
    timeout: TIMEOUTS.scroll_to_element,
  });

  // ── Instructions ──────────────────────────────────────────
  let instr = config.agent.instructions;
  const phase3Idx = instr.indexOf('## Phase 3: Filling the Application Form');
  // The guided nav section replaces everything between the opening
  // and Phase 3, regardless of whether it was applied before.
  // Anchors tried in priority order:
  //  1. Original "## Phase 0:" marker (first run)
  //  2. Existing "## Phase 0–2:" guided nav header (any previous sync)
  const oldStart1 = instr.indexOf('## Phase 0: Homepage Orientation');
  const oldStart2 = instr.indexOf('## Phase 0\u20132: Guided Navigation (start_service');
  // All of these must be present for the section to be current.
  // Add a new marker here whenever the GUIDED_NAV_SECTION is revised.
  const isAlreadyNew = instr.includes('SEMI-BLOCKING. They point a') &&
                       instr.includes('still_waiting: true') &&
                       instr.includes('stay conversational');

  if (isAlreadyNew) {
    console.log('  [skip] guided navigation section already up-to-date (semi-blocking)');
  } else if (phase3Idx !== -1 && (oldStart1 !== -1 || oldStart2 !== -1)) {
    const cutFrom = oldStart1 !== -1 ? oldStart1 : oldStart2;
    instr = instr.slice(0, cutFrom) + GUIDED_NAV_SECTION + instr.slice(phase3Idx);
    console.log('  [ok]   replaced guided navigation section with semi-blocking version');
  } else {
    // Non-fatal, same reasoning as replaceOnce: a half-updated assistant
    // is worse than a clearly-reported skip.
    console.warn(
      '  [WARN] guided navigation section: could not locate the "## Phase 3: ' +
      'Filling the Application Form" anchor or a known nav-section start. ' +
      'Leaving the navigation instructions unchanged — review them by hand ' +
      'in the Uplift dashboard.'
    );
  }

  instr = replaceOnce(instr, 'Phase 4 captcha',
    [PHASE4_OLD, PHASE4_NEW_V1], PHASE4_NEW);
  instr = replaceOnce(instr, 'Phase 5 submit',
    [PHASE5_OLD, PHASE5_NEW_V1], PHASE5_NEW);
  instr = replaceOnce(instr, 'tool docs',
    [NAVTOOL_DOC_OLD, NAVTOOL_DOC_NEW_V1], NAVTOOL_DOC_NEW);

  config.agent.instructions = instr;

  if (DRY_RUN) {
    console.log('\n--dry-run: not saving. New instructions length:', instr.length);
    console.log('Tools:', tools.map((t) => `${t.name}(${t.timeout}ms)`).join(', '));
    return;
  }

  console.log('Saving assistant config...');
  await api('POST', `/realtime-assistants/${ASSISTANT_ID}`, { config });
  console.log('Done. Assistant synced with guided navigation protocol.');
})().catch((err) => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
