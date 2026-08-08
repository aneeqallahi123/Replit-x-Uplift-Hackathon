// SERVICES, ICON, docRow, FEE_PLATFORM, FEE_FACILITATOR come from
// assets/js/services-data.js, loaded before this file.

const DISTRICTS = {
    'Punjab': ['Lahore', 'Faisalabad', 'Rawalpindi', 'Multan', 'Gujranwala', 'Sialkot', 'Bahawalpur'],
    'Sindh': ['Karachi', 'Hyderabad', 'Sukkur', 'Larkana', 'Mirpurkhas'],
    'Khyber Pakhtunkhwa': ['Peshawar', 'Abbottabad', 'Mardan', 'Swat', 'Kohat'],
    'Balochistan': ['Quetta', 'Gwadar', 'Turbat', 'Sibi'],
    'Islamabad': ['Islamabad'],
    'Gilgit-Baltistan': ['Gilgit', 'Skardu', 'Hunza'],
    'Azad Kashmir': ['Muzaffarabad', 'Mirpur', 'Rawalakot'],
};

function populateDistricts(selectEl, province) {
    const list = DISTRICTS[province] || [];
    selectEl.innerHTML = '<option value="">Select District</option>' + list.map(d => `<option>${d}</option>`).join('');
}

// ---- Shared "math captcha" block, reused by every short form ----
const CAPTCHA_HTML = `
    <hr class="my-3">
    <div class="math-captcha-wrapper mb-3">
        <div class="mb-2"><strong class="math-question">Loading...</strong> <a href="#" class="reloadCaptcha">Reload</a></div>
        <input type="text" class="form-control math-captcha-input" style="max-width:340px;" placeholder="Answer">
        <div class="captcha_error text-danger mt-1" style="display:none;"></div>
    </div>`;

function wireCaptcha(root) {
    const wrapper = root.querySelector('.math-captcha-wrapper');
    function newCaptcha() {
        const a = Math.floor(Math.random() * 9) + 1;
        const b = Math.floor(Math.random() * 9) + 1;
        wrapper.dataset.answer = a + b;
        wrapper.querySelector('.math-question').textContent = `${a} + ${b} = ?`;
        wrapper.querySelector('.math-captcha-input').value = '';
        wrapper.querySelector('.captcha_error').style.display = 'none';
    }
    wrapper.querySelector('.reloadCaptcha').addEventListener('click', (e) => { e.preventDefault(); newCaptcha(); });
    newCaptcha();
    return () => {
        const val = wrapper.querySelector('.math-captcha-input').value.trim();
        const errEl = wrapper.querySelector('.captcha_error');
        if (!val || Number(val) !== Number(wrapper.dataset.answer)) {
            errEl.textContent = 'Please solve the captcha correctly.';
            errEl.style.display = 'block';
            return false;
        }
        errEl.style.display = 'none';
        return true;
    };
}

// ---- Form templates ----

