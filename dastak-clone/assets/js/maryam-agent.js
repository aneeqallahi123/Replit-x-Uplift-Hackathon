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
  const FLOW_STORAGE_KEY = 'maryam_flow';
  // Stores a [CLICK] notification in sessionStorage so it survives page navigation
  // and can be replayed after auto-reconnect on the next page.
  const PENDING_CLICK_KEY = 'maryam_pending_click';
  const UPLIFT_BASE = 'https://api.upliftai.org/v1';

  // -------------------------------------------------------------------
  // SECTION 2 — Site config (embedded, no network call needed)
  // -------------------------------------------------------------------
  const SITE_CONFIG = {

    homepage: {
      page: 'homepage',
      instruction: 'GUIDED MODE: When the citizen wants a service ' +
                   '(e.g. license renewal), call start_service with ' +
                   'service_key (and mode if known). It will POINT at ' +
                   'the button the citizen must click and WAIT for ' +
                   'their click — you never click for them. After ' +
                   'every page change you receive a [PAGE UPDATE] ' +
                   'message; when the flow is active, immediately ' +
                   'call guide_next_step to continue guiding.',
      notes: 'Do not use navigate_to_page during a guided flow — ' +
             'the citizen must click the buttons themselves.',
    },

    services: {
      page: 'services',
      instruction: 'GUIDED MODE: call start_service(service_key, mode) ' +
                   'to begin pointing. Each step points at ONE element ' +
                   'and waits for the citizen to click it. After a ' +
                   'click, the tool result tells you what to say and ' +
                   'that you should call guide_next_step for the next ' +
                   'step. Never click for the citizen.',
      elements: [
        {
          service_key:  'renewal_driving_license',
          element_id:   '[data-service-key="renewal_driving_license"]',
          label_en:     'Renewal of Regular License',
          label_ur:     'ریگولر لائسنس رینیوول',
          triggers_ur:  [
            'license renew',
            'renew karna',
            'license renewal',
            'driving license renew',
            'لائسنس رینیو',
          ],
          use_tool:     'start_service',
        },
        {
          service_key:  'learner_driving_license',
          element_id:   '[data-service-key="learner_driving_license"]',
          label_en:     'Learner Driving License',
          label_ur:     'لرنر ڈرائیونگ لائسنس',
          triggers_ur:  [
            'learner license',
            'learning license',
            'pehli baar license',
            'لرنر لائسنس',
          ],
          use_tool:     'start_service',
        },
        {
          service_key:  'duplicate_driving_license',
          element_id:   '[data-service-key="duplicate_driving_license"]',
          label_en:     'Duplicate Driving License',
          label_ur:     'ڈپلیکیٹ ڈرائیونگ لائسنس',
          triggers_ur:  [
            'duplicate license',
            'license gum gaya',
            'license kho gaya',
            'ڈپلیکیٹ لائسنس',
          ],
          use_tool:     'start_service',
        },
        {
          service_key:  'renewal_learner_driving_license',
          element_id:   '[data-service-key="renewal_learner_driving_license"]',
          label_en:     'Renewal of Learners License',
          label_ur:     'لرنر لائسنس رینیوول',
          use_tool:     'start_service',
        },
        {
          service_key:  'international_driving_license_duplicate',
          element_id:   '[data-service-key="international_driving_license_duplicate"]',
          label_en:     'Duplicate International License',
          label_ur:     'انٹرنیشنل لائسنس ڈپلیکیٹ',
          use_tool:     'start_service',
        },
        {
          service_key:  'international_driving_license',
          element_id:   '[data-service-key="international_driving_license"]',
          label_en:     'Renewal International License',
          label_ur:     'انٹرنیشنل لائسنس رینیوول',
          use_tool:     'start_service',
        },
        {
          action:       'select_apply_mode_self_service',
          element_id:   '.apply_online',
          label_en:     'Self Service',
          label_ur:     'خود سروس',
          note:         'CSS class is apply_online but this IS Self Service',
        },
        {
          action:       'select_apply_mode_doorstep',
          element_id:   '.apply_self',
          label_en:     'Doorstep Service',
          label_ur:     'گھر پہنچ سروس',
          note:         'CSS class is apply_self but this IS Doorstep Service',
        },
        {
          action:       'proceed_to_application',
          element_id:   '.btn-apply-service',
          label_en:     'Apply',
          label_ur:     'درخواست دیں',
          requires:     'mode must be selected first',
        },
      ],
    },

    apply: {
      page:     'apply',
      service:  'renewal_driving_license',
      formType: 'renewal-license',
      instruction: 'Use fill_field() for each field, in order. ' +
                   'Always confirm value verbally before filling. ' +
                   'After all 5 fields: point_to_element to the captcha ' +
                   '(.math-captcha-wrapper) — the citizen answers it ' +
                   'themselves — then point_to_element to the submit ' +
                   'button (#btnSubmitApplication) and wait for their click.',
      fields: [
        {
          order:      1,
          field_id:   'fCnic',
          label_en:   'CNIC',
          label_ur:   'شناختی کارڈ نمبر',
          ask_ur:     'Aapka CNIC number kya hai?',
          confirm_ur: 'Kya aapka CNIC {value} hai?',
          type:       'text',
          validation: 'exactly 13 digits, no dashes or spaces',
        },
        {
          order:      2,
          field_id:   'fLicenseNo',
          label_en:   'License Number',
          label_ur:   'لائسنس نمبر',
          ask_ur:     'Aapka driving license number kya hai?',
          confirm_ur: 'License number {value} hai?',
          type:       'text',
          validation: 'non-empty string',
        },
        {
          order:      3,
          field_id:   'fIssuanceDate',
          label_en:   'License Issuance Date',
          label_ur:   'لائسنس جاری ہونے کی تاریخ',
          ask_ur:     'License kab issue hua tha? ' +
                      'Saal, mahina aur din batayein.',
          confirm_ur: 'Issuance date {value} hai?',
          type:       'date',
          format:     'YYYY-MM-DD',
          validation: 'real past date',
        },
        {
          order:      4,
          field_id:   'fDuration',
          label_en:   'Renewal Duration',
          label_ur:   'رینیوول کی مدت',
          ask_ur:     'Kitne saal ke liye renew karna hai?',
          type:       'select',
          options:    [
            'For 1 Year',
            'For 2 Years',
            'For 3 Years',
            'For 4 Years',
            'For 5 Years',
          ],
          options_ur: [
            'ek saal / 1 year = For 1 Year',
            'do saal / 2 years = For 2 Years',
            'teen saal / 3 years = For 3 Years',
            'chaar saal / 4 years = For 4 Years',
            'paanch saal / 5 years = For 5 Years',
          ],
        },
        {
          order:      5,
          field_id:   'fPossession',
          label_en:   'Is Old License in Possession',
          label_ur:   'کیا پرانا لائسنس موجود ہے',
          ask_ur:     'Kya aapka purana license aapke paas hai?',
          type:       'select',
          options:    [
            'Yes, in my possession',
            "No, it's lost",
          ],
          options_ur: [
            'haan / yes = Yes, in my possession',
            "nahi / no = No, it's lost",
          ],
        },
      ],
      postFieldSteps: [
        {
          step:           'captcha',
          element_id:     '.math-captcha-wrapper',
          label_en:       'Math Captcha',
          label_ur:       'ریاضی کا سوال',
          instruction_ur: 'Ek chota sa math sawaal hai. ' +
                          'Main pointer se dikhaunga, ' +
                          'aap khud jawab likhein.',
        },
        {
          step:           'submit',
          element_id:     '#btnSubmitApplication',
          label_en:       'Submit Application',
          label_ur:       'درخواست جمع کریں',
          instruction_ur: 'Submit karne se pehle confirm karein.',
        },
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
  // SECTION 3B — Guided flow state machine (sessionStorage-backed)
  //
  // A "flow" walks the citizen through a whole service, one click at a
  // time. Each step points at ONE element and waits for the citizen's
  // own click — never auto-clicking. State survives page reloads so
  // the flow resumes after navigation.
  // -------------------------------------------------------------------
  const FLOW_STEPS = [
    {
      id: 'open_services',
      page: 'homepage',
      selector: function () { return '.hero_actions .btn_apply_service_hero'; },
      fallbackSelector: 'a[href="services.html"]',
      navigates: true,
      // say_now: spoken as soon as the pointer appears (agent is free to talk)
      say_now: 'Theek hai! Pehle main aapko Services page par le chalti hoon. ' +
               'Screen par ek green button highlight ho raha hai — uss par click karein.',
      say_after: 'Bohat acha! Services page khul raha hai — ek second mein wahan pohonch jaayenge.',
    },
    {
      id: 'select_card',
      page: 'services',
      selector: function (flow) {
        return '[data-service-key="' + flow.serviceKey + '"]';
      },
      navigates: false,
      say_now: 'Ab main "Renewal of Regular License" card highlight kar rahi hoon. ' +
               'Uss highlighted card par click karein.',
      say_after: 'Shabash! Service khul gayi hai. Ab apply karne ka tareeqa chunein.',
    },
    {
      id: 'select_mode',
      page: 'services',
      selector: function (flow) {
        return flow.mode === 'doorstep' ? '.apply_self' : '.apply_online';
      },
      navigates: false,
      say_now: 'Bilkul. Main aapka pasandida tareeqa highlight kar rahi hoon — uss par click karein.',
      say_after: 'Theek hai, tareeqa select ho gaya. Ab Apply button dabana hai.',
    },
    {
      id: 'apply',
      page: 'services',
      selector: function () { return '.btn-apply-service'; },
      navigates: true,
      say_now: 'Apply button highlight ho gaya hai — uss par click karein taake application form khule.',
      say_after: 'Application form khul raha hai — ek second mein wahan pohonch jaayenge.',
    },
    {
      id: 'form',
      page: 'apply',
      // No pointing — the agent fills fields one by one via fill_field.
      // guide_next_step advances to the captcha step once every field
      // has a value.
      form: true,
    },
    {
      id: 'captcha',
      page: 'apply',
      // Special handling: only advances once the captcha answer is
      // actually CORRECT (checked against wrapper.dataset.answer),
      // never merely because the citizen clicked the captcha box.
      captcha: true,
    },
    {
      id: 'submit',
      page: 'apply',
      selector: function () { return '#btnSubmitApplication'; },
      navigates: false,
      say_after: 'Application submit ho rahi hai.',
    },
    {
      id: 'finish',
      page: 'apply',
      // Virtual step: verifies the success screen appeared and closes
      // the flow (or reports validation errors and returns to submit).
      finish: true,
    },
  ];

  // Form field IDs the guided renewal flow fills (renewal-license form).
  const RENEWAL_FORM_FIELD_IDS =
    ['fCnic', 'fLicenseNo', 'fIssuanceDate', 'fDuration', 'fPossession'];

  // Reads the live captcha state: answered correctly or not. The
  // expected answer is exposed by apply.js on wrapper.dataset.answer.
  function getCaptchaState() {
    const wrapper = document.querySelector('.math-captcha-wrapper');
    if (!wrapper) return { present: false, correct: false, answered: false };
    const input = wrapper.querySelector('.math-captcha-input');
    const val = input ? input.value.trim() : '';
    return {
      present: true,
      answered: val !== '',
      correct: val !== '' && Number(val) === Number(wrapper.dataset.answer),
      question: (wrapper.querySelector('.math-question') || {}).textContent || '',
    };
  }

  // Guided form-filling metadata only exists for the renewal-license
  // form. Other services reach the apply page with different fields.
  function flowHasKnownFormSchema(flow) {
    if (typeof SERVICES !== 'undefined' && SERVICES[flow.serviceKey]) {
      return SERVICES[flow.serviceKey].formType === 'renewal-license';
    }
    return flow.serviceKey === 'renewal_driving_license' ||
           flow.serviceKey === 'international_driving_license';
  }

  function loadFlow() {
    try {
      return JSON.parse(sessionStorage.getItem(FLOW_STORAGE_KEY));
    } catch (e) { return null; }
  }
  function saveFlow(flow) {
    sessionStorage.setItem(FLOW_STORAGE_KEY, JSON.stringify(flow));
  }
  function clearFlow() {
    sessionStorage.removeItem(FLOW_STORAGE_KEY);
  }

  // First step index that lives on the given page.
  function firstStepIndexForPage(pageKey) {
    for (let i = 0; i < FLOW_STEPS.length; i++) {
      if (FLOW_STEPS[i].page === pageKey) return i;
    }
    return 0;
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
  // Robust argument extraction — handles every known Uplift AI
  // payload shape so tool calls never fail silently.
  function extractArgs(rawPayload) {
    let parsed;
    try {
      parsed = typeof rawPayload === 'string'
        ? JSON.parse(rawPayload)
        : rawPayload;
    } catch (e) {
      throw new Error('Payload not valid JSON: ' + rawPayload);
    }

    // Shape 1 — documented Uplift AI format
    if (parsed.arguments && parsed.arguments.raw_arguments) {
      return parsed.arguments.raw_arguments;
    }
    // Shape 2 — flat arguments object
    if (parsed.arguments && typeof parsed.arguments === 'object') {
      return parsed.arguments;
    }
    // Shape 3 — payload is args directly
    if (parsed.element_id || parsed.field_name ||
        parsed.page || parsed.service_key) {
      return parsed;
    }
    // Shape 4 — raw_arguments at top level
    if (parsed.raw_arguments) {
      return parsed.raw_arguments;
    }
    // Fallback
    console.warn('[Maryam] Unknown payload shape:', parsed);
    return parsed;
  }

  // Small transient badge showing which tool Maryam invoked
  function showToolBadge(text) {
    setStatus(text, true);
    setTimeout(() => setStatus('', false), 2500);
  }

  // Live snapshot of what the citizen can currently see/do — merged
  // into every get_page_context result and every page-update push.
  function buildLiveContext() {
    const pageKey = getCurrentPageKey();
    const live = { page: pageKey };

    const flow = loadFlow();
    if (flow) {
      const step = FLOW_STEPS[flow.stepIndex];
      live.guided_flow = {
        service_key: flow.serviceKey,
        mode: flow.mode,
        current_step: step ? step.id : 'done',
        step_number: flow.stepIndex + 1,
        total_steps: FLOW_STEPS.length,
      };
    }

    if (pageKey === 'services') {
      const activeCard = document.querySelector('.service-card-item.active-card');
      live.expanded_service = activeCard
        ? activeCard.getAttribute('data-service-key') : null;
      live.mode_selected =
        !!document.querySelector('.apply-option-card.active');
      live.apply_panel_open = !!document.querySelector('.service-expanded-panel');
    }

    if (pageKey === 'apply') {
      const params = new URLSearchParams(window.location.search);
      live.service = params.get('service');
      live.mode = params.get('mode');
      const values = {};
      ['fCnic', 'fLicenseNo', 'fIssuanceDate', 'fDuration', 'fPossession']
        .forEach(function (id) {
          const el = document.getElementById(id);
          if (el) values[id] = el.value || '';
        });
      live.form_values = values;
      live.success_shown =
        !!document.getElementById('successView') &&
        document.getElementById('successView').style.display === 'block';
    }

    return live;
  }

  function handleGetPageContext() {
    const pageKey = getCurrentPageKey();
    const config = SITE_CONFIG[pageKey] || { page: pageKey, notes: 'No config.' };
    return { ...config, live: buildLiveContext() };
  }

  // Guided flow entry point: initializes the step tracker anchored at
  // the current page and executes the first step — POINTING at the
  // element the citizen must click and WAITING for their click.
  // Maryam never clicks for the citizen.
  async function handleStartService(payload) {
    const serviceKey = payload.service_key;
    const mode = payload.mode === 'doorstep' ? 'doorstep' : 'online';

    console.log('[Maryam] start_service (guided):', serviceKey, mode);
    showToolBadge('🧭 ' + serviceKey + ' / ' + mode);

    const currentPage = getCurrentPageKey();
    const flow = {
      serviceKey: serviceKey,
      mode: mode,
      stepIndex: firstStepIndexForPage(currentPage),
      startedAt: Date.now(),
    };
    saveFlow(flow);

    return JSON.stringify(await executeCurrentFlowStep());
  }

  // Executes the flow's current step and advances state on the
  // citizen's click. Detects page mismatches and re-anchors.
  async function executeCurrentFlowStep(isRetryAfterMismatch) {
    const flow = loadFlow();
    if (!flow) {
      return {
        active: false,
        presentationInstructions:
          'Koi guided flow active nahi hai. Pehle start_service call karein.',
      };
    }

    const step = FLOW_STEPS[flow.stepIndex];
    if (!step) {
      clearFlow();
      return {
        active: false,
        completed: true,
        presentationInstructions:
          'Guided flow mukammal ho gaya hai. Kya aur madad chahiye?',
      };
    }

    const currentPage = getCurrentPageKey();

    // ── Mismatch recovery: re-anchor the flow to the page the
    //    citizen actually sees, then continue from there. ──────
    if (step.page !== currentPage) {
      if (isRetryAfterMismatch) {
        return {
          active: true,
          page_mismatch: true,
          expected_page: step.page,
          current_page: currentPage,
          presentationInstructions:
            'User expected page par nahi hai. Unhe batayein ke woh "' +
            step.page + '" page par jayen, ya start_service dobara call karein.',
        };
      }
      const reAnchored = firstStepIndexForPage(currentPage);
      console.warn(
        '[Maryam] Flow mismatch: expected', step.page,
        'but on', currentPage, '— re-anchoring to step', reAnchored
      );
      flow.stepIndex = reAnchored;
      saveFlow(flow);
      const result = await executeCurrentFlowStep(true);
      result.page_mismatch_recovered = true;
      result.note = 'User was on ' + currentPage + ' instead of ' + step.page +
        '; flow re-anchored to step "' + FLOW_STEPS[reAnchored].id + '".';
      return result;
    }

    // ── Form step (apply page): hand over to fill_field flow ──
    if (step.form) {
      const live = buildLiveContext();

      if (!flowHasKnownFormSchema(flow)) {
        // Unknown form schema — guide generically, don't invent fields.
        return {
          active: true,
          step: 'form',
          known_schema: false,
          live: live,
          presentationInstructions:
            'Application form khul gaya hai, lekin is service ke form ki ' +
            'poori guidance abhi available nahi. get_page_context se live ' +
            'form values dekhein aur user ko form khud bharne mein zubaani ' +
            'madad dein. Jab form mukammal ho, guide_next_step call karein.',
        };
      }

      const values = (live.form_values) || {};
      const missing = RENEWAL_FORM_FIELD_IDS.filter(function (id) {
        return !(values[id] && String(values[id]).trim());
      });

      if (missing.length === 0) {
        // All fields filled — advance to the captcha step.
        flow.stepIndex += 1;
        saveFlow(flow);
        return executeCurrentFlowStep(isRetryAfterMismatch);
      }

      const apply = SITE_CONFIG.apply;
      return {
        active: true,
        step: 'form',
        known_schema: true,
        live: live,
        fields: apply.fields,
        remaining_fields: missing,
        presentationInstructions:
          'Application form khul gaya hai. Fields ek ek kar ke bharein: ' +
          'har field ke liye user se value poochhein, verbally confirm karein, ' +
          'phir fill_field call karein. Abhi yeh fields baqi hain: ' +
          missing.join(', ') + '. Sab bharne ke baad guide_next_step call ' +
          'karein — main captcha aur submit khud dikhaungi.',
      };
    }

    // ── Captcha step: NON-BLOCKING — advance only when answer is correct ──
    if (step.captcha) {
      const captcha = getCaptchaState();
      if (captcha.correct) {
        // Already answered correctly — advance immediately.
        flow.stepIndex += 1;
        saveFlow(flow);
        return executeCurrentFlowStep(isRetryAfterMismatch);
      }

      // Point at the captcha area and return immediately.
      // The click listener does NOT advance stepIndex — the agent must
      // call guide_next_step() again to re-check the answer.
      try {
        const el = await waitForElement('.math-captcha-wrapper', 5000);
        await movePointerTo(el);
        triggerPulse();

        const myOp = ++pointOpSeq;
        if (activePointCancel) activePointCancel('superseded by captcha step');

        const onClickOnce = function () {
          el.removeEventListener('click', onClickOnce, true);
          if (myOp !== pointOpSeq) return;
          activePointCancel = null;
          // Do NOT advance stepIndex — captcha may still be wrong.
          // Just notify the agent to re-check.
          const state = getCaptchaState();
          if (!maryamRoom || !maryamConnected) return;
          const msg =
            '[CLICK: captcha] (system message) Citizen interacted with the captcha. ' +
            'Captcha is ' + (state.correct ? 'CORRECT' : 'still wrong or empty') + '. ' +
            'Call guide_next_step() to check the answer and proceed.';
          maryamRoom.localParticipant
            .sendText(msg, { topic: 'lk.chat' })
            .catch(function () {});
        };
        el.addEventListener('click', onClickOnce, true);
        activePointCancel = function (reason) {
          el.removeEventListener('click', onClickOnce, true);
          activePointCancel = null;
          console.log('[Maryam] Captcha listener removed:', reason);
        };
      } catch (err) {
        console.error('[Maryam] Captcha element not found:', err.message);
      }

      return {
        active: true,
        step: 'captcha',
        captcha_correct: false,
        captcha_answered: captcha.answered,
        captcha_question: captcha.question,
        pointed: true,
        waiting_for_click: true,
        presentationInstructions:
          'Screen par captcha highlight ho gaya hai. User ko batayein ke ' +
          '"' + (captcha.question || 'security sawal') + '" ka jawab khud type karein — ' +
          'aap jawab mat batayein. Jab woh type kar lein aur [CLICK: captcha] ' +
          'message aaye, guide_next_step call karein taake main check kar sakoon.',
      };
    }

    // ── Finish step: confirm submission or report errors ──────
    if (step.finish) {
      const live = buildLiveContext();
      if (live.success_shown) {
        clearFlow();
        const idEl = document.getElementById('successAppId');
        const appId = idEl ? idEl.textContent.trim() : '';
        return {
          active: false,
          completed: true,
          application_id: appId,
          presentationInstructions:
            'Mubarak ho! Application kamyabi se submit ho gayi hai. ' +
            'User ko Application ID zaroor bata dein: ' +
            (appId || 'jo screen par nazar aa rahi hai') +
            ' — digits ek ek kar ke parhein. ' +
            '(Yeh demo hai — asli application file nahi hui.)',
        };
      }
      // Submission failed validation — return to the ACTUAL failing
      // step: incorrect captcha goes back to the captcha step;
      // field errors go back to the form step.
      const errorBox = document.getElementById('formError');
      const errors = errorBox && !errorBox.classList.contains('d-none')
        ? errorBox.textContent.trim() : '';
      const captcha = getCaptchaState();
      const captchaError =
        document.querySelector('.math-captcha-wrapper .captcha_error');
      const captchaFailed = !captcha.correct ||
        (captchaError && captchaError.style.display !== 'none');
      const failingStepId = captchaFailed && !errors ? 'captcha' : 'form';
      flow.stepIndex = FLOW_STEPS.findIndex(function (s) {
        return s.id === failingStepId;
      });
      saveFlow(flow);
      return {
        active: true,
        step: 'finish',
        submitted: false,
        failing_step: failingStepId,
        captcha_correct: captcha.correct,
        validation_errors: errors || (captchaFailed
          ? 'captcha answer wrong or empty' : 'unknown (form did not submit)'),
        presentationInstructions: captchaFailed && !errors
          ? 'Form submit nahi hua kyunke security sawal ka jawab ghalat ya ' +
            'khaali tha. User ko batayein ke captcha dobara hal karein ' +
            '(jawab aap na batayein), phir guide_next_step call karein.'
          : 'Form submit nahi hua — errors: "' + (errors || 'fields') +
            '". User ko masla samjhayein, ghalat fields theek karwayein ' +
            '(fill_field se), phir guide_next_step call karein.',
      };
    }

    // ── Pointing step: NON-BLOCKING — point and return immediately ──
    //
    // The RPC returns as soon as the pointer is positioned. A one-time
    // click listener fires when the citizen clicks:
    //  • persists flow state (before any navigation tears the page down)
    //  • sends a [CLICK] text message so the agent knows what happened
    //    and what to do next WITHOUT needing the RPC to still be alive.
    let selector = step.selector(flow);
    if (!document.querySelector(selector) && step.fallbackSelector) {
      selector = step.fallbackSelector;
    }

    try {
      const el = await waitForElement(selector, 8000);
      await movePointerTo(el);
      triggerPulse();

      const myOp = ++pointOpSeq;
      if (activePointCancel) activePointCancel('superseded by guided step');

      // One-time click listener — fires when citizen clicks the element.
      const onClickOnce = function () {
        el.removeEventListener('click', onClickOnce, true);
        if (myOp !== pointOpSeq) return; // operation superseded
        activePointCancel = null;
        hidePointer();

        // Persist state BEFORE navigation can unload the page.
        flow.stepIndex += 1;
        saveFlow(flow);
        if (step.navigates) {
          const saved = loadSavedSession();
          if (saved) saveSession({ ...saved, agentNavigated: true });
        }

        // Send a [CLICK] notification — fire-and-forget.
        // This reaches the agent even if the connection drops a moment
        // later during navigation, because it's in flight before unload.
        sendClickNotification(step, flow);
      };
      el.addEventListener('click', onClickOnce, true);

      // Allow the next point call (or page unload) to clean up the listener.
      activePointCancel = function (reason) {
        el.removeEventListener('click', onClickOnce, true);
        activePointCancel = null;
        console.log('[Maryam] Click listener removed:', reason);
      };

    } catch (err) {
      console.error('[Maryam] Could not point at', selector, err.message);
      return {
        active: true,
        step: step.id,
        pointed: false,
        error: err.message,
        presentationInstructions:
          'Element screen par nahi mila: ' + selector + '. ' +
          'User ko manually navigate karne mein madad karein, ' +
          'ya guide_next_step dobara call karein.',
      };
    }

    return {
      active: true,
      step: step.id,
      pointed: true,
      waiting_for_click: true,
      presentationInstructions:
        (step.say_now ||
          'Screen par ek green button highlight ho gaya hai. ' +
          'User ko batayein ke woh highlighted element par click karein.') +
        ' Jab woh click karein ge, aapko "[CLICK: ' + step.id + ']" ' +
        'message aayega — uss ke baad agle instructions follow karein.',
    };
  }

  // Fire-and-forget: sends a [CLICK] message to the agent so it knows
  // what happened without relying on the RPC still being alive.
  // For navigating steps the message tells the agent to wait for
  // [PAGE UPDATE]; for non-navigating steps it tells it to call
  // guide_next_step immediately.
  function sendClickNotification(step, flow) {
    const nextStep = FLOW_STEPS[flow.stepIndex];
    let msg =
      '[CLICK: ' + step.id + '] (system message — citizen clicked the highlighted element.) ' +
      (step.say_after ? 'Say: "' + step.say_after + '". ' : '');

    if (step.navigates) {
      msg +=
        'The page is now navigating to the next screen. ' +
        'Do NOT call any tool right now — just speak the above line. ' +
        'Wait for the next [PAGE UPDATE] message, then IMMEDIATELY ' +
        'call guide_next_step() and tell the citizen (in Urdu) what to do next.';

      // ── Persist the [CLICK] notification in sessionStorage ──────────────
      // Native link navigation tears down the WebSocket before sendText()
      // can flush. Storing the message here guarantees the next page's
      // pushPageContext will deliver it to the agent after reconnect.
      try {
        sessionStorage.setItem(PENDING_CLICK_KEY, JSON.stringify({
          msg: msg,
          stepId: step.id,
          savedAt: Date.now(),
        }));
      } catch (e) {
        console.warn('[Maryam] Could not save pending click to sessionStorage:', e);
      }
    } else {
      msg +=
        'The citizen is still on the same page. ' +
        'Next step is "' + (nextStep ? nextStep.id : 'done') + '". ' +
        'Speak the line above, then call guide_next_step() immediately.';
    }

    // Also try sending immediately (may succeed if WebSocket is still up)
    if (!maryamRoom || !maryamConnected) return;
    maryamRoom.localParticipant
      .sendText(msg, { topic: 'lk.chat' })
      .catch(function (err) {
        console.warn('[Maryam] sendClickNotification text failed (will replay via sessionStorage on next page):', err);
        maryamRoom.localParticipant
          .publishData(new TextEncoder().encode(msg), { reliable: true, topic: 'lk.chat' })
          .catch(function (e2) {
            console.warn('[Maryam] sendClickNotification data also failed:', e2);
          });
      });
  }

  async function handleGuideNextStep() {
    showToolBadge('🧭 اگلا قدم');
    return executeCurrentFlowStep();
  }

  function handleNavigateToPage(payload) {
    const urlMap = {
      services: 'services.html',
      apply: 'apply.html',
      homepage: 'index.html',
    };
    const url = urlMap[payload.page];
    if (!url) return { navigated: false, error: 'Unknown page: ' + payload.page };

    // Flag so the next page auto-reconnects without another click
    const saved = loadSavedSession();
    if (saved) saveSession({ ...saved, agentNavigated: true });

    window.location.href = url;
    return { navigated: true, target: url };
  }

  // Only one point operation may be active at a time. A new point call
  // (or page unload) cancels the previous one so its listeners are removed
  // and its RPC resolves instead of hanging forever.
  let activePointCancel = null;

  window.addEventListener('beforeunload', () => {
    if (activePointCancel) activePointCancel('page unload');
  });

  async function handlePointToElement(payload) {
    return pointAndWaitForClick(payload.element_id, null);
  }

  // Shared point-and-wait engine: moves the pointer to the element,
  // shows the Urdu prompt, and resolves only when the citizen clicks
  // it themselves (or the operation is cancelled/superseded).
  // `onClicked` (optional) runs synchronously inside the click handler,
  // before resolution — used by guided flows to persist state before
  // a navigation tears the page down.
  // Generation token: every new point operation invalidates all older
  // ones, including those still awaiting waitForElement — otherwise a
  // stale operation whose element appears late could steal
  // activePointCancel from the live one.
  let pointOpSeq = 0;

  async function pointAndWaitForClick(selector, onClicked) {
    const myOp = ++pointOpSeq;
    if (activePointCancel) activePointCancel('superseded by new point_to_element');

    try {
      const el = await waitForElement(selector);
      if (myOp !== pointOpSeq) {
        return { clicked: false, cancelled: true, element_id: selector,
                 reason: 'superseded while waiting for element' };
      }

      // Move the animated green pointer to the element
      await movePointerTo(el);
      triggerPulse();

      // Show Urdu status
      const labelMap = {};
      const pageConfig = SITE_CONFIG[getCurrentPageKey()];
      if (pageConfig && pageConfig.elements) {
        pageConfig.elements.forEach((e) => {
          labelMap[e.element_id] = e.label_ur || e.label_en || e.label;
        });
      }
      const label = labelMap[selector] || selector;
      setStatus('یہاں کلک کریں: ' + label);

      // Wait for the CITIZEN to click the element (not auto-click).
      // Maryam POINTS and WAITS — the citizen does the clicking.
      return await new Promise((resolve) => {
        let removalWatcher = null;

        function cleanup() {
          window.removeEventListener('scroll', reposition, true);
          window.removeEventListener('resize', reposition);
          el.removeEventListener('click', onClick, true);
          if (removalWatcher) removalWatcher.disconnect();
          if (activePointCancel === cancel) activePointCancel = null;
          hidePointer();
          setStatus('', false);
        }

        function cancel(reason) {
          cleanup();
          resolve({ clicked: false, cancelled: true, element_id: selector, reason: reason });
        }
        activePointCancel = cancel;

        function reposition() {
          const rect = el.getBoundingClientRect();
          const pointer = document.getElementById('maryam-pointer');
          if (!pointer) return;
          pointer.style.left = (rect.left + rect.width / 2 - 22) + 'px';
          pointer.style.top = (rect.top + rect.height / 2 - 22) + 'px';
        }

        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);

        // If the target is removed from the DOM (dynamic panels), resolve
        // with an error instead of waiting forever.
        removalWatcher = new MutationObserver(() => {
          if (!document.body.contains(el)) {
            cancel('element removed from page');
          }
        });
        removalWatcher.observe(document.body, { childList: true, subtree: true });

        function onClick() {
          cleanup();
          try {
            if (onClicked) onClicked();
          } catch (e) {
            console.error('[Maryam] onClicked callback failed:', e);
          }
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

      if (el.tagName === 'SELECT') {
        // Select-aware fill: match an option by value or label
        // (case-insensitive), select it once, and fire events once.
        const wanted = String(value).trim().toLowerCase();
        const match = Array.from(el.options).find(
          (opt) =>
            opt.value.trim().toLowerCase() === wanted ||
            opt.textContent.trim().toLowerCase() === wanted
        );
        if (!match) {
          el.classList.remove('field-highlight');
          hidePointer();
          const options = Array.from(el.options)
            .map((o) => o.textContent.trim())
            .filter(Boolean);
          return {
            filled: false,
            field_name: fieldId,
            error: 'No option matches "' + value + '". Valid options: ' + options.join(' | '),
          };
        }
        el.focus();
        el.value = match.value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        await delay(300);
        el.classList.remove('field-highlight');
        hidePointer();
        return { field_name: fieldId, value: match.textContent.trim(), filled: true };
      }

      if (el.type === 'date') {
        // Date inputs reject partial values — set once (expects YYYY-MM-DD).
        el.focus();
        el.value = String(value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        const ok = el.value === String(value);
        await delay(300);
        el.classList.remove('field-highlight');
        hidePointer();
        return ok
          ? { field_name: fieldId, value: value, filled: true }
          : { filled: false, field_name: fieldId, error: 'Invalid date value "' + value + '" — use YYYY-MM-DD.' };
      }

      // Typewriter fill — character by character (text-like inputs)
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
    // Proxied through server.js so the API key never touches the browser.
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantName: 'Citizen' }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error('Session creation failed: ' + res.status +
        (body.error ? ' — ' + body.error : ''));
    }
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
  //
  // Two browser constraints shape this section:
  //  1. Mic — Chrome blocks AudioContext creation unless it happens in
  //     a user-gesture handler, so we connect on mic-button click.
  //  2. Audio playback — Maryam's voice arrives as a LiveKit remote
  //     audio track that must be attached to an <audio> element and
  //     played, or her responses are silently discarded.
  // -------------------------------------------------------------------
  let maryamRoom = null;
  let maryamConnected = false;
  let maryamAudioPlaying = false; // tracks whether Maryam's audio element is unblocked

  // Build a human-readable briefing of the active guided flow so the
  // agent can resume cleanly even if the prior [CLICK] message was lost.
  function buildFlowBriefing(flow) {
    const step = FLOW_STEPS[flow.stepIndex] || {};
    const doneSteps = FLOW_STEPS.slice(0, flow.stepIndex).map(function (s) { return s.id; });
    const serviceLabel = 'Regular Driving License Renewal';
    const modeLabel = flow.mode === 'doorstep'
      ? 'Doorstep Service (a facilitator collects documents at home)'
      : 'Self Service (apply online, collect final documents from office)';
    return (
      'FULL SITUATION: The citizen wants to apply for "' + serviceLabel + '" via ' +
      modeLabel + '. ' +
      'Steps already completed: [' + (doneSteps.join(', ') || 'none') + ']. ' +
      'Current step is "' + (step.id || '?') + '" on the "' + (step.page || '?') + '" page. ' +
      (step.say_now
        ? 'If the citizen asks what to do next, say (in Urdu): "' + step.say_now + '" — ' +
          'but only AFTER calling guide_next_step() and speaking its presentationInstructions. '
        : '') +
      'After guide_next_step() returns, IMMEDIATELY speak its presentationInstructions field — ' +
      'do not paraphrase, do not add preamble.'
    );
  }

  // Proactively tells the agent which page the citizen is on (and the
  // guided-flow state) so it never gives instructions for the wrong page.
  // Also replays any [CLICK] notification that was stored in sessionStorage
  // (the click notification races with page unload and may not have reached
  // the agent in time, so we store it and send it reliably here).
  async function pushPageContext(reason) {
    if (!maryamRoom || !maryamConnected) return;

    // ── Replay stored [CLICK] notification first (pre-navigation) ──────
    try {
      const raw = sessionStorage.getItem(PENDING_CLICK_KEY);
      if (raw) {
        sessionStorage.removeItem(PENDING_CLICK_KEY);
        const pending = JSON.parse(raw);
        // Discard if stale (> 60 s — the room TTL makes this very generous)
        if (pending.msg && (Date.now() - (pending.savedAt || 0)) < 60000) {
          console.log('[Maryam] Replaying stored [CLICK] notification:', pending.stepId);
          try {
            await maryamRoom.localParticipant.sendText(pending.msg, { topic: 'lk.chat' });
          } catch (_) {}
          // Brief pause so the agent processes [CLICK] before [PAGE UPDATE]
          await delay(200);
        }
      }
    } catch (e) {
      console.warn('[Maryam] Could not replay pending click:', e);
    }

    const live = buildLiveContext();
    let text;

    if (live.guided_flow) {
      // Lead with the imperative so the agent calls guide_next_step before
      // generating any speech. Follow with a full self-contained briefing so
      // the agent can resume correctly even without prior conversation context.
      const flow = loadFlow();
      const briefing = flow ? buildFlowBriefing(flow) : '';
      text =
        '[PAGE UPDATE — ACTION REQUIRED] ' +
        'CALL guide_next_step() NOW before speaking anything. ' +
        briefing + ' ' +
        'Guided flow "' + live.guided_flow.service_key +
        '" is ACTIVE at step "' + live.guided_flow.current_step +
        '" (' + live.guided_flow.step_number + '/' + live.guided_flow.total_steps + '). ' +
        'Citizen is now on the "' + live.page + '" page (' + reason + '). ' +
        'Technical context: ' + JSON.stringify(live);
    } else {
      text =
        '[PAGE UPDATE — system message, not the citizen speaking] ' +
        'Citizen is now on the "' + live.page + '" page (' + reason + '). ' +
        'No guided flow is active. Greet the citizen and ask how you can help. ' +
        'If they want a service, call start_service. ' +
        'Live context: ' + JSON.stringify(live);
    }

    try {
      await maryamRoom.localParticipant.sendText(text, { topic: 'lk.chat' });
      console.log('[Maryam] Page context pushed via text stream:', live.page);
    } catch (err) {
      console.warn('[Maryam] sendText failed, trying publishData:', err);
      try {
        await maryamRoom.localParticipant.publishData(
          new TextEncoder().encode(text),
          { reliable: true, topic: 'lk.chat' }
        );
        console.log('[Maryam] Page context pushed via data packet');
      } catch (err2) {
        console.error('[Maryam] Page context push failed entirely:', err2);
      }
    }
  }

  function attachAudioTrack(track) {
    const audioEl = track.attach();
    audioEl.id = 'maryam-audio-output';
    // Must be in the DOM for some browsers to play
    audioEl.style.display = 'none';
    document.body.appendChild(audioEl);
    maryamAudioPlaying = false;

    var retryHandlers = [];

    function onPlaySuccess() {
      if (maryamAudioPlaying) return;
      maryamAudioPlaying = true;
      clearAudioNudge();
      // Remove all retry listeners
      retryHandlers.forEach(function (h) {
        document.removeEventListener(h.evt, h.fn, true);
      });
      retryHandlers = [];
      console.log('[Maryam] Audio playback started');
    }

    function retryPlay() {
      if (maryamAudioPlaying) return;
      audioEl.play().then(onPlaySuccess).catch(function () {});
    }

    // Expose so voice-activity handler can also trigger it
    window._maryamRetryAudio = retryPlay;

    audioEl.play().then(onPlaySuccess).catch(function (err) {
      console.warn('[Maryam] Autoplay blocked — registering multi-gesture retry:', err.name);
      // Retry on any user gesture — click, touch, or keypress
      ['click', 'touchstart', 'keydown'].forEach(function (evtName) {
        var handler = function () { retryPlay(); };
        retryHandlers.push({ evt: evtName, fn: handler });
        document.addEventListener(evtName, handler, { capture: true });
      });
      // Show a visible "tap to hear" nudge after 3 seconds if still blocked
      setTimeout(function () {
        if (!maryamAudioPlaying) showAudioNudge(retryPlay);
      }, 3000);
    });
  }

  // Nudge badge shown when audio is blocked after page navigation
  function showAudioNudge(retryFn) {
    if (document.getElementById('maryam-audio-nudge')) return;
    var nudge = document.createElement('div');
    nudge.id = 'maryam-audio-nudge';
    nudge.setAttribute('style', [
      'position:fixed', 'bottom:90px', 'right:20px',
      'background:#1a5c2e', 'color:#fff', 'padding:10px 18px',
      'border-radius:24px', 'font-size:13px', 'font-weight:600',
      'z-index:99999', 'cursor:pointer',
      'box-shadow:0 4px 14px rgba(0,0,0,.35)',
      'animation:maryamNudgePulse 1.5s ease-in-out infinite',
      'direction:rtl', 'font-family:inherit'
    ].join(';'));
    nudge.textContent = '🔊 مریم کی آواز سننے کے لیے یہاں ٹیپ کریں';
    nudge.addEventListener('click', function () {
      retryFn();
      clearAudioNudge();
    });
    document.body.appendChild(nudge);

    // Inject keyframe animation once
    if (!document.getElementById('maryam-nudge-anim')) {
      var st = document.createElement('style');
      st.id = 'maryam-nudge-anim';
      st.textContent =
        '@keyframes maryamNudgePulse{' +
        '0%,100%{opacity:1;transform:scale(1)}' +
        '50%{opacity:.88;transform:scale(1.05)}}';
      document.head.appendChild(st);
    }
  }

  function clearAudioNudge() {
    var el = document.getElementById('maryam-audio-nudge');
    if (el) el.remove();
  }

  async function connectAndRegisterTools() {
    if (typeof LivekitClient === 'undefined') {
      throw new Error('LivekitClient not loaded');
    }

    const micBtn = document.getElementById('maryam-mic-btn');
    console.log('[Maryam] Getting session...');

    const session = await getOrResumeSession();
    console.log('[Maryam] Session ready. wsUrl:', session.wsUrl ? 'ok' : 'MISSING');

    const room = new LivekitClient.Room();
    maryamRoom = room;

    // ── Register RPC tools ──────────────────────────────────
    room.localParticipant.registerRpcMethod(
      'get_page_context',
      async () => JSON.stringify(handleGetPageContext())
    );
    room.localParticipant.registerRpcMethod(
      'navigate_to_page',
      async (data) => {
        const payload = JSON.parse(data.payload);
        const args = payload.arguments ? payload.arguments.raw_arguments : payload;
        return JSON.stringify(handleNavigateToPage(args));
      }
    );
    room.localParticipant.registerRpcMethod(
      'point_to_element',
      async (data) => {
        const payload = JSON.parse(data.payload);
        const args = payload.arguments ? payload.arguments.raw_arguments : payload;
        return JSON.stringify(await handlePointToElement(args));
      }
    );
    room.localParticipant.registerRpcMethod(
      'fill_field',
      async (data) => {
        const payload = JSON.parse(data.payload);
        const args = payload.arguments ? payload.arguments.raw_arguments : payload;
        return JSON.stringify(await handleFillField(args));
      }
    );
    room.localParticipant.registerRpcMethod(
      'scroll_to_element',
      async (data) => {
        const payload = JSON.parse(data.payload);
        const args = payload.arguments ? payload.arguments.raw_arguments : payload;
        const selector = args.element_id;
        const el = document.querySelector(selector);
        if (!el) {
          return JSON.stringify({
            scrolled: false,
            error: 'Element not found: ' + selector,
          });
        }
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await delay(700);
        return JSON.stringify({ scrolled: true, element_id: selector });
      }
    );
    room.localParticipant.registerRpcMethod(
      'guide_next_step',
      async () => {
        console.log('[Maryam RPC] guide_next_step called');
        try {
          return JSON.stringify(await handleGuideNextStep());
        } catch (err) {
          console.error('[Maryam RPC] guide_next_step error:', err);
          return JSON.stringify({
            error: err.message,
            presentationInstructions: 'Ek masla aaya. Dobara koshish karte hain.',
          });
        }
      }
    );
    room.localParticipant.registerRpcMethod(
      'start_service',
      async (data) => {
        console.log('[Maryam RPC] start_service raw:', data.payload);
        try {
          const args = extractArgs(data.payload);
          console.log('[Maryam RPC] start_service args:', args);
          const result = await handleStartService(args);
          console.log('[Maryam RPC] start_service done');
          return result;
        } catch (err) {
          console.error('[Maryam RPC] start_service error:', err);
          return JSON.stringify({
            error: err.message,
            presentationInstructions:
              'Ek masla aaya. Dobara koshish karte hain.',
          });
        }
      }
    );

    // ── Connect to room ─────────────────────────────────────
    await room.connect(session.wsUrl, session.token);
    console.log('[Maryam] Room connected on:', getCurrentPageKey());

    // ── Diagnostics: connection state + disconnect handling ──
    room.on(LivekitClient.RoomEvent.ConnectionStateChanged, (state) => {
      console.log('[Maryam] Connection state:', state);
    });

    room.on(LivekitClient.RoomEvent.Disconnected, (reason) => {
      console.warn('[Maryam] Disconnected:', reason);
      maryamConnected = false;
      const btn = document.getElementById('maryam-mic-btn');
      if (btn) {
        btn.textContent = '⚠️';
        btn.style.background = '#e53e3e';
        btn.title = 'کنکشن ٹوٹ گیا — دوبارہ کلک کریں';
      }
      setStatus('کنکشن ٹوٹ گیا — دوبارہ کلک کریں', true);
    });

    // ── Speaking indicators: log + visual feedback ───────────
    room.on(LivekitClient.RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const names = speakers.map((s) =>
        s.isLocal ? 'USER' : 'MARYAM:' + s.identity
      );
      if (names.length > 0) {
        console.log('[Maryam] Speaking:', names.join(', '));
      }

      const userSpeaking = speakers.some((s) => s.isLocal);
      const agentSpeaking = speakers.some((s) => !s.isLocal);
      const btn = document.getElementById('maryam-mic-btn');

      if (userSpeaking) {
        // User speaking = user gesture context → safe to unlock audio
        if (!maryamAudioPlaying && window._maryamRetryAudio) {
          window._maryamRetryAudio();
        }
        setStatus('سن رہی ہوں...', true);
        if (btn) btn.style.boxShadow = '0 0 0 8px rgba(22,123,56,0.3)';
      } else if (agentSpeaking) {
        setStatus('مریم بول رہی ہے...', true);
        if (btn) btn.style.boxShadow = '0 0 0 8px rgba(22,123,56,0.1)';
      } else {
        setStatus('', false);
        if (btn) btn.style.boxShadow = '0 4px 16px rgba(22,123,56,0.5)';
      }
    });

    // ── Attach incoming audio (Maryam's voice) ──────────────
    room.on(LivekitClient.RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === LivekitClient.Track.Kind.Audio) {
        console.log('[Maryam] Audio track received — attaching playback');
        attachAudioTrack(track);
      }
    });

    room.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track) => {
      if (track.kind === LivekitClient.Track.Kind.Audio) {
        track.detach().forEach((el) => el.remove());
        console.log('[Maryam] Audio track detached and removed');
      }
    });

    // Handle tracks already subscribed before the listener was added
    // (can happen on session resume)
    room.remoteParticipants.forEach((participant) => {
      participant.trackPublications.forEach((pub) => {
        if (pub.track && pub.track.kind === LivekitClient.Track.Kind.Audio) {
          attachAudioTrack(pub.track);
        }
      });
    });

    // ── Enable mic (user gesture context — safe here) ───────
    // Explicit constraints: clean mono 48kHz — what LiveKit's
    // server-side VAD expects. Browser defaults vary and can
    // cause VAD to miss speech entirely.
    await room.localParticipant.setMicrophoneEnabled(true, {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000,
      channelCount: 1,
    });
    console.log('[Maryam] Microphone enabled');

    // Confirm mic track is actually published
    const micTrack = room.localParticipant.getTrackPublication(
      LivekitClient.Track.Source.Microphone
    );
    if (micTrack && micTrack.track) {
      console.log('[Maryam] Mic track published successfully. Muted:', micTrack.isMuted);
    } else {
      console.error('[Maryam] Mic track NOT published — user audio will not reach Maryam');
    }

    maryamConnected = true;

    // Update button to connected state
    if (micBtn) {
      micBtn.classList.remove('connecting');
      micBtn.classList.add('connected');
      micBtn.textContent = '🎤';
      micBtn.style.background = '#167B38';
      micBtn.disabled = false;
      micBtn.title = 'مریم سن رہی ہے — کلک کریں مائیک بند کرنے کے لیے';
    }

    setStatus('مریم تیار ہے — بولیں', true);

    // Tell the agent what page it's on — critical after guided
    // navigation so it resumes the flow instead of guessing.
    const saved = loadSavedSession();
    const arrivedViaAgentNav = !!(saved && saved.agentNavigated);
    if (arrivedViaAgentNav) {
      // Consume the flag so a manual reload later doesn't auto-reconnect.
      saveSession({ ...saved, agentNavigated: false });
    }
    // Small delay so the remote agent participant is fully joined.
    await delay(1500);
    await pushPageContext(
      arrivedViaAgentNav ? 'arrived after guided navigation' : 'session connected'
    );

    await delay(500);
    setStatus('', false);
  }

  // -------------------------------------------------------------------
  // SECTION 9 — Boot on DOMContentLoaded
  //
  // Only injects UI on load. Connects on mic-button click (the user
  // gesture). Auto-reconnects only when the agent itself navigated to
  // this page (agentNavigated flag) — the original click on the first
  // page already satisfied the gesture requirement for this tab.
  // -------------------------------------------------------------------
  function bindMicButton() {
    const micBtn = document.getElementById('maryam-mic-btn');
    if (!micBtn) return;

    micBtn.classList.remove('connecting');
    micBtn.textContent = '🎤';
    micBtn.title = 'مریم سے بات کریں';

    micBtn.addEventListener('click', async () => {
      // If already connected — toggle mute
      if (maryamConnected && maryamRoom) {
        const isOn = maryamRoom.localParticipant.isMicrophoneEnabled;
        await maryamRoom.localParticipant.setMicrophoneEnabled(!isOn);
        micBtn.textContent = !isOn ? '🎤' : '🔇';
        micBtn.style.background = !isOn ? '#167B38' : '#e53e3e';
        setStatus(!isOn ? 'مائیک آن' : 'مائیک آف', true);
        await delay(1500);
        setStatus('', false);
        return;
      }

      // First click — connect (this IS the user gesture)
      micBtn.disabled = true;
      micBtn.textContent = '⏳';
      micBtn.classList.add('connecting');
      setStatus('مریم سے جڑ رہے ہیں...', true);

      try {
        await connectAndRegisterTools();
      } catch (err) {
        console.error('[Maryam] Connection failed:', err);
        micBtn.classList.remove('connecting');
        micBtn.textContent = '⚠️';
        micBtn.style.background = '#e53e3e';
        micBtn.disabled = false;
        setStatus('کنکشن ناکام — دوبارہ کلک کریں', true);
        // A stale saved session may be the cause — clear it so the
        // retry click creates a fresh one.
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    injectPointerStylesOnce();
    injectPointerElements();
    bindMicButton();

    // Auto-reconnect only if the agent navigated us here
    const saved = loadSavedSession();
    if (saved && saved.token && saved.wsUrl && saved.agentNavigated) {
      setTimeout(async () => {
        setStatus('مریم سے دوبارہ جڑ رہے ہیں...', true);
        const micBtn = document.getElementById('maryam-mic-btn');
        if (micBtn) {
          micBtn.textContent = '⏳';
          micBtn.classList.add('connecting');
        }
        try {
          await connectAndRegisterTools();
        } catch (err) {
          console.error('[Maryam] Auto-reconnect with saved session failed:', err);
          // Saved session token may have expired — clear it and try fresh.
          sessionStorage.removeItem(SESSION_STORAGE_KEY);
          try {
            console.log('[Maryam] Retrying with a fresh session...');
            await connectAndRegisterTools();
          } catch (err2) {
            console.error('[Maryam] Fresh-session auto-reconnect also failed:', err2);
            if (micBtn) {
              micBtn.textContent = '⚠️';
              micBtn.classList.remove('connecting');
            }
            setStatus('کنکشن ناکام — مائیک بٹن دبائیں', true);
          }
        }
      }, 800);
    }
  });
})();
