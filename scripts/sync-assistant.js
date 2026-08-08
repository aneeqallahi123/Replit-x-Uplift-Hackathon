// Syncs the remote Uplift AI "Maryam" assistant with the guided
// navigation protocol implemented in dastak-clone/assets/js/maryam-agent.js.
//
// - Adds the start_service and guide_next_step tools
// - Bumps point/click-wait tool timeouts (users take time to click)
// - Rewrites the navigation phases of the instructions to use the
//   guided flow (point-and-wait, [PAGE UPDATE] messages, recovery)
//
// Usage: node scripts/sync-assistant.js          (dry run: add --dry-run)
// Requires: UPLIFT_API_KEY env var.

const ASSISTANT_ID = 'e9311394-097b-49c6-a206-fef2569dce2c';
const BASE = 'https://api.upliftai.org/v1';
const API_KEY = process.env.UPLIFT_API_KEY;
const DRY_RUN = process.argv.includes('--dry-run');

if (!API_KEY) {
  console.error('UPLIFT_API_KEY is not set.');
  process.exit(1);
}

const GUIDED_NAV_SECTION = `## Phase 0–2: Guided Navigation (start_service + guide_next_step)

Navigation to the application form is fully guided, one click at a
time. You never click anything for the user; they make every click
themselves on the highlighted element.

### How the tools work (IMPORTANT — read carefully)

\`start_service\` and \`guide_next_step\` are NON-BLOCKING. They
point a green dot at exactly one element and return IMMEDIATELY —
they do NOT wait for the user's click. This means:

1. The tool returns with a \`presentationInstructions\` field.
   **Speak that text right now**, while the pointer is on screen.
2. Stay quiet and wait. Do not call any other tool.
3. You will receive one of two system messages from the website:
   - **\`[CLICK: stepId]\`** — the citizen clicked the element.
     Follow the instructions in that message (speak + call
     \`guide_next_step()\` or wait for \`[PAGE UPDATE]\`).
   - **\`[PAGE UPDATE — ACTION REQUIRED]\`** — a new page has loaded
     after a navigation click. IMMEDIATELY call \`guide_next_step()\`
     (no waiting, no preamble) and then tell the citizen what to do.

### Starting the flow

When the user wants license renewal:
1. Ask (if not already known): Self Service or Doorstep Service?
2. Call \`start_service("renewal_driving_license", mode)\` where
   mode is "online" (Self Service) or "doorstep" (Doorstep).
3. Speak the \`presentationInstructions\` from the tool result.
4. Wait for a \`[CLICK]\` or \`[PAGE UPDATE]\` message.

### Apply-mode meanings
- Self Service (mode "online") — apply online; collect final documents
  from the office in person.
- Doorstep Service (mode "doorstep") — a facilitator visits the
  user's home to collect and deliver documents.

### System messages (not from the user — never read them aloud)
- \`[CLICK: <stepId>]\` — citizen clicked the highlighted button.
  Contains a "Say: ..." line — speak it, then follow the rest.
- \`[PAGE UPDATE — ACTION REQUIRED]\` — new page loaded. Call
  \`guide_next_step()\` immediately without any preamble.

### If things go wrong
- User navigated manually or clicked the wrong thing: the next
  \`guide_next_step()\` call re-anchors and recovers automatically.
- User hasn't clicked yet (tool resolved without \`[CLICK]\` message):
  gently remind them to tap the highlighted element, then call
  \`guide_next_step()\` again.

### While waiting for a click — stay conversational

You are NEVER required to be silent just because you are waiting for a
click. If the citizen speaks to you while the pointer is on screen
(e.g. asks "what do I do?", "where?", or anything else), respond
naturally in one short sentence and then remind them to click the
highlighted element. Example: "Woh green circle wali jagah par click
karein — woh aapka agla qadam hai."

Do NOT ignore user speech in order to "stay in character" as a
pointing tool. A brief conversational reply is always appropriate.

`;

const PHASE4_OLD = `1. Tell the user there is one last quick step before submitting — a
   simple security question they need to answer themselves on screen
2. Call \`guide_next_step()\` — it points at the captcha and waits for
   the user to complete it
3. Wait for that tool to resolve before proceeding to Phase 5`;

const PHASE4_NEW = `1. Tell the user there is one last quick step — a simple security
   question they need to answer themselves on screen
2. Call \`guide_next_step()\` — it points at the captcha and returns
   immediately. Speak whatever \`presentationInstructions\` says.
3. Wait for a \`[CLICK: captcha]\` message confirming the citizen
   interacted with the captcha, then call \`guide_next_step()\` to
   check whether the answer is correct before proceeding to Phase 5`;

const PHASE5_OLD = `3. Only after explicit confirmation, call \`guide_next_step()\` — it
   points at the submit button and waits for the user to click it.
4. After the click, call \`guide_next_step()\` one final time — it
   verifies the success screen appeared. If it reports success, tell
   the user warmly that their renewal request has been submitted and
   read out the Application ID shown on screen. If it reports
   validation errors instead, explain them and help the user fix the
   affected fields before trying again.`;