function renderNewForm() {
    return `
        <div class="row g-3">
            <div class="col-md-4">
                <label class="form-label">CNIC <span class="req">*</span></label>
                <input type="text" class="form-control" id="fCnic" maxlength="13" placeholder="e.g: 4210112345671">
            </div>
            <div class="col-md-4">
                <label class="form-label">Name <span class="req">*</span></label>
                <input type="text" class="form-control" id="fName" placeholder="Full Name">
            </div>
            <div class="col-md-4">
                <label class="form-label">Father / Husband Name <span class="req">*</span></label>
                <input type="text" class="form-control" id="fFather" placeholder="Father/Husband Name">
            </div>

            <div class="col-md-4">
                <label class="form-label">DOB (YYYY-MM-DD) <span class="req">*</span></label>
                <input type="text" class="form-control" id="fDob" placeholder="YYYY-MM-DD">
            </div>
            <div class="col-md-4">
                <label class="form-label">Phone Number <span class="req">*</span></label>
                <input type="text" class="form-control" id="fPhone" placeholder="e.g: 03001234567">
            </div>
            <div class="col-md-4">
                <label class="form-label">Emergency Contact Number <span class="req">*</span></label>
                <input type="text" class="form-control" placeholder="e.g: 03001234567">
            </div>

            <div class="col-md-4">
                <label class="form-label">Gender <span class="req">*</span></label>
                <select class="form-select"><option>Male</option><option>Female</option></select>
            </div>
            <div class="col-md-4">
                <label class="form-label">Height <span class="req">*</span></label>
                <select class="form-select">
                    <option>4</option><option>4.5</option><option>5</option>
                    <option>5.5</option><option>6</option><option>6.5</option>
                </select>
            </div>
            <div class="col-md-4">
                <label class="form-label">Citizen Type <span class="req">*</span></label>
                <select class="form-select">
                    <option>GOVT. EMPLOYEE</option><option>PRIVATE EMPLOYEE</option>
                    <option>STUDENT</option><option>BUSINESS</option><option>OTHER</option>
                </select>
            </div>

            <div class="col-md-4">
                <label class="form-label">Vehicle Type <span class="req">*</span></label>
                <select class="form-select"><option>Automatic</option><option>Manual</option></select>
            </div>
            <div class="col-md-4">
                <label class="form-label">Nationality <span class="req">*</span></label>
                <select class="form-select"><option>Pakistani</option><option>Other</option></select>
            </div>
            <div class="col-md-4">
                <label class="form-label">Blood Group <span class="req">*</span></label>
                <select class="form-select">
                    <option>A+</option><option>A-</option><option>B+</option><option>B-</option>
                    <option>AB+</option><option>AB-</option><option>O+</option><option>O-</option>
                </select>
            </div>

            <div class="col-md-4">
                <label class="form-label">Any Disability <span class="req">*</span></label>
                <select class="form-select"><option>No</option><option>Yes</option></select>
            </div>
        </div>

        <h6 class="section-heading">Permanent Address</h6>
        <div class="row g-3">
            <div class="col-md-6">
                <label class="form-label">Province <span class="req">*</span></label>
                <select class="form-select" id="permProvince">
                    <option>Punjab</option><option>Sindh</option><option>Khyber Pakhtunkhwa</option>
                    <option>Balochistan</option><option>Islamabad</option><option>Gilgit-Baltistan</option><option>Azad Kashmir</option>
                </select>
            </div>
            <div class="col-md-6">
                <label class="form-label">District <span class="req">*</span></label>
                <select class="form-select" id="permDistrict"><option value="">Select District</option></select>
            </div>
            <div class="col-12">
                <label class="form-label">Permanent Address <span class="req">*</span></label>
                <input type="text" class="form-control" id="permAddress" placeholder="House #, Street, City">
            </div>
        </div>

        <h6 class="section-heading d-flex align-items-center gap-3">
            Current Address
            <span class="form-check mb-0" style="font-size:13px; font-weight:400;">
                <input class="form-check-input" type="checkbox" id="sameAsAbove">
                <label class="form-check-label" for="sameAsAbove">Same as above</label>
            </span>
        </h6>
        <div class="row g-3">
            <div class="col-md-6">
                <label class="form-label">Province <span class="req">*</span></label>
                <select class="form-select" id="currProvince">
                    <option>Punjab</option><option>Sindh</option><option>Khyber Pakhtunkhwa</option>
                    <option>Balochistan</option><option>Islamabad</option><option>Gilgit-Baltistan</option><option>Azad Kashmir</option>
                </select>
            </div>
            <div class="col-md-6">
                <label class="form-label">District <span class="req">*</span></label>
                <select class="form-select" id="currDistrict"><option value="">Select District</option></select>
            </div>
            <div class="col-12">
                <label class="form-label">Current Address <span class="req">*</span></label>
                <input type="text" class="form-control" id="currAddress" placeholder="House #, Street, City">
            </div>
        </div>

        <h6 class="section-heading">Upload Your Picture</h6>
        <div class="warn-note">
            <i class="fas fa-exclamation-triangle"></i>
            Crop image properly and size should be only 500 Kb maximum.
        </div>
        <div class="row g-4 align-items-center">
            <div class="col-md-4 text-center">
                <div class="avatar-upload-circle" id="avatarPreview"><i class="fas fa-user"></i></div>
                <p class="text-muted small mb-3" id="avatarLabel">Upload Your Picture</p>
                <div class="d-flex gap-2 justify-content-center">
                    <button type="button" class="btn custom-btn-yellow btn-sm" id="btnUploadPicture">Upload</button>
                    <button type="button" class="btn btn-sm" style="background:#6b7280;color:#fff;" id="btnCapturePicture">Capture</button>
                </div>
                <input type="file" accept="image/*" id="pictureInput" class="d-none">
            </div>
            <div class="col-md-8">
                <div class="upload-tip">
                    <div class="upload-tip-badge"><i class="fas fa-user"></i><span class="status-dot bad"><i class="fas fa-times"></i></span></div>
                    <div><h6>Avoid Side Profile</h6><p>Refrain from showing your face from the side, as it may impede the detection process.</p></div>
                </div>
                <div class="upload-tip">
                    <div class="upload-tip-badge"><i class="fas fa-user"></i><span class="status-dot good"><i class="fas fa-check"></i></span></div>
                    <div><h6>Maintain a Straight Face with white background.</h6><p>Keep your face straight to enhance detection reliability.</p></div>
                </div>
                <div class="upload-tip">
                    <div class="upload-tip-badge"><i class="fas fa-user"></i><span class="status-dot bad"><i class="fas fa-times"></i></span></div>
                    <div><h6>No Masks Please</h6><p>Ensure a visible face without masks for effective recognition processes.</p></div>
                </div>
            </div>
        </div>

        <h6 class="section-heading">Upload CNIC (Front / Back) Image</h6>
        <div class="row g-3">
            <div class="col-md-6">
                <div class="cnic-dropzone" id="cnicFrontZone">
                    <div class="cnic-icon"><i class="fas fa-id-card"></i></div>
                    <div class="upload-btn-circle"><i class="fas fa-arrow-up"></i></div>
                    <h6>Upload Front Side of your CNIC</h6>
                    <p>Drag a file or browse from computer</p>
                    <input type="file" accept="image/*" class="d-none" id="cnicFrontInput">
                </div>
            </div>
            <div class="col-md-6">
                <div class="cnic-dropzone" id="cnicBackZone">
                    <div class="cnic-icon"><i class="fas fa-id-card"></i></div>
                    <div class="upload-btn-circle"><i class="fas fa-arrow-up"></i></div>
                    <h6>Upload Back Side of your CNIC</h6>
                    <p>Drag a file or browse from computer</p>
                    <input type="file" accept="image/*" class="d-none" id="cnicBackInput">
                </div>
            </div>
        </div>

        <div class="alert alert-danger mt-4 d-none" id="formError"></div>

        <div class="form-check mt-4">
            <input class="form-check-input" type="checkbox" id="certifyCheck">
            <label class="form-check-label small" for="certifyCheck">
                I hereby certify that the information provided by me is correct and I will be liable for legal action, if found false or forged.
            </label>
        </div>

        <button type="button" class="btn btn-success w-100 fw-bold py-2 mt-4" id="btnSubmitApplication">Submit</button>`;
}

