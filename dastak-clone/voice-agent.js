/**
 * voice-agent.js — Dastak Voice Agent, Track B
 *
 * Three-layer architecture:
 *   Layer 1 — Pointer Engine        : low-level pointer + DOM primitives
 *   Layer 2 — Navigation Actions    : Dastak-specific named step functions
 *   Layer 3 — Orchestrators         : page-specific flows
 *                                     (home / services / apply)
 *
 * Track A integration points are marked with banner comments:
 *   ═══ TRACK A INTEGRATION POINT N ═══
 *
 * Do NOT modify the function signatures of the three stubs.
 * Track A replaces only the function bodies.
 */


/* ════════════════════════════════════════════════════════════════
   SECTION 1 — Inject styles
   No separate CSS file — fully self-contained.
   ════════════════════════════════════════════════════════════════ */
(function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes va-pulse-ring {
      0%   { transform: scale(1);   opacity: 1; }
      70%  { transform: scale(1.4); opacity: 0.5; }
      100% { transform: scale(1);   opacity: 1; }
    }
    @keyframes va-mic-pulse {
      0%   { box-shadow: 0 0 0 0    rgba(229,62,62,0.6); }
      70%  { box-shadow: 0 0 0 12px rgba(229,62,62,0);   }
      100% { box-shadow: 0 0 0 0    rgba(229,62,62,0);   }
    }

    #agent-pointer {
      position: fixed; width: 44px; height: 44px;
      border-radius: 50%; border: 3px solid #167B38;
      box-shadow: 0 0 0 4px rgba(22,123,56,0.15), 0 0 16px rgba(22,123,56,0.40);
      pointer-events: none; z-index: 99999; display: none;
      transition: left 0.5s cubic-bezier(0.25,0.46,0.45,0.94),
                  top  0.5s cubic-bezier(0.25,0.46,0.45,0.94);
    }
    #agent-pointer.active { display: block; }
    #agent-pointer.pulse  { animation: va-pulse-ring 0.4s ease-in-out; }

    .field-highlight {
      outline: 2.5px solid #167B38 !important;
      background-color: #f1f8f3 !important;
      transition: all 0.3s;
    }

    #voice-agent-panel {
      position: fixed; bottom: 24px; right: 24px; z-index: 99998;
      display: flex; flex-direction: column; align-items: flex-end; gap: 10px;
    }

    #va-consent-banner {
      background: #fff; border: 1.5px solid #167B38; border-radius: 12px;
      padding: 14px 16px; max-width: 240px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.14);
      text-align: right; direction: rtl; display: none;
    }
    #va-consent-banner p {
      margin: 0 0 10px; font-size: 12px; line-height: 1.6; color: #333;
      font-family: 'Outfit', sans-serif;
    }
    #va-consent-confirm {
      width: 100%; background: #167B38; color: #fff; border: none;
      border-radius: 8px; padding: 7px 0; font-size: 13px; cursor: pointer;
      font-family: 'Outfit', sans-serif; transition: background 0.2s;
    }
    #va-consent-confirm:hover { background: #125e2e; }

    #mic-status-bubble {
      background: #167B38; color: #fff; padding: 8px 16px;
      border-radius: 20px; font-size: 13px; font-family: 'Outfit', sans-serif;
      display: none; max-width: 260px; text-align: right; direction: rtl;
      box-shadow: 0 4px 12px rgba(0,0,0,0.20); line-height: 1.5;
    }

    #mic-btn {
      width: 60px; height: 60px; border-radius: 50%;
      background: #167B38; border: none; color: #fff; font-size: 22px;
      cursor: pointer; box-shadow: 0 4px 16px rgba(22,123,56,0.50);
      transition: transform 0.2s, background 0.2s;
      display: flex; align-items: center; justify-content: center;
    }
    #mic-btn:hover { transform: scale(1.08); background: #125e2e; }
    #mic-btn.listening {
      background: #e53e3e;
      animation: va-mic-pulse 1s ease-out infinite;
    }
  `;
  document.head.appendChild(style);
})();


/* ════════════════════════════════════════════════════════════════
   SECTION 2 — Inject panel HTML
   ════════════════════════════════════════════════════════════════ */
(function injectPanel() {
  const panel = document.getElementById('voice-agent-panel');
  if (!panel) { console.error('[VoiceAgent] #voice-agent-panel not found'); return; }
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
   SECTION 3 — Field map (Track A integration contract)
   ════════════════════════════════════════════════════════════════ */
const FIELD_MAP = {
  cnic:          { id: 'fCnic',         label: 'CNIC',                 urduLabel: 'شناختی کارڈ' },
  license_no:    { id: 'fLicenseNo',    label: 'License No.',          urduLabel: 'لائسنس نمبر' },
  issuance_date: { id: 'fIssuanceDate', label: 'License Issuance Date',urduLabel: 'اجراء تاریخ' },
  duration:      { id: 'fDuration',     label: 'Renewal Duration',     urduLabel: 'رینیوول مدت' },
  possession:    { id: 'fPossession',   label: 'Old License Possession',urduLabel: 'پرانا لائسنس' },
};


/* ════════════════════════════════════════════════════════════════
   SECTION 4 — Track A stub functions
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
//   - Returns { field: string, value: string, confidence: number } | null
// Contract: async function extractField(transcript) → object | null
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
// Contract: async function speakConfirmation(urduText) → void
// ═══════════════════════════════════════════════════════════════
async function speakConfirmation(urduText) {
  // STUB — Track A replaces this with real Uplift AI TTS call
  setStatus(urduText);
  await delay(1200);
}


/* ════════════════════════════════════════════════════════════════
   LAYER 1 — Pointer Engine
   Low-level primitives. No knowledge of Dastak or its flow.
   ════════════════════════════════════════════════════════════════ */

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function setStatus(text, show = true) {
  const bubble = document.getElementById('mic-status-bubble');
  if (!bubble) return;
  bubble.textContent = text;
  bubble.style.display = show ? 'block' : 'none';
}

function triggerPulse() {
  const pointer = document.getElementById('agent-pointer');
  if (!pointer) return;
  pointer.classList.remove('pulse');
  void pointer.offsetWidth;
  pointer.classList.add('pulse');
}

async function movePointerTo(el) {
  if (!el) { console.warn('[VoiceAgent] movePointerTo: element not found'); return; }
  const pointer = document.getElementById('agent-pointer');
  if (!pointer) return;

  const r = el.getBoundingClientRect();
  const fullyVisible = r.top >= 0 && r.bottom <= window.innerHeight
                    && r.left >= 0 && r.right  <= window.innerWidth;
  if (!fullyVisible) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await delay(500);
  }

  const rect = el.getBoundingClientRect();
  pointer.style.left = (rect.left + rect.width  / 2 - 22) + 'px';
  pointer.style.top  = (rect.top  + rect.height / 2 - 22) + 'px';
  pointer.classList.add('active');
  await delay(500);
}

async function hoverElement(el, durationMs) {
  await movePointerTo(el);
  await delay(durationMs);
}

async function clickElement(el) {
  await hoverElement(el, 400);
  triggerPulse();
  await delay(200);
  el.click();
  await delay(300);
}

async function typeIntoField(el, value) {
  if (!el) { console.warn('[VoiceAgent] typeIntoField: element not found'); return; }
  await movePointerTo(el);
  triggerPulse();
  el.classList.add('field-highlight');
  el.value = '';

  for (const char of value) {
    el.value += char;
    el.dispatchEvent(new Event('input',         { bubbles: true }));
    el.dispatchEvent(new Event('change',        { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    await delay(60);
  }

  el.dispatchEvent(new Event('blur', { bubbles: true }));
  await delay(300);
  el.classList.remove('field-highlight');
}

async function selectOption(el, value) {
  if (!el) { console.warn('[VoiceAgent] selectOption: element not found'); return; }
  await movePointerTo(el);
  triggerPulse();
  await delay(200);
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  await delay(300);
}

function hidePointer() {
  const pointer = document.getElementById('agent-pointer');
  if (!pointer) return;
  pointer.classList.remove('active');
  pointer.style.left = '-100px';
}

/**
 * Tries each CSS selector in order and returns the first match.
 * Logs a warning if none match — flow continues rather than crashing.
 */
function findField(strategies) {
  for (const sel of strategies) {
    try {
      const el = document.querySelector(sel);
      if (el) return el;
    } catch (e) { /* invalid selector — skip */ }
  }
  console.warn('[VoiceAgent] findField: no match for strategies:', strategies);
  return null;
}


/* ════════════════════════════════════════════════════════════════
   LAYER 2 — Navigation Actions
   Dastak-specific step functions. Calls Layer 1 only —
   never manipulates DOM directly.
   ════════════════════════════════════════════════════════════════ */

// ── PAGE 1 (index.html) ──────────────────────────────────────────

/**
 * Hover the Apply Service hero button, then scroll to #govt_services.
 * The button's href was changed to "services.html" in an earlier revision
 * so we avoid el.click() (which would navigate away) and scroll directly.
 */
async function navClickApplyServiceHero() {
  const btn = document.querySelector('a.btn_apply_service_hero');
  setStatus('سروسز تلاش کر رہا ہوں...');
  await hoverElement(btn, 800);
  triggerPulse();
  await delay(300);
  const target = document.getElementById('govt_services');
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  await delay(700);
}

/**
 * Hover the DLIMS card then click it.
 * The anchor href is "services.html?autostart=true" (fixed in index.html)
 * so clicking naturally continues the agent flow on the next page.
 */
async function navClickDlimsCard() {
  const slideItem = document.querySelector('.explore_slide_item[data-name="dlims"]');
  const anchor    = slideItem && slideItem.querySelector('.explore_cat_card');
  setStatus('ڈرائیونگ لائسنس سروسز...');
  await hoverElement(slideItem, 800);
  setStatus('سروسز کی طرف جا رہا ہوں...');
  triggerPulse();
  await delay(200);
  if (anchor) anchor.click();
  // Page navigates — execution stops here
}

// ── PAGE 2 (services.html) ───────────────────────────────────────

/**
 * Hover the "Renewal of Regular License" card for 1000ms then click it.
 * services.js responds by highlighting the card and inserting the
 * "Choose How You Want to Apply" section below the cards row.
 */
async function navClickRenewalCard() {
  const card = document.querySelector('[data-service-key="renewal_driving_license"]');
  setStatus('لائسنس رینیوول سروس منتخب کر رہا ہوں...');
  await hoverElement(card, 1000);
  setStatus('سروس منتخب ہو گئی...');
  await clickElement(card);
}

/**
 * Wait for the inline apply section to render, then scroll it into view.
 */
async function navWaitForApplySection() {
  await delay(700);
  const panel = document.querySelector('.service-expanded-panel');
  if (panel) {
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await delay(600);
  }
  setStatus('درخواست کا طریقہ منتخب کر رہا ہوں...');
}

/**
 * Find and click the "Self Service" option card within the apply section.
 */
async function navSelectSelfService() {
  const selfCard = findField([
    '.service-expanded-panel .apply_online',
    '.apply_online',
    '[data-mode="self"]',
  ]);
  setStatus('سیلف سروس منتخب کر رہا ہوں...');
  await hoverElement(selfCard, 600);
  await clickElement(selfCard);
  await delay(400);
}

/**
 * Set the cross-page sessionStorage flags, then click the Apply button.
 * The button navigates to apply.html?service=...&mode=online.
 * sessionStorage persists across the navigation so apply.html knows to
 * auto-continue the agent flow.
 */
async function navClickApplyButton() {
  const applyBtn = findField([
    '.service-expanded-panel .btn-apply-service',
    '.btn-apply-service',
  ]);
  setStatus('درخواست شروع کر رہا ہوں...');
  await hoverElement(applyBtn, 600);
  // Set state BEFORE click — navigation happens synchronously on click
  sessionStorage.setItem('agent_active', 'true');
  sessionStorage.setItem('agent_stage', 'apply_form');
  triggerPulse();
  await delay(200);
  if (applyBtn) applyBtn.click();
  // Page navigates — execution stops here
}

// ── PAGE 3 (apply.html) ──────────────────────────────────────────

/** Fill the CNIC field. */
async function navFillCnic(value) {
  const el = findField([
    '#fCnic',
    'input[placeholder*="CNIC" i]',
    'input[name*="cnic" i]',
    'input[id*="cnic" i]',
  ]);
  setStatus('شناختی کارڈ نمبر بھر رہا ہوں...');
  await typeIntoField(el, value);
  await speakConfirmation('✓ CNIC: ' + value);
}

/** Fill the License Number field. */
async function navFillLicenseNumber(value) {
  const el = findField([
    '#fLicenseNo',
    'input[placeholder*="License No" i]',
    'input[name*="license" i]',
    'input[id*="license" i]',
  ]);
  setStatus('لائسنس نمبر بھر رہا ہوں...');
  await typeIntoField(el, value);
  await speakConfirmation('✓ لائسنس نمبر: ' + value);
}

/** Fill the License Issuance Date field. */
async function navFillIssuanceDate(value) {
  const el = findField([
    '#fIssuanceDate',
    'input[placeholder*="Issuance" i]',
    'input[placeholder*="Date" i]',
    'input[type="date"]',
    'input[name*="date" i]',
  ]);
  setStatus('لائسنس کی تاریخ بھر رہا ہوں...');
  await typeIntoField(el, value);
  await speakConfirmation('✓ تاریخ: ' + value);
}

/** Select the renewal duration (first available option). */
async function navSelectRenewalDuration() {
  const el = findField([
    '#fDuration',
    'select[id*="duration" i]',
    'select[name*="duration" i]',
  ]);
  setStatus('رینیوول کی مدت منتخب کر رہا ہوں...');
  await selectOption(el, 'For 1 Year');
  await speakConfirmation('✓ مدت: ایک سال');
}

/** Select the old-license-in-possession option. */
async function navSelectPossession() {
  const el = findField([
    '#fPossession',
    'select[id*="possession" i]',
    'select[name*="possession" i]',
  ]);
  setStatus('پرانا لائسنس...');
  await selectOption(el, 'Yes, in my possession');
  await speakConfirmation('✓ پرانا لائسنس موجود ہے');
}

/**
 * Read the math captcha question, compute the answer, fill it in.
 * Handles addition only (the only operator used in this captcha).
 */
async function navSolveCaptcha() {
  const questionEl = document.querySelector('.math-question');
  const inputEl    = findField([
    '.math-captcha-input',
    'input[placeholder*="Answer" i]',
    'input[name*="captcha" i]',
  ]);

  setStatus('سوال حل کر رہا ہوں...');

  let answer = '';
  if (questionEl) {
    const text = questionEl.textContent.replace('= ?', '').trim();
    // Supports "X + Y" format
    const parts = text.split('+');
    if (parts.length === 2) {
      answer = String(parseInt(parts[0].trim(), 10) + parseInt(parts[1].trim(), 10));
    }
  }

  if (inputEl && answer) {
    await typeIntoField(inputEl, answer);
    await speakConfirmation('✓ جواب: ' + answer);
  } else {
    console.warn('[VoiceAgent] navSolveCaptcha: could not read question or find input');
  }
}

/** Hover the Submit button then click it. */
async function navClickSubmit() {
  const btn = findField([
    '#btnSubmitApplication',
    'button[type="submit"]',
    'input[type="submit"]',
    'button.btn-success',
    'button.btn-primary',
  ]);
  setStatus('درخواست جمع کر رہا ہوں...');
  await hoverElement(btn, 600);
  await clickElement(btn);
}


/* ════════════════════════════════════════════════════════════════
   LAYER 3 — Orchestrators
   Page-specific flows. Calls Layer 2 only.
   DEMO_DATA is the only place hardcoded values live.
   Track A replaces DEMO_DATA values with live STT-extracted values.
   ════════════════════════════════════════════════════════════════ */

const DEMO_DATA = {
  cnic:          '3520212345678',
  licenseNo:     'LHR-2019-00123',
  issuanceDate:  '2019-03-15',
};

/** PAGE 1 — index.html */
async function runHomePageFlow() {
  await navClickApplyServiceHero();   // hover Apply Service → scroll to services
  await navClickDlimsCard();          // hover DLIMS → navigate to services.html?autostart=true
  // Navigation away — flow continues on services.html
}

/** PAGE 2 — services.html */
async function runServicesPageFlow() {
  await navClickRenewalCard();        // hover + click Renewal card → inline panel appears
  await navWaitForApplySection();     // wait for panel, scroll into view
  await navSelectSelfService();       // click Self Service card
  await navClickApplyButton();        // set sessionStorage + navigate to apply.html
  // Navigation away — flow continues on apply.html
}

/** PAGE 3 — apply.html */
async function runApplyFormFlow() {
  // Form is rendered dynamically by apply.js; give it time to settle
  await delay(400);

  await navFillCnic(DEMO_DATA.cnic);
  await navFillLicenseNumber(DEMO_DATA.licenseNo);
  await navFillIssuanceDate(DEMO_DATA.issuanceDate);
  await navSelectRenewalDuration();
  await navSelectPossession();
  await navSolveCaptcha();
  await navClickSubmit();

  // Success
  hidePointer();
  setStatus('درخواست جمع ہو گئی ✅');
  await delay(2500);
  setStatus('', false);
  sessionStorage.removeItem('agent_active');
  sessionStorage.removeItem('agent_stage');
}


/* ════════════════════════════════════════════════════════════════
   SECTION 5 — Consent + mic handler + page detection
   ════════════════════════════════════════════════════════════════ */
let agentRunning = false;

function hasConsented() {
  return sessionStorage.getItem('dastak_voice_consent') === '1';
}

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

async function handleMicClick(flowFn) {
  if (agentRunning) return;
  if (!hasConsented()) await requestConsent();
  agentRunning = true;
  const micBtn = document.getElementById('mic-btn');
  if (micBtn) micBtn.classList.add('listening');

  // ═══════════════════════════════════════════════════════════════
  // TRACK A INTEGRATION POINT — Live voice input entry
  // When Track A is ready, replace the direct flowFn() call below
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

  try {
    await flowFn();
  } finally {
    agentRunning = false;
    const micBtn = document.getElementById('mic-btn');
    if (micBtn) micBtn.classList.remove('listening');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const pathname = window.location.pathname;
  const search   = window.location.search;
  const isHome   = pathname === '/' || pathname.includes('index') || pathname.endsWith('/');
  const isSvc    = pathname.includes('services');
  const isApply  = pathname.includes('apply');
  const autostart = search.includes('autostart=true');

  const micBtn = document.getElementById('mic-btn');

  // ── APPLY PAGE ──────────────────────────────────────────────
  if (isApply) {
    const shouldAutoRun = sessionStorage.getItem('agent_active') === 'true'
                       && sessionStorage.getItem('agent_stage')  === 'apply_form';
    if (shouldAutoRun) {
      sessionStorage.removeItem('agent_stage');
      setTimeout(async () => {
        if (agentRunning) return;
        agentRunning = true;
        const mb = document.getElementById('mic-btn');
        if (mb) mb.classList.add('listening');
        try       { await runApplyFormFlow(); }
        finally   {
          agentRunning = false;
          const mb2 = document.getElementById('mic-btn');
          if (mb2) mb2.classList.remove('listening');
        }
      }, 900);
    } else if (micBtn) {
      micBtn.addEventListener('click', () => handleMicClick(runApplyFormFlow));
    }
    return;
  }

  // ── SERVICES PAGE — autostart (cross-page continuation) ────
  if (isSvc && autostart) {
    sessionStorage.setItem('dastak_voice_consent', '1'); // consent carried from home
    setTimeout(async () => {
      if (agentRunning) return;
      agentRunning = true;
      const mb = document.getElementById('mic-btn');
      if (mb) mb.classList.add('listening');
      try       { await runServicesPageFlow(); }
      finally   {
        agentRunning = false;
        const mb2 = document.getElementById('mic-btn');
        if (mb2) mb2.classList.remove('listening');
      }
    }, 800);
    return;
  }

  // ── HOME or SERVICES PAGE — manual mic trigger ──────────────
  if (!micBtn) return;
  if (isHome) {
    micBtn.addEventListener('click', () => handleMicClick(runHomePageFlow));
  } else if (isSvc) {
    micBtn.addEventListener('click', () => handleMicClick(runServicesPageFlow));
  } else {
    // Fallback for any other page
    micBtn.addEventListener('click', () => handleMicClick(runServicesPageFlow));
  }
});