const PHASE5_NEW = `3. Only after explicit confirmation, call \`guide_next_step()\` — it
   points at the submit button and returns immediately. Speak
   \`presentationInstructions\`, then wait for a \`[CLICK: submit]\`
   message confirming the click.
4. When \`[CLICK: submit]\` arrives, call \`guide_next_step()\` — it
   verifies the success screen. If it reports success, tell the user
   warmly that their renewal request has been submitted and read out
   the Application ID shown on screen digit by digit. If it reports
   validation errors, explain them and help fix the fields before
   trying again.`;

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

const NAVTOOL_DOC_NEW = `- **\`start_service(service_key, mode)\`** — Begins the guided flow.
  Returns IMMEDIATELY after pointing (non-blocking). Speak the
  \`presentationInstructions\` field right away, then wait for a
  \`[CLICK]\` or \`[PAGE UPDATE]\` system message. Never call another
  tool until one of those messages arrives.

- **\`guide_next_step()\`** — Advances the guided flow to the next
  step. Also returns immediately after pointing. Speak
  \`presentationInstructions\`, then wait. On \`[PAGE UPDATE — ACTION
  REQUIRED]\`, call this tool FIRST before speaking anything.

- **\`navigate_to_page(page)\`** — Directly navigates to a named page.
  AVOID during a guided flow — the user must click everything
  themselves. Only use it if the user explicitly asks to jump
  somewhere outside the guided flow.`;

function replaceOnce(text, marker, from, to) {
  if (!text.includes(from)) {
    if (text.includes(to)) {
      console.log(`  [skip] ${marker}: already applied`);
      return text;
    }
    throw new Error(`Anchor not found for ${marker}`);
  }
  console.log(`  [ok]   ${marker}`);
  return text.replace(from, to);
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
  console.log('Fetching assistant config...');
  const assistant = await api('GET', `/realtime-assistants/${ASSISTANT_ID}`);
  const config = assistant.config;

  // ── Tools ─────────────────────────────────────────────────
  const tools = config.agent.tools;
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

  if (byName.point_to_element) byName.point_to_element.timeout = 120000;

  if (!byName.start_service) {
    tools.push({
      name: 'start_service',
      description:
        'Begins the guided flow for a service: points a red dot at the first ' +
        'element the citizen must click and waits for their real click. Never ' +
        'clicks for them. The result says what to do next.',
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
      timeout: 120000,
    });
    console.log('  [ok]   added start_service tool');
  } else {
    byName.start_service.timeout = 120000;
    console.log('  [skip] start_service tool exists');
  }

  if (!byName.guide_next_step) {
    tools.push({
      name: 'guide_next_step',
      description:
        'Continues the guided flow: points at the next element and waits for ' +
        'the citizen to click it. Call whenever a tool result or a ' +
        '[PAGE UPDATE] message says to, and to verify final submission.',
      parameters: { type: 'object', required: [], properties: {} },
      timeout: 120000,
    });
    console.log('  [ok]   added guide_next_step tool');
  } else {
    byName.guide_next_step.timeout = 120000;
    console.log('  [skip] guide_next_step tool exists');
  }

  // ── Instructions ──────────────────────────────────────────
  let instr = config.agent.instructions;
  const phase3Idx = instr.indexOf('## Phase 3: Filling the Application Form');
  // The guided nav section replaces everything between the opening
  // and Phase 3, regardless of whether it was applied before.
  // Anchors tried in priority order:
  //  1. Original "## Phase 0:" marker (first run)
  //  2. Existing "## Phase 0–2:" guided nav header (subsequent runs — old blocking version)
  //  3. Existing non-blocking header (already up-to-date — skip)
  const oldStart1 = instr.indexOf('## Phase 0: Homepage Orientation');
  const oldStart2 = instr.indexOf('## Phase 0\u20132: Guided Navigation (start_service');
  // All three strings must be present for the section to be current.
  // Add a new marker here whenever the GUIDED_NAV_SECTION is revised.
  const isAlreadyNew = instr.includes('NON-BLOCKING. They') &&
                       instr.includes('[CLICK: stepId]') &&
                       instr.includes('stay conversational');

  if (isAlreadyNew) {
    console.log('  [skip] guided navigation section already up-to-date (non-blocking)');
  } else if (phase3Idx !== -1 && (oldStart1 !== -1 || oldStart2 !== -1)) {
    const cutFrom = oldStart1 !== -1 ? oldStart1 : oldStart2;
    instr = instr.slice(0, cutFrom) + GUIDED_NAV_SECTION + instr.slice(phase3Idx);
    console.log('  [ok]   replaced guided navigation section with non-blocking version');
  } else {
    throw new Error(
      'Could not locate Phase 3 anchor or a known nav-section start. ' +
      'Check remote instructions manually.'
    );
  }

  instr = replaceOnce(instr, 'Phase 4 captcha', PHASE4_OLD, PHASE4_NEW);
  instr = replaceOnce(instr, 'Phase 5 submit', PHASE5_OLD, PHASE5_NEW);
  instr = replaceOnce(instr, 'tool docs', NAVTOOL_DOC_OLD, NAVTOOL_DOC_NEW);

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
