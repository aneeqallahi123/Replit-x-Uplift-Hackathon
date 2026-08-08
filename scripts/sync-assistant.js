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

Navigation to the application form is now fully guided, one click at a
time, by two tools. You never click anything for the user and you never
use \`navigate_to_page\` while guiding — the user makes every click
themselves, on the element being pointed at.

How it works:

1. When the user wants license renewal, briefly tell them you will
   guide them step by step, then call
   \`start_service("renewal_driving_license", mode)\`. If the user has
   already told you how they want to apply, pass mode "online" (Self
   Service) or "doorstep" (Doorstep Service). If they haven't, ask the
   one-line question first (see the mode meanings below), then call the
   tool with their choice.
2. The tool points a red dot at exactly ONE element on screen and
   WAITS until the user really clicks it. When it resolves, the result
   tells you what happened and what to do next — follow its
   presentationInstructions.
3. Whenever the result (or a [PAGE UPDATE] message) tells you to, call
   \`guide_next_step()\` — it points at the next element and waits
   again. Keep repeating until the flow reaches the application form.

Page changes: when the user's click causes a new page to load, you will
receive a message starting with "[PAGE UPDATE" — this is a system
message from the website, NOT the user speaking. Do not read it aloud.
It tells you which page the user is now on and whether a guided flow is
active. If a flow is active, immediately call \`guide_next_step()\` and
then tell the user (in Urdu) what to do next.

Apply-mode meanings (asked before or during the flow):
- Self Service (mode "online") — apply online, collect final documents
  from the office in person
- Doorstep Service (mode "doorstep") — a facilitator collects and
  delivers documents at the user's home

If things go wrong:
- If the user clicks somewhere else or navigates manually, the next
  \`guide_next_step()\` call detects the mismatch, re-anchors to the
  page the user is actually on, and tells you how to continue. Stay
  calm, briefly re-orient the user, and continue.
- If the user hasn't clicked yet and the tool resolves without a click,
  gently remind them to click the highlighted element, then call
  \`guide_next_step()\` again.

`;

const PHASE4_OLD = `1. Tell the user there is one last quick step before submitting — a
   simple security question they need to answer themselves on screen
2. Call \`point_to_element\` on the captcha element (\`.math-captcha-wrapper\`)
3. Wait for that tool to resolve (meaning the user has completed it)
   before proceeding to Phase 5`;

const PHASE4_NEW = `1. Tell the user there is one last quick step before submitting — a
   simple security question they need to answer themselves on screen
2. Call \`guide_next_step()\` — it points at the captcha and waits for
   the user to complete it
3. Wait for that tool to resolve before proceeding to Phase 5`;

const PHASE5_OLD = `3. Only after explicit confirmation, call \`point_to_element\` on the
   submit button (\`#btnSubmitApplication\`) and wait for the user to
   click it.
4. After submission, confirm with the user that a success screen has
   appeared and tell them clearly and warmly that their renewal
   request has been submitted successfully.`;

const PHASE5_NEW = `3. Only after explicit confirmation, call \`guide_next_step()\` — it
   points at the submit button and waits for the user to click it.
4. After the click, call \`guide_next_step()\` one final time — it
   verifies the success screen appeared. If it reports success, tell
   the user warmly that their renewal request has been submitted and
   read out the Application ID shown on screen. If it reports
   validation errors instead, explain them and help the user fix the
   affected fields before trying again.`;

const NAVTOOL_DOC_OLD = `- **\`navigate_to_page(page)\`** — Directly navigates to a named page
  (e.g. "services"). Use this for the homepage-to-services transition,
  since the real link there isn't wired up yet. Most other transitions
  in this flow happen naturally as a result of the user clicking
  something via \`point_to_element\`.`;

const NAVTOOL_DOC_NEW = `- **\`start_service(service_key, mode)\`** — Begins the guided flow for
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
  const phase0Idx = instr.indexOf('## Phase 0: Homepage Orientation');
  const phase3Idx = instr.indexOf('## Phase 3: Filling the Application Form');
  if (phase0Idx !== -1 && phase3Idx !== -1) {
    instr = instr.slice(0, phase0Idx) + GUIDED_NAV_SECTION + instr.slice(phase3Idx);
    console.log('  [ok]   replaced Phase 0-2 with guided navigation section');
  } else if (instr.includes('Guided Navigation (start_service')) {
    console.log('  [skip] guided navigation section already applied');
  } else {
    throw new Error('Could not locate Phase 0 / Phase 3 anchors');
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
