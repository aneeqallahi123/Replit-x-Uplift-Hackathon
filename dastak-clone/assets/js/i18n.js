// Lightweight in-place English/Urdu toggle for the static mockup pages.
// Elements opt in with data-i18n="key" (innerHTML swap) or
// data-i18n-placeholder="key" (input placeholder swap). Adding a new
// language later only means adding another column to DASTAK_I18N below.
(function () {
    'use strict';

    var STORAGE_KEY = 'dastak_lang';

    var DASTAK_I18N = {
        // ---- Navbar ----
        nav_home: { en: 'Home', ur: 'ہوم' },
        nav_about: { en: 'About', ur: 'ہمارے بارے میں' },
        nav_services: { en: 'Services', ur: 'خدمات' },
        nav_partners: { en: 'Our Partners', ur: 'ہمارے شراکت دار' },
        nav_news: { en: 'News', ur: 'خبریں' },
        nav_contact: { en: 'Contact', ur: 'رابطہ' },
        nav_become_facilitator: { en: 'Become a Facilitator', ur: 'سہولت کار بنیں' },
        nav_register_applicant: { en: 'Register as Applicant', ur: 'درخواست گزار کے طور پر رجسٹر کریں' },
        nav_login: { en: 'Login', ur: 'لاگ ان' },
        nav_my_profile: { en: 'My Profile', ur: 'میری پروفائل' },
        nav_my_applications: { en: 'My Applications', ur: 'میری درخواستیں' },
        nav_logout: { en: 'Logout', ur: 'لاگ آؤٹ' },

        // ---- Home: hero ----
        hero_subtitle: { en: 'Your Online One-Window for All Government Services', ur: 'تمام سرکاری خدمات کے لیے آپ کی آن لائن ون ونڈو' },
        hero_title: { en: 'Just a Click Away', ur: 'صرف ایک کلک کے فاصلے پر' },
        hero_desc: {
            en: 'Maryam Ki Dastak is Punjab\'s <strong class="text-success fw-bold">one-stop online platform</strong> that makes it easy for citizens to apply for government services online and choose between self-service or doorstep delivery by trained facilitators, <strong class="text-success fw-bold">all in one place.</strong>',
            ur: 'مریم کی دستک پنجاب کا <strong class="text-success fw-bold">ون سٹاپ آن لائن پلیٹ فارم</strong> ہے جو شہریوں کے لیے سرکاری خدمات کے لیے آن لائن درخواست دینا آسان بناتا ہے، اور تربیت یافتہ سہولت کاروں کے ذریعے سیلف سروس یا ڈور سٹیپ ڈلیوری کا انتخاب، <strong class="text-success fw-bold">سب ایک ہی جگہ۔</strong>'
        },
        hero_apply_service: { en: 'Apply Service', ur: 'درخواست دیں' },
        hero_explore_services: { en: 'Explore Services', ur: 'خدمات دیکھیں' },

        // ---- Home: explore services ----
        explore_title_1: { en: 'Explore', ur: 'دیکھیں' },
        explore_title_2: { en: 'Available Services', ur: 'دستیاب خدمات' },
        explore_desc: {
            en: 'Access a wide range of all government services choose what you need from the categories below and <strong class="text-dark">apply online</strong> or select <strong class="text-dark">doorstep delivery</strong> by a trained facilitator.',
            ur: 'تمام سرکاری خدمات کی وسیع رینج تک رسائی حاصل کریں، ذیل کے زمروں سے اپنی ضرورت کا انتخاب کریں اور <strong class="text-dark">آن لائن درخواست</strong> دیں یا تربیت یافتہ سہولت کار کے ذریعے <strong class="text-dark">ڈور سٹیپ ڈلیوری</strong> منتخب کریں۔'
        },
        search_services_placeholder: { en: 'Search Services...', ur: 'خدمات تلاش کریں...' },
        cat_dlims: { en: 'DLIMS', ur: 'ڈی ایل آئی ایم ایس' },
        cat_lda: { en: 'Lahore<br>Development<br>Authority', ur: 'لاہور<br>ڈویلپمنٹ<br>اتھارٹی' },
        cat_excise: { en: 'Excise &<br>Taxation', ur: 'ایکسائز اینڈ<br>ٹیکسیشن' },
        cat_local_govt: { en: 'Local<br>Government', ur: 'لوکل<br>گورنمنٹ' },
        cat_bor: { en: 'Board of<br>Revenue', ur: 'بورڈ آف<br>ریونیو' },
        view_all: { en: 'View All', ur: 'سب دیکھیں' },

        // ---- Home: DLIMS section ----
        dlims_title: { en: 'DLIMS Services', ur: 'ڈی ایل آئی ایم ایس خدمات' },
        dlims_subtitle: { en: 'now at Dastak - Web Platform', ur: 'اب دستک ویب پلیٹ فارم پر' },
        dlims_desc: {
            en: 'All <span>DLIMS</span> services have been seamlessly migrated to <span>Dastak - Web Platform</span>. Apply for licenses, track applications, and access your previous records.',
            ur: 'تمام <span>ڈی ایل آئی ایم ایس</span> خدمات کو <span>دستک ویب پلیٹ فارم</span> پر منتقل کر دیا گیا ہے۔ لائسنس کے لیے درخواست دیں، درخواستوں کو ٹریک کریں، اور اپنے سابقہ ریکارڈ تک رسائی حاصل کریں۔'
        },
        dlims_feature_1: { en: 'Apply for license service online', ur: 'لائسنس سروس کے لیے آن لائن درخواست دیں' },
        dlims_feature_2: { en: 'Track your applications in real-time', ur: 'اپنی درخواستوں کو ریئل ٹائم میں ٹریک کریں' },
        dlims_feature_3: { en: 'Access previous records after linking', ur: 'لنک کرنے کے بعد سابقہ ریکارڈ تک رسائی حاصل کریں' },

        // ---- Home: citizen app ----
        citizen_small_title: { en: 'For the Citizen of Punjab', ur: 'پنجاب کے شہریوں کے لیے' },
        citizen_title: {
            en: 'Download Dastak <span class="bold_span_sec_title">Citizen App</span> <span class="mt-3">One Window, All Services</span>',
            ur: 'دستک <span class="bold_span_sec_title">سٹیزن ایپ</span> ڈاؤن لوڈ کریں <span class="mt-3">ایک ونڈو، تمام خدمات</span>'
        },
        citizen_desc: { en: 'Access a wide range of government services through a one-stop online app designed to make the process fast, simple, and convenient for every citizen.', ur: 'ایک ون سٹاپ آن لائن ایپ کے ذریعے سرکاری خدمات کی وسیع رینج تک رسائی حاصل کریں جو ہر شہری کے لیے عمل کو تیز، آسان اور آسان بنانے کے لیے ڈیزائن کی گئی ہے۔' },
        citizen_app_desc_info: { en: '<span>Dastak Citizen</span> App is available at Google Play Store and Apple App Store', ur: '<span>دستک سٹیزن</span> ایپ گوگل پلے سٹور اور ایپل ایپ سٹور پر دستیاب ہے' },

        // ---- Home: facilitator ----
        facilitator_app_desc_info: { en: '<span>Dastak Facilitator</span> App is available at Google Play Store and Apple App Store', ur: '<span>دستک سہولت کار</span> ایپ گوگل پلے سٹور اور ایپل ایپ سٹور پر دستیاب ہے' },
        facilitator_small_title: { en: 'Easy and Quick Steps for', ur: 'کے لیے آسان اور تیز اقدامات' },
        facilitator_title: { en: 'How to register as a <span class="bold_span_sec_title">Facilitator</span>', ur: '<span class="bold_span_sec_title">سہولت کار</span> کے طور پر رجسٹر کیسے کریں' },
        facilitator_desc: { en: 'Get government services delivered to your home with a trained facilitator. Download now to experience convenience and trust in one app.', ur: 'تربیت یافتہ سہولت کار کے ذریعے سرکاری خدمات اپنے گھر پر حاصل کریں۔ ایک ہی ایپ میں سہولت اور اعتماد کا تجربہ کرنے کے لیے ابھی ڈاؤن لوڈ کریں۔' },
        step_1: { en: '<span>Dastak</span> Facilitator App', ur: '<span>دستک</span> سہولت کار ایپ' },
        step_2: { en: '<span>Sign -</span> Up', ur: '<span>سائن</span> اپ' },
        step_3: { en: '<span>Fill</span> Form', ur: '<span>فارم</span> پُر کریں' },
        step_4: { en: '<span>Required</span> Documents', ur: '<span>مطلوبہ</span> دستاویزات' },
        step_5: { en: '<span>Training by</span> PITB', ur: '<span>پی آئی ٹی بی کی جانب سے</span> تربیت' },

        // ---- Home: partners ----
        partners_title: { en: 'Our Partners & <span>Supporters</span>', ur: 'ہمارے شراکت دار اور <span>معاون</span>' },
        partners_desc: { en: 'Dastak is powered by collaboration with Punjab\'s leading government departments, ensuring citizens receive secure, timely, and authentic services.', ur: 'دستک پنجاب کے سرکردہ سرکاری محکموں کے تعاون سے چل رہا ہے، جو شہریوں کو محفوظ، بروقت اور مصدقہ خدمات کی فراہمی کو یقینی بناتا ہے۔' },
        partner_bor: { en: 'Board of Revenue<br><span>Punjab</span>', ur: 'بورڈ آف ریونیو<br><span>پنجاب</span>' },
        partner_lgcd: { en: 'Local Government &<br>Community, <span>Punjab</span>', ur: 'لوکل گورنمنٹ اینڈ<br>کمیونٹی، <span>پنجاب</span>' },
        partner_excise: { en: 'Excise Taxation &<br>Narcotics Control, <span>Punjab</span>', ur: 'ایکسائز ٹیکسیشن اینڈ<br>نارکوٹکس کنٹرول، <span>پنجاب</span>' },
        partner_social: { en: 'Social Welfare<br><span>Department</span>', ur: 'سوشل ویلفیئر<br><span>ڈیپارٹمنٹ</span>' },
        partner_police: { en: 'Police<br><span>Punjab</span>', ur: 'پولیس<br><span>پنجاب</span>' },

        // ---- Home: news ----
        news_small_title: { en: 'DIRECT FROM THE BLOG POSTS', ur: 'بلاگ پوسٹس سے براہ راست' },
        news_title: { en: 'Latest News and <span>Articles</span>', ur: 'تازہ ترین خبریں اور <span>مضامین</span>' },
        news_desc: { en: 'Stay informed with updates, insights, and stories on how Dastak is transforming public service delivery across Punjab.', ur: 'دستک پنجاب بھر میں عوامی خدمات کی فراہمی کو کس طرح بدل رہا ہے، اس سے متعلق تازہ کاریوں اور کہانیوں سے باخبر رہیں۔' },
        news_1_title: { en: 'Transforming Public Service Delivery: "Dastak App"', ur: 'عوامی خدمات کی فراہمی میں انقلاب: "دستک ایپ"' },
        news_1_desc: { en: 'As Punjab experiences a surge in urbanization and population growth, the delivery of public services has become a formidable challenge, with citizens grappling with multiple issues in accessing government services....', ur: 'جیسے جیسے پنجاب میں شہری کاری اور آبادی میں اضافہ ہو رہا ہے، عوامی خدمات کی فراہمی ایک بڑا چیلنج بن گئی ہے، اور شہریوں کو سرکاری خدمات تک رسائی میں متعدد مشکلات کا سامنا ہے....' },
        news_2_title: { en: 'Pioneering Doorstep Delivery for a New Era', ur: 'نئے دور کے لیے ڈور سٹیپ ڈلیوری کا آغاز' },
        news_2_desc: { en: 'Punjab embarks on a transformative journey in public service delivery with the launch of the Dastak app, designed to tackle challenges stemming from urbanization and population growth. The initiative addresses long-standing....', ur: 'پنجاب دستک ایپ کے آغاز کے ساتھ عوامی خدمات کی فراہمی میں ایک تبدیلی کے سفر کا آغاز کر رہا ہے، جو شہری کاری اور آبادی میں اضافے سے پیدا ہونے والے چیلنجز سے نمٹنے کے لیے تیار کی گئی ہے....' },
        news_3_title: { en: 'Dastak App - Government Services at Your Doorstep', ur: 'دستک ایپ - سرکاری خدمات آپ کے دروازے پر' },
        news_3_desc: { en: 'The Dastak App is a step towards a smarter and more digital Pakistan. Say goodbye to long queues and experience convenience like never before...', ur: 'دستک ایپ ایک زیادہ ذہین اور ڈیجیٹل پاکستان کی طرف ایک قدم ہے۔ لمبی قطاروں کو الوداع کہیں اور پہلے سے کہیں زیادہ سہولت کا تجربہ کریں...' },
        read_more: { en: 'Read More', ur: 'مزید پڑھیں' },

        // ---- Footer ----
        footer_menu: { en: 'Menu', ur: 'مینو' },
        footer_departments: { en: 'Departments', ur: 'محکمے' },
        footer_contact: { en: 'Contact', ur: 'رابطہ' },
        footer_fee_structure: { en: 'Fee Structure', ur: 'فیس کا ڈھانچہ' },
        footer_download: { en: 'Download', ur: 'ڈاؤن لوڈ' },
        footer_bor: { en: 'Board of Revenue', ur: 'بورڈ آف ریونیو' },
        footer_lgcd: { en: 'Local Government Dpt.', ur: 'لوکل گورنمنٹ ڈیپارٹمنٹ' },
        footer_excise: { en: 'Excise Taxation & Narcotics Control', ur: 'ایکسائز ٹیکسیشن اینڈ نارکوٹکس کنٹرول' },
        footer_copyright: { en: '© 2026 Dastak Services. All rights reserved.', ur: '© 2026 دستک سروسز۔ جمیع حقوق محفوظ ہیں۔' },

        // ---- Services page ----
        services_page_title: { en: 'Services', ur: 'خدمات' },
        services_demo_banner: {
            en: 'This is a static front-end recreation of the DLIMS Services accordion from <strong>dastak.punjab.gov.pk/citizen/services</strong>. Forms are for UI demonstration only — no data is submitted anywhere and no real license is generated or verified.',
            ur: 'یہ <strong>dastak.punjab.gov.pk/citizen/services</strong> کے ڈی ایل آئی ایم ایس خدمات ایکارڈین کی ایک جامد فرنٹ اینڈ نقل ہے۔ فارم صرف یو آئی مظاہرے کے لیے ہیں — کوئی ڈیٹا کہیں جمع نہیں کیا جاتا اور کوئی حقیقی لائسنس تیار یا تصدیق نہیں ہوتا۔'
        },
        toggle_citizen: { en: 'Citizen', ur: 'شہری' },
        toggle_business: { en: 'Business', ur: 'کاروبار' },
        dept_dlims: { en: 'DLIMS Services', ur: 'ڈی ایل آئی ایم ایس خدمات' },
        dept_track_application: { en: 'Track Application', ur: 'درخواست ٹریک کریں' },
        dept_e_license: { en: 'e-License', ur: 'ای-لائسنس' },
        dept_verify_license: { en: 'Verify License', ur: 'لائسنس کی تصدیق کریں' },
        svc_learner_dl: { en: 'Learner Driving License', ur: 'لرنر ڈرائیونگ لائسنس' },
        svc_renewal_learner_dl: { en: 'Renewal of Learners Driving License', ur: 'لرنر ڈرائیونگ لائسنس کی تجدید' },
        svc_renewal_regular_dl: { en: 'Renewal of Regular License', ur: 'ریگولر لائسنس کی تجدید' },
        svc_duplicate_dl: { en: 'Duplicate Driving License', ur: 'ڈپلیکیٹ ڈرائیونگ لائسنس' },
        svc_duplicate_intl_dl: { en: 'Duplicate International Driving License', ur: 'ڈپلیکیٹ انٹرنیشنل ڈرائیونگ لائسنس' },
        svc_renewal_intl_dl: { en: 'Renewal International Driving License', ur: 'انٹرنیشنل ڈرائیونگ لائسنس کی تجدید' },
        dept_local_govt: { en: 'Local Govt. &amp; Community Development', ur: 'لوکل گورنمنٹ اینڈ کمیونٹی ڈویلپمنٹ' },
        dept_police: { en: 'Punjab Police', ur: 'پنجاب پولیس' },
        dept_lda: { en: 'Lahore Development Authority (LDA)', ur: 'لاہور ڈویلپمنٹ اتھارٹی (ایل ڈی اے)' },
        dept_social_welfare: { en: 'Social Welfare Department', ur: 'سوشل ویلفیئر ڈیپارٹمنٹ' },
        dept_excise: { en: 'Excise and Taxation', ur: 'ایکسائز اینڈ ٹیکسیشن' },
        dept_bor: { en: 'Board of Revenue', ur: 'بورڈ آف ریونیو' },
        dept_forestry: { en: 'Forestry, Wildlife and Fisheries', ur: 'فاریسٹری، وائلڈ لائف اینڈ فشریز' },
        dept_food_authority: { en: 'Punjab Food Authority', ur: 'پنجاب فوڈ اتھارٹی' },
        dept_water_sewerage: { en: 'Water and Sewerage Authority', ur: 'واٹر اینڈ سیوریج اتھارٹی' },
        dept_higher_ed: { en: 'Higher Education Department', ur: 'ہائر ایجوکیشن ڈیپارٹمنٹ' },

        // Offcanvas: e-License / Track / Verify
        oc_e_license_title: { en: 'e-License', ur: 'ای-لائسنس' },
        oc_track_title: { en: 'Track License', ur: 'لائسنس ٹریک کریں' },
        oc_verify_title: { en: 'Verify License', ur: 'لائسنس کی تصدیق کریں' },
        label_regular_license: { en: 'Regular License', ur: 'ریگولر لائسنس' },
        label_international_license: { en: 'International License', ur: 'انٹرنیشنل لائسنس' },
        label_enter_cnic: { en: 'Enter CNIC', ur: 'شناختی کارڈ نمبر درج کریں' },
        label_dob: { en: 'Date of Birth', ur: 'تاریخ پیدائش' },
        label_license_number: { en: 'License Number', ur: 'لائسنس نمبر' },
        btn_reload: { en: 'Reload', ur: 'دوبارہ لوڈ کریں' },
        btn_cancel: { en: 'Cancel', ur: 'منسوخ کریں' },
        btn_generate_license: { en: 'Generate e-License', ur: 'ای-لائسنس بنائیں' },
        btn_track_license: { en: 'Track License', ur: 'لائسنس ٹریک کریں' },
        btn_verify_license: { en: 'Verify License', ur: 'لائسنس کی تصدیق کریں' },
        demo_note_e_license: {
            en: '<i class="fas fa-flask me-1"></i> Demo mode — this form doesn\'t connect to a real backend, so no e-License is actually generated.',
            ur: '<i class="fas fa-flask me-1"></i> ڈیمو موڈ — یہ فارم کسی حقیقی بیک اینڈ سے منسلک نہیں ہے، لہٰذا کوئی حقیقی ای-لائسنس تیار نہیں ہوتا۔'
        },
        demo_note_track: {
            en: '<i class="fas fa-flask me-1"></i> Demo mode — there\'s no real application to look up, so this can\'t return a genuine tracking result.',
            ur: '<i class="fas fa-flask me-1"></i> ڈیمو موڈ — دیکھنے کے لیے کوئی حقیقی درخواست موجود نہیں، لہٰذا یہ حقیقی ٹریکنگ نتیجہ فراہم نہیں کر سکتا۔'
        },
        demo_note_verify: {
            en: '<i class="fas fa-flask me-1"></i> Demo mode — there\'s no license database behind this, so nothing is really verified.',
            ur: '<i class="fas fa-flask me-1"></i> ڈیمو موڈ — اس کے پیچھے کوئی لائسنس ڈیٹا بیس موجود نہیں، لہٰذا کچھ بھی حقیقی طور پر تصدیق نہیں ہوتا۔'
        },

        // Success modal
        success_modal_title: { en: 'Application Submitted', ur: 'درخواست جمع ہو گئی' },
        success_modal_heading: { en: 'Congratulations!', ur: 'مبارک ہو!' },
        success_modal_body: { en: 'Your license renewal application has been submitted successfully (demo only — no real application is filed).', ur: 'آپ کی لائسنس تجدید کی درخواست کامیابی سے جمع ہو گئی ہے (صرف ڈیمو — کوئی حقیقی درخواست جمع نہیں کی گئی)۔' },
        success_modal_note: { en: 'In production, a confirmation SMS and email would be sent to the applicant.', ur: 'حقیقی نظام میں، درخواست گزار کو تصدیقی ایس ایم ایس اور ای میل بھیجی جائے گی۔' },
        btn_close: { en: 'Close', ur: 'بند کریں' },

        // ---- Apply page ----
        apply_demo_banner: { en: 'This application form is a static front-end mockup — nothing is uploaded, saved, or submitted anywhere.', ur: 'یہ درخواست فارم ایک جامد فرنٹ اینڈ نمونہ ہے — کچھ بھی اپ لوڈ، محفوظ یا کہیں جمع نہیں کیا جاتا۔' },
        apply_required_documents: { en: 'Required Documents', ur: 'مطلوبہ دستاویزات' },
        apply_th_sr: { en: 'Sr #', ur: 'نمبر' },
        apply_th_documents: { en: 'Documents', ur: 'دستاویزات' },
        apply_th_original: { en: 'Original', ur: 'اصل' },
        apply_th_photocopy: { en: 'Photocopy', ur: 'فوٹو کاپی' },
        apply_th_attested: { en: 'Attested', ur: 'تصدیق شدہ' },
        apply_note: { en: 'Note:', ur: 'نوٹ:' },
        apply_fee_title: { en: 'Fee of Application', ur: 'درخواست کی فیس' },
        apply_new_application: { en: 'New Application', ur: 'نئی درخواست' },
        apply_success_title: { en: 'Application Submitted!', ur: 'درخواست جمع ہو گئی!' },
        apply_success_note: { en: '(Demo only — no real application was created.)', ur: '(صرف ڈیمو — کوئی حقیقی درخواست نہیں بنائی گئی۔)' },
        apply_application_id: { en: 'Application ID', ur: 'درخواست نمبر' },
        apply_btn_copy: { en: 'Copy', ur: 'کاپی کریں' },
        apply_amount_due: { en: 'Amount Due', ur: 'واجب الادا رقم' },
        apply_btn_pay_now: { en: 'Pay Now', ur: 'ابھی ادائیگی کریں' },
        apply_track_application: { en: 'Track Application', ur: 'درخواست ٹریک کریں' },
        apply_back_to_services: { en: 'Back to Services', ur: 'خدمات پر واپس جائیں' },
        apply_sidebar_toggle: { en: 'Service Details', ur: 'سروس کی تفصیلات' },
    };

    var PLACEHOLDER_I18N = {
        home_search_placeholder: { en: 'Search', ur: 'تلاش کریں' },
        home_search_services_placeholder: { en: 'Search Services...', ur: 'خدمات تلاش کریں...' },
        placeholder_cnic: { en: 'CNIC without dashes. e.g (1111122222223)', ur: 'ڈیش کے بغیر شناختی کارڈ نمبر۔ مثال (1111122222223)' },
        placeholder_dob: { en: 'YYYY-MM-DD', ur: 'YYYY-MM-DD' },
        placeholder_answer: { en: 'Answer', ur: 'جواب' }
    };

    function getSavedLang() {
        try {
            return localStorage.getItem(STORAGE_KEY) || 'en';
        } catch (e) {
            return 'en';
        }
    }

    function saveLang(lang) {
        try {
            localStorage.setItem(STORAGE_KEY, lang);
        } catch (e) { /* ignore */ }
    }

    function applyLanguage(lang) {
        document.documentElement.setAttribute('lang', lang === 'ur' ? 'ur' : 'en');
        document.documentElement.setAttribute('dir', lang === 'ur' ? 'rtl' : 'ltr');
        document.body.classList.toggle('lang-ur', lang === 'ur');

        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            var key = el.getAttribute('data-i18n');
            var entry = DASTAK_I18N[key];
            if (entry) el.innerHTML = entry[lang] || entry.en;
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
            var key = el.getAttribute('data-i18n-placeholder');
            var entry = PLACEHOLDER_I18N[key];
            if (entry) el.setAttribute('placeholder', entry[lang] || entry.en);
        });

        document.querySelectorAll('.custom-lang-toggle').forEach(function (toggle) {
            toggle.classList.toggle('urdu-active', lang === 'ur');
            var enSpan = toggle.querySelector('#langEn .lang-text, a:first-child .lang-text');
            var urSpan = toggle.querySelector('#langUr .lang-text, a:last-child .lang-text');
            if (enSpan) enSpan.classList.toggle('active', lang !== 'ur');
            if (urSpan) urSpan.classList.toggle('active', lang === 'ur');
        });
    }

    function initLangToggle() {
        var lang = getSavedLang();
        applyLanguage(lang);

        document.querySelectorAll('.custom-lang-toggle').forEach(function (toggle) {
            toggle.addEventListener('click', function (e) {
                e.preventDefault();
                lang = (getSavedLang() === 'ur') ? 'en' : 'ur';
                saveLang(lang);
                applyLanguage(lang);
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLangToggle);
    } else {
        initLangToggle();
    }
})();
