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
  // Set by endSession() when a flow/quick action was still active — tells
  // the next reconnect's pushPageContext to ask before resuming instead
  // of assuming the citizen wants to continue.
  const RESUME_PENDING_KEY = 'maryam_resume_pending';
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
  //
  // CRITICAL #3: services differ in their fields, validation, and
  // whether they even have a captcha — never assume one service's form
  // looks like another's. get_service_journey(key) is the source of
  // truth for exactly what a service/quick-action needs.
  const GUIDED_FLOW_RULES =
    'CRITICAL: (1) Every time you point at or highlight something, you ' +
    'MUST speak the matching line from presentationInstructions in that ' +
    'same turn — never highlight silently and wait for the citizen to ' +
    'ask what happened. (2) After the citizen completes a step, do not ' +
    'thank or praise them for it — go straight to the next instruction ' +
    '("Ab agla qadam yeh hai: ..."). (3) ALWAYS call ' +
    'get_service_journey(key) before start_service/start_quick_action — ' +
    'it tells you the exact fields, their order, whether a captcha ' +
    'exists, and which fields need the citizen\'s own manual action ' +
    '(file uploads) — never assume one service\'s form looks like another\'s.';

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
      // 3 quick-action panels next to the "DLIMS Services" header — no
      // service card needed. Same shape as `elements` above so intent
      // routing works the same way; use_tool is start_quick_action, not
      // start_service.
      quick_actions: [
        {
          action_key:  'track_application',
          element_id:  '[data-bs-target="#trackdlimsOffcanvas"]',
          label_en:    'Track Application',
          label_ur:    'درخواست ٹریک کریں',
          triggers_ur: ['application track karo', 'mera application kahan hai', 'status check karo'],
          use_tool:    'start_quick_action',
        },
        {
          action_key:  'e_license',
          element_id:  '[data-bs-target="#eLicenseOffcanvas"]',
          label_en:    'e-License',
          label_ur:    'ای-لائسنس',
          triggers_ur: ['e-license banao', 'digital license chahiye', 'e license generate karo'],
          use_tool:    'start_quick_action',
        },
        {
          action_key:  'verify_license',
          element_id:  '[data-bs-target="#VerifyOffcanvas"]',
          label_en:    'Verify License',
          label_ur:    'لائسنس تصدیق کریں',
          triggers_ur: ['license verify karo', 'license check karo ke asli hai ya nahi'],
          use_tool:    'start_quick_action',
        },
      ],
    },

    apply: {
      page:     'apply',
      instruction: GUIDED_FLOW_RULES + ' ' +
                   'Fields differ per service — you already called ' +
                   'get_service_journey(service_key) before start_service, ' +
                   'so you have the exact field list, order, and validation ' +
                   'for whichever service is active. Use fill_field() for ' +
                   'each field in that order; always confirm the value ' +
                   'verbally before filling, except for file-upload fields ' +
                   '(the citizen must pick those themselves — never invent ' +
                   'a file). Once every required field is satisfied, call ' +
                   'guide_next_step() — it handles the captcha itself if ' +
                   'the journey has one (auto-skipped when it does not, ' +
                   'e.g. Learner License) and then the submit button. Keep ' +
                   'calling guide_next_step() and speaking its ' +
                   'presentationInstructions until the flow completes. ' +
                   'Do NOT call the standalone point-and-wait tool on this ' +
                   'page — the guided flow owns the captcha and submit steps.',
    },

  };

  // -------------------------------------------------------------------
  // SECTION 2B — Service & quick-action "journeys"
  //
  // A journey is the single source of truth for a service's or quick
  // action's exact fields, validation, and captcha behavior — ported
  // directly from apply.js's/services.js's real DOM structure. It backs
  // BOTH the get_service_journey RPC tool (what the agent can ask for on
  // demand) and the internal flow engine (what actually drives
  // fill_field/computeMissingFields) — one source of truth, not two.
  // -------------------------------------------------------------------
  const FORM_FIELD_TEMPLATES = {
    // formType 'new' — Learner Driving License (renderNewForm in apply.js).
    // The 8 fields with no `id` attribute in that form (Emergency Contact,
    // Gender, Height, Citizen Type, Vehicle Type, Nationality, Blood
    // Group, Any Disability) are deliberately excluded — apply.js never
    // validates them on submit, so skipping them changes nothing
    // observable, and reaching them would need fragile label-text/
    // position matching for zero functional benefit.
    new: [
      { order: 1, field_id: 'fCnic', type: 'text', required: true,
        label_en: 'CNIC', label_ur: 'شناختی کارڈ نمبر',
        ask_ur: 'Aapka CNIC number kya hai?', confirm_ur: 'CNIC {value} hai?',
        validation: 'exactly 13 digits, no dashes or spaces' },
      { order: 2, field_id: 'fName', type: 'text', required: true,
        label_en: 'Full Name', label_ur: 'پورا نام',
        ask_ur: 'Aapka pura naam kya hai?', confirm_ur: 'Naam {value} hai?' },
      { order: 3, field_id: 'fFather', type: 'text', required: true,
        label_en: 'Father / Husband Name', label_ur: 'والد / شوہر کا نام',
        ask_ur: 'Aapke walid ya shohar ka naam kya hai?',
        confirm_ur: 'Walid/shohar ka naam {value} hai?' },
      { order: 4, field_id: 'fDob', type: 'date', format: 'YYYY-MM-DD', required: true,
        label_en: 'Date of Birth', label_ur: 'تاریخ پیدائش',
        ask_ur: 'Aapki tareekh-e-paidaish kya hai? Saal, mahina, din batayein.',
        confirm_ur: 'DOB {value} hai?', validation: 'YYYY-MM-DD format' },
      { order: 5, field_id: 'fPhone', type: 'text', required: true,
        label_en: 'Phone Number', label_ur: 'فون نمبر',
        ask_ur: 'Aapka phone number kya hai?', confirm_ur: 'Phone number {value} hai?' },

      { order: 6, field_id: 'permProvince', type: 'select', required: true,
        options: ['Punjab', 'Sindh', 'Khyber Pakhtunkhwa', 'Balochistan', 'Islamabad', 'Gilgit-Baltistan', 'Azad Kashmir'],
        label_en: 'Permanent Address — Province', label_ur: 'مستقل پتہ — صوبہ',
        ask_ur: 'Aapka mustaqil pata kis province mein hai?',
        confirm_ur: 'Province {value} hai?' },
      { order: 7, field_id: 'permDistrict', type: 'select', required: true,
        dependsOn: 'permProvince',
        label_en: 'Permanent Address — District', label_ur: 'مستقل پتہ — ضلع',
        ask_ur: 'Kis district mein?', confirm_ur: 'District {value} hai?',
        validation: 'must be filled AFTER permProvince — its options are populated live from the chosen province' },
      { order: 8, field_id: 'permAddress', type: 'text', required: true,
        label_en: 'Permanent Address', label_ur: 'مستقل پتہ',
        ask_ur: 'Ghar ka pura pata batayein — makan number, gali, shehar.',
        confirm_ur: 'Pata {value} hai?' },

      { order: 9, field_id: 'sameAsAbove', type: 'checkbox', required: false,
        label_en: 'Current address same as permanent', label_ur: 'موجودہ پتہ مستقل پتے جیسا ہے',
        ask_ur: 'Kya aapka mojooda pata mustaqil pate jaisa hi hai?',
        validation: 'when true, currProvince/currDistrict/currAddress are auto-filled and no longer required' },
      { order: 10, field_id: 'currProvince', type: 'select', required: true,
        skipWhenFieldEquals: { field: 'sameAsAbove', equals: true },
        options: ['Punjab', 'Sindh', 'Khyber Pakhtunkhwa', 'Balochistan', 'Islamabad', 'Gilgit-Baltistan', 'Azad Kashmir'],
        label_en: 'Current Address — Province', label_ur: 'موجودہ پتہ — صوبہ',
        ask_ur: 'Mojooda pata kis province mein hai?', confirm_ur: 'Province {value} hai?' },
      { order: 11, field_id: 'currDistrict', type: 'select', required: true,
        dependsOn: 'currProvince',
        skipWhenFieldEquals: { field: 'sameAsAbove', equals: true },
        label_en: 'Current Address — District', label_ur: 'موجودہ پتہ — ضلع',
        ask_ur: 'Kis district mein?', confirm_ur: 'District {value} hai?' },
      { order: 12, field_id: 'currAddress', type: 'text', required: true,
        skipWhenFieldEquals: { field: 'sameAsAbove', equals: true },
        label_en: 'Current Address', label_ur: 'موجودہ پتہ',
        ask_ur: 'Mojooda pata batayein.', confirm_ur: 'Pata {value} hai?' },

      { order: 13, field_id: 'cnicFrontInput', type: 'file', required: true,
        dropzoneSelector: '#cnicFrontZone',
        label_en: 'CNIC Front Photo', label_ur: 'شناختی کارڈ کا اگلا حصہ',
        validation: 'citizen must pick a real file themselves — the agent points and waits, never fabricates one' },
      { order: 14, field_id: 'cnicBackInput', type: 'file', required: true,
        dropzoneSelector: '#cnicBackZone',
        label_en: 'CNIC Back Photo', label_ur: 'شناختی کارڈ کا پچھلا حصہ' },

      { order: 15, field_id: 'certifyCheck', type: 'checkbox', required: true, mustBeChecked: true,
        label_en: 'Certification checkbox', label_ur: 'تصدیقی خانہ',
        ask_ur: 'Kya aap tasdeeq karte hain ke di gayi tamam maloomat sahi hai?' },
    ],

    'renewal-simple': [
      { order: 1, field_id: 'fCnic', type: 'text', required: true,
        label_en: 'CNIC', label_ur: 'شناختی کارڈ نمبر',
        ask_ur: 'Aapka CNIC number kya hai?', confirm_ur: 'CNIC {value} hai?',
        validation: 'exactly 13 digits, no dashes or spaces' },
      { order: 2, field_id: 'fDob', type: 'date', format: 'YYYY-MM-DD', required: true,
        label_en: 'Date of Birth', label_ur: 'تاریخ پیدائش',
        ask_ur: 'Aapki tareekh-e-paidaish kya hai?', confirm_ur: 'DOB {value} hai?',
        validation: 'YYYY-MM-DD format' },
    ],

    'renewal-license': [
      { order: 1, field_id: 'fCnic', label_en: 'CNIC', label_ur: 'شناختی کارڈ نمبر',
        ask_ur: 'Aapka CNIC number kya hai?', confirm_ur: 'Kya aapka CNIC {value} hai?',
        type: 'text', required: true, validation: 'exactly 13 digits, no dashes or spaces' },
      { order: 2, field_id: 'fLicenseNo', label_en: 'License Number', label_ur: 'لائسنس نمبر',
        ask_ur: 'Aapka driving license number kya hai?', confirm_ur: 'License number {value} hai?',
        type: 'text', required: true, validation: 'non-empty string' },
      { order: 3, field_id: 'fIssuanceDate', label_en: 'License Issuance Date', label_ur: 'لائسنس جاری ہونے کی تاریخ',
        ask_ur: 'License kab issue hua tha? Saal, mahina aur din batayein.',
        confirm_ur: 'Issuance date {value} hai?', type: 'date', format: 'YYYY-MM-DD',
        required: true, validation: 'real past date' },
      { order: 4, field_id: 'fDuration', label_en: 'Renewal Duration', label_ur: 'رینیوول کی مدت',
        ask_ur: 'Kitne saal ke liye renew karna hai?', type: 'select', required: true,
        options: ['For 1 Year', 'For 2 Years', 'For 3 Years', 'For 4 Years', 'For 5 Years'],
        options_ur: [
          'ek saal / 1 year = For 1 Year', 'do saal / 2 years = For 2 Years',
          'teen saal / 3 years = For 3 Years', 'chaar saal / 4 years = For 4 Years',
          'paanch saal / 5 years = For 5 Years',
        ] },
      { order: 5, field_id: 'fPossession', label_en: 'Is Old License in Possession', label_ur: 'کیا پرانا لائسنس موجود ہے',
        ask_ur: 'Kya aapka purana license aapke paas hai?', type: 'select', required: true,
        options: ['Yes, in my possession', "No, it's lost"],
        options_ur: ['haan / yes = Yes, in my possession', "nahi / no = No, it's lost"] },
    ],

    'duplicate-license': [
      { order: 1, field_id: 'fCnic', label_en: 'CNIC', label_ur: 'شناختی کارڈ نمبر',
        ask_ur: 'Aapka CNIC number kya hai?', confirm_ur: 'Kya aapka CNIC {value} hai?',
        type: 'text', required: true, validation: 'exactly 13 digits, no dashes or spaces' },
      { order: 2, field_id: 'fLicenseNo', label_en: 'License Number', label_ur: 'لائسنس نمبر',
        ask_ur: 'Aapka driving license number kya hai?', confirm_ur: 'License number {value} hai?',
        type: 'text', required: true, validation: 'non-empty string' },
      { order: 3, field_id: 'fIssuanceDate', label_en: 'License Issuance Date', label_ur: 'لائسنس جاری ہونے کی تاریخ',
        ask_ur: 'License kab issue hua tha? Saal, mahina aur din batayein.',
        confirm_ur: 'Issuance date {value} hai?', type: 'date', format: 'YYYY-MM-DD',
        required: true, validation: 'real past date' },
    ],
  };

  // One entry per real service_key (matches SITE_CONFIG.services.elements
  // and services-data.js's SERVICES keys). hasCaptcha:false only for the
  // 'new' formType — renderNewForm() never includes the captcha markup.
  const SERVICE_JOURNEYS = {
    learner_driving_license: {
      serviceKey: 'learner_driving_license', formType: 'new',
      label_en: 'Learner Driving License',
      hasCaptcha: false, captchaSelector: null,
      submitSelector: '#btnSubmitApplication',
      fields: FORM_FIELD_TEMPLATES.new,
      decorativeFieldsNote: [
        'Emergency Contact Number', 'Gender', 'Height', 'Citizen Type',
        'Vehicle Type', 'Nationality', 'Blood Group', 'Any Disability', 'Profile Picture',
      ],
    },
    renewal_learner_driving_license: {
      serviceKey: 'renewal_learner_driving_license', formType: 'renewal-simple',
      label_en: 'Renewal of Learners Driving License',
      hasCaptcha: true, captchaSelector: '.math-captcha-wrapper',
      submitSelector: '#btnSubmitApplication',
      fields: FORM_FIELD_TEMPLATES['renewal-simple'],
    },
    renewal_driving_license: {
      serviceKey: 'renewal_driving_license', formType: 'renewal-license',
      label_en: 'Renewal of Regular License',
      hasCaptcha: true, captchaSelector: '.math-captcha-wrapper',
      submitSelector: '#btnSubmitApplication',
      fields: FORM_FIELD_TEMPLATES['renewal-license'],
    },
    international_driving_license: {
      serviceKey: 'international_driving_license', formType: 'renewal-license',
      label_en: 'Renewal International Driving License',
      hasCaptcha: true, captchaSelector: '.math-captcha-wrapper',
      submitSelector: '#btnSubmitApplication',
      fields: FORM_FIELD_TEMPLATES['renewal-license'],
    },
    duplicate_driving_license: {
      serviceKey: 'duplicate_driving_license', formType: 'duplicate-license',
      label_en: 'Duplicate Driving License',
      hasCaptcha: true, captchaSelector: '.math-captcha-wrapper',
      submitSelector: '#btnSubmitApplication',
      fields: FORM_FIELD_TEMPLATES['duplicate-license'],
    },
    international_driving_license_duplicate: {
      serviceKey: 'international_driving_license_duplicate', formType: 'duplicate-license',
      label_en: 'Duplicate International Driving License',
      hasCaptcha: true, captchaSelector: '.math-captcha-wrapper',
      submitSelector: '#btnSubmitApplication',
      fields: FORM_FIELD_TEMPLATES['duplicate-license'],
    },
  };

  // The 3 "quick action" panels on services.html — NOT page navigations,
  // just a Bootstrap offcanvas opening on the same page. Each has its own
  // independent captcha instance, so every selector here (including the
  // captcha) is scoped inside the panel's offcanvas id — never a bare
  // document-wide `.math-captcha-wrapper` query, since all 3 panels'
  // markup exists in the DOM simultaneously (only one is visible at a time).
  const QUICK_ACTION_JOURNEYS = {
    track_application: {
      actionKey: 'track_application', label_en: 'Track Application',
      offcanvasId: 'trackdlimsOffcanvas',
      fields: [
        { order: 1, field_id: 'trackCnic', selector: '#trackdlimsOffcanvas input[name="identity_number"]',
          type: 'text', required: false, label_en: 'CNIC', label_ur: 'شناختی کارڈ نمبر',
          ask_ur: 'Aapka CNIC number kya hai?', confirm_ur: 'CNIC {value} hai?' },
      ],
      hasCaptcha: true, captchaSelector: '#trackdlimsOffcanvas .math-captcha-wrapper',
      actionButtonSelector: '#generateTrackButton',
      demoNoteSelector: '#trackDemoNote',
      demoNoteText_ur: 'Yeh demo hai — koi asli application yahan track nahi ho rahi, bas UI dikhane ke liye hai.',
    },
    e_license: {
      actionKey: 'e_license', label_en: 'e-License',
      offcanvasId: 'eLicenseOffcanvas',
      fields: [
        { order: 1, field_id: 'regularLicense', selector: '#regularLicense', type: 'radio', group: 'licenseType',
          required: false, label_en: 'Regular License', label_ur: 'ریگولر لائسنس' },
        { order: 2, field_id: 'internationalLicense', selector: '#internationalLicense', type: 'radio', group: 'licenseType',
          required: false, label_en: 'International License', label_ur: 'انٹرنیشنل لائسنس' },
        { order: 3, field_id: 'cnicPassportInput', type: 'text', required: true,
          label_en: 'CNIC / Passport Number (label follows the License Type choice above)',
          ask_ur: 'Aapka CNIC ya passport number kya hai?', confirm_ur: '{value} hai?' },
        { order: 4, field_id: 'eLicenseDob', selector: '#eLicenseOffcanvas input[name="dob"]',
          type: 'text', format: 'YYYY-MM-DD', required: true,
          label_en: 'Date of Birth', ask_ur: 'Aapki tareekh-e-paidaish kya hai?', confirm_ur: 'DOB {value} hai?' },
      ],
      hasCaptcha: true, captchaSelector: '#eLicenseOffcanvas .math-captcha-wrapper',
      actionButtonSelector: '#generateLicenseButton',
      demoNoteSelector: '#eLicenseDemoNote',
      demoNoteText_ur: 'Yeh demo hai — koi asli e-License nahi banti, backend se connect nahi hai.',
    },
    verify_license: {
      actionKey: 'verify_license', label_en: 'Verify License',
      offcanvasId: 'VerifyOffcanvas',
      fields: [
        { order: 1, field_id: 'verifyregularLicense', selector: '#verifyregularLicense', type: 'radio', group: 'verifylicenseType',
          required: false, label_en: 'Regular License', label_ur: 'ریگولر لائسنس' },
        { order: 2, field_id: 'verifyinternationalLicense', selector: '#verifyinternationalLicense', type: 'radio', group: 'verifylicenseType',
          required: false, label_en: 'International License', label_ur: 'انٹرنیشنل لائسنس' },
        { order: 3, field_id: 'verifyCnicPassport', selector: '#VerifyOffcanvas input[name="verify_identity_number"]',
          type: 'text', required: true, label_en: 'CNIC / Passport Number',
          ask_ur: 'Aapka CNIC ya passport number kya hai?', confirm_ur: '{value} hai?' },
        { order: 4, field_id: 'verifyLicenseNo',
          // The only field in this whole config with neither an id nor a
          // name in services.html — located positionally as the 4th
          // direct div child of the panel's .row.g-3 (confirmed against
          // the real markup: error-alert, radios, CNIC, License Number).
          // Fragile to a markup reorder; correct given this feature may
          // only touch maryam-agent.js.
          selector: '#VerifyOffcanvas .row.g-3 > div:nth-of-type(4) input',
          type: 'text', required: true, label_en: 'License Number',
          ask_ur: 'License number kya hai?', confirm_ur: 'License number {value} hai?' },
      ],
      hasCaptcha: true, captchaSelector: '#VerifyOffcanvas .math-captcha-wrapper',
      actionButtonSelector: '#verifyLicenseButton',
      demoNoteSelector: '#verifyDemoNote',
      demoNoteText_ur: 'Yeh demo hai — koi asli license database nahi hai, kuch verify nahi ho raha.',
    },
  };

  // Looks a key up in either journey map — the agent's mental model is
  // "give me the journey for X," not "which kind of X is this."
  function getJourneyByKey(key) {
    return SERVICE_JOURNEYS[key] || QUICK_ACTION_JOURNEYS[key] || null;
  }

  // Resolves whichever journey is "in play" right now: the active guided
  // service flow, the active quick-action flow, or (fallback) the service
  // named in apply.html's own URL — so fill_field and friends don't need
  // to be told twice which journey applies. loadQuickActionFlow is defined
  // later in this file (function hoisting makes the forward reference safe).
  function getActiveJourney() {
    const flow = loadFlow();
    if (flow && SERVICE_JOURNEYS[flow.serviceKey]) return SERVICE_JOURNEYS[flow.serviceKey];
    const qa = loadQuickActionFlow();
    if (qa && QUICK_ACTION_JOURNEYS[qa.actionKey]) return QUICK_ACTION_JOURNEYS[qa.actionKey];
    if (getCurrentPageKey() === 'apply') {
      const params = new URLSearchParams(window.location.search);
      const serviceKey = params.get('service');
      if (serviceKey && SERVICE_JOURNEYS[serviceKey]) return SERVICE_JOURNEYS[serviceKey];
    }
    return null;
  }

  // Reads a field's current DOM state via its explicit selector or the
  // default '#'+field_id — the single place that knows how to inspect a
  // live element regardless of field type.
  function readFieldLiveValue(field) {
    const el = document.querySelector(field.selector || ('#' + field.field_id));
    if (!el) return { exists: false, value: '', checked: false, fileCount: 0 };
    return {
      exists: true,
      value: el.value !== undefined ? el.value : '',
      checked: !!el.checked,
      fileCount: (el.files && el.files.length) || 0,
    };
  }

  function isFieldSatisfied(field) {
    const live = readFieldLiveValue(field);
    switch (field.type) {
      case 'checkbox':
        // Optional toggles (e.g. sameAsAbove) never block advancing —
        // only ones explicitly flagged mustBeChecked (e.g. certifyCheck) do.
        return field.mustBeChecked ? live.checked === true : true;
      case 'radio':
        return true; // every radio group on this site ships with a default-checked option
      case 'file':
        return live.fileCount > 0;
      case 'text':
      case 'date':
      case 'select':
      default:
        return !!String(live.value || '').trim();
    }
  }

  // Mirrors apply.js's real validation semantics: a field whose
  // skipWhenFieldEquals condition matches (e.g. sameAsAbove checked) is
  // removed from what's required — exactly like the site's own disabling
  // behavior, not just visually but for what blocks advancing.
  function computeMissingFields(journey) {
    if (!journey || !journey.fields) return [];
    return journey.fields
      .filter(function (f) {
        if (f.required === false) return false;
        if (f.skipWhenFieldEquals) {
          const dep = journey.fields.find(function (x) { return x.field_id === f.skipWhenFieldEquals.field; });
          if (dep && readFieldLiveValue(dep).checked === f.skipWhenFieldEquals.equals) return false;
        }
        return !isFieldSatisfied(f);
      })
      .map(function (f) { return f.field_id; });
  }

  // Coerces a spoken/typed value into a boolean for checkbox fields —
  // accepts English and Roman Urdu yes/no phrasing.
  function coerceBoolean(value) {
    const v = String(value).trim().toLowerCase();
    return v === 'true' || v === 'yes' || v === 'haan' || v === 'han' || v === '1';
  }

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
               'Screen par button highlight ho gaya hai — ab isi waqt uss par click karein.',
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
               'Ab isi waqt uss highlighted card par click karein.',
      say_after: 'Service khul gayi hai. Ab agla qadam yeh hai: apply karne ka ' +
                 'tareeqa chunein — Self Service ya Doorstep.',
    },
    {
      id: 'select_mode',
      page: 'services',
      selector: function (flow) {
        return flow.mode === 'doorstep' ? '.apply_self' : '.apply_online';
      },
      navigates: false,
      action_label: 'Choose Self Service or Doorstep Service.',
      say_now: 'Bilkul. Main aapka pasandida tareeqa highlight kar rahi hoon — ' +
               'ab isi waqt uss par click karein.',
      say_after: 'Tareeqa select ho gaya hai. Ab agla qadam yeh hai: highlighted ' +
                 'Apply button dabayein.',
    },
    {
      id: 'apply',
      page: 'services',
      selector: function () { return '.btn-apply-service'; },
      navigates: true,
      action_label: 'Click the "Apply" button.',
      say_now: 'Apply button highlight ho gaya hai — ab isi waqt uss par click ' +
               'karein taake application form khule.',
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
      say_now: 'Submit button highlight ho gaya hai — ab isi waqt uss par click karein.',
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

  // Reads the live captcha state: answered correctly or not. Accepts an
  // optional wrapper element or CSS selector — defaults to the page-wide
  // `.math-captcha-wrapper` (apply.html has exactly one), but services.html
  // has 3 offcanvas panels whose captchas all share that class, so quick
  // actions must pass their own journey.captchaSelector explicitly. The
  // expected answer is exposed by both apply.js and services.js on
  // wrapper.dataset.answer.
  function getCaptchaState(wrapperOrSelector) {
    const wrapper = !wrapperOrSelector
      ? document.querySelector('.math-captcha-wrapper')
      : (typeof wrapperOrSelector === 'string'
          ? document.querySelector(wrapperOrSelector)
          : wrapperOrSelector);
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

  // Guided form-filling metadata now exists for every real service — this
  // is trivially true for all 6 SERVICE_JOURNEYS keys, replacing the old
  // 2-service allowlist.
  function flowHasKnownFormSchema(flow) {
    return !!SERVICE_JOURNEYS[flow.serviceKey];
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

  // Shows the pending step's highlight the instant a page loads, purely
  // client-side — it does NOT wait for the remote agent to call
  // guide_next_step(). The agent's own call (whenever it lands) just
  // re-points at the same element, which is harmless. Without this, the
  // citizen sees a blank page for however long the agent takes to react
  // to the [PAGE UPDATE] message, which reads as Maryam having lost
  // track of the flow.
  function preRenderPendingFlowStep() {
    const flow = loadFlow();
    if (!flow) return;
    const step = FLOW_STEPS[flow.stepIndex];
    if (!step || step.page !== getCurrentPageKey()) return;

    setNextStep(step.action_label);

    // Form/captcha/finish steps don't point at a fixed selector up front —
    // form fields are filled one at a time and the captcha only appears
    // once the form is complete, so there is nothing to pre-highlight yet.
    if (step.form || step.captcha || step.finish || !step.selector) return;

    let selector;
    try {
      selector = step.selector(flow);
    } catch (e) {
      return;
    }

    const existing = document.querySelector(selector) ||
      (step.fallbackSelector && document.querySelector(step.fallbackSelector));
    if (existing) {
      movePointerTo(existing);
      triggerPulse();
      return;
    }
    // Element may render slightly after DOMContentLoaded (e.g. behind a
    // brief loading state) — give it a short window before giving up.
    waitForElement(selector, 4000)
      .then(function (el) { movePointerTo(el); triggerPulse(); })
      .catch(function () { /* agent's own guide_next_step() will retry */ });
  }

  // Companion to preRenderPendingFlowStep for quick actions — re-opens
  // the offcanvas panel and re-highlights the pending phase's target the
  // instant services.html reloads (e.g. a manual refresh), for the same
  // reason: don't make the citizen wait for guide_next_step() to react.
  function preRenderPendingQuickActionStep() {
    const qa = loadQuickActionFlow();
    if (!qa || getCurrentPageKey() !== 'services') return;
    const journey = QUICK_ACTION_JOURNEYS[qa.actionKey];
    if (!journey) return;

    setNextStep(journey.label_en + ': fill in the details.');

    try {
      const offcanvasEl = document.getElementById(journey.offcanvasId);
      if (offcanvasEl && window.bootstrap && window.bootstrap.Offcanvas) {
        window.bootstrap.Offcanvas.getOrCreateInstance(offcanvasEl).show();
      }
    } catch (e) { /* guide_next_step() still works even if this fails */ }

    let selector = null;
    if (qa.phase === 'captcha') selector = journey.captchaSelector;
    else if (qa.phase === 'action') selector = journey.actionButtonSelector;
    if (!selector) return;

    waitForElement(selector, 4000)
      .then(function (el) { movePointerTo(el); triggerPulse(); })
      .catch(function () { /* agent's own guide_next_step() will retry */ });
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
      #maryam-panel.open.no-anim {
        animation: none;
      }
      @keyframes maryamPanelIn {
        from { opacity: 0; transform: scale(0.94) translateY(8px); }
        to   { opacity: 1; transform: scale(1) translateY(0); }
      }
      /* While the panel is expanded it already shows the avatar, name and
         live status — the collapsed pill and persistent label underneath
         it would just be a duplicate, overlapping copy of the same text. */
      body.maryam-panel-open #maryam-status,
      body.maryam-panel-open #maryam-label {
        display: none !important;
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

  // Persisted across page navigations — a citizen mid-guided-flow who
  // had the panel open shouldn't have it silently collapse just because
  // clicking a highlighted button loaded a new page.
  const PANEL_OPEN_KEY = 'maryam_panel_open';

  // skipAnimation: used when restoring the panel's open state on a fresh
  // page load — it should already be there, not visibly pop in.
  function openPanel(skipAnimation) {
    const panel = document.getElementById('maryam-panel');
    if (!panel) return;
    if (skipAnimation) panel.classList.add('no-anim');
    panel.classList.add('open');
    document.body.classList.add('maryam-panel-open');
    sessionStorage.setItem(PANEL_OPEN_KEY, '1');
    if (skipAnimation) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { panel.classList.remove('no-anim'); });
      });
    }
  }
  function closePanel() {
    const panel = document.getElementById('maryam-panel');
    if (panel) panel.classList.remove('open', 'no-anim');
    document.body.classList.remove('maryam-panel-open');
    sessionStorage.removeItem(PANEL_OPEN_KEY);
  }
  function togglePanel() {
    const panel = document.getElementById('maryam-panel');
    if (!panel) return;
    if (panel.classList.contains('open')) {
      closePanel();
    } else {
      openPanel();
    }
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

  // Fully stops Maryam — disconnects the room and mic, and resets the
  // widget to its pre-connection state. Distinct from muting, which
  // keeps the session alive and just stops sending audio.
  //
  // Deliberately does NOT clear an in-progress guided flow/quick action —
  // ending is a deliberate citizen action, not the same as finishing.
  // Instead it flags RESUME_PENDING_KEY so the next reconnect's
  // pushPageContext asks whether to continue, rather than either
  // silently forgetting the flow or silently barreling ahead as if
  // nothing happened.
  async function endSession() {
    closePanel();
    if (loadFlow() || loadQuickActionFlow()) {
      try { sessionStorage.setItem(RESUME_PENDING_KEY, '1'); } catch (e) {}
    }
    try {
      if (maryamRoom) await maryamRoom.disconnect();
    } catch (e) {
      console.warn('[Maryam] Error while ending session:', e);
    }
    maryamRoom = null;
    maryamConnected = false;
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

  // How long to keep the room open after end_session() is called, so the
  // citizen's already-spoken farewell line finishes playing before the
  // connection actually drops instead of being cut off mid-word.
  const END_SESSION_GRACE_MS = 4000;

  // RPC handler for end_session — called by the agent AFTER it has
  // already spoken a farewell (e.g. "Allah Hafiz"), never before. Reuses
  // endSession() itself, so an in-progress flow is preserved and offered
  // for resumption next time, exactly like the manual End button.
  async function handleEndSession() {
    setTimeout(function () { endSession(); }, END_SESSION_GRACE_MS);
    return {
      ending: true,
      presentationInstructions:
        'Do not say anything else after this call — you have already ' +
        'said your farewell line. Stay silent; the session will end on ' +
        'its own in a few seconds.',
    };
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

    // Mutually exclusive with guided_flow — see handleStartService/
    // handleStartQuickAction, which each clear the other's state.
    const qa = loadQuickActionFlow();
    if (qa) {
      live.quick_action = {
        action_key: qa.actionKey,
        phase: qa.phase,
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
      // Reads whichever fields the ACTIVE journey declares (not a fixed
      // list) — differs per service's form type, including checkboxes
      // (.checked) and file inputs (upload presence, never file content).
      const journey = getActiveJourney();
      const values = {};
      if (journey) {
        journey.fields.forEach(function (f) {
          const lv = readFieldLiveValue(f);
          if (!lv.exists) return;
          if (f.type === 'checkbox') values[f.field_id] = lv.checked;
          else if (f.type === 'file') values[f.field_id] = lv.fileCount > 0 ? 'uploaded' : '';
          else if (f.type === 'radio') values[f.field_id] = lv.checked ? lv.value : '';
          else values[f.field_id] = lv.value || '';
        });
      }
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

  // Returns the full journey for a service_key or a quick-action's
  // action_key — whichever map it's found in. This is the SAME object
  // the internal flow engine (executeCurrentFlowStep, handleFillField,
  // computeMissingFields) reads from, so what this tool reports and how
  // Maryam actually guides can never drift apart.
  function handleGetServiceJourney(payload) {
    const key = payload && (payload.key || payload.service_key || payload.action_key);
    if (!key) {
      return {
        found: false,
        error: 'key missing',
        presentationInstructions:
          'Mujhe pata nahi chala kaunsi service ya action ke baare mein ' +
          'poochha ja raha hai. User se service ka naam dobara poochhein.',
      };
    }
    const journey = getJourneyByKey(key);
    if (!journey) {
      return {
        found: false,
        error: 'unknown key: ' + key,
        presentationInstructions:
          'Yeh service ya action mujhe nahi mili. Key dobara jaanch karein ' +
          'ya user se poochhein woh kya chahte hain.',
      };
    }
    const isQuickAction = !!QUICK_ACTION_JOURNEYS[key];
    return {
      found: true,
      kind: isQuickAction ? 'quick_action' : 'service',
      ...journey,
      presentationInstructions:
        'Yeh journey ki poori tafseel hai — fields, unka order, aur ' +
        (journey.hasCaptcha === false ? 'is mein koi captcha nahi hai' : 'ek captcha step hai') + '. ' +
        (journey.decorativeFieldsNote
          ? 'Yeh extra fields sirf UI mein hain, bharne ki zaroorat nahi: ' +
            journey.decorativeFieldsNote.join(', ') + '. '
          : '') +
        'Ab ' + (isQuickAction ? 'start_quick_action' : 'start_service') + ' call karein.',
    };
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

    // A service flow and a quick-action flow are mutually exclusive.
    clearQuickActionFlow();

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

  // -------------------------------------------------------------------
  // SECTION 6B — Quick-action step runner (Track Application, e-License,
  // Verify License)
  //
  // Structurally separate from the FLOW_STEPS/executeCurrentFlowStep
  // engine above: FLOW_STEPS is built entirely around page navigation
  // (`page`, `navigates`, page-mismatch re-anchoring), but quick actions
  // never navigate — they just open a Bootstrap offcanvas on the current
  // services.html page and have their own captcha instance scoped to
  // that panel. Reuses the same primitives (pointAndAwaitClick,
  // computeMissingFields, getCaptchaState/awaitCaptchaCorrect,
  // handleFillField) as the service-flow engine above.
  // -------------------------------------------------------------------
  const QUICK_ACTION_STORAGE_KEY = 'maryam_quick_action';

  function loadQuickActionFlow() {
    let qa;
    try {
      qa = JSON.parse(sessionStorage.getItem(QUICK_ACTION_STORAGE_KEY));
    } catch (e) { return null; }
    if (!qa) return null;
    if (qa.startedAt && (Date.now() - qa.startedAt) > FLOW_TTL_MS) {
      console.warn('[Maryam] Discarding stale quick-action flow');
      clearQuickActionFlow();
      return null;
    }
    return qa;
  }
  function saveQuickActionFlow(qa) {
    sessionStorage.setItem(QUICK_ACTION_STORAGE_KEY, JSON.stringify(qa));
  }
  function clearQuickActionFlow() {
    sessionStorage.removeItem(QUICK_ACTION_STORAGE_KEY);
  }

  // Quick-action entry point: opens the offcanvas panel and starts at
  // its first phase. Mutually exclusive with a service guided flow.
  async function handleStartQuickAction(payload) {
    const actionKey = payload && payload.action_key;
    const journey = QUICK_ACTION_JOURNEYS[actionKey];
    if (!actionKey || !journey) {
      return {
        active: false,
        error: 'unknown action_key: ' + actionKey,
        presentationInstructions:
          'Mujhe pata nahi chala kaunsa quick action chahiye. User se ' +
          'poochhein woh Track Application, e-License, ya Verify License ' +
          'mein se kya chahte hain.',
      };
    }
    if (getCurrentPageKey() !== 'services') {
      return {
        active: false,
        error: 'wrong page for quick action',
        presentationInstructions:
          'Yeh sirf Services page par available hai. Pehle navigate_to_page ' +
          'se services page par jayein, phir dobara koshish karein.',
      };
    }

    console.log('[Maryam] start_quick_action:', actionKey);
    showToolBadge('🧭 ' + actionKey);

    // A quick-action flow and a service flow are mutually exclusive.
    clearFlow();

    try {
      const offcanvasEl = document.getElementById(journey.offcanvasId);
      if (offcanvasEl && window.bootstrap && window.bootstrap.Offcanvas) {
        window.bootstrap.Offcanvas.getOrCreateInstance(offcanvasEl).show();
      }
    } catch (e) {
      console.warn('[Maryam] Could not open offcanvas for quick action:', actionKey, e);
    }

    saveQuickActionFlow({
      actionKey: actionKey,
      phase: journey.fields.length ? 'fields' : (journey.hasCaptcha ? 'captcha' : 'action'),
      startedAt: Date.now(),
    });

    return executeCurrentQuickActionStep();
  }

  // Executes the quick action's current phase and advances on
  // completion — mirrors executeCurrentFlowStep's shape but without any
  // page-navigation/page-mismatch concept, since quick actions never
  // navigate.
  async function executeCurrentQuickActionStep() {
    const qa = loadQuickActionFlow();
    if (!qa) {
      return {
        active: false,
        presentationInstructions:
          'Koi quick action active nahi hai. Pehle start_quick_action call karein.',
      };
    }
    const journey = QUICK_ACTION_JOURNEYS[qa.actionKey];
    if (!journey) {
      clearQuickActionFlow();
      return {
        active: false,
        presentationInstructions: 'Yeh quick action nahi mili. User se dobara poochhein.',
      };
    }

    setNextStep(journey.label_en + ': fill in the details.');

    // ── Fields phase ──────────────────────────────────────────
    if (qa.phase === 'fields') {
      const missing = computeMissingFields(journey);
      if (missing.length === 0) {
        qa.phase = journey.hasCaptcha ? 'captcha' : 'action';
        saveQuickActionFlow(qa);
        return executeCurrentQuickActionStep();
      }
      return {
        active: true,
        phase: 'fields',
        fields: journey.fields,
        remaining_fields: missing,
        presentationInstructions:
          journey.label_en + ' form khul gaya hai. Fields ek ek kar ke bharein: ' +
          'har field ke liye user se value poochhein, verbally confirm karein, ' +
          'phir fill_field call karein. Abhi yeh fields baqi hain: ' +
          missing.join(', ') + '. Sab bharne ke baad guide_next_step call ' +
          'karein — main captcha (agar hai) aur action button khud dikhaungi.',
      };
    }

    // ── Captcha phase — same semantics as the service flow's captcha
    //    step, but scoped to this panel's own offcanvas-local captcha. ──
    if (qa.phase === 'captcha') {
      if (journey.hasCaptcha === false) {
        qa.phase = 'action';
        saveQuickActionFlow(qa);
        return executeCurrentQuickActionStep();
      }

      const captchaSelector = journey.captchaSelector;
      const captcha = getCaptchaState(captchaSelector);
      if (captcha.correct) {
        qa.phase = 'action';
        saveQuickActionFlow(qa);
        return executeCurrentQuickActionStep();
      }

      let wrapper;
      try {
        wrapper = await waitForElement(captchaSelector, 3000);
      } catch (err) {
        console.error('[Maryam] Quick-action captcha element not found:', err.message);
        return {
          active: true,
          phase: 'captcha',
          captcha_correct: false,
          error: err.message,
          presentationInstructions:
            'Security sawal panel mein nahi mil raha. User se kahein ke ' +
            'panel dobara khulwayein, phir guide_next_step dobara call karein.',
        };
      }

      movePointerTo(wrapper);
      triggerPulse();
      setStatus('Next step: solve the highlighted box');
      setNextStep('Solve the highlighted math question.');

      const state = await awaitCaptchaCorrect(wrapper, CAPTCHA_TIMEOUT_MS);

      if (state.correct) {
        hidePointer();
        setStatus('', false);
        return {
          active: true,
          phase: 'captcha',
          captcha_correct: true,
          presentationInstructions:
            'SPEAK THIS NOW: "Security sawal ka jawab sahi hai. Ab agla ' +
            'qadam yeh hai: ' + journey.label_en + ' button dabana." — then ' +
            'immediately call guide_next_step(). Never say the captcha ' +
            'answer out loud, and do not thank the citizen.',
        };
      }

      return {
        active: true,
        phase: 'captcha',
        captcha_correct: false,
        still_waiting: true,
        captcha_answered: getCaptchaState(captchaSelector).answered,
        captcha_question: captcha.question,
        presentationInstructions:
          'SPEAK THIS NOW, do not highlight silently — say: "Screen par ' +
          'security sawal highlight ho gaya hai: ' +
          (captcha.question || 'chota sa math sawal') + '. Iska jawab khud ' +
          'box mein type karein." Aap jawab hargiz na batayein. Phir ' +
          'guide_next_step() dobara call karein.',
      };
    }

    // ── Action phase: click the panel's primary button ──────────
    if (qa.phase === 'action') {
      const onClicked = function () {
        const current = loadQuickActionFlow();
        if (!current) return;
        if (current.phase === qa.phase) {
          current.phase = 'done';
          saveQuickActionFlow(current);
        }
        sendRoomText(
          '[CLICK: quick_action_action] (system message — citizen clicked ' +
          'the highlighted button.) Say: "Theek hai, ho gaya." — then ' +
          'immediately call guide_next_step() to confirm the result.'
        );
      };

      // Fire and forget, same reasoning as executeCurrentFlowStep: speak
      // the instant the highlight appears, don't wait for the click.
      pointAndAwaitClick(journey.actionButtonSelector, {
        onClicked: onClicked,
        actionLabel: 'Click "' + journey.label_en + '".',
      }).then(function (r) {
        if (r.clicked) return;
        if (r.timed_out) {
          sendRoomText(
            '[STILL WAITING — system message] The citizen has not yet ' +
            'clicked the highlighted "' + journey.label_en + '" button. ' +
            'Gently remind them once (in Urdu), then wait quietly again.'
          );
          return;
        }
        console.error('[Maryam] Could not point at quick-action button', journey.actionButtonSelector, r.reason);
      });

      return {
        active: true,
        phase: 'action',
        pointed: true,
        waiting_for_click: true,
        presentationInstructions:
          'SPEAK THIS RIGHT NOW, in this same turn — do not highlight ' +
          'silently and wait: "Highlighted button par ab isi waqt click ' +
          'karein." The citizen stays on this same page — do NOT call any ' +
          'tool right now, wait quietly. A [CLICK] message will arrive the ' +
          'moment they click; speak its line and call guide_next_step() ' +
          'immediately when it does.',
      };
    }

    // ── Done: confirm the demo note appeared ─────────────────────
    if (qa.phase === 'done') {
      const noteEl = document.querySelector(journey.demoNoteSelector);
      const shown = !!noteEl && noteEl.classList.contains('show');
      if (shown) {
        clearQuickActionFlow();
        setNextStep(null);
        return {
          active: false,
          completed: true,
          presentationInstructions:
            'SPEAK THIS NOW: "' + journey.demoNoteText_ur + '" — say it ' +
            'warmly, as an upfront disclosure, not as a failure. Then ask ' +
            'if the citizen needs anything else.',
        };
      }
      return {
        active: true,
        phase: 'done',
        still_waiting: true,
        presentationInstructions:
          'Abhi tak result nahi aaya. guide_next_step() dobara call karein.',
      };
    }

    // Unknown phase — should be unreachable, but never leave the agent
    // with a rejected tool call.
    clearQuickActionFlow();
    return {
      active: false,
      error: 'unknown quick-action phase: ' + qa.phase,
      presentationInstructions:
        'Ek masla aaya. User se maazrat karein aur dobara koshish karein.',
    };
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
      const journey = SERVICE_JOURNEYS[flow.serviceKey];

      if (!flowHasKnownFormSchema(flow)) {
        // Unknown form schema — guide generically, don't invent fields.
        // Should be unreachable now that all 6 real services have a
        // journey; kept as a safety net for an unrecognized service_key.
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

      const missing = computeMissingFields(journey);

      if (missing.length === 0) {
        // All fields filled — advance to the captcha step.
        advanceFlow(flow);
        return executeCurrentFlowStep(isRetryAfterMismatch, { skipDebounce: true });
      }

      return {
        active: true,
        step: 'form',
        known_schema: true,
        live: live,
        fields: journey.fields,
        remaining_fields: missing,
        decorative_fields_note: journey.decorativeFieldsNote || null,
        presentationInstructions:
          'Application form khul gaya hai. Fields ek ek kar ke bharein: ' +
          'har field ke liye user se value poochhein, verbally confirm karein, ' +
          'phir fill_field call karein. Abhi yeh fields baqi hain: ' +
          missing.join(', ') + '. Sab bharne ke baad guide_next_step call ' +
          'karein — main captcha (agar hai) aur submit khud dikhaungi.',
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
      const journey = SERVICE_JOURNEYS[flow.serviceKey];

      if (journey && journey.hasCaptcha === false) {
        // This form type (e.g. Learner License) never includes a captcha
        // — skip straight to the submit step.
        advanceFlow(flow);
        return executeCurrentFlowStep(isRetryAfterMismatch, { skipDebounce: true });
      }

      const captchaSelector = (journey && journey.captchaSelector) || '.math-captcha-wrapper';
      const captcha = getCaptchaState(captchaSelector);
      if (captcha.correct) {
        // Already answered correctly — advance immediately.
        advanceFlow(flow);
        return executeCurrentFlowStep(isRetryAfterMismatch, { skipDebounce: true });
      }

      let wrapper;
      try {
        wrapper = await waitForElement(captchaSelector, 3000);
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
        captcha_answered: getCaptchaState(captchaSelector).answered,
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
      const finishJourney = SERVICE_JOURNEYS[flow.serviceKey];
      const finishCaptchaSelector = (finishJourney && finishJourney.captchaSelector) || '.math-captcha-wrapper';
      const captcha = getCaptchaState(finishCaptchaSelector);
      const captchaError =
        document.querySelector(finishCaptchaSelector + ' .captcha_error');
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

    // Fire and forget for EVERY pointing step, not just navigating ones —
    // awaiting the click here meant the tool call itself didn't return
    // until the citizen had already clicked (up to 20s later), so the
    // agent had nothing to say until after the fact. Speaking must happen
    // the instant the highlight appears, so we return say_now right away
    // and let the click land asynchronously; sendClickNotification (via
    // the still-open room — same page, nothing unloads) is what tells the
    // agent afterward to speak the confirmation and advance.
    pointAndAwaitClick(selector, {
      timeoutMs: step.navigates ? 0 : POINT_TIMEOUT_MS,
      onClicked: onClicked,
      actionLabel: step.action_label,
    }).then(function (r) {
      if (r.clicked) return;
      if (r.timed_out) {
        console.log('[Maryam] Point timed out without a click:', step.id);
        sendStillWaitingNotification(step);
        return;
      }
      console.log('[Maryam] Point ended without a click:', step.id, r);
    });

    if (step.navigates) {
      return {
        active: true,
        step: step.id,
        pointed: true,
        navigates: true,
        waiting_for_click: true,
        presentationInstructions:
          'SPEAK THIS RIGHT NOW, in this same turn — do not highlight ' +
          'silently and wait: "' +
          (step.say_now ||
            'Button highlight ho gaya hai — ab isi waqt uss par click karein.') +
          '" Uss click se naya page khulega. Koi tool call na karein — ' +
          'agla [PAGE UPDATE] message aane ka intezaar karein, phir ' +
          'foran guide_next_step() call karein.',
      };
    }

    return {
      active: true,
      step: step.id,
      pointed: true,
      waiting_for_click: true,
      presentationInstructions:
        'SPEAK THIS RIGHT NOW, in this same turn — do not highlight ' +
        'silently and wait: "' +
        (step.say_now ||
          'Button highlight ho gaya hai — ab isi waqt uss par click karein.') +
        '" The citizen stays on this same page for this step — do NOT ' +
        'call any tool right now, just wait quietly. A [CLICK] message ' +
        'will arrive the moment they click; when it does, speak its line ' +
        'and call guide_next_step() immediately. If a reminder message ' +
        'arrives instead, gently remind them once, then keep waiting.',
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
        'This is the signal that the click actually happened — the ' +
        'guide_next_step() result you got when you started pointing only ' +
        'told you to wait, not that it was clicked. Speak the line above ' +
        'now, then call guide_next_step() immediately.';
    }

    sendRoomText(msg);
  }

  // Sent when a same-page pointing step's click never arrived within the
  // normal wait window. Gentle, one-time — the pointer stays on screen
  // either way, so there's nothing else to do but nudge once.
  function sendStillWaitingNotification(step) {
    const msg =
      '[STILL WAITING — system message] The citizen has not yet clicked ' +
      'the highlighted item for "' + (step.action_label || step.id) + '". ' +
      'Gently remind them once (in Urdu) to tap the highlighted item, then ' +
      'wait quietly again — do not call any tool right now.';
    sendRoomText(msg);
  }

  // Shared best-effort send used by both notifications above: try sendText
  // first, fall back to publishData, and never throw either way — this is
  // always a redundant/secondary signal, not something worth surfacing an
  // error for.
  function sendRoomText(msg) {
    if (!maryamRoom || !maryamConnected) return;
    maryamRoom.localParticipant
      .sendText(msg, { topic: 'lk.chat' })
      .catch(function (err) {
        console.warn('[Maryam] sendRoomText failed, trying publishData:', err);
        maryamRoom.localParticipant
          .publishData(new TextEncoder().encode(msg), { reliable: true, topic: 'lk.chat' })
          .catch(function (e2) {
            console.warn('[Maryam] sendRoomText data also failed:', e2);
          });
      });
  }

  async function handleGuideNextStep() {
    showToolBadge('🧭 Next step');
    // A quick-action flow and a service flow are mutually exclusive —
    // whichever one is active is the one this call advances.
    if (loadQuickActionFlow()) return executeCurrentQuickActionStep();
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

    // The client-side router (assets/js/router.js) intercepts this exact
    // same navigation for real <a> clicks — route through it here too, so
    // Maryam's own navigate_to_page call no longer tears down the LiveKit
    // room mid-flow. Fall back to a real reload only if the router script
    // somehow failed to load.
    if (window.__maryamRouter && window.__maryamRouter.navigateTo) {
      window.__maryamRouter.navigateTo(url);
    } else {
      // Flag so the next page auto-reconnects without another click.
      const saved = loadSavedSession();
      if (saved) saveSession({ ...saved, agentNavigated: true });
      window.location.href = url;
    }
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

    // Checks THIS specific wrapper, not the page-wide default — services.html
    // has multiple offcanvas panels' `.math-captcha-wrapper` elements
    // coexisting in the DOM at once, so getCaptchaState()'s unscoped
    // default (the first one in document order) would silently compare
    // against the wrong panel's answer for every quick action except
    // whichever one happens to be first.
    function isThisWrapperCorrect() {
      const input = wrapper.querySelector('.math-captcha-input');
      const val = input ? input.value.trim() : '';
      return val !== '' && Number(val) === Number(wrapper.dataset.answer);
    }

    return new Promise((resolve) => {
      const input = wrapper.querySelector('.math-captcha-input');
      if (!input) {
        return resolve({ correct: false, cancelled: true,
                         reason: 'captcha input not found' });
      }
      if (isThisWrapperCorrect()) return resolve({ correct: true });

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
        if (!isThisWrapperCorrect()) return; // wait until it's actually right
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
    // Never fall back to the raw CSS selector here — that's internal
    // plumbing, not something a citizen should ever see on screen.
    const targetLabel = labelMap[selector] || 'the highlighted item';
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

  // How long a file-upload wait may hold a tool call open. Longer than a
  // normal click wait — the citizen has to navigate an OS file picker,
  // not just tap something already on screen.
  const FILE_WAIT_TIMEOUT_MS = 60000;

  // Sibling of pointAndAwaitClick, for fields the agent cannot fill
  // itself — file uploads. apply.js's wireDropzone() already adds a
  // `has-file` class to the dropzone the instant the citizen picks a
  // real file, so this highlights the dropzone and resolves once that
  // class appears, instead of waiting for a click. Never fabricates a
  // file. Shares the same activePointCancel/pointOpSeq plumbing as
  // pointAndAwaitClick so a new point operation from either function
  // correctly supersedes the other.
  //
  // Returns { satisfied:true, element_id } | { satisfied:false, timed_out:true, element_id }
  //        | { satisfied:false, cancelled:true, element_id, reason }
  async function pointAndAwaitCondition(selector, opts) {
    opts = opts || {};
    const timeoutMs = opts.timeoutMs === undefined ? FILE_WAIT_TIMEOUT_MS : opts.timeoutMs;
    const conditionClass = opts.conditionClass || 'has-file';

    const myOp = ++pointOpSeq;
    if (activePointCancel) activePointCancel('superseded by new point operation');

    let el;
    try {
      el = await waitForElement(selector);
    } catch (err) {
      console.warn('[Maryam] condition target never appeared:', selector, err.message);
      return { satisfied: false, cancelled: true, element_id: selector, reason: err.message };
    }
    if (myOp !== pointOpSeq) {
      return { satisfied: false, cancelled: true, element_id: selector,
               reason: 'superseded while waiting for element' };
    }

    movePointerTo(el);
    triggerPulse();
    // Never fall back to the raw CSS selector here — internal plumbing,
    // not something a citizen should ever see on screen.
    setNextStep(opts.actionLabel || 'Complete the highlighted step.');

    if (el.classList.contains(conditionClass)) {
      hidePointer();
      return { satisfied: true, element_id: selector };
    }

    return new Promise((resolve) => {
      let observer = null;
      let timer = null;
      let settled = false;
      let disposed = false;

      function dispose() {
        if (disposed) return;
        disposed = true;
        if (timer) clearTimeout(timer);
        if (observer) observer.disconnect();
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
        settle({ satisfied: false, cancelled: true, element_id: selector, reason: reason });
      }
      activePointCancel = cancel;

      observer = new MutationObserver(() => {
        if (myOp !== pointOpSeq) return; // superseded
        if (el.classList.contains(conditionClass)) {
          dispose();
          hidePointer();
          settle({ satisfied: true, element_id: selector });
        }
      });
      observer.observe(el, { attributes: true, attributeFilter: ['class'] });

      if (timeoutMs > 0) {
        timer = setTimeout(function () {
          // Deliberately NOT disposing — a late file pick must still count.
          console.log('[Maryam] Condition wait timed out (still listening):', selector);
          settle({ satisfied: false, timed_out: true, element_id: selector });
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

      const journey = getActiveJourney();
      const fieldMeta = journey && journey.fields.find((f) => f.field_id === fieldId);
      const selector = (fieldMeta && fieldMeta.selector) || ('#' + fieldId);

      // A field whose prerequisite isn't filled yet (e.g. a district
      // before its province) is refused outright — a defensive backstop
      // against the agent asking out of order, independent of whichever
      // conversation order it chose.
      if (fieldMeta && fieldMeta.dependsOn) {
        const dep = journey.fields.find((f) => f.field_id === fieldMeta.dependsOn);
        if (dep && !isFieldSatisfied(dep)) {
          return {
            filled: false,
            field_name: fieldId,
            error: fieldMeta.dependsOn + ' must be filled first',
            presentationInstructions:
              'Pehle "' + (dep.label_en || fieldMeta.dependsOn) + '" poochhein ' +
              'aur bharein, phir yeh field dobara try karein.',
          };
        }
      }

      const el = await waitForElement(selector);

      // File inputs: the agent can never fabricate a citizen's document —
      // point at the visible dropzone and wait for a REAL file pick
      // (apply.js's wireDropzone() adds `has-file` to it), never touch
      // el.value/.files directly.
      if (fieldMeta && fieldMeta.type === 'file') {
        const dropzoneSelector = fieldMeta.dropzoneSelector || selector;
        const outcome = await pointAndAwaitCondition(dropzoneSelector, {
          conditionClass: 'has-file',
          actionLabel: 'Upload: ' + (fieldMeta.label_en || fieldId),
        });
        if (outcome.satisfied) {
          return { filled: true, field_name: fieldId, manual_action: true };
        }
        return {
          filled: false,
          field_name: fieldId,
          still_waiting: !!outcome.timed_out,
          presentationInstructions:
            'SPEAK THIS: describe exactly where the upload box is (' +
            (fieldMeta.label_en || fieldId) + ') and ask the citizen to ' +
            'pick a real file there. Do NOT claim a file is uploaded or ' +
            'invent one. Once they say they picked a file, call ' +
            'guide_next_step() or fill_field() again to re-check.',
        };
      }

      // Move pointer to the field (not awaited — see movePointerTo)
      movePointerTo(el);
      triggerPulse();

      setNextStep('Filling in: ' + (fieldMeta ? fieldMeta.label_en : fieldId));

      // Highlight the field
      el.classList.add('field-highlight');

      if (el.type === 'checkbox') {
        const desired = coerceBoolean(value);
        el.checked = desired;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        clearFieldHighlightSoon(el);
        return { field_name: fieldId, value: desired, filled: true };
      }

      if (el.type === 'radio') {
        // field_name here identifies the SPECIFIC option (its own id),
        // not the shared group name.
        el.checked = true;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        clearFieldHighlightSoon(el);
        return { field_name: fieldId, value: el.value, filled: true };
      }

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
      name: 'get_service_journey',
      handler: handleGetServiceJourney,
      recovery_ur: 'Is service ki tafseelat nahi mil sakin. Dobara ' +
                   'koshish karein ya user se service ka naam poochhein.',
    },
    {
      name: 'start_service',
      handler: handleStartService,
      recovery_ur: 'Service shuru karne mein masla aaya. User se maazrat ' +
                   'karein aur dobara koshish karein.',
    },
    {
      name: 'start_quick_action',
      handler: handleStartQuickAction,
      recovery_ur: 'Yeh quick action shuru karne mein masla aaya. User se ' +
                   'maazrat karein aur dobara koshish karein.',
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
    {
      name: 'end_session',
      handler: handleEndSession,
      recovery_ur: 'Session band karne mein masla aaya — koi baat nahi, ' +
                   'aap chahein to khud mic button se session band kar sakte hain.',
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

  // Fetches a session but does NOT save it to sessionStorage — used by the
  // cold-start pre-warm below, so merely loading the page never leaves a
  // token behind. A saved session must mean "the citizen actually started
  // talking to Maryam" — the auto-reconnect logic on the next reload is
  // gated on exactly that, and a token saved just from pre-warming (with
  // no real connection ever happening) would falsely trigger it, racing
  // an unwanted background auto-reconnect against a genuine mic click.
  async function fetchNewSessionData() {
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
    return res.json();
  }

  async function createNewSession() {
    const data = await fetchNewSessionData();
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
  // Kicked off immediately on DOMContentLoaded (see SECTION 9), in
  // parallel with the rest of page setup, so the network round-trip for
  // the very first session isn't waiting on the mic-button click too.
  // One-shot: only the first real connect of the tab's lifetime benefits
  // from it (the persistent-shell router means there is normally only
  // ever one connect per tab at all — see connectAndRegisterTools).
  let pendingSessionPromise = null;

  async function getOrResumeSession() {
    if (pendingSessionPromise) {
      const inFlight = pendingSessionPromise;
      pendingSessionPromise = null;
      const preWarmed = await inFlight;
      if (preWarmed) {
        // Only now — at the moment it's actually being used for a real
        // connection — does this become a "saved session" for the
        // auto-reconnect logic's purposes.
        saveSession(preWarmed);
        return preWarmed;
      }
      // Pre-warm failed — fall through to a fresh attempt below.
    }
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
  let maryamConnecting = false;   // guard against concurrent connectAndRegisterTools() calls

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

    // A previous session was manually ended while a flow/quick action was
    // still active — the citizen has now reconnected. Ask before resuming
    // instead of either forgetting it or barreling ahead unasked.
    let resumeAfterEnd = false;
    try {
      if (sessionStorage.getItem(RESUME_PENDING_KEY)) {
        sessionStorage.removeItem(RESUME_PENDING_KEY);
        resumeAfterEnd = true;
      }
    } catch (e) {
      console.warn('[Maryam] Could not read resume-pending flag:', e);
    }

    const live = buildLiveContext();
    let text;

    if (live.guided_flow) {
      // Lead with the imperative so the agent calls guide_next_step before
      // generating any speech. Follow with a full self-contained briefing so
      // the agent can resume correctly even without prior conversation context.
      const flow = loadFlow();
      const briefing = flow ? buildFlowBriefing(flow) : '';
      text = resumeAfterEnd
        ? '[SESSION RESUMED — ACTION REQUIRED] The citizen ended the ' +
          'previous session while this guided flow was still in progress, ' +
          'and has just reconnected. Greet them normally, then in ONE ' +
          'short line mention what you were doing last time and ask if ' +
          'they want to continue — for example: "Pichli dafa hum "' +
          live.guided_flow.service_key + '" ke silsile mein "' +
          live.guided_flow.current_step + '" step par thay — kya aap yehi ' +
          'jaari rakhna chahte hain?" Wait for their answer before calling ' +
          'guide_next_step(). If they say yes, call guide_next_step() and ' +
          'speak its presentationInstructions right away. If they say no ' +
          'or want something else, help with that instead — do not force ' +
          'the old flow. ' +
          briefing + ' ' +
          'Guided flow "' + live.guided_flow.service_key +
          '" is PAUSED at step "' + live.guided_flow.current_step +
          '" (' + live.guided_flow.step_number + '/' + live.guided_flow.total_steps + '). ' +
          'Citizen is now on the "' + live.page + '" page. ' +
          'Technical context: ' + JSON.stringify(live)
        : '[PAGE UPDATE — ACTION REQUIRED] You already have full context on ' +
          'this citizen and exactly where they are in this flow (see below) ' +
          '— do NOT act confused, do NOT re-introduce yourself, and do NOT ' +
          'go quiet waiting for the citizen to speak first. ' +
          'CALL guide_next_step() NOW, then IMMEDIATELY speak its ' +
          'presentationInstructions line out loud in this same turn — the ' +
          'highlight on screen means nothing to the citizen until you say ' +
          'what to do with it. ' +
          briefing + ' ' +
          'Guided flow "' + live.guided_flow.service_key +
          '" is ACTIVE at step "' + live.guided_flow.current_step +
          '" (' + live.guided_flow.step_number + '/' + live.guided_flow.total_steps + '). ' +
          'Citizen is now on the "' + live.page + '" page (' + reason + '). ' +
          'Technical context: ' + JSON.stringify(live);
    } else if (live.quick_action) {
      // Quick actions never navigate away from services.html, so outside
      // the resumeAfterEnd case this path is rare — a LiveKit reconnect
      // (e.g. after an audio drop) while the offcanvas is still open.
      text = resumeAfterEnd
        ? '[SESSION RESUMED — ACTION REQUIRED] The citizen ended the ' +
          'previous session mid-way through this quick action, and has ' +
          'just reconnected. Greet them normally, mention what you were ' +
          'doing ("' + live.quick_action.action_key + '") in one short ' +
          'line, and ask if they want to continue before calling ' +
          'guide_next_step(). If they say no or want something else, help ' +
          'with that instead. Quick action "' + live.quick_action.action_key +
          '" is PAUSED at phase "' + live.quick_action.phase + '". ' +
          'Citizen is now on the "' + live.page + '" page. ' +
          'Technical context: ' + JSON.stringify(live)
        : '[PAGE UPDATE — ACTION REQUIRED] You already have full context on ' +
          'this citizen\'s quick action (see below) — do NOT act confused. ' +
          'CALL guide_next_step() NOW, then IMMEDIATELY speak its ' +
          'presentationInstructions line out loud in this same turn. ' +
          'Quick action "' + live.quick_action.action_key +
          '" is ACTIVE at phase "' + live.quick_action.phase + '". ' +
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
    if (maryamConnecting) {
      console.warn('[Maryam] connectAndRegisterTools() already in progress — skipping duplicate call');
      return;
    }
    maryamConnecting = true;
    try {

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

    // Buffer: ParticipantConnected fires when the worker appears in the room,
    // but its LLM session and data-channel subscription are not ready yet.
    // Sending the greeting immediately races with that startup window and the
    // message is silently dropped. A short wait lets the pipeline finish.
    if (agentPresent) {
      await delay(1200);
    }

    await pushPageContext(reason);

    // Retry the greeting until the agent responds with audio — audio-track
    // subscription is the most reliable proxy for "the agent received the
    // message and has started generating a response". Retrying on participant
    // count alone (the old check) never triggered when the participant was
    // present but the data pipeline wasn't ready.
    const MAX_GREETING_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_GREETING_RETRIES; attempt++) {
      // Stop if the room was replaced by a concurrent connect (RC-1 safety).
      if (!maryamConnected || maryamRoom !== room) break;

      // Stop if the agent already responded (subscribed audio track present).
      let agentHasAudio = false;
      room.remoteParticipants.forEach(function (p) {
        p.trackPublications.forEach(function (pub) {
          if (pub.track && pub.track.kind === LivekitClient.Track.Kind.Audio) {
            agentHasAudio = true;
          }
        });
      });
      if (agentHasAudio || maryamAudioPlaying) break;

      // Stop if everyone left (disconnected mid-greeting).
      if (room.remoteParticipants.size === 0) break;

      await delay(3500);

      // Re-check after the wait — agent may have responded while we waited.
      if (!maryamConnected || maryamRoom !== room) break;
      agentHasAudio = false;
      room.remoteParticipants.forEach(function (p) {
        p.trackPublications.forEach(function (pub) {
          if (pub.track && pub.track.kind === LivekitClient.Track.Kind.Audio) {
            agentHasAudio = true;
          }
        });
      });
      if (agentHasAudio || maryamAudioPlaying) break;

      console.warn('[Maryam] No agent audio after ' + (attempt * 3.5) + 's — retrying greeting push (' +
        attempt + '/' + MAX_GREETING_RETRIES + ')');
      await pushPageContext(reason + ' (retry ' + attempt + ')');
    }

    await delay(500);
    setStatus('', false);

    } finally {
      maryamConnecting = false;
    }
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

      // Connection already in progress (e.g. auto-reconnect) — ignore the
      // click so we don't spin up a second concurrent room.
      if (maryamConnecting) return;

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
    // Cold start (first real load, or a hard refresh) is the only case
    // left where a real reconnect happens — start the network round-trip
    // for it immediately, in parallel with the rest of setup, instead of
    // waiting for the mic-button click. Saves real seconds off the
    // visible "Connecting to Maryam..." delay; getOrResumeSession() picks
    // this up whenever the first connect actually happens.
    pendingSessionPromise = fetchNewSessionData().catch((err) => {
      console.warn('[Maryam] Pre-warm session creation failed (will retry on connect):', err);
      return null;
    });

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
    // Restore the expanded panel's open state across navigation — only
    // meaningful if a session is actually expected to reconnect below.
    const saved = loadSavedSession();
    if (saved && sessionStorage.getItem(PANEL_OPEN_KEY) === '1') {
      openPanel(true);
    } else {
      sessionStorage.removeItem(PANEL_OPEN_KEY);
    }

    // If a guided flow is already mid-way through on this exact page,
    // highlight the pending element immediately — do not wait for the
    // agent's own guide_next_step() tool call, which can lag a few
    // seconds behind the page load and reads as Maryam having forgotten
    // where the citizen was.
    preRenderPendingFlowStep();
    preRenderPendingQuickActionStep();

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

  // Debug handle — lets us drive the flow from the browser console during
  // the demo build, and lets a headless test script call the exact RPC
  // handler functions directly (equivalent to driving the real RPC layer
  // minus the LiveKit transport).
  window.__maryam = {
    get room() { return maryamRoom; },
    get connected() { return maryamConnected; },
    loadFlow, saveFlow, clearFlow, pushPageContext,
    executeCurrentFlowStep, getCaptchaState, buildLiveContext, FLOW_STEPS,
    SERVICE_JOURNEYS, QUICK_ACTION_JOURNEYS, getJourneyByKey, computeMissingFields,
    handleStartService, handleGuideNextStep, handleFillField,
    handleGetServiceJourney, handleStartQuickAction,
    loadQuickActionFlow, executeCurrentQuickActionStep,
    preRenderPendingFlowStep, preRenderPendingQuickActionStep,
    endSession, handleEndSession,
  };
})();
