// Shared service data + icon markup used by both services.js (the DLIMS
// accordion + apply-choice panel) and apply.js (the application form page).
// Per-service data extracted from the real DLIMS "expanded-detail" panels.
// docs entries are [label, original, photocopy, attested] booleans.
const SERVICES = {
    learner_driving_license: {
        name: 'Learner Driving License',
        short: 'Learner',
        formType: 'new',
        applyHeading: 'New Learner Application',
        docs: [
            ['CNIC of Applicant', true, false, false],
            ['Medical certificate (only required if Age is above 50 years or LTV)', true, false, false],
            ['Live photograph with white background (upper shoulder)', true, false, false],
        ],
        turnaround: '2 Working Days',
        note: "The age requirement for obtaining a commercial license is set at more than 21 years. Learner cannot be made of disabled person. Validity of this learner will be 180 days.",
    },
    renewal_learner_driving_license: {
        name: 'Renewal of Learners Driving License',
        short: 'Learner Renewal',
        formType: 'renewal-simple',
        applyHeading: 'Renewal of Learner Application',
        docs: [
            ['CNIC of Applicant', true, false, false],
            ['Medical certificate (required if Age is above 50 years or LTV)', true, false, false],
            ['Live photograph with white background (upper shoulder)', true, false, false],
        ],
        turnaround: '2 Working Days',
        note: 'The age requirement for obtaining a commercial license is set at more than 21 years. In any combination, the fee of highest fee category will be applicable.',
    },
    renewal_driving_license: {
        name: 'Renewal of Regular License',
        short: 'License Renewal',
        formType: 'renewal-license',
        applyHeading: 'Renewal of Regular Application',
        docs: [
            ['FIR (in case if original driving license is lost)', false, true, false],
            ['CNIC of Applicant', true, false, false],
            ['Live Photograph with white background (upper shoulder)', true, false, false],
            ['Medical certificate (required if age is above 50 years or LTV)', true, false, false],
            ['Old Driving License', true, false, false],
        ],
        turnaround: '7 Working Days',
        note: 'Candidate can make license for the period of 1 year, 2 years, 3 years, 4 years or 5 years max.',
    },
    duplicate_driving_license: {
        name: 'Duplicate Driving License',
        short: 'Duplicate License',
        formType: 'duplicate-license',
        applyHeading: 'Duplicate of Regular Application',
        docs: [
            ['Medical certificate (required if Age is above 50 years or LTV)', true, false, false],
            ['CNIC of Applicant', true, false, false],
            ['Live photograph with white background (upper shoulder)', true, false, false],
            ['FIR (Lost License report) of the Police Station.', true, false, false],
        ],
        turnaround: '10 Working Days',
        note: 'The age requirement for obtaining a commercial license is set at more than 21 years. In any combination, the fee of highest fee category will be applicable. It is recommended if at least one year remains in license expiry. Otherwise, renewal of license is recommended.',
    },
    international_driving_license_duplicate: {
        name: 'Duplicate International Driving License',
        short: 'International Duplicate',
        formType: 'duplicate-license',
        applyHeading: 'Duplicate of International Application',
        docs: [
            ['FIR (in case if original driving license is lost)', false, true, false],
            ['CNIC of Applicant', true, false, false],
            ['Valid Driving License issued by the licensing Authority.', true, false, false],
            ['Pakistani Passport valid for at least six (6) Months along with Visa.', true, false, false],
            ['Live photograph with white background (upper shoulder)', true, false, false],
            ['Medical certificate (only required if Age is above 50 years or LTV)', true, false, false],
        ],
        turnaround: '10 Working Days',
        note: 'Applicant will bring his/her original C.N.I.C, Driving License, Passport and Visa. Candidate can make license for the period of 1 year, 2 years, or 3 years max. Medical certificate is required if applicant needs this license for commercial category irrespective of the age of the Applicant.',
    },
    international_driving_license: {
        name: 'Renewal International Driving License',
        short: 'International Renewal',
        formType: 'renewal-license',
        applyHeading: 'Renewal of International Application',
        docs: [
            ['FIR (in case if original driving license is lost)', false, true, false],
            ['CNIC of Applicant', true, false, false],
            ['Valid Driving License issued by the licensing Authority.', true, false, false],
            ['Pakistani Passport valid for at least six (6) Months along with Visa.', true, false, false],
            ['Live photograph with white background (upper shoulder)', true, false, false],
            ['Medical certificate (only required if Age is above 50 years or LTV)', true, false, false],
        ],
        turnaround: null,
        note: 'Applicant will bring his/her original C.N.I.C, Driving License, Passport and Visa. Candidate can make license for the period of 1 year, 2 years, or 3 years max. Medical certificate is required if applicant needs this license for commercial category irrespective of the age of the Applicant.',
    },
};

const ICON = {
    check: 'assets/images/check_icon.png',
    cross: 'assets/images/cross_icon.png',
};

const FEE_PLATFORM = 15;
const FEE_FACILITATOR = 950;

