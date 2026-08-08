/**
 * voice-agent.js — Dastak Voice Agent, Track B
 *
 * This file is the entire Track B layer. It is fully self-contained:
 *  - Injects its own styles into <head>
 *  - Injects the mic panel HTML into #voice-agent-panel
 *  - Implements all utility functions and the demo flow
 *  - Leaves three clearly-marked stub functions for Track A to replace
 *
 * Track A integration points are marked with banner comments:
 *   ═══ TRACK A INTEGRATION POINT N ═══
 *
 * Do NOT modify the function signatures of the three stubs.
 * Track A replaces only the function bodies.
 */

/* ════════════════════════════════════════════════════════════════
   SECTION 4 — Field map constant
   This is the integration contract between Track A and Track B.
   Track A's NLU layer must return { field, value } where `field`
   is one of the keys below. Track B reads fieldConfig.id to
   locate the DOM element.
   ════════════════════════════════════════════════════════════════ */
const FIELD_MAP = {
  name: { id: 'wizardFullName', label: 'Full Name',   urduLabel: 'نام' },
  cnic: { id: 'wizardCnic',     label: 'CNIC Number', urduLabel: 'سی این آئی سی' },
  // The following fields exist in the real Dastak renewal form.
  // They live in later wizard steps not yet wired for voice input.
  // Track A should extract these from speech — Track B will wire
  // them up once the wizard steps are expanded:
  // dob:              { label: 'Date of Birth',     urduLabel: 'تاریخ پیدائش' },
  // license_number:   { label: 'License Number',    urduLabel: 'لائسنس نمبر' },
  // license_type:     { label: 'License Type',      urduLabel: 'لائسنس قسم' },
  // license_category: { label: 'License Category',  urduLabel: 'لائسنس درجہ' },
  // expiry_date:      { label: 'Expiry Date',        urduLabel: 'میعاد ختم' },
};


/* ════════════════════════════════════════════════════════════════
   SECTION 1 — Inject styles
   No separate CSS file — all styles live here so the layer is
   fully self-contained and can be dropped into any page with one
   <script> tag.
   ════════════════════════════════════════════════════════════════ */