function renderRenewalSimpleForm() {
    return `
        <div class="row g-3">
            <div class="col-md-4">
                <label class="form-label">CNIC <span class="req">*</span></label>
                <input type="text" class="form-control" id="fCnic" maxlength="13" placeholder="CNIC">
            </div>
            <div class="col-md-4">
                <label class="form-label">DOB (YYYY-MM-DD) <span class="req">*</span></label>
                <input type="text" class="form-control" id="fDob" placeholder="YYYY-MM-DD">
            </div>
        </div>
        ${CAPTCHA_HTML}
        <div class="alert alert-danger mt-2 d-none" id="formError"></div>
        <button type="button" class="btn btn-success px-5 fw-bold py-2 mt-2" id="btnSubmitApplication">Submit</button>`;
}

function renderLicenseLookupForm(withRenewalFields) {
    const renewalRow = withRenewalFields ? `
        <div class="col-md-4">
            <label class="form-label">Renewal Duration <span class="req">*</span></label>
            <select class="form-select" id="fDuration">
                <option value="">Select…</option>
                <option>For 1 Year</option><option>For 2 Years</option><option>For 3 Years</option>
                <option>For 4 Years</option><option>For 5 Years</option>
            </select>
        </div>
        <div class="col-md-4">
            <label class="form-label">Is old License in Possession <span class="req">*</span></label>
            <select class="form-select" id="fPossession">
                <option value="">Select…</option>
                <option>Yes, in my possession</option>
                <option>No, it's lost</option>
            </select>
        </div>` : '';

    return `
        <div class="row g-3">
            <div class="col-md-4">
                <label class="form-label">CNIC <span class="req">*</span></label>
                <input type="text" class="form-control" id="fCnic" maxlength="13" placeholder="CNIC">
            </div>
            <div class="col-md-4">
                <label class="form-label">License No. <span class="req">*</span></label>
                <input type="text" class="form-control" id="fLicenseNo" placeholder="License No.">
            </div>
            <div class="col-md-4">
                <label class="form-label">License Issuance Date <span class="req">*</span></label>
                <input type="text" class="form-control" id="fIssuanceDate" placeholder="License Issuance Date">
            </div>
            ${renewalRow}
        </div>
        ${CAPTCHA_HTML}
        <div class="alert alert-danger mt-2 d-none" id="formError"></div>
        <button type="button" class="btn btn-success px-5 fw-bold py-2 mt-2" id="btnSubmitApplication">Submit</button>`;
}

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const serviceKey = params.get('service') || 'learner_driving_license';
    const mode = params.get('mode') === 'doorstep' ? 'doorstep' : 'online';
    const svc = SERVICES[serviceKey] || SERVICES.learner_driving_license;

    // ---- Populate sidebar (identical across every form type) ----
    document.getElementById('sidebarServiceName').textContent = svc.name;
    document.getElementById('sidebarDocRows').innerHTML = svc.docs.map(docRow).join('');
    document.getElementById('sidebarNote').textContent = svc.note;

    const isDoorstep = mode === 'doorstep';
    const totalFee = isDoorstep ? FEE_PLATFORM + FEE_FACILITATOR : FEE_PLATFORM;
    document.getElementById('sidebarPlatformFee').textContent = FEE_PLATFORM;
    document.getElementById('sidebarFacilitatorFee').textContent = FEE_FACILITATOR;
    document.getElementById('sidebarFacilitatorRow').style.display = isDoorstep ? 'block' : 'none';
    document.getElementById('sidebarTotalFee').textContent = totalFee;

    // ---- Heading + form body, based on service type ----
    document.getElementById('formHeading').textContent = svc.applyHeading || `New ${svc.short || svc.name} Application`;
    document.title = `Dastak — Apply: ${svc.name}`;

    const formCard = document.getElementById('formCardBody');
    const formType = svc.formType || 'new';

    if (formType === 'new') {
        formCard.innerHTML = renderNewForm();
        wireNewForm();
    } else if (formType === 'renewal-simple') {
        formCard.innerHTML = renderRenewalSimpleForm();
        wireSimpleForm(validateRenewalSimple);
    } else if (formType === 'renewal-license') {
        formCard.innerHTML = renderLicenseLookupForm(true);
        wireSimpleForm(validateLicenseLookup);
    } else if (formType === 'duplicate-license') {
        formCard.innerHTML = renderLicenseLookupForm(false);
        wireSimpleForm(validateLicenseLookup);
    }

    function showSuccess() {
        const appId = 'DLIMS-' + Math.floor(100000 + Math.random() * 900000);
        document.getElementById('successServiceName').textContent = svc.name;
        document.getElementById('successAppId').textContent = appId;
        document.getElementById('successAmount').textContent = `PKR ${totalFee}`;
        document.getElementById('formView').style.display = 'none';
        document.getElementById('successView').style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function validateRenewalSimple() {
        const errors = [];
        const cnic = document.getElementById('fCnic').value.trim();
        const dob = document.getElementById('fDob').value.trim();
        if (!/^\d{13}$/.test(cnic)) errors.push('Enter a valid 13-digit CNIC.');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) errors.push('DOB must be in YYYY-MM-DD format.');
        return errors;
    }

    function validateLicenseLookup() {
        const errors = [];
        const cnic = document.getElementById('fCnic').value.trim();
        const licenseNo = document.getElementById('fLicenseNo').value.trim();
        const issuanceDate = document.getElementById('fIssuanceDate').value.trim();
        if (!/^\d{13}$/.test(cnic)) errors.push('Enter a valid 13-digit CNIC.');
        if (!licenseNo) errors.push('License No. is required.');
        if (!issuanceDate) errors.push('License Issuance Date is required.');
        // Renewal-only selects: present for renewal-license, absent for
        // duplicate-license. Both now start on an empty placeholder option,
        // so an untouched select must be rejected instead of silently
        // defaulting to the first real value.
        const duration = document.getElementById('fDuration');
        const possession = document.getElementById('fPossession');
        if (duration && !duration.value.trim()) errors.push('Renewal Duration is required.');
        if (possession && !possession.value.trim()) errors.push('Is old License in Possession is required.');
        return errors;
    }

    // ---- Wiring for the short lookup-style forms (renewal-simple, renewal-license, duplicate-license) ----
    function wireSimpleForm(validateFn) {
        const checkCaptcha = wireCaptcha(formCard);
        document.getElementById('btnSubmitApplication').addEventListener('click', () => {
            const errors = validateFn();
            const captchaOk = checkCaptcha();
            const errorBox = document.getElementById('formError');
            if (errors.length || !captchaOk) {
                errorBox.innerHTML = errors.join('<br>');
                errorBox.classList.toggle('d-none', errors.length === 0);
                if (errors.length) errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
            errorBox.classList.add('d-none');
            showSuccess();
        });
    }

    // ---- Wiring for the full "new applicant" form ----
    function wireNewForm() {
        const permProvince = document.getElementById('permProvince');
        const permDistrict = document.getElementById('permDistrict');
        const currProvince = document.getElementById('currProvince');
        const currDistrict = document.getElementById('currDistrict');
        const sameAsAbove = document.getElementById('sameAsAbove');
        const permAddress = document.getElementById('permAddress');
        const currAddress = document.getElementById('currAddress');

        populateDistricts(permDistrict, permProvince.value);
        populateDistricts(currDistrict, currProvince.value);
        permProvince.addEventListener('change', () => populateDistricts(permDistrict, permProvince.value));
        currProvince.addEventListener('change', () => populateDistricts(currDistrict, currProvince.value));

        function syncCurrentAddress() {
            currProvince.value = permProvince.value;
            populateDistricts(currDistrict, permProvince.value);
            currDistrict.value = permDistrict.value;
            currAddress.value = permAddress.value;
        }
        sameAsAbove.addEventListener('change', () => {
            const on = sameAsAbove.checked;
            [currProvince, currDistrict, currAddress].forEach(el => el.disabled = on);
            if (on) syncCurrentAddress();
        });
        [permProvince, permDistrict, permAddress].forEach(el => {
            el.addEventListener('input', () => { if (sameAsAbove.checked) syncCurrentAddress(); });
            el.addEventListener('change', () => { if (sameAsAbove.checked) syncCurrentAddress(); });
        });

        // Picture upload / preview
        const avatarPreview = document.getElementById('avatarPreview');
        const avatarLabel = document.getElementById('avatarLabel');
        const pictureInput = document.getElementById('pictureInput');

        function showAvatarFile(file) {
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                avatarPreview.innerHTML = `<img src="${e.target.result}" alt="">`;
                avatarLabel.textContent = file.name;
            };
            reader.readAsDataURL(file);
        }
        document.getElementById('btnUploadPicture').addEventListener('click', () => pictureInput.click());
        pictureInput.addEventListener('change', () => showAvatarFile(pictureInput.files[0]));

        // Capture (webcam)
        document.getElementById('btnCapturePicture').addEventListener('click', async () => {
            if (!navigator.mediaDevices?.getUserMedia) {
                alert('Camera capture is not available in this browser.');
                return;
            }
            let stream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
            } catch (err) {
                alert("Camera access was not granted, so capture is unavailable. Please use Upload instead.");
                return;
            }
            const modalHtml = `
                <div class="modal fade" id="captureModal" tabindex="-1">
                    <div class="modal-dialog modal-dialog-centered">
                        <div class="modal-content p-3">
                            <video id="captureVideo" autoplay playsinline style="width:100%; border-radius:12px;"></video>
                            <div class="d-flex gap-2 justify-content-center mt-3">
                                <button type="button" class="btn btn-success" id="btnTakeShot">Take Photo</button>
                                <button type="button" class="btn btn-light border" data-bs-dismiss="modal">Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            const modalEl = document.getElementById('captureModal');
            const video = document.getElementById('captureVideo');
            video.srcObject = stream;
            const bsModal = new bootstrap.Modal(modalEl);
            bsModal.show();

            function stopStream() { stream.getTracks().forEach(t => t.stop()); }

            document.getElementById('btnTakeShot').addEventListener('click', () => {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                canvas.getContext('2d').drawImage(video, 0, 0);
                avatarPreview.innerHTML = `<img src="${canvas.toDataURL('image/png')}" alt="">`;
                avatarLabel.textContent = 'Captured photo';
                bsModal.hide();
            });
            modalEl.addEventListener('hidden.bs.modal', () => { stopStream(); modalEl.remove(); });
        });

        // CNIC front/back dropzones
        function wireDropzone(zoneId, inputId) {
            const zone = document.getElementById(zoneId);
            const input = document.getElementById(inputId);
            zone.addEventListener('click', () => input.click());
            input.addEventListener('change', () => {
                const file = input.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (e) => {
                    zone.classList.add('has-file');
                    zone.querySelector('h6').textContent = file.name;
                    zone.querySelector('p').textContent = 'Click to change';
                    const existingThumb = zone.querySelector('.preview-thumb');
                    if (existingThumb) existingThumb.remove();
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.className = 'preview-thumb';
                    zone.insertBefore(img, zone.firstChild);
                    zone.querySelector('.cnic-icon')?.remove();
                };
                reader.readAsDataURL(file);
            });
        }
        wireDropzone('cnicFrontZone', 'cnicFrontInput');
        wireDropzone('cnicBackZone', 'cnicBackInput');

        document.getElementById('btnSubmitApplication').addEventListener('click', () => {
            const errors = [];
            const cnic = document.getElementById('fCnic').value.trim();
            const name = document.getElementById('fName').value.trim();
            const father = document.getElementById('fFather').value.trim();
            const dob = document.getElementById('fDob').value.trim();
            const phone = document.getElementById('fPhone').value.trim();

            if (!/^\d{13}$/.test(cnic)) errors.push('Enter a valid 13-digit CNIC.');
            if (!name) errors.push('Name is required.');
            if (!father) errors.push('Father / Husband Name is required.');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) errors.push('DOB must be in YYYY-MM-DD format.');
            if (!phone) errors.push('Phone Number is required.');
            if (!permAddress.value.trim()) errors.push('Permanent Address is required.');
            if (!currAddress.value.trim()) errors.push('Current Address is required.');
            if (!document.getElementById('cnicFrontInput').files.length) errors.push('Upload the front side of your CNIC.');
            if (!document.getElementById('cnicBackInput').files.length) errors.push('Upload the back side of your CNIC.');
            if (!document.getElementById('certifyCheck').checked) errors.push('Please confirm the certification checkbox.');

            const errorBox = document.getElementById('formError');
            if (errors.length) {
                errorBox.innerHTML = errors.join('<br>');
                errorBox.classList.remove('d-none');
                errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
            errorBox.classList.add('d-none');
            showSuccess();
        });
    }

    document.getElementById('btnCopyId').addEventListener('click', function () {
        const id = document.getElementById('successAppId').textContent;
        navigator.clipboard?.writeText(id).catch(() => {});
        this.textContent = 'Copied!';
        this.classList.add('success-state');
        setTimeout(() => { this.textContent = 'Copy'; this.classList.remove('success-state'); }, 1500);
    });

    document.getElementById('btnPayNow').addEventListener('click', () => {
        alert('Demo mode — no real payment gateway is connected.');
    });

    // ---- Mobile sidebar toggle ----
    const sidebar = document.getElementById('serviceSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    document.getElementById('sidebarToggleBtn').addEventListener('click', () => {
        sidebar.classList.add('show-sidebar');
        backdrop.classList.add('show');
    });
    backdrop.addEventListener('click', () => {
        sidebar.classList.remove('show-sidebar');
        backdrop.classList.remove('show');
    });
});