function docRow([label, orig, photo, attested], i) {
    const icon = (v) => `<img src="${v ? ICON.check : ICON.cross}" alt="">`;
    return `<tr>
        <td>${i + 1}</td>
        <td>${label}</td>
        <td class="text-center">${icon(orig)}</td>
        <td class="text-center">${icon(photo)}</td>
        <td class="text-center">${icon(attested)}</td>
    </tr>`;
}

const SELF_SERVICE_SVG = `<svg width="55" height="55" viewBox="0 0 55 55" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect opacity="0.8" x="0.5" y="0.5" width="54" height="54" rx="27" fill="#167B38" stroke="#167B38" />
    <path d="M42.8792 35.0014C42.6162 33.7133 41.9755 32.5264 41.0516 31.5958C40.0535 30.6044 38.4485 30.5572 37.3897 31.4879L34.7191 33.8549L31.1584 30.2942C30.8684 30.0042 30.4722 29.8896 30.0946 29.9418C30.3542 29.5945 30.2885 29.1646 30.2885 29.1646C30.248 28.5914 29.7692 28.1328 29.1825 28.1328H23.1806C22.5669 28.1328 22.0679 28.6386 22.0679 29.2523C22.0679 29.8727 22.5669 30.3718 23.1806 30.3718H29.0073C29.1253 30.3718 29.2298 30.3617 29.3276 30.3465C29.1152 30.5826 29.0005 30.8827 29.0005 31.1844C29.0005 31.5081 29.1286 31.8318 29.3714 32.0814L31.0574 33.7673L32.831 35.5342V35.5409C32.8243 35.5409 32.8243 35.5477 32.8175 35.5477L33.9033 36.5997C34.0853 36.7683 34.0853 37.0516 33.9167 37.2337C33.7414 37.409 33.4582 37.4157 33.2828 37.2404L32.1431 36.1411C31.9003 36.4581 31.7655 36.8425 31.7452 37.2471C31.7385 37.2808 31.7385 37.3213 31.7385 37.355L31.7452 37.6652C31.7452 38.2654 32.1431 38.7847 32.7163 38.9466L33.6807 39.2231C34.2 39.3647 34.7395 39.4322 35.279 39.4052C35.3397 39.4052 35.4071 39.3984 35.4678 39.3984C36.4659 39.3984 37.4303 39.7963 38.1384 40.5044L38.6442 41.0102L43.176 36.4715L42.8792 35.0014Z" fill="white" />
    <path d="M28.0027 31.3865H23.1808C22.0074 31.3865 21.0565 30.4288 21.0565 29.2554C21.0565 28.0753 22.0074 27.1244 23.1808 27.1244H29.1827C30.282 27.1244 31.1991 27.9674 31.2935 29.0599C31.3003 29.0869 31.3003 29.1206 31.3003 29.161C31.5093 29.2689 31.7049 29.4106 31.8735 29.5792L34.7126 32.4183H34.8138L36.7155 30.7324C37.3764 30.1524 38.2127 29.8287 39.0826 29.8085V17.8314C39.0826 16.1927 37.7473 14.8574 36.1086 14.8574H16.2548C14.616 14.8574 13.2808 16.1927 13.2808 17.8314V32.4184H28.3602C28.1579 32.1014 28.0297 31.7574 28.0027 31.3865ZM26.1819 16.705C28.6231 16.705 30.6058 18.6877 30.6058 21.129C30.6058 23.577 28.6231 25.5598 26.1819 25.5598C23.7406 25.5598 21.7579 23.5771 21.7579 21.129C21.7579 18.6877 23.7406 16.705 26.1819 16.705Z" fill="white" />
    <path d="M25.2495 22.644C25.3726 22.7856 25.5479 22.8716 25.735 22.8784H25.7603C25.939 22.8784 26.111 22.8076 26.2375 22.6811L28.6821 20.2365C28.9451 19.9734 28.9451 19.5469 28.6821 19.2822C28.4191 19.0192 27.9925 19.0192 27.7279 19.2822L25.7974 21.2127L24.9646 20.2466C24.7218 19.965 24.2952 19.933 24.0137 20.1758C23.7321 20.4186 23.7001 20.8451 23.9429 21.1267L25.2495 22.644Z" fill="white" />
    <path d="M44.2422 36.6699L43.8241 37.088L39.2922 41.6268L38.9146 41.9977L40.4049 43.4881L45.7327 38.1603L44.2422 36.6699Z" fill="white" />
    <path d="M29.5265 33.7675L29.4523 33.6934L29.1286 34.2261L28.8049 34.678C28.6903 34.9208 28.4542 35.0691 28.1912 35.0691H24.1719C23.9089 35.0691 23.6729 34.9208 23.5582 34.678L23.0187 33.9294C22.9985 33.8822 22.9782 33.8215 22.9715 33.7676H11.9858L12.2623 35.3928C12.4444 36.4651 13.3751 37.2474 14.4608 37.2474H30.7336C30.7269 37.2136 30.7336 37.1867 30.7336 37.1597C30.7741 36.5595 30.9832 35.993 31.3406 35.5277L30.3222 34.5364L29.5265 33.7675Z" fill="white" />
</svg>`;

