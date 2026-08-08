/**
 * voice-agent.js — Dastak Voice Agent, Track B
 *
 * Three-layer architecture:
 *   Layer 1 — Pointer Engine     : low-level pointer + DOM primitives
 *   Layer 2 — Navigation Controller : Dastak-specific step functions
 *   Layer 3 — Demo Orchestrator  : end-to-end sequence + DEMO_DATA
 *
 * Track A integration points are marked with banner comments:
 *   ═══ TRACK A INTEGRATION POINT N ═══
 *
 * Do NOT modify the function signatures of the three stubs.
 * Track A replaces only the function bodies.
 */


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
   SECTION 3 — Core utility
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
   SECTION 4 — Field map constant
   Integration contract between Track A and Track B.
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
  return null;
}

// ═══════════════════════════════════════════════════════════════
// TRACK A INTEGRATION POINT 2 — Field Extraction (NLU)
// Currently: Returns null — demo flow uses hardcoded DEMO_DATA
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
   LAYER 1 — Pointer Engine
   Low-level primitives. Has no knowledge of Dastak or its flow.
   Only knows how to move a pointer and interact with DOM elements.
   ════════════════════════════════════════════════════════════════ */

/**
 * Moves the pointer ring to center over a DOM element.
 * Always scrolls first and waits before reading final position —
 * critical for elements inside offcanvases that animate in.
 * @param {Element} el - Target element
 */
async function movePointerTo(el) {
  const pointer = document.getElementById('agent-pointer');

  // Step 1: Check if element is fully in viewport
  const rectBefore = el.getBoundingClientRect();
  const needsScroll = rectBefore.top < 0 || rectBefore.bottom > window.innerHeight;

  if (needsScroll) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await delay(500); // wait for scroll to settle
  }

  // Step 2: Get fresh position AFTER scroll
  const rect = el.getBoundingClientRect();

  // Step 3: Center the 44px ring on the element (subtract half = 22px)
  pointer.style.left = (rect.left + rect.width  / 2 - 22) + 'px';
  pointer.style.top  = (rect.top  + rect.height / 2 - 22) + 'px';
  pointer.classList.add('active');

  await delay(500); // wait for CSS transition
}

/**
 * Moves pointer to element, pulses, then clicks it.
 * @param {Element} el
 */
async function clickElement(el) {
  await movePointerTo(el);
  triggerPulse();
  await delay(300);
  el.click();
  await delay(200);
}

/**
 * Moves pointer to a form field and types a value character by character.
 * Dispatches input + change events so framework listeners stay in sync.
 * @param {Element} el    - Target input element
 * @param {string}  value - Full value to type
 */
async function typeIntoField(el, value) {
  await movePointerTo(el);
  triggerPulse();
  el.classList.add('field-highlight');
  el.value = '';

  for (const char of value) {
    el.value += char;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await delay(60);
  }

  await delay(300);
  el.classList.remove('field-highlight');
}

/**
 * Moves pointer to element and holds it there for durationMs.
 * @param {Element} el
 * @param {number}  durationMs
 */
async function hoverElement(el, durationMs) {
  await movePointerTo(el);
  await delay(durationMs);
}

/**
 * Hides the pointer ring and moves it off screen.
 */
function hidePointer() {
  const pointer = document.getElementById('agent-pointer');
  pointer.classList.remove('active');
  pointer.style.left = '-100px';
}


/* ════════════════════════════════════════════════════════════════
   LAYER 2 — Navigation Controller
   Dastak-specific step functions. Calls Layer 1 only —
   never manipulates DOM directly.
   ════════════════════════════════════════════════════════════════ */

/**
 * Step 1: Hover the Renewal of Regular License card, then click it.
 * Waits 700ms after click for the Bootstrap offcanvas animation.
 */
