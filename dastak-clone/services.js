// SERVICES, ICON, docRow, SELF_SERVICE_SVG, DOORSTEP_SVG come from
// assets/js/services-data.js, loaded before this file.

function buildPanel(key) {
    const svc = SERVICES[key];
    const docsHtml = svc.docs.map(docRow).join('');
    return `
    <div class="col-12 mt-2 service-expanded-panel">
        <div class="service-expanded-box border-success-custom p-4 bg-white shadow-sm position-relative">
            <h5 class="fw-bold mb-1">Choose How You Want to Apply</h5>
            <p class="text-muted small mb-4">Select the service mode that works best for you</p>

            <div class="row g-3 mb-4">
                <div class="col-md-6">
                    <div class="apply-option-card apply_online d-flex align-items-center p-3 cursor-pointer gap-3">
                        <div class="apply-icon-col"><div>${SELF_SERVICE_SVG}</div></div>
                        <div class="apply-text-col flex-grow-1">
                            <h6 class="fw-bold mb-1">Self Service</h6>
                            <p class="mb-0 text-muted small" style="font-size:0.8rem;">Apply online. Collect your final documents from the Relevant office in person.</p>
                        </div>
                        <div class="apply-radio-col ms-2 text-end"><i class="far fa-circle text-muted fs-5"></i></div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="apply-option-card apply_self d-flex align-items-center p-3 cursor-pointer gap-3">
                        <div class="apply-icon-col"><div>${DOORSTEP_SVG}</div></div>
                        <div class="apply-text-col flex-grow-1">
                            <h6 class="fw-bold mb-1">Doorstep Service</h6>
                            <p class="mb-0 text-muted small" style="font-size:0.8rem;">A Facilitator collects and delivers documents at your home.</p>
                        </div>
                        <div class="apply-radio-col ms-2 text-end"><i class="far fa-circle text-muted fs-5"></i></div>
                    </div>
                </div>
            </div>

            <div class="row g-4">
                <div class="col-lg-6">
                    <h6 class="fw-bold mb-3">Required Documents</h6>
                    <div class="table-responsive">
                        <table class="table table-borderless custom-doc-table align-middle tbals_csss">
                            <thead class="table-dark">
                                <tr>
                                    <th scope="col" class="rounded-start" style="width:55px;">Sr #</th>
                                    <th scope="col" class="w-50">Documents</th>
                                    <th scope="col" class="text-center">Original</th>
                                    <th scope="col" class="text-center">Photocopy</th>
                                    <th scope="col" class="text-center rounded-end">Attested</th>
                                </tr>
                            </thead>
                            <tbody>${docsHtml}</tbody>
                        </table>
                    </div>
                </div>
                <div class="col-lg-6">
                    <div class="fee_detail_card fee_detail_card_2">
                        <div class="d-flex align-items-center justify-content-between gap-3 flex-wrap">
                            <div class="d-flex gap-2">
                                <div><i class="fas fa-file-invoice-dollar" style="color:#F5BB18; font-size:28px;"></i></div>
                                <div><h6 class="fee_card_details_title mb-0">Fee of Application</h6></div>
                            </div>
                            <div>
                                <p class="fee_flex small_2 mb-0">Services: <span class="ms-1 fw-bold">Varies</span></p>
                                <p class="fee_flex small_2 mb-0">Platform fee: <span class="ms-1 fw-bold"><small class="text-uppercase">pkr</small> 15</span></p>
                                <p class="fee_flex small_2 mb-0 d-none facilitator-fee-row">
                                    <span>Facilitator fee:</span>
                                    <span class="ms-1 fw-bold"><small class="text-uppercase">pkr</small> 950</span>
                                </p>
                            </div>
                        </div>
                    </div>
                    <div class="fee_detail_breakdown_card fee_detail_breakdown_card_2">
                        <div>
                            <h6 class="fee_card_details_title text-success mb-0 text-end total-fee-display" data-platform-charge="15" data-facilitator-fee="950">
                                Varies + <small class="text-uppercase">pkr</small> 15
                            </h6>
                        </div>
                    </div>

                    ${svc.turnaround ? `
                    <div class="fee_detail_card mt-3 turnaround-time-card d-none">
                        <div class="d-flex align-items-center justify-content-between gap-3 flex-wrap">
                            <div class="d-flex gap-2">
                                <div><i class="fas fa-clock text-warning fa-2x"></i></div>
                                <div>
                                    <h6 class="fee_card_details_title mb-0">Turnaround Time</h6>
                                    <p class="fee_card_details_desc mb-0">Turnaround time for this service is around</p>
                                </div>
                            </div>
                            <h6 class="fee_card_details_title text-success mb-0">${svc.turnaround}</h6>
                        </div>
                    </div>` : ''}

                    <div class="mt-4">
                        <h6 class="fw-bold mb-1">Note:</h6>
                        <p class="text-muted mb-0" style="font-size:0.8rem; line-height:1.5;">${svc.note}</p>
                    </div>

                    <div class="demo-note" id="applyDemoNote">
                        <i class="fas fa-flask me-1"></i> Demo mode — this is a UI-only recreation, so "Apply" doesn't submit a real application.
                    </div>

                    <div class="d-flex justify-content-end gap-3 mt-4 pt-2 flex-wrap">
                        <button type="button" class="btn btn-light px-4 border rounded fw-bold text-dark bg-white btn-expand-cancel">Cancel</button>
                        <button type="button" class="btn btn-success px-5 fw-bold btn-apply-service">Apply</button>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

function initServicesPage() {
    // Guard: this file's script tag is now loaded on every page (so any
    // page can host services.html's fragment via the router), but this
    // init only makes sense when the services markup is actually mounted.
    if (!document.getElementById('dlimsServiceRow')) return;

    // Citizen / Business toggle — visual only
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    const row = document.getElementById('dlimsServiceRow');

    row.addEventListener('click', (e) => {
        const card = e.target.closest('.service-card-item');
        if (!card) return;

        const key = card.getAttribute('data-service-key');

        const wasActive = card.classList.contains('active-card');
        const existingPanel = row.parentElement.querySelector('.service-expanded-panel');

        if (existingPanel) existingPanel.remove();
        row.querySelectorAll('.service-card-item').forEach(c => c.classList.remove('active-card'));

        if (wasActive) return; // toggled closed

        card.classList.add('active-card');
        const panelHtml = buildPanel(key);
        row.insertAdjacentHTML('afterend', panelHtml);

        const panel = row.parentElement.querySelector('.service-expanded-panel');
        wireApplyPanel(panel, card, key);
    });

    function wireApplyPanel(panel, card, serviceKey) {
        const onlineCard = panel.querySelector('.apply_online');
        const doorstepCard = panel.querySelector('.apply_self');
        const facRow = panel.querySelector('.facilitator-fee-row');
        const turnaround = panel.querySelector('.turnaround-time-card');
        const total = panel.querySelector('.total-fee-display');
        const applyBtn = panel.querySelector('.btn-apply-service');
        const platformCharge = total ? Number(total.getAttribute('data-platform-charge')) : 0;
        const facilitatorFee = total ? Number(total.getAttribute('data-facilitator-fee')) : 0;

        function selectMode(mode) {
            [onlineCard, doorstepCard].forEach(c => {
                c.classList.remove('active');
                const icon = c.querySelector('i');
                icon.classList.remove('fa-check-circle');
                icon.classList.add('fa-circle');
            });
            const chosen = mode === 'online' ? onlineCard : doorstepCard;
            chosen.classList.add('active');
            const icon = chosen.querySelector('i');
            icon.classList.remove('fa-circle');
            icon.classList.add('fa-check-circle');

            const isDoorstep = mode === 'doorstep';
            if (facRow) facRow.classList.toggle('d-none', !isDoorstep);
            if (turnaround) turnaround.classList.toggle('d-none', !isDoorstep);
            if (total) {
                const amount = isDoorstep ? platformCharge + facilitatorFee : platformCharge;
                total.innerHTML = `Varies + <small class="text-uppercase">pkr</small> ${amount}`;
            }
            applyBtn.classList.add('active-btn');
            applyBtn.dataset.mode = mode;
        }

        onlineCard.addEventListener('click', () => selectMode('online'));
        doorstepCard.addEventListener('click', () => selectMode('doorstep'));

        panel.querySelector('.btn-expand-cancel').addEventListener('click', () => {
            panel.remove();
            card.classList.remove('active-card');
        });

        applyBtn.addEventListener('click', () => {
            if (!applyBtn.dataset.mode) {
                alert('Please select an application method.');
                return;
            }
            const target = `apply.html?service=${encodeURIComponent(serviceKey)}&mode=${applyBtn.dataset.mode}`;
            if (window.__maryamRouter && window.__maryamRouter.navigateTo) {
                window.__maryamRouter.navigateTo(target);
            } else {
                window.location.href = target;
            }
        });
    }

    // ---- Math captcha (client-side, demo only) ----
    document.querySelectorAll('.math-captcha-wrapper').forEach(wrapper => {
        function newCaptcha() {
            const a = Math.floor(Math.random() * 9) + 1;
            const b = Math.floor(Math.random() * 9) + 1;
            wrapper.dataset.answer = a + b;
            wrapper.querySelector('.math-question').textContent = `What is ${a} + ${b}?`;
            wrapper.querySelector('.math-captcha-input').value = '';
            wrapper.querySelector('.captcha_error').style.display = 'none';
        }
        wrapper.querySelector('.reloadCaptcha').addEventListener('click', newCaptcha);
        newCaptcha();
    });

    function validateCaptcha(offcanvasEl) {
        const wrapper = offcanvasEl.querySelector('.math-captcha-wrapper');
        const input = wrapper.querySelector('.math-captcha-input');
        const errorEl = wrapper.querySelector('.captcha_error');
        const val = input.value.trim();
        if (!val || Number(val) !== Number(wrapper.dataset.answer)) {
            errorEl.textContent = 'Please solve the captcha correctly';
            errorEl.style.display = 'block';
            return false;
        }
        errorEl.style.display = 'none';
        return true;
    }

    // License-type toggle: CNIC <-> Passport Number labels
    function wireLicenseTypeToggle(radioName, labelId, inputId) {
        document.querySelectorAll(`input[name="${radioName}"]`).forEach(radio => {
            radio.addEventListener('change', () => {
                const label = document.getElementById(labelId);
                const input = document.querySelector(`#${inputId}`) || document.getElementById(inputId);
                if (!label) return;
                if (radio.value === 'regular') {
                    label.textContent = 'Enter CNIC';
                    if (input) input.setAttribute('placeholder', 'CNIC without dashes. e.g (1111122222223)');
                } else {
                    label.textContent = 'Enter Passport Number';
                    if (input) input.setAttribute('placeholder', 'Enter Passport Number');
                }
            });
        });
    }
    wireLicenseTypeToggle('licenseType', 'cnicPassportLabel', 'cnicPassportInput');
    wireLicenseTypeToggle('verifylicenseType', 'verifycnicPassportLabel', 'verifycnicPassportInput');

    // Generate / Track / Verify — demo-only actions
    function wireActionButton(buttonId, offcanvasId, noteId) {
        const btn = document.getElementById(buttonId);
        if (!btn) return;
        btn.addEventListener('click', () => {
            const offcanvasEl = document.getElementById(offcanvasId);
            if (!validateCaptcha(offcanvasEl)) return;
            const note = document.getElementById(noteId);
            if (note) note.classList.add('show');
        });
    }
    wireActionButton('generateLicenseButton', 'eLicenseOffcanvas', 'eLicenseDemoNote');
    wireActionButton('generateTrackButton', 'trackdlimsOffcanvas', 'trackDemoNote');
    wireActionButton('verifyLicenseButton', 'VerifyOffcanvas', 'verifyDemoNote');

    // Reset demo notes / forms whenever an offcanvas is closed
    document.querySelectorAll('.offcanvas').forEach(oc => {
        oc.addEventListener('hidden.bs.offcanvas', () => {
            oc.querySelectorAll('.demo-note').forEach(n => n.classList.remove('show'));
        });
    });

    // Coming back from apply.html's success screen via "Track Application"
    if (new URLSearchParams(window.location.search).get('openTrack') === '1') {
        bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('trackdlimsOffcanvas')).show();
        history.replaceState(null, '', window.location.pathname);
    }
}
window.initServicesPage = initServicesPage;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initServicesPage);
} else {
    initServicesPage();
}