const DOORSTEP_SVG = `<svg width="55" height="55" viewBox="0 0 55 55" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect opacity="0.7" width="55" height="55" rx="27.5" fill="#DEAE1C" />
    <g clip-path="url(#clip0_dlims)">
        <path fill-rule="evenodd" clip-rule="evenodd" d="M12.604 14.1311C12.604 13.7259 12.7504 13.3374 13.0109 13.0509C13.2714 12.7645 13.6247 12.6035 13.9931 12.6035H29.2728C29.6412 12.6035 29.9945 12.7645 30.255 13.0509C30.5155 13.3374 30.6618 13.7259 30.6618 14.1311V21.7689H36.2181C37.1301 21.7689 38.0333 21.9664 38.8759 22.3503C39.7186 22.7341 40.4842 23.2967 41.1291 24.0059C41.7741 24.7152 42.2857 25.5571 42.6347 26.4838C42.9837 27.4105 43.1634 28.4037 43.1634 29.4067V35.5169C43.1637 36.5003 42.8764 37.4578 42.3439 38.2478C41.8113 39.0378 41.0618 39.6185 40.2061 39.904C39.9513 40.8282 39.4376 41.6403 38.7382 42.2243C38.0388 42.8083 37.1896 43.1344 36.3116 43.1561C35.4337 43.1778 34.572 42.8939 33.8495 42.345C33.127 41.7961 32.5806 41.0102 32.2884 40.0996H23.4804C23.1881 41.0102 22.6418 41.7961 21.9193 42.345C21.1968 42.8939 20.3351 43.1778 19.4571 43.1561C18.5792 43.1344 17.7299 42.8083 17.0306 42.2243C16.3312 41.6403 15.8175 40.8282 15.5627 39.904C14.7067 39.6188 13.9569 39.0382 13.4241 38.2482C12.8913 37.4581 12.6037 36.5005 12.604 35.5169V29.4067H20.9384C21.3068 29.4067 21.6601 29.2457 21.9206 28.9592C22.1811 28.6728 22.3274 28.2842 22.3274 27.8791C22.3274 27.474 22.1811 27.0854 21.9206 26.799C21.6601 26.5125 21.3068 26.3515 20.9384 26.3515H12.604V23.2964H18.1603C18.5287 23.2964 18.882 23.1355 19.1425 22.849C19.403 22.5625 19.5493 22.174 19.5493 21.7689C19.5493 21.3637 19.403 20.9752 19.1425 20.6887C18.882 20.4022 18.5287 20.2413 18.1603 20.2413H12.604V14.1311ZM30.6618 37.0445H32.2884C32.563 36.1897 33.062 35.4437 33.7222 34.9009C34.3824 34.358 35.1741 34.0427 35.9973 33.9948C36.8205 33.9469 37.6381 34.1685 38.3467 34.6317C39.0554 35.0949 39.6231 35.7788 39.9783 36.5969C40.2388 36.3105 40.3852 35.922 40.3853 35.5169V29.4067C40.3853 28.1913 39.9462 27.0256 39.1647 26.1662C38.3832 25.3068 37.3233 24.824 36.2181 24.824H30.6618V37.0445ZM20.9384 38.572C20.9384 38.1669 20.792 37.7783 20.5315 37.4919C20.271 37.2054 19.9177 37.0445 19.5493 37.0445C19.1809 37.0445 18.8276 37.2054 18.5671 37.4919C18.3066 37.7783 18.1603 38.1669 18.1603 38.572C18.1603 38.9771 18.3066 39.3657 18.5671 39.6522C18.8276 39.9386 19.1809 40.0996 19.5493 40.0996C19.9177 40.0996 20.271 39.9386 20.5315 39.6522C20.792 39.3657 20.9384 38.9771 20.9384 38.572ZM35.236 37.492C34.9755 37.7784 34.8291 38.1669 34.829 38.572C34.8289 38.9254 34.9403 39.2679 35.1441 39.5412C35.3479 39.8144 35.6316 40.0015 35.9468 40.0705C36.262 40.1395 36.5892 40.0862 36.8726 39.9197C37.1561 39.7531 37.3783 39.4837 37.5013 39.1572C37.6243 38.8307 37.6406 38.4674 37.5474 38.1292C37.4541 37.791 37.2572 37.4988 36.99 37.3024C36.7228 37.106 36.402 37.0175 36.0821 37.0521C35.7623 37.0867 35.4633 37.2422 35.236 37.492Z" fill="#F7F7F7" />
    </g>
    <defs><clipPath id="clip0_dlims"><rect width="36.6614" height="36.6614" fill="white" transform="translate(12.3721 9.74219)" /></clipPath></defs>
</svg>`;
