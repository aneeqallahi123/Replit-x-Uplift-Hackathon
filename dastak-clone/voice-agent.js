/**
 * voice-agent.js — Dastak Voice Agent, Track B
 *
 * Three-layer architecture:
 *   Layer 1 — Pointer Engine        : low-level pointer + DOM primitives
 *   Layer 2 — Navigation Actions    : Dastak-specific named step functions
 *   Layer 3 — Orchestrators         : page-specific flows (home / services)
 *
 * Track A integration points are marked with banner comments:
 *   ═══ TRACK A INTEGRATION POINT N ═══
 *
 * Do NOT modify the function signatures of the three stubs.
 * Track A replaces only the function bodies.
 */


/* ════════════════════════════════════════════════════════════════
   SECTION 1 — Inject styles
   No separate CSS file — fully self-contained; drop into any page
   with one <script> tag.
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

    /* ── Consent banner ── */
    #va-consent-banner {
      background:    #fff;
      border:        1.5px solid #167B38;
      border-radius: 12px;
      padding:       14px 16px;
      max-width:     240px;
      box-shadow:    0 4px 16px rgba(0,0,0,0.14);
      text-align:    right;
      direction:     rtl;
      display:       none;
    }
    #va-consent-banner p {
      margin:      0 0 10px;
      font-size:   12px;
      line-height: 1.6;
      color:       #333;
      font-family: 'Outfit', sans-serif;
    }
    #va-consent-confirm {
      width:         100%;
      background:    #167B38;
      color:         #fff;
      border:        none;
      border-radius: 8px;
      padding:       7px 0;
      font-size:     13px;
      cursor:        pointer;
      font-family:   'Outfit', sans-serif;
      transition:    background 0.2s;
    }
    #va-consent-confirm:hover { background: #125e2e; }

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
    <div id="va-consent-banner">
      <p>یہ ایجنٹ ویب سائٹ پر آپ کی رہنمائی کرے گا۔
         شروع کرنے کے لیے تصدیق کریں۔</p>
      <button id="va-consent-confirm">ٹھیک ہے ✓</button>
    </div>
    <div id="mic-status-bubble"></div>
    <button id="mic-btn" title="Voice Agent — Click to start demo">🎤</button>
  `;
})();


/* ════════════════════════════════════════════════════════════════
   SECTION 3 — Field map constant
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
   SECTION 4 — Track A stub functions
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
  if (!bubble) return;
  bubble.textContent = text;
  bubble.style.display = show ? 'block' : 'none';
}

/**
 * Triggers the pulse animation on the pointer ring.
 * Removes and re-adds the class to restart the keyframe animation.
 */
function triggerPulse() {
  const pointer = document.getElementById('agent-pointer');
  if (!pointer) return;
  pointer.classList.remove('pulse');
  void pointer.offsetWidth; // force reflow to restart animation
  pointer.classList.add('pulse');
}

/**
 * Moves the pointer ring to center over a DOM element.
 * Always scrolls first and waits before reading final position —
 * critical for elements inside offcanvases that animate in.
 * @param {Element} el - Target element
 */
async function movePointerTo(el) {
  if (!el) { console.warn('[VoiceAgent] movePointerTo: element not found'); return; }
  const pointer = document.getElementById('agent-pointer');
  if (!pointer) return;

  // Step 1: scroll into view if not fully visible
  const rectBefore = el.getBoundingClientRect();
  const fullyVisible = rectBefore.top >= 0 && rectBefore.bottom <= window.innerHeight
                    && rectBefore.left >= 0 && rectBefore.right  <= window.innerWidth;
  if (!fullyVisible) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await delay(500); // wait for scroll to settle
  }

  // Step 2: get fresh rect AFTER scroll
  const rect = el.getBoundingClientRect();

  // Step 3: center the 44px ring over the element (subtract half ring = 22px)
  pointer.style.left = (rect.left + rect.width  / 2 - 22) + 'px';
  pointer.style.top  = (rect.top  + rect.height / 2 - 22) + 'px';
  pointer.classList.add('active');

  await delay(500); // wait for CSS transition
}

/**
 * Moves pointer to element and holds it for durationMs.
 * @param {Element} el
 * @param {number}  durationMs
 */
async function hoverElement(el, durationMs) {
  await movePointerTo(el);
  await delay(durationMs);
}

/**
 * Moves pointer to element, pulses, then fires a real click.
 * @param {Element} el
 */
async function clickElement(el) {
  await hoverElement(el, 400);
  triggerPulse();
  await delay(200);
  el.click();
  await delay(300);
}

/**
 * Moves pointer to a form field and types a value character by character.
 * Dispatches input + change + keyup so framework validators stay in sync.
 * Fires blur after all characters so step-level validation triggers.
 * @param {Element} el    - Target input element
 * @param {string}  value - Full string to type
 */
async function typeIntoField(el, value) {
  await movePointerTo(el);
  triggerPulse();
  el.classList.add('field-highlight');
  el.value = '';

  for (const char of value) {
    el.value += char;
    el.dispatchEvent(new Event('input',              { bubbles: true }));
    el.dispatchEvent(new Event('change',             { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup',      { bubbles: true }));
    await delay(60);
  }

  el.dispatchEvent(new Event('blur', { bubbles: true }));
  await delay(300);
  el.classList.remove('field-highlight');
}

/**
 * Hides the pointer ring.
 */
function hidePointer() {
  const pointer = document.getElementById('agent-pointer');
  if (!pointer) return;
  pointer.classList.remove('active');
  pointer.style.left = '-100px';
}


/* ════════════════════════════════════════════════════════════════
   LAYER 2 — Navigation Actions
   Dastak-specific step functions. Calls Layer 1 only —
   never manipulates DOM directly.
   ════════════════════════════════════════════════════════════════ */

/**
 * STAGE 1, STEP A+B — Hover the "Apply Service" hero button then click it.
 * The button scrolls the page to #govt_services.
 */
async function navClickApplyService() {
  const btn = document.querySelector('a.btn_apply_service_hero');
  setStatus('سروس کے لیے درخواست دینے کا بٹن...');
  await hoverElement(btn, 800);
  setStatus('سروسز دیکھ رہا ہوں...');
  // Pulse for visual feedback without firing a real click — the button's href
  // was updated to "services.html" so el.click() would navigate away immediately.
  // Instead we programmatically scroll to the services section as the button intends.
  triggerPulse();
  await delay(300);
  const target = document.getElementById('govt_services');
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  await delay(700); // wait for scroll to settle
}

/**
 * STAGE 1, STEP C+D — Hover the DLIMS card then navigate to services page.
 * Uses window.location so the URL carries ?autostart=true, which
 * tells the services page to resume the flow automatically.
 */
async function navClickDlimsCard() {
  const card = document.querySelector('.explore_slide_item[data-name="dlims"]');
  setStatus('ڈی ایل آئی ایم ایس سروسز...');
  await hoverElement(card, 800);
  setStatus('ڈرائیونگ لائسنس سروسز...');
  triggerPulse();
  await delay(400);
  // Navigate manually so we can append ?autostart=true
  window.location.href = 'services.html?autostart=true';
}

/**
 * STAGE 2, STEP A+B — Hover the "Renewal of Regular License" card (so the
 * citizen sees which service is being selected), then open the offcanvas
 * directly via Bootstrap API. A real card click would open the inline details
 * panel (normal user behaviour), so the agent uses the API instead to keep
 * both paths independent.
 */
async function navClickRenewalCard() {
  const card = document.querySelector('[data-service-key="renewal_driving_license"]');
  setStatus('لائسنس رینیوول سروس...');
  await hoverElement(card, 800);
  setStatus('فارم کھل رہا ہے...');
  triggerPulse();
  await delay(300);
  // Open the website's own offcanvas directly — normal card clicks are unaffected
  bootstrap.Offcanvas.getOrCreateInstance(
    document.getElementById('appFormOffcanvas')
  ).show();
}

/**
 * Wait for Bootstrap offcanvas slide-in animation to complete.
 */
async function navWaitForOffcanvas() {
  await delay(700);
}

/**
 * STAGE 3, STEP A+B — Fill the Full Name field.
 * @param {string} value
 */
async function navFillFullName(value) {
  const el = document.getElementById('wizardFullName');
  setStatus('نام بھر رہا ہوں...');
  await typeIntoField(el, value);
  await speakConfirmation('✓ نام: ' + value);
}

/**
 * STAGE 3, STEP C+D — Fill the CNIC field.
 * @param {string} value
 */
async function navFillCnic(value) {
  const el = document.getElementById('wizardCnic');
  setStatus('شناختی کارڈ نمبر بھر رہا ہوں...');
  await typeIntoField(el, value);
  await speakConfirmation('✓ شناختی کارڈ: ' + value);
}

/**
 * STAGE 3, STEP E / STAGE 4, STEP A — Hover Next button 500ms then click.
 * Used to advance the wizard from any step.
 * @param {string} [statusText] - Optional Urdu status override
 */
async function navClickNext(statusText) {
  const btn = document.getElementById('btn-next');
  setStatus(statusText || 'اگلا مرحلہ...');
  await hoverElement(btn, 500);
  await clickElement(btn);
  await delay(600); // wait for wizard step transition
}

/**
 * STAGE 4 — Skip the Documents step (hover Next 400ms then click).
 */
async function navSkipDocuments() {
  const btn = document.getElementById('btn-next');
  setStatus('دستاویزات کا مرحلہ...');
  await hoverElement(btn, 400);
  await clickElement(btn);
  await delay(600);
}

/**
 * STAGE 5, STEP A+B — Hover the terms checkbox then check it.
 */
async function navCheckTerms() {
  const checkbox = document.getElementById('wizardTerms');
  setStatus('شرائط قبول کر رہا ہوں...');
  await hoverElement(checkbox, 400);
  triggerPulse();
  await delay(200);
  // Only click if currently unchecked — clicking an already-checked box toggles it OFF
  if (!checkbox.checked) {
    checkbox.click();
  }
  // Safety fallback: ensure checked state after the click
  checkbox.checked = true;
  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  await delay(400);
}

/**
 * STAGE 5, STEP C — Hover submit button (same #btn-next on Step 3) then click.
 * The website's own success modal fires.
 */
async function navSubmit() {
  const btn = document.getElementById('btn-next');
  setStatus('درخواست جمع ہو رہی ہے...');
  await hoverElement(btn, 500);
  await clickElement(btn);
  await delay(500);
}


/* ════════════════════════════════════════════════════════════════
   LAYER 3 — Orchestrators
   Page-specific flows. Calls Layer 2 only.
   DEMO_DATA is the only place hardcoded demo values live.
   Track A will replace DEMO_DATA with values extracted from speech.
   ════════════════════════════════════════════════════════════════ */

const DEMO_DATA = {
  name: 'علی احمد',
  cnic: '3520212345678',
};

/**
 * HOME PAGE FLOW (index.html) — Stage 1
 * Clicks Apply Service → scrolls to services section → clicks DLIMS card
 * → navigates to services.html?autostart=true
 * The services page resumes automatically on load.
 */
async function runHomePageFlow() {
  await navClickApplyService();   // hover Apply Service → click → scroll
  await navClickDlimsCard();      // hover DLIMS → navigate (page changes here)
  // Execution stops here; services.html picks up via ?autostart=true
}

/**
 * SERVICES PAGE FLOW (services.html) — Stages 2-6
 * Clicks Renewal card → offcanvas opens → fills form → submits
 */
async function runServicesPageFlow() {
  // Stage 2 — select service
  await navClickRenewalCard();            // hover card → click → offcanvas starts sliding
  await navWaitForOffcanvas();            // wait for Bootstrap animation

  // Stage 3 — fill personal info
  await navFillFullName(DEMO_DATA.name);  // type Full Name
  await navFillCnic(DEMO_DATA.cnic);      // type CNIC
  await navClickNext('پہلا مرحلہ مکمل...'); // Next → Step 2

  // Stage 4 — skip documents step
  await navSkipDocuments();               // Next → Step 3

  // Stage 5 — confirmation
  await navCheckTerms();                  // check terms checkbox
  await navSubmit();                      // click submit → success modal fires

  // Stage 6 — completion
  hidePointer();
  setStatus('فارم جمع ہو گیا ✅');
  await delay(2500);
  setStatus('', false);
}


/* ════════════════════════════════════════════════════════════════
   SECTION 5 — Consent banner + mic handler + page detection
   ════════════════════════════════════════════════════════════════ */
let agentRunning = false;

/**
 * Shows the consent banner above the mic button.
 * Returns a Promise that resolves when the user clicks confirm.
 */
function requestConsent() {
  return new Promise(resolve => {
    const banner = document.getElementById('va-consent-banner');
    const btn    = document.getElementById('va-consent-confirm');
    if (!banner || !btn) { resolve(); return; }
    banner.style.display = 'block';
    btn.addEventListener('click', function handler() {
      btn.removeEventListener('click', handler);
      banner.style.display = 'none';
      sessionStorage.setItem('dastak_voice_consent', '1');
      resolve();
    }, { once: true });
  });
}

/**
 * Returns true if the user has already consented this session.
 */
function hasConsented() {
  return sessionStorage.getItem('dastak_voice_consent') === '1';
}

window.addEventListener('DOMContentLoaded', () => {
  const path     = window.location.pathname;
  const isHome   = path === '/' || path.includes('index') || path.endsWith('/');
  const isSvc    = path.includes('services');
  const autostart = window.location.search.includes('autostart=true');

  const micBtn = document.getElementById('mic-btn');
  if (!micBtn) return;

  // ── Auto-start on services.html?autostart=true (cross-page continuation) ──
  if (isSvc && autostart) {
    // Consent was already given on the home page; carry it forward
    sessionStorage.setItem('dastak_voice_consent', '1');
    setTimeout(async () => {
      if (agentRunning) return;
      agentRunning = true;
      micBtn.classList.add('listening');
      await runServicesPageFlow();
      micBtn.classList.remove('listening');
      agentRunning = false;
    }, 800);
    return; // mic click not needed when autostart
  }

  // ── Mic click handler ──
  micBtn.addEventListener('click', async () => {
    if (agentRunning) return;

    // Show consent banner on first click
    if (!hasConsented()) {
      await requestConsent();
    }

    agentRunning = true;
    micBtn.classList.add('listening');

    // ═══════════════════════════════════════════════════════════════
    // TRACK A INTEGRATION POINT — Live voice input entry
    // When Track A is ready, replace the direct flow calls below
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
    // For now, skip real voice input entirely and run the demo:
    // ═══════════════════════════════════════════════════════════════

    if (isHome) {
      await runHomePageFlow();
      // Page navigates away — code below won't run
    } else if (isSvc) {
      micBtn.classList.remove('listening');
      await runServicesPageFlow();
    } else {
      // Unknown page — go to services
      window.location.href = 'services.html';
    }

    agentRunning = false;
    micBtn.classList.remove('listening');
  });
});
