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
  // Applies to every guided step on every page — repeated here once
  // instead of on every single tool result, since the model does not
  // always re-read older context.
  //
  // CRITICAL #1: every tool result's presentationInstructions contains a
  // line you must SPEAK OUT LOUD, in the SAME turn as the tool call. Never
  // just move the pointer/highlight silently and wait — the citizen has
  // no way to know what the highlight means without you saying it.
  //
  // CRITICAL #2: when a step completes, do NOT thank or praise the
  // citizen for the previous click ("shabash", "bohat acha", etc.) before
  // moving on. Go straight to the next action: "Ab agla qadam yeh hai: ...".
  const GUIDED_FLOW_RULES =
    'CRITICAL: (1) Every time you point at or highlight something, you ' +
    'MUST speak the matching line from presentationInstructions in that ' +
    'same turn — never highlight silently and wait for the citizen to ' +
    'ask what happened. (2) After the citizen completes a step, do not ' +
    'thank or praise them for it — go straight to the next instruction ' +
    '("Ab agla qadam yeh hai: ...").';

  const SITE_CONFIG = {

    homepage: {
      page: 'homepage',
      instruction: GUIDED_FLOW_RULES + ' ' +
                   'GUIDED MODE: When the citizen wants a service ' +
                   '(e.g. license renewal), call start_service with ' +
                   'service_key (and mode if known). It will POINT at ' +
                   'the button the citizen must click and WAIT for ' +
                   'their click — you never click for them. After ' +
                   'every page change you receive a [PAGE UPDATE] ' +
                   'message; when the flow is active, immediately ' +
                   'call guide_next_step to continue guiding. ' +
                   'INTENT ROUTING: if the citizen wants a brand-new ' +
                   'license (they have never held one before — phrases ' +
                   'like "new license", "nayi license", "pehli baar ' +
                   'license banwani hai"), that is NOT a renewal — use ' +
                   'service_key "learner_driving_license" and explain ' +
                   'that a Learner License is the required first step ' +
                   'before a regular/new license can be issued. For ' +
                   'every other request, match it to the specific ' +
                   'renewal or duplicate service the citizen actually ' +
                   'asked for (see the services page config for the ' +
                   'full list) rather than defaulting to the same one.',
      notes: 'Do not use navigate_to_page during a guided flow — ' +
             'the citizen must click the buttons themselves.',
    },

    services: {
      page: 'services',
      instruction: GUIDED_FLOW_RULES + ' ' +
                   'GUIDED MODE: call start_service(service_key, mode) ' +
                   'to begin pointing. Each step points at ONE element ' +
                   'and waits for the citizen to click it. After a ' +
                   'click, the tool result tells you what to say and ' +
                   'that you should call guide_next_step for the next ' +
                   'step. Never click for the citizen. ' +
                   'INTENT ROUTING: "new license" / "first license" / ' +
                   'no license held yet → service_key ' +
                   '"learner_driving_license" (tell the citizen a ' +
                   'Learner License must come first). A license they ' +
                   'already hold that is expiring or expired → the ' +
                   'matching "renewal_*" service_key for that specific ' +
                   'license type. Lost or damaged license → the ' +
                   'matching "duplicate_*" service_key. Always pick the ' +
                   'element whose triggers/label match what the citizen ' +
                   'actually described, never a generic default.',
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
            'new license',
            'nayi license',
            'license banwana hai',
            'license nahi hai',
            'لرنر لائسنس',
          ],
          note:         'Route here whenever the citizen wants a license ' +
                        'and has never held one before ("new license") — ' +
                        'a Learner License is the mandatory first step; ' +
                        'explain that to the citizen before pointing.',
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
      instruction: GUIDED_FLOW_RULES + ' ' +
                   'Use fill_field() for each field, in order. ' +
                   'Always confirm value verbally before filling. ' +
                   'After all 5 fields are filled, call guide_next_step() — ' +
                   'it highlights the captcha itself (the citizen types the ' +
                   'answer, you NEVER say it aloud) and then the submit ' +
                   'button. Keep calling guide_next_step() and speaking its ' +
                   'presentationInstructions until the flow completes. ' +
                   'Do NOT call the standalone point-and-wait tool on this ' +
                   'page — the guided flow owns the captcha and submit steps.',
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
      // Shown verbatim in the expanded panel's "next step" row — keep it
      // short, in English, and action-first (no praise/thanks framing).
      action_label: 'Click the "Apply Service" button.',
      // say_now: spoken as soon as the pointer appears (agent is free to talk)
      say_now: 'Theek hai! Pehle main aapko Services page par le chalti hoon. ' +
               'Screen par relevant button highlight ho gaya hai — uss par click karein.',
      say_after: 'Services page khul raha hai — ek second mein wahan pohonch jaayenge.',
    },
    {
      id: 'select_card',
      page: 'services',
      selector: function (flow) {
        return '[data-service-key="' + flow.serviceKey + '"]';
      },
      navigates: false,
      action_label: 'Click the highlighted service card.',
      say_now: 'Ab main "Renewal of Regular License" card highlight kar rahi hoon. ' +
               'Uss highlighted card par click karein.',
      say_after: 'Ab agla qadam yeh hai: apply karne ka tareeqa chunein — ' +
                 'Self Service ya Doorstep.',
    },
    {
      id: 'select_mode',
      page: 'services',
      selector: function (flow) {
        return flow.mode === 'doorstep' ? '.apply_self' : '.apply_online';
      },
      navigates: false,
      action_label: 'Choose Self Service or Doorstep Service.',
      say_now: 'Bilkul. Main aapka pasandida tareeqa highlight kar rahi hoon — uss par click karein.',
      say_after: 'Ab agla qadam yeh hai: highlighted Apply button dabayein.',
    },
    {
      id: 'apply',
      page: 'services',
      selector: function () { return '.btn-apply-service'; },
      navigates: true,
      action_label: 'Click the "Apply" button.',
      say_now: 'Apply button highlight ho gaya hai — uss par click karein taake application form khule.',
      say_after: 'Application form khul raha hai — ek second mein wahan pohonch jaayenge.',
    },
    {
      id: 'form',
      page: 'apply',
      // No pointing — the agent fills fields one by one via fill_field.
      // guide_next_step advances to the captcha step once every field
      // has a value.
      action_label: 'Answer the questions to fill in the application form.',
      form: true,
    },
    {
      id: 'captcha',
      page: 'apply',
      // Special handling: only advances once the captcha answer is
      // actually CORRECT (checked against wrapper.dataset.answer),
      // never merely because the citizen clicked the captcha box.
      action_label: 'Solve the highlighted math question.',
      captcha: true,
    },
    {
      id: 'submit',
      page: 'apply',
      selector: function () { return '#btnSubmitApplication'; },
      navigates: false,
      action_label: 'Click the "Submit" button.',
      say_after: 'Application submit ho rahi hai.',
    },
    {
      id: 'finish',
      page: 'apply',
      // Virtual step: verifies the success screen appeared and closes
      // the flow (or reports validation errors and returns to submit).
      action_label: 'Reviewing your application...',
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

  // A flow older than this is stale — a leftover from an earlier run
  // would otherwise make the agent demand guide_next_step on a freshly
  // opened page and point at the wrong thing.
  const FLOW_TTL_MS = 30 * 60 * 1000;

  // Two advances closer together than this are treated as the same
  // advance. A navigating step emits both a [CLICK] and a [PAGE UPDATE]
  // and they can arrive out of order, so the agent may call
  // guide_next_step twice — without this the flow skips a step and
  // points at the wrong element.
  const ADVANCE_DEBOUNCE_MS = 500;

  function loadFlow() {
    let flow;
    try {
      flow = JSON.parse(sessionStorage.getItem(FLOW_STORAGE_KEY));
    } catch (e) { return null; }
    if (!flow) return null;
    if (flow.startedAt && (Date.now() - flow.startedAt) > FLOW_TTL_MS) {
      console.warn('[Maryam] Discarding stale guided flow (started',
        Math.round((Date.now() - flow.startedAt) / 60000), 'min ago)');
      clearFlow();
      return null;
    }
    return flow;
  }
  function saveFlow(flow) {
    sessionStorage.setItem(FLOW_STORAGE_KEY, JSON.stringify(flow));
  }
  function clearFlow() {
    sessionStorage.removeItem(FLOW_STORAGE_KEY);
  }

  // The single place stepIndex moves forward. Stamps lastAdvancedAt so a
  // duplicate guide_next_step arriving right behind this one is debounced
  // instead of skipping a step.
  function advanceFlow(flow) {
    flow.stepIndex += 1;
    flow.lastAdvancedAt = Date.now();
    saveFlow(flow);
    return flow;
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
        border-radius: 14px;
        border: 3px solid #e53935;
        box-shadow: 0 0 0 4px rgba(229,57,53,0.20),
                    0 0 22px rgba(229,57,53,0.35);
        background: rgba(229,57,53,0.06);
        pointer-events: none;
        display: none;
        z-index: 99999;
        transition: left 0.4s cubic-bezier(0.25,0.46,0.45,0.94),
                    top  0.4s cubic-bezier(0.25,0.46,0.45,0.94),
                    width 0.4s cubic-bezier(0.25,0.46,0.45,0.94),
                    height 0.4s cubic-bezier(0.25,0.46,0.45,0.94);
      }
      #maryam-pointer.active { display: block; }
      #maryam-pointer.pulse {
        animation: maryamPulse 0.5s ease-out;
      }
      @keyframes maryamPulse {
        0%   { box-shadow: 0 0 0 4px rgba(229,57,53,0.55), 0 0 22px rgba(229,57,53,0.5); }
        70%  { box-shadow: 0 0 0 12px rgba(229,57,53,0), 0 0 30px rgba(229,57,53,0.25); }
        100% { box-shadow: 0 0 0 4px rgba(229,57,53,0.20), 0 0 22px rgba(229,57,53,0.35); }
      }
      #maryam-status {
        position: fixed;
        bottom: 98px;
        right: 24px;
        background: #ffffff;
        color: var(--primary-color, #0d6b39);
        padding: 10px 18px;
        border-radius: 16px;
        font-size: 13.5px;
        font-weight: 600;
        font-family: 'Manrope', 'Outfit', sans-serif;
        display: none;
        align-items: center;
        max-width: 260px;
        line-height: 1.4;
        text-align: left;
        direction: ltr;
        z-index: 99998;
        border: 1px solid rgba(13,107,57,0.10);
        box-shadow: 0 12px 28px rgba(13,107,57,0.18), 0 2px 8px rgba(0,0,0,0.06);
      }
      #maryam-status.visible { display: flex; }
      #maryam-status::after {
        content: '';
        position: absolute;
        bottom: -7px;
        right: 28px;
        width: 14px;
        height: 14px;
        background: #ffffff;
        border-right: 1px solid rgba(13,107,57,0.10);
        border-bottom: 1px solid rgba(13,107,57,0.10);
        transform: rotate(45deg);
      }
      #maryam-mic-btn {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 68px;
        height: 68px;
        border-radius: 50%;
        padding: 0;
        display: block;
        background: linear-gradient(145deg, var(--primary-color, #0d6b39), #0a5a30);
        border: 3px solid #ffffff;
        cursor: pointer;
        z-index: 99998;
        box-shadow: 0 10px 26px rgba(13,107,57,0.45);
        transition: transform 0.2s ease, box-shadow 0.3s ease;
      }
      #maryam-mic-btn:hover {
        transform: scale(1.07);
      }
      #maryam-avatar-img {
        display: block;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        object-fit: cover;
        object-position: top center;
        pointer-events: none;
      }
      #maryam-mic-badge {
        position: absolute;
        right: -3px;
        bottom: -3px;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        background: var(--primary-color, #0d6b39);
        border: 2px solid #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12.5px;
        line-height: 1;
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        transition: background 0.3s ease;
        pointer-events: none;
      }
      #maryam-mic-btn.connected #maryam-mic-badge {
        background: var(--primary-color, #0d6b39);
      }
      #maryam-mic-btn.connecting #maryam-mic-badge {
        background: #7c847c;
      }
      #maryam-mic-btn.connecting {
        animation: maryamConnecting 1.1s ease-in-out infinite;
      }
      #maryam-mic-btn.listening {
        box-shadow: 0 10px 26px rgba(13,107,57,0.45), 0 0 0 10px rgba(245,187,24,0.35);
      }
      #maryam-mic-btn.speaking {
        box-shadow: 0 10px 26px rgba(13,107,57,0.45), 0 0 0 10px rgba(13,107,57,0.20);
      }
      #maryam-mic-btn.muted #maryam-mic-badge {
        background: #a3780e;
      }
      #maryam-mic-btn.error #maryam-mic-badge {
        background: #a83232;
      }
      #maryam-mic-btn.error {
        box-shadow: 0 10px 26px rgba(217,83,79,0.4);
      }
      @keyframes maryamConnecting {
        0%, 100% { box-shadow: 0 10px 26px rgba(13,107,57,0.25); }
        50%      { box-shadow: 0 10px 32px rgba(13,107,57,0.55); }
      }
      #maryam-label {
        position: fixed;
        bottom: 24px;
        right: 102px;
        height: 68px;
        display: flex;
        align-items: center;
        z-index: 99997;
        pointer-events: none;
      }
      #maryam-label span {
        background: #ffffff;
        color: var(--primary-color, #0d6b39);
        font-family: 'Manrope', 'Outfit', sans-serif;
        font-size: 12.5px;
        font-weight: 700;
        padding: 7px 14px;
        border-radius: 999px;
        white-space: nowrap;
        border: 1px solid rgba(13,107,57,0.10);
        box-shadow: 0 8px 20px rgba(13,107,57,0.18), 0 2px 6px rgba(0,0,0,0.06);
      }
      @media (max-width: 480px) {
        #maryam-label { display: none; }
      }
      #maryam-panel {
        position: fixed;
        bottom: 102px;
        right: 24px;
        width: 300px;
        max-width: calc(100vw - 32px);
        background: #ffffff;
        border-radius: 20px;
        border: 1px solid rgba(13,107,57,0.08);
        box-shadow: 0 22px 50px rgba(13,107,57,0.25), 0 4px 14px rgba(0,0,0,0.08);
        padding: 16px;
        display: none;
        flex-direction: column;
        gap: 12px;
        z-index: 99997;
        font-family: 'Manrope', 'Outfit', sans-serif;
        transform-origin: bottom right;
      }
      #maryam-panel.open {
        display: flex;
        animation: maryamPanelIn 0.2s ease-out;
      }
      @keyframes maryamPanelIn {
        from { opacity: 0; transform: scale(0.94) translateY(8px); }
        to   { opacity: 1; transform: scale(1) translateY(0); }
      }
      .maryam-panel-header {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .maryam-panel-header img {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        object-fit: cover;
        object-position: top center;
        border: 2px solid var(--primary-color, #0d6b39);
        flex-shrink: 0;
      }
      .maryam-panel-heading {
        display: flex;
        flex-direction: column;
        line-height: 1.25;
        min-width: 0;
      }
      .maryam-panel-title {
        font-weight: 800;
        font-size: 14.5px;
        color: var(--primary-color, #0d6b39);
      }
      .maryam-panel-subtitle {
        font-size: 11.5px;
        color: #6b7a70;
        font-weight: 600;
      }
      .maryam-activity-row {
        display: flex;
        align-items: center;
        gap: 9px;
        background: #f3f8f5;
        border-radius: 12px;
        padding: 9px 12px;
      }
      #maryam-activity-dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: #9aa39a;
        flex-shrink: 0;
      }
      #maryam-activity-text {
        font-size: 13px;
        font-weight: 700;
        color: #2f4b3c;
      }
      .maryam-activity-row.is-listening #maryam-activity-dot {
        background: #f5bb18;
        animation: maryamDotPulse 1s ease-in-out infinite;
      }
      .maryam-activity-row.is-speaking #maryam-activity-dot {
        background: var(--primary-color, #0d6b39);
        animation: maryamDotPulse 1s ease-in-out infinite;
      }
      .maryam-activity-row.is-connecting #maryam-activity-dot {
        background: #9aa39a;
        animation: maryamDotPulse 0.8s ease-in-out infinite;
      }
      .maryam-activity-row.is-error #maryam-activity-dot {
        background: #d9534f;
      }
      @keyframes maryamDotPulse {
        0%, 100% { transform: scale(1);   opacity: 1;   }
        50%      { transform: scale(1.5); opacity: 0.55; }
      }
      .maryam-nextstep-row {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 0 2px;
      }
      .maryam-nextstep-label {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.06em;
        color: #b9860a;
        text-transform: uppercase;
      }
      #maryam-next-step-text {
        font-size: 13.5px;
        font-weight: 600;
        color: #20291f;
        line-height: 1.4;
      }
      .maryam-panel-actions {
        display: flex;
        gap: 8px;
        margin-top: 2px;
      }
      .maryam-panel-actions button {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border: none;
        border-radius: 12px;
        padding: 9px 10px;
        font-size: 12.5px;
        font-weight: 700;
        cursor: pointer;
        font-family: inherit;
        transition: filter 0.15s ease;
      }
      .maryam-panel-actions button:hover {
        filter: brightness(0.96);
      }
      #maryam-mute-btn {
        background: #eef3ef;
        color: var(--primary-color, #0d6b39);
      }
      #maryam-mute-btn.is-muted {
        background: #fbeecb;
        color: #8a6512;
      }
      #maryam-end-btn {
        background: #fdeceb;
        color: #a83232;
      }
      .field-highlight {
        outline: 2.5px solid #167B38 !important;
        background-color: #f1f8f3 !important;
        transition: all 0.3s;
      }
    `;
    document.head.appendChild(style);
  }

  // The mic button's face is the avatar photo — the state icon (mic,
  // hourglass, mute, warning) lives in the small badge at its corner
  // instead of replacing the photo.
  function setMicIcon(btn, icon) {
    const badge = btn && btn.querySelector('#maryam-mic-badge');
    if (badge) badge.textContent = icon;
  }

  function injectPointerElements() {
    if (document.getElementById('maryam-pointer')) return;

    const pointer = document.createElement('div');
    pointer.id = 'maryam-pointer';
    document.body.appendChild(pointer);

    const status = document.createElement('div');
    status.id = 'maryam-status';
    document.body.appendChild(status);

    const label = document.createElement('div');
    label.id = 'maryam-label';
    label.innerHTML = '<span>Your AI assisted guide</span>';
    document.body.appendChild(label);

    const micBtn = document.createElement('button');
    micBtn.id = 'maryam-mic-btn';
    micBtn.title = 'Talk to Maryam';
    micBtn.innerHTML =
      '<img id="maryam-avatar-img" src="assets/images/maryam-avatar.png" alt="Your AI assisted guide">' +
      '<span id="maryam-mic-badge">🎤</span>';
    micBtn.classList.add('connecting');
    document.body.appendChild(micBtn);

    // Expanded panel: click the avatar (once connected) to see what
    // Maryam is doing right now — listening/speaking vs. the actual next
    // action she wants the citizen to take — plus mute/end controls.
    const panel = document.createElement('div');
    panel.id = 'maryam-panel';
    panel.innerHTML =
      '<div class="maryam-panel-header">' +
        '<img src="assets/images/maryam-avatar.png" alt="Maryam">' +
        '<div class="maryam-panel-heading">' +
          '<span class="maryam-panel-title">Maryam</span>' +
          '<span class="maryam-panel-subtitle">Your AI assisted guide</span>' +
        '</div>' +
      '</div>' +
      '<div id="maryam-activity-row" class="maryam-activity-row is-idle">' +
        '<span id="maryam-activity-dot"></span>' +
        '<span id="maryam-activity-text">Tap the mic to talk to Maryam.</span>' +
      '</div>' +
      '<div class="maryam-nextstep-row">' +
        '<span class="maryam-nextstep-label">Next step</span>' +
        '<span id="maryam-next-step-text">Tell me what service you need, or ask a question.</span>' +
      '</div>' +
      '<div class="maryam-panel-actions">' +
        '<button id="maryam-mute-btn" type="button">🎤 Mute</button>' +
        '<button id="maryam-end-btn" type="button">✕ End</button>' +
      '</div>';
    document.body.appendChild(panel);

    // Clicking anywhere outside the panel/avatar closes the panel — it's
    // a peek at what's happening, not a modal.
    document.addEventListener('click', function (e) {
      if (!panel.classList.contains('open')) return;
      if (panel.contains(e.target) || micBtn.contains(e.target)) return;
      closePanel();
    });
  }

  function openPanel() {
    const panel = document.getElementById('maryam-panel');
    if (panel) panel.classList.add('open');
  }
  function closePanel() {
    const panel = document.getElementById('maryam-panel');
    if (panel) panel.classList.remove('open');
  }
  function togglePanel() {
    const panel = document.getElementById('maryam-panel');
    if (panel) panel.classList.toggle('open');
  }

  // Human-readable defaults for the panel's activity row. Keep these
  // distinct from the "next step" text: activity is what Maryam is doing
  // right now (listening/speaking/connecting); next step is the action
  // she wants the citizen to take.
  const ACTIVITY_LABELS = {
    idle: 'Tap the mic to talk to Maryam.',
    connecting: 'Connecting to Maryam...',
    connected: 'Ready — start speaking.',
    listening: 'Listening to you...',
    speaking: 'Maryam is speaking...',
    muted: 'Mic muted.',
    error: 'Connection issue — tap to retry.',
  };

  function setActivity(kind, text) {
    const row = document.getElementById('maryam-activity-row');
    if (!row) return;
    row.className = 'maryam-activity-row is-' + kind;
    const label = document.getElementById('maryam-activity-text');
    if (label) label.textContent = text || ACTIVITY_LABELS[kind] || '';
  }

  // The concrete action Maryam wants the citizen to take right now — e.g.
  // "Click the highlighted service card." Distinct from setActivity(),
  // which only reflects listening/speaking/connection state.
  function setNextStep(text) {
    const el = document.getElementById('maryam-next-step-text');
    if (el) el.textContent = text || 'Tell me what service you need, or ask a question.';
  }

  function bindPanelButtons() {
    const muteBtn = document.getElementById('maryam-mute-btn');
    const endBtn = document.getElementById('maryam-end-btn');

    if (muteBtn) {
      muteBtn.addEventListener('click', async function () {
        if (!maryamConnected || !maryamRoom) return;
        const wasOn = maryamRoom.localParticipant.isMicrophoneEnabled;
        await maryamRoom.localParticipant.setMicrophoneEnabled(!wasOn);
        const micBtn = document.getElementById('maryam-mic-btn');
        setMicIcon(micBtn, wasOn ? '🔇' : '🎤');
        if (micBtn) micBtn.classList.toggle('muted', wasOn);
        muteBtn.textContent = wasOn ? '🔊 Unmute' : '🎤 Mute';
        muteBtn.classList.toggle('is-muted', wasOn);
        setActivity(wasOn ? 'muted' : 'connected');
      });
    }

    if (endBtn) {
      endBtn.addEventListener('click', function () {
        endSession();
      });
    }
  }

  // Fully stops Maryam — disconnects the room and mic, clears the saved
  // session/guided flow so nothing auto-reconnects, and resets the
  // widget to its pre-connection state. Distinct from muting, which
  // keeps the session alive and just stops sending audio.
  async function endSession() {
    closePanel();
    try {
      if (maryamRoom) await maryamRoom.disconnect();
    } catch (e) {
      console.warn('[Maryam] Error while ending session:', e);
    }
    maryamRoom = null;
    maryamConnected = false;
    clearFlow();
    sessionStorage.removeItem(SESSION_STORAGE_KEY);

    const micBtn = document.getElementById('maryam-mic-btn');
    if (micBtn) {
      micBtn.classList.remove('connecting', 'connected', 'listening', 'speaking', 'muted', 'error');
      micBtn.disabled = false;
      micBtn.title = 'Talk to Maryam';
      setMicIcon(micBtn, '🎤');
    }
    const muteBtn = document.getElementById('maryam-mute-btn');
    if (muteBtn) {
      muteBtn.textContent = '🎤 Mute';
      muteBtn.classList.remove('is-muted');
    }
    setStatus('', false);
    setActivity('idle');
    setNextStep(null);
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function setStatus(text, show) {
    const el = document.getElementById('maryam-status');
    if (!el) return;
    el.textContent = text;
    if (show === false || !text) {
      el.classList.remove('visible');
    } else {
      el.classList.add('visible');
    }
  }

  // Deliberately NOT awaited by the pointing paths — the dot animates
  // while Maryam is already talking, which is the effect we want. The
  // internal delays only exist to let the smooth scroll settle before we
  // read the element's rect; the scroll/resize repositioning in
  // pointAndAwaitClick corrects anything that lands late.
  async function movePointerTo(el) {
    if (!el) return;
    const pointer = document.getElementById('maryam-pointer');
    if (!pointer) return;

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await delay(150);

    const rect = el.getBoundingClientRect();
    const pad = POINTER_PADDING_PX;
    pointer.style.left = (rect.left - pad) + 'px';
    pointer.style.top = (rect.top - pad) + 'px';
    pointer.style.width = (rect.width + pad * 2) + 'px';
    pointer.style.height = (rect.height + pad * 2) + 'px';
    pointer.classList.add('active');
    await delay(150);
  }

  // Padding (px) added around the target element's box when drawing the
  // highlight frame around it.
  const POINTER_PADDING_PX = 8;

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
    timeoutMs = timeoutMs || 3000;
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
  // raw_arguments arrives as either an object or a JSON string depending
  // on the shape; always hand callers an object.
  function parseMaybeJson(value) {
    if (typeof value !== 'string') return value;
    try {
      const parsed = JSON.parse(value);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      console.warn('[Maryam] raw_arguments is not valid JSON:', value);
      return {};
    }
  }

  function extractArgs(rawPayload) {
    // No payload at all (get_page_context, guide_next_step) — not an error.
    if (rawPayload === undefined || rawPayload === null || rawPayload === '') {
      return {};
    }

    let parsed;
    try {
      parsed = typeof rawPayload === 'string'
        ? JSON.parse(rawPayload)
        : rawPayload;
    } catch (e) {
      throw new Error('Payload not valid JSON: ' + rawPayload);
    }
    if (!parsed || typeof parsed !== 'object') return {};

    // Shape 1 — documented Uplift AI format
    if (parsed.arguments && parsed.arguments.raw_arguments) {
      return parseMaybeJson(parsed.arguments.raw_arguments);
    }
    // Shape 2 — flat arguments object (no raw_arguments)
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
      return parseMaybeJson(parsed.raw_arguments);
    }
    // Fallback — an empty object here is legitimate (no-arg tools).
    if (Object.keys(parsed).length) {
      console.warn('[Maryam] Unknown payload shape:', parsed);
    }
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
    const serviceKey = payload && payload.service_key;
    if (!serviceKey) {
      return {
        active: false,
        error: 'service_key missing',
        presentationInstructions:
          'Mujhe pata nahi chala kaunsi service chahiye. User se poochhein ' +
          'ke woh kaunsi service ke liye darkhwast dena chahte hain.',
      };
    }
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

    const result = await executeCurrentFlowStep();

    // A "new license" request lands here as learner_driving_license — make
    // sure the citizen hears WHY before the pointing instructions, since
    // they asked for a "new"/regular license, not explicitly a learner one.
    if (serviceKey === 'learner_driving_license' && result &&
        result.presentationInstructions) {
      result.presentationInstructions =
        'Pakistan mein naya (regular) license seedha nahi banta — pehle ' +
        'Learner License lena zaroori hai. Yeh batayein, phir: ' +
        result.presentationInstructions;
    }

    return result;
  }

  // Executes the flow's current step and advances state on the
  // citizen's click. Detects page mismatches and re-anchors.
  async function executeCurrentFlowStep(isRetryAfterMismatch, opts) {
    opts = opts || {};
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

    // Surface the concrete next action in the expanded panel as soon as we
    // know which step we're on — independent of what Maryam says out loud.
    setNextStep(step.action_label);

    // ── Double-advance guard ────────────────────────────────────────
    // A duplicate guide_next_step arriving right behind an advance gets
    // the CURRENT step back, unchanged, instead of pushing the flow one
    // step further and pointing at the wrong element.
    if (!opts.skipDebounce && flow.lastAdvancedAt &&
        (Date.now() - flow.lastAdvancedAt) < ADVANCE_DEBOUNCE_MS) {
      console.warn('[Maryam] Debounced duplicate advance at step', step.id);
      return {
        active: true,
        step: step.id,
        debounced: true,
        presentationInstructions:
          'Pichla qadam abhi abhi mukammal hua hai. Ek lamha rukein aur ' +
          'phir guide_next_step() dobara call karein.',
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
      const result = await executeCurrentFlowStep(true, { skipDebounce: true });
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
        advanceFlow(flow);
        return executeCurrentFlowStep(isRetryAfterMismatch, { skipDebounce: true });
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

    // ── Captcha step: SEMI-BLOCKING, driven by INPUT not CLICK ──────
    //
    // The citizen clicks the box and *then* types. A click listener
    // therefore fires immediately, reporting "still wrong or empty", and
    // no further click ever arrives once they are focused in the box —
    // that was a permanent deadlock. Watch the input instead and only
    // report once the answer is actually correct.
    if (step.captcha) {
      const captcha = getCaptchaState();
      if (captcha.correct) {
        // Already answered correctly — advance immediately.
        advanceFlow(flow);
        return executeCurrentFlowStep(isRetryAfterMismatch, { skipDebounce: true });
      }

      let wrapper;
      try {
        wrapper = await waitForElement('.math-captcha-wrapper', 3000);
      } catch (err) {
        console.error('[Maryam] Captcha element not found:', err.message);
        return {
          active: true,
          step: 'captcha',
          captcha_correct: false,
          error: err.message,
          presentationInstructions:
            'Security sawal screen par nahi mil raha. User se kahein ke ' +
            'page thora scroll karein, phir guide_next_step dobara call karein.',
        };
      }

      movePointerTo(wrapper);   // not awaited — dot animates while Maryam talks
      triggerPulse();
      setStatus('Next step: solve the highlighted box');
      setNextStep(step.action_label);

      // Wait (up to ~30 s) for the answer to become CORRECT. Resolves on
      // the input event — never a timer poll — so typing alone advances
      // the flow with no further clicking required.
      const state = await awaitCaptchaCorrect(wrapper, CAPTCHA_TIMEOUT_MS);

      if (state.correct) {
        hidePointer();
        setStatus('', false);
        // Do NOT advance here — the next guide_next_step() re-checks and
        // advances, keeping a single advance path and a bounded call.
        return {
          active: true,
          step: 'captcha',
          captcha_correct: true,
          presentationInstructions:
            'SPEAK THIS NOW: "Security sawal ka jawab sahi hai. Ab agla ' +
            'qadam yeh hai: submit button dabana." — then immediately call ' +
            'guide_next_step() so the submit step begins. Never say the ' +
            'captcha answer out loud, and do not thank the citizen — go ' +
            'straight to the next step.',
        };
      }

      return {
        active: true,
        step: 'captcha',
        captcha_correct: false,
        still_waiting: true,
        captcha_answered: getCaptchaState().answered,
        captcha_question: captcha.question,
        presentationInstructions:
          'SPEAK THIS NOW, do not highlight silently — say: "Screen par ' +
          'security sawal highlight ho gaya hai: ' +
          (captcha.question || 'chota sa math sawal') + '. Iska jawab khud ' +
          'box mein type karein." Aap jawab hargiz na batayein. ' +
          'Phir guide_next_step() dobara call karein taake main check kar sakoon.',
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

    // ── Pointing step: SEMI-BLOCKING ────────────────────────────────
    //
    // Non-navigating steps await the click for up to POINT_TIMEOUT_MS and
    // return the outcome in the tool result itself, so the agent always
    // has something to say even if the [CLICK] text channel is never
    // ingested by the remote worker.
    //
    // Navigating steps return immediately — the page unload destroys the
    // RPC response anyway — and rely on the fresh page's pushPageContext
    // to resume the flow. The listener is still attached through the same
    // engine so scroll tracking, removal watching and cleanup all apply.
    let selector = step.selector(flow);
    if (!document.querySelector(selector) && step.fallbackSelector) {
      selector = step.fallbackSelector;
    }

    // On click: persist state (before any navigation unloads the page),
    // then send the redundant [CLICK] notification.
    const onClicked = function () {
      const current = loadFlow();
      if (!current) return;
      // Only advance if nothing else already moved past this step.
      if (current.stepIndex === flow.stepIndex) {
        advanceFlow(current);
      }
      if (step.navigates) {
        const saved = loadSavedSession();
        if (saved) saveSession({ ...saved, agentNavigated: true });
      }
      sendClickNotification(step, current);
    };

    if (step.navigates) {
      // Fire and forget — do not await, the response cannot survive unload.
      pointAndAwaitClick(selector, { timeoutMs: 0, onClicked: onClicked, actionLabel: step.action_label })
        .then(function (r) {
          if (!r.clicked) {
            console.log('[Maryam] Navigating step point ended without click:', step.id, r);
          }
        });
      return {
        active: true,
        step: step.id,
        pointed: true,
        navigates: true,
        waiting_for_click: true,
        presentationInstructions:
          'SPEAK THIS AS SOON AS THE POINTER APPEARS — do not highlight silently: "' +
          (step.say_now ||
            'Relevant button highlight ho gaya hai. Uss par click karein.') +
          '" Uss click se naya page khulega. Koi tool call na karein — ' +
          'agla [PAGE UPDATE] message aane ka intezaar karein, phir ' +
          'foran guide_next_step() call karein.',
      };
    }

    const outcome = await pointAndAwaitClick(selector, {
      timeoutMs: POINT_TIMEOUT_MS,
      onClicked: onClicked,
      actionLabel: step.action_label,
    });

    if (outcome.clicked) {
      return {
        active: true,
        step: step.id,
        clicked: true,
        presentationInstructions:
          'SPEAK THIS NOW, do not stay silent — say exactly: "' +
          (step.say_after || 'Ab agla qadam yeh hai.') +
          '" — then immediately call guide_next_step(). Do NOT thank or ' +
          'praise the citizen for the previous click; go straight to ' +
          'what comes next.',
      };
    }

    if (outcome.timed_out) {
      return {
        active: true,
        step: step.id,
        clicked: false,
        still_waiting: true,
        presentationInstructions:
          'User ne abhi tak click nahi kiya. Narmi se yaad dilayein ke ' +
          'screen par jo cheez highlight ho rahi hai uss par ' +
          'tap karein — pointer wahin maujood hai. Phir guide_next_step() ' +
          'dobara call karein.',
      };
    }

    if (outcome.reason === 'superseded while waiting for element' ||
        (outcome.reason || '').indexOf('superseded') !== -1) {
      // Another point op took over (usually a duplicate guide_next_step).
      return {
        active: true,
        step: step.id,
        superseded: true,
        presentationInstructions:
          'Pointer pehle se hi sahi jagah par hai. User ko highlighted ' +
          'element par click karne ko kahein.',
      };
    }

    console.error('[Maryam] Could not point at', selector, outcome.reason);
    return {
      active: true,
      step: step.id,
      pointed: false,
      error: outcome.reason,
      presentationInstructions:
        'Element screen par nahi mila: ' + selector + '. ' +
        'User ko manually navigate karne mein madad karein, ' +
        'ya guide_next_step dobara call karein.',
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
        'This is a REDUNDANT backup signal: the guide_next_step()/start_service() ' +
        'tool result for this step already told you the same thing. ' +
        'If you have already spoken that line and called guide_next_step(), ' +
        'ignore this message. Otherwise speak the line above and call ' +
        'guide_next_step() now.';
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
    showToolBadge('🧭 Next step');
    return executeCurrentFlowStep();
  }

  async function handleScrollToElement(payload) {
    const selector = payload && payload.element_id;
    if (!selector) {
      return {
        scrolled: false,
        error: 'element_id missing',
        presentationInstructions:
          'Mujhe pata nahi chala kahan scroll karna hai. User se poochhein ' +
          'woh kya dhoond rahe hain.',
      };
    }
    const el = document.querySelector(selector);
    if (!el) {
      return {
        scrolled: false,
        error: 'Element not found: ' + selector,
        presentationInstructions:
          'Woh cheez is page par nahi mili. User ko zubaani bataayein ke ' +
          'woh page par kahan dekhein.',
      };
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await delay(400);
    return { scrolled: true, element_id: selector };
  }

  function handleNavigateToPage(payload) {
    const urlMap = {
      services: 'services.html',
      apply: 'apply.html',
      homepage: 'index.html',
    };
    const page = payload && payload.page;
    const url = urlMap[page];
    if (!url) {
      return {
        navigated: false,
        error: 'Unknown page: ' + page,
        presentationInstructions:
          'Woh page mujhe nahi mila. User se poochhein woh kahan jaana ' +
          'chahte hain — homepage, services, ya application form.',
      };
    }

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
    try {
      const selector = payload && payload.element_id;
      if (!selector) {
        return {
          clicked: false,
          error: 'element_id missing',
          presentationInstructions:
            'Mujhe pata nahi chala kis cheez par ishara karna hai. ' +
            'User se poochhein woh kya karna chahte hain.',
        };
      }
      // Hard 20 s cap: this tool can never hold the conversation hostage,
      // even if the agent calls it directly outside the guided flow.
      const outcome = await pointAndAwaitClick(selector, { timeoutMs: POINT_TIMEOUT_MS });
      if (outcome.clicked) {
        outcome.presentationInstructions =
          'User ne click kar diya hai. Unhein shabashi dein aur agla qadam batayein.';
      } else if (outcome.timed_out) {
        outcome.presentationInstructions =
          'User ne abhi tak click nahi kiya. Narmi se yaad dilayein ke ' +
          'highlighted jagah par tap karein.';
      } else {
        outcome.presentationInstructions =
          'Screen par woh cheez nahi mili ya pointer hat gaya. User ko ' +
          'zubaani bataayein ke kahan click karna hai.';
      }
      return outcome;
    } catch (err) {
      console.warn('[Maryam] point_to_element failed:', err.message);
      return {
        clicked: false,
        error: err.message,
        presentationInstructions:
          'Screen par woh cheez nahi mili. User ko zubaani bataayein ke ' +
          'kahan click karna hai.',
      };
    }
  }

  // Generation token: every new point operation invalidates all older
  // ones, including those still awaiting waitForElement — otherwise a
  // stale operation whose element appears late could steal
  // activePointCancel from the live one.
  let pointOpSeq = 0;

  // How long any single point-and-wait may hold a tool call open. Must
  // stay comfortably under the remote tool timeout (30 s) so the agent
  // always receives our result rather than a remote timeout error.
  const POINT_TIMEOUT_MS = 20000;

  // How long the captcha step may hold a tool call open. Longer than a
  // pointing step because the citizen has to read and solve a sum.
  const CAPTCHA_TIMEOUT_MS = 30000;

  // Resolves once the captcha answer is actually CORRECT — driven by the
  // input's own `input` event, never a polling timer. Also sends the
  // redundant [CLICK: captcha] notification the moment it turns correct.
  //
  // Returns { correct: true } | { correct: false, timed_out: true }
  //        | { correct: false, cancelled: true, reason }
  //
  // On timeout the listener deliberately stays attached, so a citizen who
  // solves it late still triggers the notification.
  function awaitCaptchaCorrect(wrapper, timeoutMs) {
    const myOp = ++pointOpSeq;
    if (activePointCancel) activePointCancel('superseded by captcha step');

    return new Promise((resolve) => {
      const input = wrapper.querySelector('.math-captcha-input');
      if (!input) {
        return resolve({ correct: false, cancelled: true,
                         reason: 'captcha input not found' });
      }
      if (getCaptchaState().correct) return resolve({ correct: true });

      let settled = false;
      let disposed = false;
      let timer = null;

      function dispose() {
        if (disposed) return;
        disposed = true;
        if (timer) clearTimeout(timer);
        input.removeEventListener('input', onInput);
        input.removeEventListener('change', onInput);
        if (activePointCancel === cancel) activePointCancel = null;
      }

      function settle(result) {
        if (settled) return;
        settled = true;
        resolve(result);
      }

      function cancel(reason) {
        dispose();
        settle({ correct: false, cancelled: true, reason: reason });
      }
      activePointCancel = cancel;

      function onInput() {
        if (myOp !== pointOpSeq) return; // superseded
        if (!getCaptchaState().correct) return; // wait until it's actually right
        dispose();
        // Redundant secondary signal — harmless if lk.chat is not ingested.
        if (maryamRoom && maryamConnected) {
          maryamRoom.localParticipant.sendText(
            '[CLICK: captcha] (system message) Captcha answered CORRECTLY. ' +
            'Call guide_next_step() now to proceed to submit.',
            { topic: 'lk.chat' }
          ).catch(function () {});
        }
        settle({ correct: true });
      }

      input.addEventListener('input', onInput);
      input.addEventListener('change', onInput);

      if (timeoutMs > 0) {
        timer = setTimeout(function () {
          // Deliberately NOT disposing — a late correct answer still notifies.
          console.log('[Maryam] Captcha wait timed out (still listening)');
          settle({ correct: false, timed_out: true });
        }, timeoutMs);
      }
    });
  }

  // ── The ONE pointing engine ─────────────────────────────────────────
  // Moves the pointer to the element, shows the Urdu prompt, and resolves
  // on click, on timeout, or on cancellation. NEVER hangs.
  //
  // Returns one of:
  //   { clicked: true,  element_id }
  //   { clicked: false, timed_out: true, element_id }
  //   { clicked: false, cancelled: true, element_id, reason }
  //
  // opts: { timeoutMs = POINT_TIMEOUT_MS (0 or less = no timeout),
  //         onClicked = null }
  //
  // On timeout the promise resolves but the listeners stay attached and
  // the dot stays on screen — a late click still runs onClicked and still
  // sends its [CLICK] notification. Only a supersede, a DOM removal or
  // the actual click tears the operation down.
  async function pointAndAwaitClick(selector, opts) {
    opts = opts || {};
    const timeoutMs = opts.timeoutMs === undefined ? POINT_TIMEOUT_MS : opts.timeoutMs;
    const onClicked = opts.onClicked || null;

    const myOp = ++pointOpSeq;
    if (activePointCancel) activePointCancel('superseded by new point operation');

    let el;
    try {
      el = await waitForElement(selector);
    } catch (err) {
      console.warn('[Maryam] point target never appeared:', selector, err.message);
      return { clicked: false, cancelled: true, element_id: selector, reason: err.message };
    }
    if (myOp !== pointOpSeq) {
      return { clicked: false, cancelled: true, element_id: selector,
               reason: 'superseded while waiting for element' };
    }

    // Move the animated green pointer to the element.
    // Not awaited: the dot animates while Maryam is already talking.
    movePointerTo(el);
    triggerPulse();

    // Show an English status label — the labels themselves are only ever
    // UI chrome; Maryam's spoken guidance stays in Urdu separately.
    const labelMap = {};
    const pageConfig = SITE_CONFIG[getCurrentPageKey()];
    if (pageConfig && pageConfig.elements) {
      pageConfig.elements.forEach((e) => {
        labelMap[e.element_id] = e.label_en || e.label_ur || e.label;
      });
    }
    const targetLabel = labelMap[selector] || selector;
    setStatus('Click here: ' + targetLabel);
    setNextStep(opts.actionLabel || ('Click "' + targetLabel + '".'));

    // Wait for the CITIZEN to click the element (never auto-click).
    return new Promise((resolve) => {
      let removalWatcher = null;
      let timer = null;
      let settled = false;   // promise already resolved
      let disposed = false;  // listeners already removed

      function dispose() {
        if (disposed) return;
        disposed = true;
        if (timer) clearTimeout(timer);
        window.removeEventListener('scroll', reposition, true);
        window.removeEventListener('resize', reposition);
        el.removeEventListener('click', onClick, true);
        if (removalWatcher) removalWatcher.disconnect();
        if (activePointCancel === cancel) activePointCancel = null;
      }

      function settle(result) {
        if (settled) return;
        settled = true;
        resolve(result);
      }

      function cancel(reason) {
        dispose();
        hidePointer();
        setStatus('', false);
        settle({ clicked: false, cancelled: true, element_id: selector, reason: reason });
      }
      activePointCancel = cancel;

      function reposition() {
        const rect = el.getBoundingClientRect();
        const pointer = document.getElementById('maryam-pointer');
        if (!pointer) return;
        const pad = POINTER_PADDING_PX;
        pointer.style.left = (rect.left - pad) + 'px';
        pointer.style.top = (rect.top - pad) + 'px';
        pointer.style.width = (rect.width + pad * 2) + 'px';
        pointer.style.height = (rect.height + pad * 2) + 'px';
      }

      window.addEventListener('scroll', reposition, true);
      window.addEventListener('resize', reposition);

      // If the target is removed from the DOM (dynamic panels), resolve
      // instead of waiting forever.
      removalWatcher = new MutationObserver(() => {
        if (!document.body.contains(el)) cancel('element removed from page');
      });
      removalWatcher.observe(document.body, { childList: true, subtree: true });

      function onClick() {
        dispose();
        hidePointer();
        setStatus('', false);
        // Runs SYNCHRONOUSLY, before resolve: guided-flow state must be
        // persisted before a navigation tears this page down.
        try {
          if (onClicked) onClicked();
        } catch (e) {
          console.error('[Maryam] onClicked callback failed:', e);
        }
        settle({ clicked: true, element_id: selector });
      }

      el.addEventListener('click', onClick, true);

      if (timeoutMs > 0) {
        timer = setTimeout(function () {
          // Deliberately NOT disposing — a late click must still count.
          console.log('[Maryam] Point timed out (still listening):', selector);
          settle({ clicked: false, timed_out: true, element_id: selector });
        }, timeoutMs);
      }
    });
  }

  // Per-character typewriter pace. Deliberately kept (it is a demo
  // feature) but fast enough that a 13-digit CNIC lands in ~0.3 s.
  const TYPEWRITER_DELAY_MS = 25;

  // The green field highlight is purely cosmetic, so clear it on a timer
  // instead of awaiting it — fill_field must not hold the agent's turn
  // open for an animation.
  function clearFieldHighlightSoon(el) {
    setTimeout(function () {
      el.classList.remove('field-highlight');
      hidePointer();
    }, 300);
  }

  async function handleFillField(payload) {
    // Destructured INSIDE the try: a malformed payload must produce a
    // structured result the agent can speak, not a rejected RPC.
    let fieldId;
    try {
      fieldId = payload && payload.field_name;
      const value = payload && payload.value;
      if (!fieldId) {
        return {
          filled: false,
          error: 'field_name missing',
          presentationInstructions:
            'Mujhe pata nahi chala kaunsi field bharni hai. User se ' +
            'agli field ki value dobara poochhein.',
        };
      }

      const el = await waitForElement('#' + fieldId);

      // Move pointer to the field (not awaited — see movePointerTo)
      movePointerTo(el);
      triggerPulse();

      const fieldMeta = SITE_CONFIG.apply.fields.find((f) => f.field_id === fieldId);
      setNextStep('Filling in: ' + (fieldMeta ? fieldMeta.label_en : fieldId));

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
        clearFieldHighlightSoon(el);
        return { field_name: fieldId, value: match.textContent.trim(), filled: true };
      }

      if (el.type === 'date') {
        // Date inputs reject partial values — set once (expects YYYY-MM-DD).
        el.focus();
        el.value = String(value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        const ok = el.value === String(value);
        clearFieldHighlightSoon(el);
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
        await delay(TYPEWRITER_DELAY_MS);
      }
      el.dispatchEvent(new Event('blur', { bubbles: true }));

      clearFieldHighlightSoon(el);

      return { field_name: fieldId, value: value, filled: true };
    } catch (err) {
      console.warn('[Maryam] fill_field failed:', fieldId, err.message);
      return {
        filled: false,
        field_name: fieldId,
        error: err.message,
        presentationInstructions:
          'Yeh field bharne mein masla aaya. User se maazrat karein aur ' +
          'unhein kahein ke woh khud yeh field bhar dein, phir aap aage barhein.',
      };
    }
  }

  // Single registry for every RPC method the remote agent can call.
  // `recovery_ur` is what Maryam says if the handler throws outright.
  const RPC_METHODS = [
    {
      name: 'get_page_context',
      handler: function () { return handleGetPageContext(); },
      recovery_ur: 'Page ki tafseelat nahi mil sakin. User se poochhein ' +
                   'woh is waqt kaunse page par hain.',
    },
    {
      name: 'start_service',
      handler: handleStartService,
      recovery_ur: 'Service shuru karne mein masla aaya. User se maazrat ' +
                   'karein aur dobara koshish karein.',
    },
    {
      name: 'guide_next_step',
      handler: handleGuideNextStep,
      recovery_ur: 'Agla qadam batane mein masla aaya. User ko kahein ke ' +
                   'ek lamha rukein, phir dobara koshish karein.',
    },
    {
      name: 'point_to_element',
      handler: handlePointToElement,
      recovery_ur: 'Screen par ishara nahi kar saki. User ko zubaani ' +
                   'bataayein ke kahan click karna hai.',
    },
    {
      name: 'fill_field',
      handler: handleFillField,
      recovery_ur: 'Field bharne mein masla aaya. User se kahein ke woh ' +
                   'yeh field khud bhar dein.',
    },
    {
      name: 'navigate_to_page',
      handler: handleNavigateToPage,
      recovery_ur: 'Page kholne mein masla aaya. User se poochhein woh ' +
                   'kahan jaana chahte hain.',
    },
    {
      name: 'scroll_to_element',
      handler: handleScrollToElement,
      recovery_ur: 'Page scroll nahi kar saki. User ko kahein ke woh khud ' +
                   'thora neeche scroll karein.',
    },
  ];

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

  // Always mint a FRESH session, even across page navigations.
  //
  // Reusing the saved token looks cheaper but breaks the demo two ways:
  //  1. The Uplift agent worker ends its session when the only human
  //     participant disconnects, so reconnecting with the old token drops
  //     us into a room with no agent in it — mic works, UI says
  //     connected, nothing ever answers.
  //  2. Reconnecting with the same participant identity races the old
  //     connection's teardown and LiveKit typically drops one of them.
  //
  // We lose the agent's memory of earlier turns, but pushPageContext
  // re-briefs it with the full guided-flow state, which is what actually
  // matters for resuming the guidance.
  async function getOrResumeSession() {
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

  // Shown via setStatus whenever autoplay is blocked, so the citizen is
  // never left with unexplained silence.
  const AUDIO_BLOCKED_MSG = 'Tap the screen to hear Maryam';

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
      // Clear the "tap to hear" prompt, but only if it is still the thing
      // on screen — never stomp a live status message.
      var statusEl = document.getElementById('maryam-status');
      if (statusEl && statusEl.textContent === AUDIO_BLOCKED_MSG) setStatus('', false);
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
      // Chrome requires a user gesture on THIS document — the gesture from
      // the previous page does not carry over, so after every guided
      // navigation the citizen would otherwise miss Maryam's opening line.
      // Retry on any user gesture — click, touch, or keypress.
      ['click', 'touchstart', 'keydown'].forEach(function (evtName) {
        var handler = function () { retryPlay(); };
        retryHandlers.push({ evt: evtName, fn: handler });
        document.addEventListener(evtName, handler, { capture: true });
      });
      // Say so immediately — silence with no explanation is
      // indistinguishable from the agent having died.
      setStatus(AUDIO_BLOCKED_MSG, true);
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
      'position:fixed', 'bottom:98px', 'right:20px',
      'background:#0d6b39', 'color:#fff', 'padding:10px 18px',
      'border-radius:24px', 'font-size:13px', 'font-weight:600',
      'z-index:99999', 'cursor:pointer',
      'box-shadow:0 10px 24px rgba(13,107,57,.4)',
      'animation:maryamNudgePulse 1.5s ease-in-out infinite',
      'direction:ltr', 'font-family:Manrope,inherit'
    ].join(';'));
    nudge.textContent = '🔊 Tap here to hear Maryam';
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

  // Resolves true as soon as a remote participant (the Uplift agent
  // worker) is in the room, or false if none joins within timeoutMs.
  function waitForRemoteParticipant(room, timeoutMs) {
    if (room.remoteParticipants.size > 0) return Promise.resolve(true);
    return new Promise((resolve) => {
      let timer = null;
      function done(result) {
        if (timer) clearTimeout(timer);
        try {
          room.off(LivekitClient.RoomEvent.ParticipantConnected, onJoin);
        } catch (e) { /* older client without .off — harmless */ }
        resolve(result);
      }
      function onJoin() { done(true); }
      room.on(LivekitClient.RoomEvent.ParticipantConnected, onJoin);
      timer = setTimeout(function () {
        done(room.remoteParticipants.size > 0);
      }, timeoutMs || 5000);
    });
  }

  async function connectAndRegisterTools() {
    if (typeof LivekitClient === 'undefined') {
      throw new Error('LivekitClient not loaded');
    }

    const micBtn = document.getElementById('maryam-mic-btn');
    console.log('[Maryam] Getting session...');

    // Read the "the agent navigated us here" flag BEFORE creating the new
    // session — createNewSession() overwrites the stored session object,
    // which is also how the flag gets consumed exactly once.
    const previous = loadSavedSession();
    const arrivedViaAgentNav = !!(previous && previous.agentNavigated);

    const session = await getOrResumeSession();
    console.log('[Maryam] Session ready. wsUrl:', session.wsUrl ? 'ok' : 'MISSING');

    const room = new LivekitClient.Room();
    maryamRoom = room;

    // ── Register RPC tools ──────────────────────────────────
    //
    // Every handler goes through the SAME wrapper: extractArgs (which
    // knows all four Uplift payload shapes) plus a try/catch that always
    // returns a structured result with something Maryam can say. A
    // rejected RPC gives the agent a hard tool error and no recovery
    // text, which reads exactly like the agent going silent.
    RPC_METHODS.forEach(function (entry) {
      room.localParticipant.registerRpcMethod(entry.name, async function (data) {
        try {
          const args = extractArgs(data && data.payload);
          console.log('[Maryam RPC]', entry.name, args);
          return JSON.stringify(await entry.handler(args));
        } catch (err) {
          console.error('[Maryam RPC]', entry.name, 'error:', err);
          return JSON.stringify({
            error: err.message,
            presentationInstructions: entry.recovery_ur ||
              'Ek technical masla aaya. User se maazrat karein aur ' +
              'poochhein ke woh dobara koshish karna chahte hain.',
          });
        }
      });
    });

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
        setMicIcon(btn, '⚠️');
        btn.classList.remove('connected', 'listening', 'speaking');
        btn.classList.add('error');
        btn.title = 'Connection lost — click to reconnect';
      }
      setStatus('Connection lost — click to reconnect', true);
      setActivity('error', 'Connection lost — click to reconnect.');
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
        setStatus('Listening...', true);
        setActivity('listening');
        if (btn) { btn.classList.add('listening'); btn.classList.remove('speaking'); }
      } else if (agentSpeaking) {
        setStatus('Maryam is speaking...', true);
        setActivity('speaking');
        if (btn) { btn.classList.add('speaking'); btn.classList.remove('listening'); }
      } else {
        setStatus('', false);
        if (maryamConnected) setActivity('connected');
        if (btn) { btn.classList.remove('listening', 'speaking'); }
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
      micBtn.classList.remove('connecting', 'error', 'muted');
      micBtn.classList.add('connected');
      setMicIcon(micBtn, '🎤');
      micBtn.disabled = false;
      micBtn.title = 'Maryam is listening — click to view status';
    }

    setStatus('Maryam is ready — start speaking', true);
    setActivity('connected');

    // Tell the agent what page it's on — critical after guided
    // navigation so it resumes the flow instead of guessing.
    // (arrivedViaAgentNav was captured before the fresh session replaced
    // the stored one, which consumed the flag.)
    //
    // A fixed delay was a gamble: if the remote agent joined even slightly
    // later, the [PAGE UPDATE — ACTION REQUIRED] message vanished with no
    // retry and the flow never resumed on the new page. Wait for the
    // participant instead.
    const reason = arrivedViaAgentNav
      ? 'arrived after guided navigation' : 'session connected';
    const agentPresent = await waitForRemoteParticipant(room, 5000);
    console.log('[Maryam] Remote participants before page-context push:',
      room.remoteParticipants.size,
      agentPresent ? '(agent joined)' : '(TIMED OUT — pushing anyway)');

    await pushPageContext(reason);

    // If nobody was there when the push fired, it went nowhere. Retry once.
    if (room.remoteParticipants.size === 0) {
      await delay(2000);
      console.warn('[Maryam] No remote participant at push time — retrying. ' +
        'Remote participants now:', room.remoteParticipants.size);
      await pushPageContext(reason + ' (retry)');
    }

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
    setMicIcon(micBtn, '🎤');
    micBtn.title = 'Talk to Maryam';

    micBtn.addEventListener('click', async () => {
      // Already connected — clicking the avatar peeks at what Maryam is
      // doing instead of muting; mute/end live inside that panel now.
      if (maryamConnected && maryamRoom) {
        togglePanel();
        return;
      }

      // First click — connect (this IS the user gesture)
      micBtn.disabled = true;
      setMicIcon(micBtn, '⏳');
      micBtn.classList.add('connecting');
      setStatus('Connecting to Maryam...', true);
      setActivity('connecting');

      try {
        await connectAndRegisterTools();
      } catch (err) {
        console.error('[Maryam] Connection failed:', err);
        micBtn.classList.remove('connecting');
        micBtn.classList.add('error');
        setMicIcon(micBtn, '⚠️');
        micBtn.disabled = false;
        setStatus('Connection failed — click to retry', true);
        setActivity('error');
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
    bindPanelButtons();

    // Auto-reconnect whenever this tab has ever had a session.
    //
    // Gating on agentNavigated meant that any ordinary link click — the
    // nav bar, another service card, browser back — left the citizen on a
    // page with no reconnect and no visible indication. To them Maryam
    // simply died. agentNavigated is still read (in
    // connectAndRegisterTools) to label the page-context push, but it is
    // no longer what decides whether we reconnect.
    const saved = loadSavedSession();
    if (saved) {
      setTimeout(async () => {
        setStatus('Reconnecting to Maryam...', true);
        setActivity('connecting', 'Reconnecting to Maryam...');
        const micBtn = document.getElementById('maryam-mic-btn');
        if (micBtn) {
          setMicIcon(micBtn, '⏳');
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
              setMicIcon(micBtn, '⚠️');
              micBtn.classList.remove('connecting');
              micBtn.classList.add('error');
            }
            setStatus('Connection failed — press the mic button', true);
            setActivity('error', 'Connection failed — press the mic button.');
          }
        }
      }, 800);
    }
  });

  // Debug handle — lets us drive the flow from the browser console during the demo build.
  window.__maryam = {
    get room() { return maryamRoom; },
    get connected() { return maryamConnected; },
    loadFlow, saveFlow, clearFlow, pushPageContext,
    executeCurrentFlowStep, getCaptchaState, buildLiveContext, FLOW_STEPS,
  };
})();