async function navSelectRenewalService() {
  const card = document.querySelector('[data-service-key="renewal_driving_license"]');
  setStatus('لائسنس رینیوول سروس ڈھونڈ رہا ہوں...');
  await hoverElement(card, 800);
  setStatus('فارم کھل رہا ہے...');
  await clickElement(card);
  await delay(700); // wait for offcanvas slide animation
}

/**
 * Step 2: Fill the Full Name field inside the open offcanvas.
 * @param {string} value
 */
async function navFillFullName(value) {
  const el = document.getElementById('wizardFullName');
  setStatus('نام بھر رہا ہوں...');
  await typeIntoField(el, value);
  await speakConfirmation('✓ نام: ' + value);
}

/**
 * Step 3: Fill the CNIC field inside the open offcanvas.
 * @param {string} value
 */
async function navFillCnic(value) {
  const el = document.getElementById('wizardCnic');
  setStatus('شناختی کارڈ نمبر بھر رہا ہوں...');
  await typeIntoField(el, value);
  await speakConfirmation('✓ شناختی کارڈ: ' + value);
}

/**
 * Hover the Next button for 400ms then click it, then wait for
 * the wizard transition to complete.
 * @param {string} [statusText] - Optional Urdu status override
 */
async function navClickNext(statusText) {
  const btn = document.getElementById('btn-next');
  setStatus(statusText || 'اگلا مرحلہ...');
  await hoverElement(btn, 400);
  await clickElement(btn);
  await delay(600); // wait for wizard step transition
}

/**
 * Hover the Terms checkbox then check it.
 */
async function navCheckTerms() {
  const checkbox = document.getElementById('wizardTerms');
  setStatus('شرائط قبول کر رہا ہوں...');
  await hoverElement(checkbox, 400);
  await clickElement(checkbox);
  checkbox.checked = true;
  await delay(300);
}

/**
 * Check terms then advance to submit.
 */
async function navSubmitForm() {
  await navCheckTerms();
  await navClickNext('درخواست جمع ہو رہی ہے...');
}


/* ════════════════════════════════════════════════════════════════
   LAYER 3 — Demo Orchestrator
   Defines the demo data and calls Layer 2 actions in sequence.
   This is the only place where specific demo values live.
   Track A will replace DEMO_DATA with values extracted from speech.
   ════════════════════════════════════════════════════════════════ */

const DEMO_DATA = {
  name: 'علی احمد',
  cnic: '3520212345678',
};

async function runDemoFlow() {
  await navSelectRenewalService();              // Step 1+2: hover card → offcanvas opens
  await navFillFullName(DEMO_DATA.name);        // Step 3: fill Full Name
  await navFillCnic(DEMO_DATA.cnic);            // Step 4: fill CNIC
  await navClickNext('پہلا مرحلہ مکمل...');    // Step 5: Next → wizard Step 2
  await delay(500);
  await navClickNext('دستاویزات کا مرحلہ...'); // Step 6: Next → wizard Step 3
  await delay(500);
  await navSubmitForm();                         // Step 7: check terms + submit
  await delay(500);
  hidePointer();                                 // Step 8: hide pointer
  setStatus('فارم جمع ہو گیا ✅');
  await delay(2000);
  setStatus('', false);
}


/* ════════════════════════════════════════════════════════════════
   SECTION 8 — Mic button click handler
   ════════════════════════════════════════════════════════════════ */
let agentRunning = false;

document.getElementById('mic-btn').addEventListener('click', async () => {
  // If we are not on the services page, send the user there to run the demo
  if (!document.querySelector('[data-service-key="renewal_driving_license"]')) {
    window.location.href = 'services.html';
    return;
  }

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
  //     await typeIntoField(el, extracted.value)
  //     await speakConfirmation(`${fieldConfig.urduLabel}: ${extracted.value}`)
  //   }
  //
  // For now, skip real voice input entirely and run the hardcoded demo:
  // ═══════════════════════════════════════════════════════════════

  btn.classList.remove('listening');
  await runDemoFlow();

  agentRunning = false;
});