(function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* ── Keyframes ── */
    @keyframes va-pulse-ring {
      0%   { transform: scale(1);   opacity: 1; }
      70%  { transform: scale(1.4); opacity: 0.5; }
      100% { transform: scale(1);   opacity: 1; }
    }

    @keyframes va-mic-pulse {
      0%   { box-shadow: 0 0 0 0    rgba(229, 62, 62, 0.6); }
      70%  { box-shadow: 0 0 0 12px rgba(229, 62, 62, 0);   }
      100% { box-shadow: 0 0 0 0    rgba(229, 62, 62, 0);   }
    }

    /* ── Agent pointer ── */
    #agent-pointer {
      position:       fixed;
      width:          44px;
      height:         44px;
      border-radius:  50%;
      border:         3px solid #167B38;
      box-shadow:     0 0 0 4px rgba(22,123,56,0.15),
                      0 0 16px  rgba(22,123,56,0.40);
      pointer-events: none;
      z-index:        99999;
      display:        none;
      transition:     left 0.5s cubic-bezier(0.25,0.46,0.45,0.94),
                      top  0.5s cubic-bezier(0.25,0.46,0.45,0.94);
    }
    #agent-pointer.active { display: block; }
    #agent-pointer.pulse  { animation: va-pulse-ring 0.4s ease-in-out; }

    /* ── Field highlight ── */
    .field-highlight {
      outline:          2.5px solid #167B38 !important;
      background-color: #f1f8f3 !important;
      transition:       all 0.3s;
    }

    /* ── Voice agent panel ── */
    #voice-agent-panel {
      position:       fixed;
      bottom:         24px;
      right:          24px;
      z-index:        99998;
      display:        flex;
      flex-direction: column;
      align-items:    flex-end;
      gap:            10px;
    }

    /* ── Status bubble ── */
    #mic-status-bubble {
      background:    #167B38;
      color:         #fff;
      padding:       8px 16px;
      border-radius: 20px;
      font-size:     13px;
      font-family:   'Outfit', sans-serif;
      display:       none;
      max-width:     260px;
      text-align:    right;
      direction:     rtl;
      box-shadow:    0 4px 12px rgba(0,0,0,0.20);
      line-height:   1.5;
    }

    /* ── Mic button ── */
    #mic-btn {
      width:           60px;
      height:          60px;
      border-radius:   50%;
      background:      #167B38;
      border:          none;
      color:           #fff;
      font-size:       22px;
      cursor:          pointer;
      box-shadow:      0 4px 16px rgba(22,123,56,0.50);
      transition:      transform 0.2s, background 0.2s;
      display:         flex;
      align-items:     center;
      justify-content: center;
    }
    #mic-btn:hover {
      transform:  scale(1.08);
      background: #125e2e;
    }
    #mic-btn.listening {
      background: #e53e3e;
      animation:  va-mic-pulse 1s ease-out infinite;
    }
  `;
  document.head.appendChild(style);
})();


/* ════════════════════════════════════════════════════════════════
   SECTION 2 — Inject panel HTML
   ════════════════════════════════════════════════════════════════ */
(function injectPanel() {
  const panel = document.getElementById('voice-agent-panel');
  if (!panel) {
    console.error('[VoiceAgent] #voice-agent-panel not found in DOM');
    return;
  }
  panel.innerHTML = `
    <div id="mic-status-bubble"></div>
    <button id="mic-btn" title="Voice Agent — Click to start demo">🎤</button>
  `;
})();


/* ════════════════════════════════════════════════════════════════
   SECTION 3 — Core utility functions
   ════════════════════════════════════════════════════════════════ */

/** Returns a Promise that resolves after `ms` milliseconds. */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Shows or hides the Urdu status bubble.
 * @param {string}  text - Message to display (Urdu)
 * @param {boolean} show - true = show, false = hide
 */
function setStatus(text, show = true) {
  const bubble = document.getElementById('mic-status-bubble');
  bubble.textContent = text;
  bubble.style.display = show ? 'block' : 'none';
}

/**
 * Animates the pointer ring to center over a DOM element.
 * Accounts for scroll position so the ring lands on the correct spot
 * even inside a scrollable offcanvas.
 * @param {Element} el - Target element
 * @returns {Promise} resolves after the CSS transition completes (500ms)
 */
function movePointerToElement(el) {
  const pointer = document.getElementById('agent-pointer');
  const rect    = el.getBoundingClientRect();

  // Center the 44px ring on the element (subtract half = 22px)
  pointer.style.left = (rect.left + rect.width  / 2 - 22) + 'px';
  pointer.style.top  = (rect.top  + rect.height / 2 - 22) + 'px';
  pointer.classList.add('active');

  return delay(500); // wait for CSS transition
}

/**
 * Fills a form field character-by-character with a typewriter effect.
 * Dispatches 'input' events so any existing listeners stay in sync.
 * @param {string} fieldId - DOM id of the input
 * @param {string} value   - Full value to type in
 */
async function fillField(fieldId, value) {
  const el = document.getElementById(fieldId);
  el.classList.add('field-highlight');
  el.value = '';

  for (const char of value) {
    el.value += char;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await delay(60);
  }

  await delay(300);
  el.classList.remove('field-highlight');
}

/**
 * Triggers the pulse animation on the pointer ring.
 * Removes and re-adds the class to restart the keyframe animation.
 */
function triggerPulse() {
  const pointer = document.getElementById('agent-pointer');
  pointer.classList.remove('pulse');
  void pointer.offsetWidth; // force reflow to restart animation
  pointer.classList.add('pulse');
}


/* ════════════════════════════════════════════════════════════════
   SECTION 5 — Track A stub functions
   These three functions define the integration contract.
   Track A replaces ONLY the function bodies — never the signatures.
   ════════════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════════════════════════
// TRACK A INTEGRATION POINT 1 — Speech to Text (STT)
// Currently: Does nothing — demo flow skips real recording entirely
// Replace with:
//   - Capture audio via MediaRecorder
//   - POST audio blob to Uplift AI STT endpoint (Singapore region)
//   - Return transcript string in Urdu
// Contract: async function captureAndTranscribe() → string
// ═══════════════════════════════════════════════════════════════
async function captureAndTranscribe() {
  // STUB — Track A replaces this
  // When real: records mic audio, sends to Uplift AI STT, returns Urdu transcript
  return null;
}

// ═══════════════════════════════════════════════════════════════
// TRACK A INTEGRATION POINT 2 — Field Extraction (NLU)
// Currently: Returns null — demo flow uses hardcoded DEMO_SEQUENCE
// Replace with:
//   - Takes a transcript string
//   - Calls Track A's LLM-based extraction logic
//   - Returns structured JSON identifying which field and value
// Contract: async function extractField(transcript) →
//   { field: string, value: string, confidence: number } | null
// ═══════════════════════════════════════════════════════════════
async function extractField(transcript) {
  // STUB — Track A replaces this
  return null;
}

// ═══════════════════════════════════════════════════════════════
// TRACK A INTEGRATION POINT 3 — Text to Speech (TTS read-back)
// Currently: Shows text in status bubble and waits 1200ms
// Replace with:
//   - Takes a confirmation string in Urdu
//   - POSTs to Uplift AI TTS endpoint (Singapore region)
//   - Plays returned audio stream, waits for playback to finish
//   - The 1200ms delay below is the placeholder for audio duration
// Contract: async function speakConfirmation(urduText) → void
// ═══════════════════════════════════════════════════════════════
async function speakConfirmation(urduText) {
  // STUB — Track A replaces this with real Uplift AI TTS call
  setStatus(urduText);
  await delay(1200);
}


/* ════════════════════════════════════════════════════════════════
   SECTION 6 — Demo sequence
   Hardcoded data that the demo flow types into the wizard.
   Track A will replace this with live voice input — see Section 8.
   ════════════════════════════════════════════════════════════════ */
const DEMO_SEQUENCE = [
  {
    field:        'name',
    value:        'علی احمد',
    statusFill:   'نام بھر رہا ہوں...',
    confirmation: '✓ نام: علی احمد',
  },
  {
    field:        'cnic',
    value:        '3520212345678',
    statusFill:   'شناختی کارڈ نمبر بھر رہا ہوں...',
    confirmation: '✓ شناختی کارڈ: 3520212345678',
  },
];


/* ════════════════════════════════════════════════════════════════
   SECTION 7 — Main demo flow
   Runs automatically when the mic button is clicked.
   Drives the entire wizard without any keyboard input.
   ════════════════════════════════════════════════════════════════ */
async function runDemoFlow() {
  const pointer = document.getElementById('agent-pointer');

  // ── Step 1: Open the renewal offcanvas ──────────────────────
  setStatus('لائسنس رینیوول سروس کھل رہی ہے...');
  document.querySelector('[data-service-key="renewal_driving_license"]').click();
  await delay(800);

  // ── Step 2: Fill each field in sequence ─────────────────────
  for (const step of DEMO_SEQUENCE) {
    const fieldConfig = FIELD_MAP[step.field];
    const el = document.getElementById(fieldConfig.id);

    setStatus(step.statusFill);
    await movePointerToElement(el);
    triggerPulse();
    await delay(200);
    await fillField(fieldConfig.id, step.value);

    // speakConfirmation is a stub — currently shows text + 1200ms wait.
    // Track A will replace it with real Uplift AI TTS audio.
    await speakConfirmation(step.confirmation);
  }

  // ── Step 3: Advance wizard steps ────────────────────────────
  setStatus('اگلا مرحلہ...');
  pointer.classList.remove('active');
  await delay(400);

  document.getElementById('btn-next').click();   // Step 1 → Step 2
  await delay(600);

  document.getElementById('btn-next').click();   // Step 2 → Step 3
  await delay(600);

  document.getElementById('wizardTerms').checked = true;
  await delay(300);

  document.getElementById('btn-next').click();   // Submit → success modal

  // ── Step 4: Finish ───────────────────────────────────────────
  await delay(500);
  setStatus('فارم جمع ہو گیا ✅');
  await delay(2000);
  setStatus('', false);
}


/* ════════════════════════════════════════════════════════════════
   SECTION 8 — Mic button click handler
   ════════════════════════════════════════════════════════════════ */
let agentRunning = false;

document.getElementById('mic-btn').addEventListener('click', async () => {
  if (agentRunning) return;
  agentRunning = true;

  const btn = document.getElementById('mic-btn');
  btn.classList.add('listening');

  // ═══════════════════════════════════════════════════════════════
  // TRACK A INTEGRATION POINT — Live voice input entry
  // When Track A is ready, replace the direct runDemoFlow() call below
  // with the following live loop:
  //
  //   const transcript = await captureAndTranscribe()
  //   const extracted  = await extractField(transcript)
  //   if (extracted) {
  //     const fieldConfig = FIELD_MAP[extracted.field]
  //     const el = document.getElementById(fieldConfig.id)
  //     await movePointerToElement(el)
  //     triggerPulse()
  //     await fillField(fieldConfig.id, extracted.value)
  //     await speakConfirmation(`${fieldConfig.urduLabel}: ${extracted.value}`)
  //   }
  //
  // For now, skip real voice input entirely and run the hardcoded demo:
  // ═══════════════════════════════════════════════════════════════

  btn.classList.remove('listening');
  await runDemoFlow();

  agentRunning = false;
});
