/**
 * maryam-agent.js
 *
 * Combined Track A + Track B integration.
 * - Track A: Maryam voice intelligence via Uplift AI realtime assistant (LiveKit)
 * - Track B: animated green pointer engine, typewriter form filling, Urdu status
 *
 * Tools Maryam can call via RPC:
 *   - get_page_context()
 *   - navigate_to_page(page)
 *   - point_to_element(element_id)   — points and WAITS for the citizen to click
 *   - fill_field(field_name, value)  — typewriter-fills automatically
 *
 * Include on index.html, services.html, apply.html AFTER the LiveKit client:
 *   <script src="https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.umd.min.js"></script>
 *   <script src="assets/js/maryam-agent.js"></script>
 */

(function () {
  'use strict';

  // -------------------------------------------------------------------
  // SECTION 1 — Configuration
  // -------------------------------------------------------------------
  const ASSISTANT_ID = 'e9311394-097b-49c6-a206-fef2569dce2c';
  const SESSION_STORAGE_KEY = 'maryam_session';
  const UPLIFT_BASE = 'https://api.upliftai.org/v1';

  // -------------------------------------------------------------------
  // SECTION 2 — Site config (embedded, no network call needed)
  // -------------------------------------------------------------------
  const SITE_CONFIG = {
    homepage: {
      page: 'homepage',
      notes:
        "The DLIMS service category card here is not wired to navigate anywhere (href='#'). Do not point_to_element on it — call navigate_to_page('services') instead.",
    },
    services: {
      page: 'services',
      elements: [
        {
          action: 'select_service',
          element_id: '[data-service-key="renewal_driving_license"]',
          label: 'Renewal of Regular License',
          interaction: 'point_to_element',
          result: 'Expands a panel with two apply-mode options below the service row',
        },
        {
          action: 'select_apply_mode_self_service',
          element_id: '.apply_online',
          label: 'Self Service',
          interaction: 'point_to_element',
          note: "class name says apply_online but this IS the Self Service option",
        },
        {
          action: 'select_apply_mode_doorstep',
          element_id: '.apply_self',
          label: 'Doorstep Service',
          interaction: 'point_to_element',
          note: "class name says apply_self but this IS the Doorstep Service option",
        },
        {
          action: 'proceed_to_application',
          element_id: '.btn-apply-service',
          label: 'Apply',
          interaction: 'point_to_element',
          requires: 'an apply mode must be selected first',
          result: 'Navigates to apply.html',
        },
      ],
    },
    apply: {
      page: 'apply',
      service: 'renewal_driving_license',
      formType: 'renewal-license',
      fields: [
        { order: 1, field_id: 'fCnic',         label: 'CNIC',
          type: 'text',   validation: 'exactly 13 digits, no dashes' },
        { order: 2, field_id: 'fLicenseNo',    label: 'License Number',
          type: 'text',   validation: 'non-empty' },
        { order: 3, field_id: 'fIssuanceDate', label: 'License Issuance Date',
          type: 'date',   validation: 'real past date' },
        { order: 4, field_id: 'fDuration',     label: 'Renewal Duration',
          type: 'select',
          options: ['For 1 Year', 'For 2 Years', 'For 3 Years', 'For 4 Years', 'For 5 Years'] },
        { order: 5, field_id: 'fPossession',   label: 'Is Old License in Possession',
          type: 'select',
          options: ['Yes, in my possession', "No, it's lost"] },
      ],
      postFieldSteps: [
        { step: 'captcha',
          element_id: '.math-captcha-wrapper',
          description: 'Math captcha — user solves directly on screen.' },
        { step: 'submit',
          element_id: '#btnSubmitApplication',
          description: 'Final submit button.' },
      ],
    },
  };

  // -------------------------------------------------------------------
  // SECTION 3 — Page detection
  // -------------------------------------------------------------------
  function getCurrentPageKey() {
    const path = window.location.pathname;
    if (path.endsWith('services.html')) return 'services';
    if (path.endsWith('apply.html')) return 'apply';
    return 'homepage';
  }

  // -------------------------------------------------------------------
  // SECTION 4 — Animated pointer engine (Track B upgrade)
  // -------------------------------------------------------------------
  function injectPointerStylesOnce() {
    if (document.getElementById('maryam-pointer-style')) return;
    const style = document.createElement('style');
    style.id = 'maryam-pointer-style';
    style.textContent = `
      #maryam-pointer {
        position: fixed;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        border: 3px solid #167B38;
        box-shadow: 0 0 0 4px rgba(22,123,56,0.15),
                    0 0 16px rgba(22,123,56,0.4);
        pointer-events: none;
        display: none;
        z-index: 99999;
        transition: left 0.5s cubic-bezier(0.25,0.46,0.45,0.94),
                    top  0.5s cubic-bezier(0.25,0.46,0.45,0.94);
      }
      #maryam-pointer.active { display: block; }
      #maryam-pointer.pulse {
        animation: maryamPulse 0.4s ease-out;
      }
      @keyframes maryamPulse {
        0%   { transform: scale(1);   }
        50%  { transform: scale(1.5); }
        100% { transform: scale(1);   }
      }
      #maryam-status {
        position: fixed;
        bottom: 90px;
        right: 24px;
        background: #167B38;
        color: white;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 13px;
        font-family: 'Outfit', sans-serif;
        display: none;
        max-width: 280px;
        text-align: right;
        z-index: 99998;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      }
      #maryam-mic-btn {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: #167B38;
        border: none;
        color: white;
        font-size: 22px;
        cursor: pointer;
        z-index: 99998;
        box-shadow: 0 4px 16px rgba(22,123,56,0.5);
        transition: transform 0.2s, background 0.2s;
      }
      #maryam-mic-btn:hover {
        transform: scale(1.08);
        background: #125e2e;
      }
      #maryam-mic-btn.connected {
        background: #167B38;
      }
      #maryam-mic-btn.connecting {
        background: #999;
        animation: maryamConnecting 1s infinite;
      }
      @keyframes maryamConnecting {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.5; }
      }
      .field-highlight {
        outline: 2.5px solid #167B38 !important;
        background-color: #f1f8f3 !important;
        transition: all 0.3s;
      }
    `;
    document.head.appendChild(style);
  }

  function injectPointerElements() {
    if (document.getElementById('maryam-pointer')) return;

    const pointer = document.createElement('div');
    pointer.id = 'maryam-pointer';
    document.body.appendChild(pointer);

    const status = document.createElement('div');
    status.id = 'maryam-status';
    document.body.appendChild(status);

    const micBtn = document.createElement('button');
    micBtn.id = 'maryam-mic-btn';
    micBtn.title = 'مریم سے بات کریں';
    micBtn.textContent = '🎤';
    micBtn.classList.add('connecting');
    document.body.appendChild(micBtn);
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function setStatus(text, show) {
    const el = document.getElementById('maryam-status');
    if (!el) return;
    el.textContent = text;
    el.style.display = show === false ? 'none' : 'block';
  }

  async function movePointerTo(el) {
    if (!el) return;
    const pointer = document.getElementById('maryam-pointer');
    if (!pointer) return;

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await delay(500);

    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2 - 22;
    const y = rect.top + rect.height / 2 - 22;

    pointer.style.left = x + 'px';
    pointer.style.top = y + 'px';
    pointer.classList.add('active');
    await delay(500);
  }

  function triggerPulse() {
    const pointer = document.getElementById('maryam-pointer');
    if (!pointer) return;
    pointer.classList.remove('pulse');
    void pointer.offsetWidth;
    pointer.classList.add('pulse');
  }

  function hidePointer() {
    const pointer = document.getElementById('maryam-pointer');
    if (pointer) pointer.classList.remove('active');
  }

  // -------------------------------------------------------------------
  // SECTION 5 — waitForElement utility
  // -------------------------------------------------------------------
  function waitForElement(selector, timeoutMs) {
    timeoutMs = timeoutMs || 8000;
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(selector);
      if (existing) return resolve(existing);
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) { observer.disconnect(); resolve(el); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        reject(new Error('Element not found: ' + selector));
      }, timeoutMs);
    });
  }

  // -------------------------------------------------------------------
  // SECTION 6 — Tool handler implementations
  // -------------------------------------------------------------------
  function handleGetPageContext() {
    const pageKey = getCurrentPageKey();
    return SITE_CONFIG[pageKey] || { page: pageKey, notes: 'No config.' };
  }

  function handleNavigateToPage(payload) {
    const urlMap = {
      services: 'services.html',
      apply: 'apply.html',
      homepage: 'index.html',
    };
    const url = urlMap[payload.page];
    if (!url) return { navigated: false, error: 'Unknown page: ' + payload.page };
    window.location.href = url;
    return { navigated: true, target: url };
  }

  async function handlePointToElement(payload) {
    const selector = payload.element_id;

    try {
      const el = await waitForElement(selector);

      // Move the animated green pointer to the element
      await movePointerTo(el);
      triggerPulse();

      // Show Urdu status
      const labelMap = {};
      const pageConfig = SITE_CONFIG[getCurrentPageKey()];
      if (pageConfig && pageConfig.elements) {
        pageConfig.elements.forEach((e) => { labelMap[e.element_id] = e.label; });
      }
      const label = labelMap[selector] || selector;
      setStatus('یہاں کلک کریں: ' + label);

      // Wait for the CITIZEN to click the element (not auto-click).
      // Maryam POINTS and WAITS — the citizen does the clicking.
      return await new Promise((resolve) => {
        function cleanup() {
          window.removeEventListener('scroll', reposition, true);
          window.removeEventListener('resize', reposition);
          el.removeEventListener('click', onClick, true);
          hidePointer();
          setStatus('', false);
        }

        function reposition() {
          const rect = el.getBoundingClientRect();
          const pointer = document.getElementById('maryam-pointer');
          if (!pointer) return;
          pointer.style.left = (rect.left + rect.width / 2 - 22) + 'px';
          pointer.style.top = (rect.top + rect.height / 2 - 22) + 'px';
        }

        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);

        function onClick() {
          cleanup();
          resolve({ clicked: true, element_id: selector });
        }

        el.addEventListener('click', onClick, true);
      });
    } catch (err) {
      console.warn('[Maryam] point_to_element failed:', selector, err.message);
      return { clicked: false, error: err.message };
    }
  }

  async function handleFillField(payload) {
    const fieldId = payload.field_name;
    const value = payload.value;

    try {
      const el = await waitForElement('#' + fieldId);

      // Move pointer to the field
      await movePointerTo(el);
      triggerPulse();

      // Highlight the field
      el.classList.add('field-highlight');

      // Typewriter fill — character by character
      el.value = '';
      el.focus();
      for (const char of String(value)) {
        el.value += char;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        await delay(55);
      }
      el.dispatchEvent(new Event('blur', { bubbles: true }));

      await delay(300);
      el.classList.remove('field-highlight');
      hidePointer();

      return { field_name: fieldId, value: value, filled: true };
    } catch (err) {
      console.warn('[Maryam] fill_field failed:', fieldId, err.message);
      return { filled: false, error: err.message };
    }
  }

  // -------------------------------------------------------------------
  // SECTION 7 — Session management
  // -------------------------------------------------------------------
  function saveSession(session) {
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ ...session, savedAt: Date.now() })
    );
  }

  function loadSavedSession() {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  async function createNewSession() {
    const res = await fetch(
      `${UPLIFT_BASE}/realtime-assistants/${ASSISTANT_ID}/createPublicSession`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantName: 'Citizen' }),
      }
    );
    if (!res.ok) throw new Error('Session creation failed: ' + res.status);
    const data = await res.json();
    saveSession(data);
    return data;
  }

  async function getOrResumeSession() {
    const saved = loadSavedSession();
    if (saved && saved.token && saved.wsUrl) return saved;
    return createNewSession();
  }

  // -------------------------------------------------------------------
  // SECTION 8 — LiveKit connection and RPC registration
  // -------------------------------------------------------------------
  async function connectAndRegisterTools() {
    if (typeof LivekitClient === 'undefined') {
      console.error('[Maryam] LivekitClient not loaded.');
      return;
    }

    const micBtn = document.getElementById('maryam-mic-btn');

    try {
      const session = await getOrResumeSession();
      const room = new LivekitClient.Room();

      // Register all four RPC tools
      room.localParticipant.registerRpcMethod(
        'get_page_context',
        async () => JSON.stringify(handleGetPageContext())
      );

      room.localParticipant.registerRpcMethod(
        'navigate_to_page',
        async (data) => {
          const payload = JSON.parse(data.payload);
          const args = payload.arguments
            ? payload.arguments.raw_arguments : payload;
          return JSON.stringify(handleNavigateToPage(args));
        }
      );

      room.localParticipant.registerRpcMethod(
        'point_to_element',
        async (data) => {
          const payload = JSON.parse(data.payload);
          const args = payload.arguments
            ? payload.arguments.raw_arguments : payload;
          return JSON.stringify(await handlePointToElement(args));
        }
      );

      room.localParticipant.registerRpcMethod(
        'fill_field',
        async (data) => {
          const payload = JSON.parse(data.payload);
          const args = payload.arguments
            ? payload.arguments.raw_arguments : payload;
          return JSON.stringify(await handleFillField(args));
        }
      );

      await room.connect(session.wsUrl, session.token);
      console.log('[Maryam] Connected on:', getCurrentPageKey());

      // Enable mic automatically — Maryam is always listening
      await room.localParticipant.setMicrophoneEnabled(true);

      // Update mic button to show connected state
      if (micBtn) {
        micBtn.classList.remove('connecting');
        micBtn.classList.add('connected');
        micBtn.title = 'مریم سے بات کر رہے ہیں';
        // Mic button now just toggles mute/unmute
        micBtn.addEventListener('click', async () => {
          const isMuted = !room.localParticipant.isMicrophoneEnabled;
          await room.localParticipant.setMicrophoneEnabled(isMuted);
          micBtn.textContent = isMuted ? '🎤' : '🔇';
          micBtn.style.background = isMuted ? '#167B38' : '#e53e3e';
        });
      }
    } catch (err) {
      console.error('[Maryam] Connection failed:', err);
      if (micBtn) {
        micBtn.classList.remove('connecting');
        micBtn.style.background = '#e53e3e';
        micBtn.title = 'Connection failed — refresh to retry';
        micBtn.textContent = '⚠️';
      }
    }
  }

  // -------------------------------------------------------------------
  // SECTION 9 — Boot on DOMContentLoaded
  // -------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    injectPointerStylesOnce();
    injectPointerElements();
    connectAndRegisterTools();
  });
})();
