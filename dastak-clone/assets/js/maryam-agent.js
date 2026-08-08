/**
 * maryam-agent.js
 *
 * Connects the Dastak mockup site to the "Maryam" Uplift AI Realtime
 * Assistant, and implements the four tools the assistant can call:
 *   - get_page_context()
 *   - navigate_to_page(page)
 *   - point_to_element(element_id)
 *   - fill_field(field_name, value)
 *
 * Include this file on index.html, services.html, and apply.html,
 * AFTER the LiveKit client script tag:
 *
 *   <script src="https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.umd.min.js"></script>
 *   <script src="assets/js/maryam-agent.js"></script>
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // CONFIG
  // ---------------------------------------------------------------------
  const ASSISTANT_ID = 'e9311394-097b-49c6-a206-fef2569dce2c';
  const SESSION_STORAGE_KEY = 'maryam_session';

  // ---------------------------------------------------------------------
  // SITE CONFIG — mirrors site_config.json, embedded directly so
  // get_page_context() never needs an extra network round trip.
  // Keep this in sync if the real site's fields/elements change.
  // ---------------------------------------------------------------------
  const SITE_CONFIG = {
    homepage: {
      page: 'homepage',
      notes:
        "The DLIMS service category card here is not wired to navigate anywhere (href=\"#\"). Do not point_to_element on it — call navigate_to_page(\"services\") instead.",
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
          description: 'Apply online, collect final documents from the office in person',
          interaction: 'point_to_element',
          note: "CAUTION: class name says 'apply_online' but this IS the Self Service option",
        },
        {
          action: 'select_apply_mode_doorstep',
          element_id: '.apply_self',
          label: 'Doorstep Service',
          description: "A facilitator collects and delivers documents at the user's home",
          interaction: 'point_to_element',
          note: "CAUTION: class name says 'apply_self' but this IS the Doorstep Service option",
        },
        {
          action: 'proceed_to_application',
          element_id: '.btn-apply-service',
          label: 'Apply',
          interaction: 'point_to_element',
          requires: 'an apply mode must be selected first, or this button has no effect',
          result: 'Navigates to apply.html with the service and mode set in the URL',
        },
      ],
    },
    apply: {
      page: 'apply',
      service: 'renewal_driving_license',
      formType: 'renewal-license',
      fields: [
        {
          order: 1,
          field_id: 'fCnic',
          label: 'CNIC',
          type: 'text',
          validation: 'exactly 13 digits, no dashes or spaces',
          interaction: 'fill_field',
        },
        {
          order: 2,
          field_id: 'fLicenseNo',
          label: 'License Number',
          type: 'text',
          validation: 'non-empty',
          interaction: 'fill_field',
        },
        {
          order: 3,
          field_id: 'fIssuanceDate',
          label: 'License Issuance Date',
          type: 'date',
          validation: 'real calendar date, should be in the past',
          interaction: 'fill_field',
        },
        {
          order: 4,
          field_id: 'fDuration',
          label: 'Renewal Duration',
          type: 'select',
          options: ['For 1 Year', 'For 2 Years', 'For 3 Years', 'For 4 Years', 'For 5 Years'],
          interaction: 'fill_field',
        },
        {
          order: 5,
          field_id: 'fPossession',
          label: 'Is Old License in Possession',
          type: 'select',
          options: ['Yes, in my possession', "No, it's lost"],
          interaction: 'fill_field',
        },
      ],
      postFieldSteps: [
        {
          step: 'captcha',
          element_id: '.math-captcha-wrapper',
          description: 'Math captcha must be solved by the user directly on screen before submission.',
          interaction: 'point_to_element',
        },
        {
          step: 'submit',
          element_id: '#btnSubmitApplication',
          description: 'Final submit button that completes the application.',
          interaction: 'point_to_element',
        },
      ],
    },
  };

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  function getCurrentPageKey() {
    const path = window.location.pathname;
    if (path.endsWith('services.html')) return 'services';
    if (path.endsWith('apply.html')) return 'apply';
    return 'homepage';
  }

  function waitForElement(selector, timeoutMs) {
    timeoutMs = timeoutMs || 8000;
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(selector);
      if (existing) return resolve(existing);

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error('Element not found in time: ' + selector));
      }, timeoutMs);
    });
  }

  function pointToElementAndWaitForClick(selector) {
    return waitForElement(selector).then((el) => {
      return new Promise((resolve) => {
        injectPointerStylesOnce();

        const dot = document.createElement('div');
        dot.className = 'maryam-pointer-dot';
        document.body.appendChild(dot);

        function positionDot() {
          const rect = el.getBoundingClientRect();
          dot.style.top = rect.top + rect.height / 2 + window.scrollY - 10 + 'px';
          dot.style.left = rect.left + rect.width / 2 + window.scrollX - 10 + 'px';
        }
        positionDot();

        const reposition = () => positionDot();
        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });

        function cleanup() {
          window.removeEventListener('scroll', reposition, true);
          window.removeEventListener('resize', reposition);
          dot.remove();
          el.removeEventListener('click', onClick, true);
        }

        function onClick() {
          cleanup();
          resolve({ clicked: true, element_id: selector });
        }

        el.addEventListener('click', onClick, true);
      });
    });
  }

  function injectPointerStylesOnce() {
    if (document.getElementById('maryam-pointer-style')) return;
    const style = document.createElement('style');
    style.id = 'maryam-pointer-style';
    style.textContent = `
      .maryam-pointer-dot {
        position: absolute;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: rgba(220, 38, 38, 0.85);
        box-shadow: 0 0 0 rgba(220, 38, 38, 0.6);
        animation: maryam-pulse 1.2s infinite;
        pointer-events: none;
        z-index: 99999;
      }
      @keyframes maryam-pulse {
        0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.6); }
        70% { box-shadow: 0 0 0 16px rgba(220, 38, 38, 0); }
        100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }
      }
    `;
    document.head.appendChild(style);
  }

  function fillFieldOnPage(fieldId, value) {
    return waitForElement('#' + fieldId).then((el) => {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { field_name: fieldId, value: value, filled: true };
    });
  }

  // ---------------------------------------------------------------------
  // Session persistence across page navigation
  // ---------------------------------------------------------------------

  function saveSession(session) {
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ ...session, savedAt: Date.now() })
    );
  }

  function loadSavedSession() {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  async function createNewSession() {
    const res = await fetch(
      `https://api.upliftai.org/v1/realtime-assistants/${ASSISTANT_ID}/createPublicSession`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantName: 'Citizen' }),
      }
    );
    if (!res.ok) throw new Error('Failed to create session: ' + res.status);
    const data = await res.json();
    saveSession(data);
    return data;
  }

  async function getOrResumeSession() {
    const saved = loadSavedSession();
    if (saved && saved.token && saved.wsUrl) {
      return saved;
    }
    return createNewSession();
  }

  // ---------------------------------------------------------------------
  // Tool handlers
  // ---------------------------------------------------------------------

  function handleGetPageContext() {
    const pageKey = getCurrentPageKey();
    return SITE_CONFIG[pageKey] || { page: pageKey, notes: 'No config found for this page.' };
  }

  function handleNavigateToPage(payload) {
    const target = payload.page;
    const urlMap = { services: 'services.html', apply: 'apply.html', homepage: 'index.html' };
    const url = urlMap[target];
    if (!url) return { navigated: false, error: 'Unknown page: ' + target };
    window.location.href = url;
    return { navigated: true, target: url };
  }

  async function handlePointToElement(payload) {
    const elementId = payload.element_id;
    const result = await pointToElementAndWaitForClick(elementId);
    return result;
  }

  async function handleFillField(payload) {
    const result = await fillFieldOnPage(payload.field_name, payload.value);
    return result;
  }

  // ---------------------------------------------------------------------
  // Connect + register tools
  // ---------------------------------------------------------------------

  async function connectAndRegisterTools() {
    if (typeof LivekitClient === 'undefined') {
      console.error('[Maryam] livekit-client script not loaded — add the CDN script tag before this file.');
      return;
    }

    const session = await getOrResumeSession();
    const room = new LivekitClient.Room();

    room.localParticipant.registerRpcMethod('get_page_context', async () => {
      const result = handleGetPageContext();
      return JSON.stringify(result);
    });

    room.localParticipant.registerRpcMethod('navigate_to_page', async (data) => {
      const payload = JSON.parse(data.payload);
      const args = payload.arguments ? payload.arguments.raw_arguments : payload;
      const result = handleNavigateToPage(args);
      return JSON.stringify(result);
    });

    room.localParticipant.registerRpcMethod('point_to_element', async (data) => {
      const payload = JSON.parse(data.payload);
      const args = payload.arguments ? payload.arguments.raw_arguments : payload;
      const result = await handlePointToElement(args);
      return JSON.stringify(result);
    });

    room.localParticipant.registerRpcMethod('fill_field', async (data) => {
      const payload = JSON.parse(data.payload);
      const args = payload.arguments ? payload.arguments.raw_arguments : payload;
      const result = await handleFillField(args);
      return JSON.stringify(result);
    });

    await room.connect(session.wsUrl, session.token);
    console.log('[Maryam] Connected on page:', getCurrentPageKey());

    await room.localParticipant.setMicrophoneEnabled(true);
  }

  document.addEventListener('DOMContentLoaded', () => {
    connectAndRegisterTools().catch((err) => {
      console.error('[Maryam] Failed to connect:', err);
    });
  });
})();
