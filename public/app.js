/**
 * CodeVerse Hackathon 2026 - Student Registration & Payment Controller
 * Manages 6-step registration wizard, member cards (4-6 members), validations, UPI/Bank copy tools, and receipts.
 */

// Application State
const PRICING_TIERS = {
  2: { fee: 250, name: 'DUO' },
  3: { fee: 330, name: 'TRIO' },
  4: { fee: 400, name: 'QUARTET' },
  5: { fee: 470, name: 'QUINTET' }
};

function calculateTeamFee(memberCount) {
  const tier = PRICING_TIERS[memberCount];
  return tier ? tier.fee : 250;
}

function getTierName(memberCount) {
  const tier = PRICING_TIERS[memberCount];
  return tier ? tier.name : 'DUO';
}

const state = {
  currentStep: 1,
  hackathonConfig: null,
  registeredTeam: null,
  teamDraft: {
    teamName: '',
    track: 'To be decided (Post-Vibecoding)',
    projectTitle: '',
    referral: '',
    leader: {
      fullName: '',
      regNumber: '',
      collegeEmail: '',
      phone: '',
      residenceType: 'HOSTELLER',
      hostelBlock: '',
      roomNo: '',
      hostelDetails: '',
      dayScholarType: 'LOCAL',
      dayScholarLocation: '',
      residenceAddress: '',
      commuteMode: ''
    },
    // Starts with 1 additional member to make 2 total (1 leader + 1 member = DUO tier)
    members: [
      {
        id: 'mem_1',
        fullName: '',
        regNumber: '',
        collegeEmail: '',
        phone: '',
        residenceType: 'HOSTELLER',
        hostelBlock: '',
        roomNo: '',
        hostelDetails: '',
        dayScholarType: 'LOCAL',
        dayScholarLocation: '',
        residenceAddress: '',
        commuteMode: ''
      }
    ]
  },
  proofFile: null
};

// Edit Team Modal State
const editState = {
  registrationId: null,
  teamName: '',
  track: 'AI & Intelligent Systems',
  projectTitle: '',
  leader: {
    fullName: '',
    regNumber: '',
    collegeEmail: '',
    phone: ''
  },
  members: [],
  deadline: null,
  isDeadlinePassed: false
};

// Cloudflare Turnstile anti-bot security
let turnstileWidgetId = null;
let currentTurnstileToken = null;

function initTurnstile() {
  const container = document.getElementById('cf-turnstile-container');
  if (!container) return;

  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const siteKey = isLocal 
    ? '1x00000000000000000000AA' 
    : ((state.hackathonConfig && state.hackathonConfig.turnstileSiteKey) || '0x4AAAAAAFe4Z-FGGrCOS8QK');

  const renderWidget = () => {
    if (window.turnstile && typeof window.turnstile.render === 'function') {
      if (turnstileWidgetId !== null) {
        try { window.turnstile.remove(turnstileWidgetId); } catch (e) {}
        turnstileWidgetId = null;
      }
      try {
        turnstileWidgetId = window.turnstile.render('#cf-turnstile-container', {
          sitekey: siteKey,
          theme: 'dark',
          size: 'flexible',
          callback: function (token) {
            currentTurnstileToken = token;
            const tokenInput = document.getElementById('turnstile-token');
            if (tokenInput) tokenInput.value = token;
          },
          'expired-callback': function () {
            currentTurnstileToken = null;
            const tokenInput = document.getElementById('turnstile-token');
            if (tokenInput) tokenInput.value = '';
          },
          'error-callback': function () {
            currentTurnstileToken = null;
            const tokenInput = document.getElementById('turnstile-token');
            if (tokenInput) tokenInput.value = '';
          }
        });
      } catch (err) {
        console.warn('[TURNSTILE] Failed to render widget:', err);
      }
    } else {
      setTimeout(renderWidget, 250);
    }
  };

  renderWidget();
}

window.onloadTurnstileCallback = function () {
  initTurnstile();
};

// DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
  initApp();
});

async function initApp() {
  await fetchConfig();
  initTurnstile();
  renderMembers();
  updateMemberCounter();
  bindEvents();
  initParticleCanvas();
  initTypewriterEffect();
  init3DParallaxAndTilt();
  initScrollReveal();

  // Set default transaction date to today
  const payDateInput = document.getElementById('pay-date');
  if (payDateInput) {
    payDateInput.value = new Date().toISOString().split('T')[0];
  }

  // Restore session state
  restoreSessionState();

  // Check for direct resume URL parameter or local pending registration
  const urlParams = new URLSearchParams(window.location.search);
  const resumeParam = urlParams.get('resume');
  if (resumeParam) {
    await handleResumeRegistration(resumeParam);
  } else if (urlParams.get('openResume')) {
    openResumeModal();
  } else {
    checkPendingRegistrationBanner();
  }

  // Bind auto-save listeners
  document.addEventListener('input', () => setTimeout(saveSessionState, 100));
  document.addEventListener('change', () => setTimeout(saveSessionState, 100));
}

/**
 * Auto-Save & Restore Session State to prevent data loss on refresh
 */
function saveSessionState() {
  if (state.currentStep === 6) return; // Don't save receipt state
  
  const formData = {};
  formData.currentStep = state.currentStep;
  formData.memberCount = state.teamDraft.members.length;
  
  // Track OTP verification
  const sendBtn = document.getElementById('btn-send-otp');
  formData.otpVerified = Boolean(isLeaderEmailVerified || (sendBtn && sendBtn.disabled && sendBtn.textContent.includes('Verified')) || sessionStorage.getItem('codeverse_verified_email'));
  formData.verificationToken = state.verificationToken || sessionStorage.getItem('codeverse_verification_token') || '';
  formData.verifiedEmail = sessionStorage.getItem('codeverse_verified_email') || '';

  // Edit Modal State
  const editModal = document.getElementById('edit-modal');
  if (editModal && !editModal.classList.contains('hidden')) {
    formData.isEditModalOpen = true;
    formData.editRegId = document.getElementById('edit-search-input')?.value || '';
  }
  
  document.querySelectorAll('input, select, textarea').forEach(el => {
    if (el.id && el.type !== 'file' && el.type !== 'submit' && el.type !== 'button') {
      formData[el.id] = el.value;
    }
  });
  
  sessionStorage.setItem('codeverse_reg_state', JSON.stringify(formData));
}

function restoreSessionState() {
  const savedStr = sessionStorage.getItem('codeverse_reg_state');
  if (!savedStr) return;
  
  try {
    const formData = JSON.parse(savedStr);

    // Bypass instructions gate if there is saved state
    const instructionsGate = document.getElementById('instructions-gate');
    const registerWizard = document.getElementById('register-wizard-container');
    if (instructionsGate && registerWizard) {
      instructionsGate.style.display = 'none';
      registerWizard.style.display = 'block';
    }
    
    // 1. Restore Member Count
    if (formData.memberCount) {
      while (state.teamDraft.members.length < formData.memberCount) {
        state.teamDraft.members.push({
          id: `mem_${state.teamDraft.members.length + 1}`,
          fullName: '',
          regNumber: '',
          collegeEmail: '',
          phone: '',
          residenceType: 'HOSTELLER',
          hostelBlock: '',
          roomNo: '',
          hostelDetails: '',
          dayScholarType: 'LOCAL',
          dayScholarLocation: '',
          residenceAddress: '',
          commuteMode: ''
        });
      }
      while (state.teamDraft.members.length > formData.memberCount) {
        state.teamDraft.members.pop();
      }
      renderMembers();
      updateMemberCounter();
    }
    
    // 2. Restore DOM Values (for static elements)
    document.querySelectorAll('input, select, textarea').forEach(el => {
      if (el.id && formData[el.id] !== undefined && el.type !== 'file') {
        el.value = formData[el.id];
      }
    });

    // 3. Restore OTP verification
    if (formData.otpVerified) {
      isLeaderEmailVerified = true;
      state.verificationToken = formData.verificationToken || sessionStorage.getItem('codeverse_verification_token') || state.verificationToken;
      if (formData.verifiedEmail) {
        try {
          sessionStorage.setItem('codeverse_verified_email', formData.verifiedEmail);
        } catch (e) {}
      }
      if (formData.verificationToken) {
        try {
          sessionStorage.setItem('codeverse_verification_token', formData.verificationToken);
        } catch (e) {}
      }

      const emailInput = document.getElementById('leader-email');
      const sendBtn = document.getElementById('btn-send-otp');
      const otpSection = document.getElementById('otp-section');
      const otpHint = document.getElementById('otp-hint');
      
      if (emailInput) {
        emailInput.readOnly = true;
        emailInput.classList.add('verified-input');
        emailInput.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
        emailInput.style.borderColor = 'rgba(16, 185, 129, 0.5)';
      }
      if (sendBtn) {
        sendBtn.style.display = 'none';
        sendBtn.disabled = true;
        sendBtn.innerHTML = '✓ Verified';
        sendBtn.classList.add('btn-success');
      }
      if (otpSection) otpSection.style.display = 'none';
      if (otpHint) {
        otpHint.style.display = 'block';
        otpHint.innerHTML = '✅ Email verified successfully. <a href="#" id="link-change-email" style="color: #818cf8; margin-left: 8px; text-decoration: underline;">Change email</a>';
        otpHint.style.color = '#10b981';

        document.getElementById('link-change-email')?.addEventListener('click', (ev) => {
          ev.preventDefault();
          isLeaderEmailVerified = false;
          state.verificationToken = null;
          try {
            sessionStorage.removeItem('codeverse_verification_token');
            sessionStorage.removeItem('codeverse_verified_email');
            localStorage.removeItem('codeverse_verification_token');
            localStorage.removeItem('codeverse_verified_email');
          } catch (e) {}
          emailInput.readOnly = false;
          emailInput.style.backgroundColor = '';
          emailInput.style.borderColor = '';
          sendBtn.style.display = '';
          sendBtn.disabled = false;
          sendBtn.textContent = 'Send OTP';
          sendBtn.classList.remove('btn-success');
          otpHint.innerHTML = 'Official updates & receipt will be sent here. Email verification required.';
          otpHint.style.color = 'var(--text-muted)';
          emailInput.focus();
        });
      }
    }
    
    // 4. Restore Step
    if (formData.currentStep && formData.currentStep >= 1 && formData.currentStep < 6) {
      if (state.hackathonConfig && state.hackathonConfig.isRegistrationDeadlinePassed) {
        // Do not restore step if registration is closed
        sessionStorage.removeItem('codeverse_reg_state');
      } else {
        goToStep(formData.currentStep);
      }
    }

    // 5. Restore Edit Modal
    if (formData.isEditModalOpen && formData.editRegId) {
      openEditModal();
      const input = document.getElementById('edit-search-input');
      if (input) input.value = formData.editRegId;
      
      // Auto trigger lookup, then apply saved inputs!
      handleLookupEdit(true).then(() => {
        // After lookup is complete and form is built, apply saved values
        document.querySelectorAll('#form-edit-team input, #form-edit-team select').forEach(el => {
          if (el.id && formData[el.id] !== undefined) {
            el.value = formData[el.id];
          }
        });
      }).catch(err => console.error(err));
    }
  } catch(e) {
    console.error('Failed to restore session state', e);
  }
}

/**
 * Fetch Hackathon & Payment Configuration from Backend
 */
async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    if (data.success) {
      state.hackathonConfig = data.config;
      applyConfigToUI(data.config);
    }
  } catch (err) {
    console.warn('Could not fetch config from server, using defaults:', err);
    showToast('Offline or local configuration mode active', 'info');
  }
}

function applyConfigToUI(config) {
  // Update Fee Displays dynamically based on members
  updateDynamicFeeUI();

  // Apply UPI details
  if (config.upiDetails) {
    const upiIdEl = document.getElementById('upi-id-text');
    const upiNameEl = document.getElementById('upi-name-text');
    const qrImageEl = document.getElementById('upi-qr-image');
    const qrLoadingEl = document.getElementById('qr-loading');

    if (upiIdEl) upiIdEl.textContent = config.upiDetails.upiId;
    if (upiNameEl) upiNameEl.textContent = config.upiDetails.payeeName;
    if (qrImageEl && config.upiDetails.qrCodeDataUrl) {
      qrImageEl.src = config.upiDetails.qrCodeDataUrl;
      if (qrLoadingEl) qrLoadingEl.classList.add('hidden');
    }
  }

  // Apply Bank details
  if (config.bankDetails) {
    const holderEl = document.getElementById('bank-holder-text');
    const bankEl = document.getElementById('bank-name-text');
    const accEl = document.getElementById('bank-acc-text');
    const ifscEl = document.getElementById('bank-ifsc-text');
    const branchEl = document.getElementById('bank-branch-text');
    const typeEl = document.getElementById('bank-type-text');

    if (holderEl) holderEl.textContent = config.bankDetails.accountHolder;
    if (bankEl) bankEl.textContent = config.bankDetails.bankName;
    if (accEl) accEl.textContent = config.bankDetails.accountNumber;
    if (ifscEl) ifscEl.textContent = config.bankDetails.ifscCode;
    if (branchEl) branchEl.textContent = config.bankDetails.branch;
    if (typeEl) typeEl.textContent = config.bankDetails.accountType;
  }

  // Handle Registration Deadline
  if (config.isRegistrationDeadlinePassed) {
    const proceedBtn = document.getElementById('proceed-to-register-btn');
    const checkboxLabel = document.querySelector('.custom-checkbox-label');
    const actionsContainer = document.querySelector('.form-actions');
    const instructionsList = document.querySelector('#instructions-gate .form-grid');

    if (proceedBtn) proceedBtn.style.display = 'none';
    if (checkboxLabel) checkboxLabel.style.display = 'none';
    if (instructionsList) instructionsList.style.display = 'none';
    
    // Update the step header
    const stepTitle = document.querySelector('#instructions-gate .step-title');
    const stepDesc = document.querySelector('#instructions-gate .step-desc');
    if (stepTitle) stepTitle.textContent = '🚫 Registrations Are Closed';
    if (stepDesc) stepDesc.textContent = '';

    if (actionsContainer) {
      actionsContainer.innerHTML = '';
      const closedMsg = document.createElement('div');
      closedMsg.style.cssText = 'text-align:center; padding:30px 20px; background:rgba(255,70,70,0.1); border:1px solid rgba(255,70,70,0.3); border-radius:12px; width:100%;';
      closedMsg.innerHTML = `
        <div style="font-size:3rem; margin-bottom:12px;">⛔</div>
        <h3 style="color:#ff4646; margin-bottom:10px; font-size:1.3rem;">Registration Deadline Has Passed</h3>
        <p style="color:var(--text-muted); font-size:0.95rem; line-height:1.6;">
          We are no longer accepting new team registrations for CodeVerse 2.0.<br>
          If you have already registered, you can still check your registration status or edit your team details (if the edit window is open).
        </p>
        <p style="margin-top:15px; color:var(--text-muted); font-size:0.85rem;">
          For any queries, contact: <strong style="color:var(--text-main);">Anzal Khan (+91 99563 61794)</strong>, <strong style="color:var(--text-main);">Aniket (+91 83058 01086)</strong>, or <strong style="color:var(--text-main);">Trisha Kapoor (+91 70113 49889)</strong>
        </p>
      `;
      actionsContainer.appendChild(closedMsg);
    }
  }
}

/**
 * OTP Verification Logic
 */
function initOTPLogic() {
  const sendBtn = document.getElementById('btn-send-otp');
  const verifyBtn = document.getElementById('btn-verify-otp');
  const emailInput = document.getElementById('leader-email');
  const otpSection = document.getElementById('otp-section');
  const otpInput = document.getElementById('leader-otp');
  const statusMsg = document.getElementById('otp-status-msg');
  const otpHint = document.getElementById('otp-hint');

  if (!sendBtn) return;

  sendBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!email || !emailRegex.test(email)) {
      showToast('Please enter a valid email before requesting an OTP.', 'error');
      emailInput.focus();
      return;
    }

    const tokenInput = document.getElementById('turnstile-token');
    const turnstileToken = (tokenInput && tokenInput.value) || currentTurnstileToken;
    if (!turnstileToken && window.turnstile && document.getElementById('cf-turnstile-container')) {
      showToast('Please complete the security verification before requesting an OTP.', 'warning');
      return;
    }

    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';

    try {
      const response = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, turnstileToken })
      });
      const data = await response.json();

      if (data.success) {
        showToast('OTP sent! Please check your email.', 'success');
        otpSection.style.display = 'block';
        otpHint.style.display = 'none';

        // Check if there is an existing pending team for this email
        const noticeEl = document.getElementById('step1-pending-notice');
        if (noticeEl) {
          if (data.pendingTeam) {
            noticeEl.style.display = 'block';
            noticeEl.innerHTML = `
              <div class="pending-notice-card">
                <div>
                  <span>⚡ Incomplete registration found for squad <strong>${escapeHtml(data.pendingTeam.teamName)}</strong> (ID: <code>${escapeHtml(data.pendingTeam.registrationId)}</code>).</span>
                </div>
                <button type="button" class="btn btn-sm btn-primary" id="btn-inline-resume-pay">
                  Continue to Payment →
                </button>
              </div>
            `;
            document.getElementById('btn-inline-resume-pay')?.addEventListener('click', async (e) => {
              e.preventDefault();
              const btn = e.currentTarget;
              btn.disabled = true;
              btn.textContent = 'Redirecting to Payment...';
              try {
                await handleResumeRegistration(data.pendingTeam.registrationId);
              } finally {
                btn.disabled = false;
                btn.textContent = 'Continue to Payment →';
              }
            });
          } else {
            noticeEl.style.display = 'none';
          }
        }
        
        // Cooldown for resend
        let countdown = 60;
        const interval = setInterval(() => {
          countdown--;
          sendBtn.textContent = `Resend in ${countdown}s`;
          if (countdown <= 0) {
            clearInterval(interval);
            sendBtn.disabled = false;
            sendBtn.textContent = 'Resend OTP';
            if (window.turnstile && turnstileWidgetId !== null) {
              try { window.turnstile.reset(turnstileWidgetId); } catch (e) {}
              currentTurnstileToken = null;
              if (tokenInput) tokenInput.value = '';
            }
          }
        }, 1000);
      } else {
        if (window.turnstile && turnstileWidgetId !== null) {
          try { window.turnstile.reset(turnstileWidgetId); } catch (e) {}
          currentTurnstileToken = null;
          if (tokenInput) tokenInput.value = '';
        }
        showToast(data.error || 'Failed to send OTP.', 'error');
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send OTP';
      }
    } catch (err) {
      if (window.turnstile && turnstileWidgetId !== null) {
        try { window.turnstile.reset(turnstileWidgetId); } catch (e) {}
        currentTurnstileToken = null;
        if (tokenInput) tokenInput.value = '';
      }
      console.error(err);
      showToast('An error occurred while sending OTP.', 'error');
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send OTP';
    }
  });

  verifyBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const otp = otpInput.value.trim();

    if (!otp || otp.length !== 6) {
      statusMsg.textContent = 'Please enter a valid 6-digit OTP.';
      return;
    }

    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Verifying...';
    statusMsg.textContent = '';

    try {
      const response = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp })
      });
      const data = await response.json();

      if (data.success) {
        isLeaderEmailVerified = true;
        state.verificationToken = data.verificationToken;
        try {
          sessionStorage.setItem('codeverse_verification_token', data.verificationToken);
          sessionStorage.setItem('codeverse_verified_email', email.trim().toLowerCase());
          localStorage.setItem('codeverse_verification_token', data.verificationToken);
          localStorage.setItem('codeverse_verified_email', email.trim().toLowerCase());
        } catch (e) {}
        showToast('Email verified successfully!', 'success');
        
        // Update UI to show verified state
        otpSection.style.display = 'none';
        sendBtn.style.display = 'none';
        emailInput.readOnly = true;
        emailInput.style.backgroundColor = 'rgba(16, 185, 129, 0.1)'; // green tint
        emailInput.style.borderColor = 'rgba(16, 185, 129, 0.5)';
        
        otpHint.style.display = 'block';
        otpHint.innerHTML = '✅ Email verified successfully. <a href="#" id="link-change-email" style="color: #818cf8; margin-left: 8px; text-decoration: underline;">Change email</a>';
        otpHint.style.color = '#10b981';

        document.getElementById('link-change-email')?.addEventListener('click', (ev) => {
          ev.preventDefault();
          isLeaderEmailVerified = false;
          state.verificationToken = null;
          try {
            sessionStorage.removeItem('codeverse_verification_token');
            sessionStorage.removeItem('codeverse_verified_email');
            localStorage.removeItem('codeverse_verification_token');
            localStorage.removeItem('codeverse_verified_email');
          } catch (e) {}
          emailInput.readOnly = false;
          emailInput.style.backgroundColor = '';
          emailInput.style.borderColor = '';
          sendBtn.style.display = '';
          sendBtn.disabled = false;
          sendBtn.textContent = 'Send OTP';
          sendBtn.classList.remove('btn-success');
          otpHint.innerHTML = 'Official updates & receipt will be sent here. Email verification required.';
          otpHint.style.color = 'var(--text-muted)';
          emailInput.focus();
        });
      } else {
        statusMsg.textContent = data.error || 'Invalid OTP.';
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify';
      }
    } catch (err) {
      console.error(err);
      statusMsg.textContent = 'An error occurred during verification.';
      verifyBtn.disabled = false;
      verifyBtn.textContent = 'Verify';
    }
  });

  // Reset verification if email changes to a different address
  emailInput.addEventListener('input', () => {
    const currentEmail = emailInput.value.trim().toLowerCase();
    const verifiedEmail = (sessionStorage.getItem('codeverse_verified_email') || '').trim().toLowerCase();
    if (isLeaderEmailVerified && verifiedEmail && currentEmail === verifiedEmail) {
      return; // Still verified!
    }
    isLeaderEmailVerified = false;
    state.verificationToken = null;
    try {
      sessionStorage.removeItem('codeverse_verification_token');
      sessionStorage.removeItem('codeverse_verified_email');
    } catch (e) {}
    otpSection.style.display = 'none';
    const noticeEl = document.getElementById('step1-pending-notice');
    if (noticeEl) noticeEl.style.display = 'none';
    otpHint.style.display = 'block';
    otpHint.innerHTML = 'Official updates & receipt will be sent here. Email verification required.';
    otpHint.style.color = 'var(--text-muted)';
    sendBtn.style.display = '';
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send OTP';
    sendBtn.classList.remove('btn-success');
    emailInput.readOnly = false;
    emailInput.style.backgroundColor = '';
    emailInput.style.borderColor = '';
  });
}

/**
 * Event Bindings
 */
function bindEvents() {
  initOTPLogic();

  // Step 1 Leader Residence Toggle
  const btnLeaderHosteller = document.getElementById('btn-leader-res-hosteller');
  const btnLeaderDayScholar = document.getElementById('btn-leader-res-dayscholar');
  const leaderResTypeInput = document.getElementById('leader-residence-type');
  const leaderHostelBox = document.getElementById('leader-hostel-container');
  const leaderDayScholarBox = document.getElementById('leader-dayscholar-container');

  function setLeaderResidenceType(type) {
    if (leaderResTypeInput) leaderResTypeInput.value = type;
    if (state.teamDraft && state.teamDraft.leader) state.teamDraft.leader.residenceType = type;

    if (type === 'HOSTELLER') {
      btnLeaderHosteller?.classList.add('active');
      btnLeaderDayScholar?.classList.remove('active');
      leaderHostelBox?.classList.remove('hidden');
      leaderDayScholarBox?.classList.add('hidden');
    } else {
      btnLeaderHosteller?.classList.remove('active');
      btnLeaderDayScholar?.classList.add('active');
      leaderHostelBox?.classList.add('hidden');
      leaderDayScholarBox?.classList.remove('hidden');
    }
  }

  btnLeaderHosteller?.addEventListener('click', () => setLeaderResidenceType('HOSTELLER'));
  btnLeaderDayScholar?.addEventListener('click', () => setLeaderResidenceType('DAY_SCHOLAR'));

  // Edit Leader Residence Toggle
  const btnEditLeaderHosteller = document.getElementById('btn-edit-leader-res-hosteller');
  const btnEditLeaderDayScholar = document.getElementById('btn-edit-leader-res-dayscholar');
  const editLeaderResTypeInput = document.getElementById('edit-leader-residence-type');
  const editLeaderHostelBox = document.getElementById('edit-leader-hostel-container');
  const editLeaderDayScholarBox = document.getElementById('edit-leader-dayscholar-container');

  function setEditLeaderResidenceType(type) {
    if (editLeaderResTypeInput) editLeaderResTypeInput.value = type;
    if (type === 'HOSTELLER') {
      btnEditLeaderHosteller?.classList.add('active');
      btnEditLeaderDayScholar?.classList.remove('active');
      editLeaderHostelBox?.classList.remove('hidden');
      editLeaderDayScholarBox?.classList.add('hidden');
    } else {
      btnEditLeaderHosteller?.classList.remove('active');
      btnEditLeaderDayScholar?.classList.add('active');
      editLeaderHostelBox?.classList.add('hidden');
      editLeaderDayScholarBox?.classList.remove('hidden');
    }
  }

  btnEditLeaderHosteller?.addEventListener('click', () => setEditLeaderResidenceType('HOSTELLER'));
  btnEditLeaderDayScholar?.addEventListener('click', () => setEditLeaderResidenceType('DAY_SCHOLAR'));
  
  // Navigation buttons
  document.getElementById('btn-goto-step-2')?.addEventListener('click', handleStep1Next);
  document.getElementById('btn-back-to-step-1')?.addEventListener('click', () => goToStep(1));
  document.getElementById('btn-goto-step-3')?.addEventListener('click', handleStep2Next);
  document.getElementById('btn-back-to-step-2')?.addEventListener('click', () => goToStep(2));
  document.getElementById('btn-confirm-and-pay')?.addEventListener('click', handleConfirmAndProceedToPayment);
  document.getElementById('btn-back-to-step-3')?.addEventListener('click', () => goToStep(3));
  document.getElementById('btn-goto-step-5')?.addEventListener('click', () => goToStep(5));
  document.getElementById('btn-back-to-step-4')?.addEventListener('click', () => goToStep(4));

  // Add Member Button
  document.getElementById('btn-add-member')?.addEventListener('click', addMemberCard);

  // Review confirmation checkbox
  const reviewCheckbox = document.getElementById('review-confirm-checkbox');
  const confirmBtn = document.getElementById('btn-confirm-and-pay');
  reviewCheckbox?.addEventListener('change', (e) => {
    if (confirmBtn) confirmBtn.disabled = !e.target.checked;
  });

  // Payment Tabs (UPI vs Bank Transfer)
  const tabBtns = document.querySelectorAll('.payment-tab');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');

      document.getElementById('tab-content-upi')?.classList.toggle('active', tabId === 'upi');
      document.getElementById('tab-content-bank')?.classList.toggle('active', tabId === 'bank');
    });
  });

  // One-click copy buttons
  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetId = btn.getAttribute('data-copy-target');
      const textToCopy = document.getElementById(targetId)?.textContent?.trim();
      if (textToCopy) {
        copyToClipboard(textToCopy, btn);
      }
    });
  });

  // Copy receipt registration ID
  document.getElementById('btn-copy-receipt-id')?.addEventListener('click', () => {
    const regId = document.getElementById('receipt-reg-id')?.textContent;
    if (regId) copyToClipboard(regId);
  });

  // File Dropzone & Picker
  setupDropzone();

  // Step 5 Payment Form Submission
  document.getElementById('form-payment-submit')?.addEventListener('submit', handlePaymentSubmit);

  // Print receipt
  document.getElementById('btn-print-receipt')?.addEventListener('click', () => {
    window.print();
  });

  // Track status buttons & modal
  document.getElementById('nav-track-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    openTrackModal();
  });
  document.getElementById('btn-track-this-team')?.addEventListener('click', () => {
    const regId = state.registeredTeam?.registration_id || state.registeredTeam?.registrationId;
    openTrackModal(regId);
  });
  document.getElementById('modal-track-close')?.addEventListener('click', closeTrackModal);
  document.getElementById('btn-lookup-status')?.addEventListener('click', handleTrackLookup);

  // Edit Team Details buttons & modal
  document.getElementById('nav-edit-team-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    openEditModal();
  });
  document.getElementById('modal-edit-close')?.addEventListener('click', closeEditModal);
  document.getElementById('btn-cancel-edit')?.addEventListener('click', closeEditModal);
  document.getElementById('btn-edit-cancel')?.addEventListener('click', closeEditModal);
  document.getElementById('btn-lookup-edit')?.addEventListener('click', handleLookupEdit);
  document.getElementById('form-edit-team')?.addEventListener('submit', handleSaveTeamEdit);

  // Resume / Continue Registration bindings
  document.getElementById('nav-resume-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    openResumeModal();
  });
  document.getElementById('btn-open-resume-modal')?.addEventListener('click', openResumeModal);
  document.getElementById('modal-resume-close')?.addEventListener('click', closeResumeModal);
  document.getElementById('btn-lookup-resume')?.addEventListener('click', () => {
    const val = document.getElementById('resume-search-input')?.value.trim();
    if (val) handleResumeRegistration(val);
    else showToast('Please enter your Registration ID or College Email', 'warning');
  });
  document.getElementById('resume-search-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = document.getElementById('resume-search-input')?.value.trim();
      if (val) handleResumeRegistration(val);
      else showToast('Please enter your Registration ID or College Email', 'warning');
    }
  });

  // Persistent Banner actions
  document.getElementById('btn-banner-resume')?.addEventListener('click', () => {
    const regId = document.getElementById('pending-banner-reg-id')?.textContent.trim();
    if (regId) handleResumeRegistration(regId);
  });
  document.getElementById('btn-banner-dismiss')?.addEventListener('click', () => {
    hidePendingBanner();
  });

  // Step 4 Pay Later
  document.getElementById('btn-pay-later')?.addEventListener('click', handlePayLater);
  document.getElementById('modal-pay-later-close')?.addEventListener('click', closePayLaterModal);
  document.getElementById('btn-close-pay-later-modal')?.addEventListener('click', () => {
    closePayLaterModal();
    window.location.href = 'index.html';
  });
  document.getElementById('btn-pay-now-from-modal')?.addEventListener('click', () => {
    closePayLaterModal();
    document.getElementById('step-4')?.scrollIntoView({ behavior: 'smooth' });
  });
  document.getElementById('btn-copy-resume-link')?.addEventListener('click', () => {
    const input = document.getElementById('pay-later-link-input');
    if (input && input.value) {
      copyToClipboard(input.value);
      showToast('Resume link copied to clipboard!', 'success');
    }
  });

  // Mobile Hamburger & Navigation Drawer Toggle
  const hamburgerBtn = document.getElementById('nav-hamburger-btn');
  const mobileDrawer = document.getElementById('mobile-menu-drawer');

  function toggleMobileDrawer(forceState) {
    if (!hamburgerBtn || !mobileDrawer) return;
    const shouldOpen = typeof forceState === 'boolean' ? forceState : !mobileDrawer.classList.contains('open');
    mobileDrawer.classList.toggle('open', shouldOpen);
    hamburgerBtn.classList.toggle('active', shouldOpen);
    hamburgerBtn.setAttribute('aria-expanded', String(shouldOpen));
  }

  hamburgerBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMobileDrawer();
  });

  // Close drawer when clicking any link inside it
  mobileDrawer?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      toggleMobileDrawer(false);
    });
  });

  // Close drawer when clicking outside
  document.addEventListener('click', (e) => {
    if (mobileDrawer?.classList.contains('open')) {
      if (!mobileDrawer.contains(e.target) && !hamburgerBtn?.contains(e.target)) {
        toggleMobileDrawer(false);
      }
    }
  });

  // Drawer Action Buttons
  document.getElementById('drawer-track-btn')?.addEventListener('click', () => {
    toggleMobileDrawer(false);
    openTrackModal();
  });

  document.getElementById('drawer-edit-btn')?.addEventListener('click', () => {
    toggleMobileDrawer(false);
    openEditModal();
  });

  // Smooth scroll for nav links with offset for sticky navbar
  document.querySelectorAll('.nav-link, .mobile-nav-link, .mobile-drawer-link').forEach(link => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      if (targetId && targetId.startsWith('#')) {
        const targetEl = document.querySelector(targetId);
        if (targetEl) {
          e.preventDefault();
          const navHeight = document.getElementById('main-nav')?.offsetHeight || 70;
          const targetTop = targetEl.getBoundingClientRect().top + window.pageYOffset - navHeight - 12;
          window.scrollTo({ top: targetTop, behavior: 'smooth' });
        }
      }
    });
  });

  // FAQ Accordion Interactivity
  document.querySelectorAll('.faq-item').forEach(item => {
    const questionBtn = item.querySelector('.faq-btn') || item.querySelector('.faq-question') || item;
    questionBtn?.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
      if (!isActive) {
        item.classList.add('active');
      }
    });
  });

  // Register button smooth jump & input focus
  document.querySelectorAll('a[href="#register"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const regSection = document.getElementById('register');
      if (regSection) {
        regSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => {
          if (state.currentStep === 1) {
            document.getElementById('team-name')?.focus();
          }
        }, 600);
      }
    });
  });
}

let isLeaderEmailVerified = false;

/**
 * Step 1 Navigation & Validation
 */
function handleStep1Next() {
  const teamName = document.getElementById('team-name').value.trim();
  const trackEl = document.getElementById('team-track');
  const projectTitleEl = document.getElementById('project-title');
  const track = trackEl ? trackEl.value : 'To be decided (Post-Vibecoding)';
  const projectTitle = projectTitleEl ? projectTitleEl.value.trim() : '';
  const referralEl = document.getElementById('referral');
  const referral = referralEl ? referralEl.value.trim() : '';

  const leaderName = document.getElementById('leader-name').value.trim();
  const leaderReg = document.getElementById('leader-reg').value.trim();
  const leaderEmail = document.getElementById('leader-email').value.trim();
  const leaderPhone = document.getElementById('leader-phone').value.trim();

  if (!teamName) {
    showToast('Please enter your Team Name.', 'error');
    document.getElementById('team-name').focus();
    return;
  }

  if (!leaderName) {
    showToast('Please enter Team Leader Full Name.', 'error');
    document.getElementById('leader-name').focus();
    return;
  }

  if (!leaderReg) {
    showToast('Please enter Team Leader College Registration Number.', 'error');
    document.getElementById('leader-reg').focus();
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!leaderEmail || !emailRegex.test(leaderEmail)) {
    showToast('Please enter a valid College Email for the Team Leader.', 'error');
    document.getElementById('leader-email').focus();
    return;
  }

  const storedVerifiedEmail = (sessionStorage.getItem('codeverse_verified_email') || '').trim().toLowerCase();
  if (storedVerifiedEmail && leaderEmail.toLowerCase() === storedVerifiedEmail) {
    isLeaderEmailVerified = true;
  }

  if (!isLeaderEmailVerified) {
    showToast('Please verify the Team Leader email address first.', 'warning');
    document.getElementById('leader-email').focus();
    return;
  }

  const cleanPhone = leaderPhone.replace(/\D/g, '');
  if (cleanPhone.length < 10) {
    showToast('Please enter a valid 10-digit phone number for the Team Leader.', 'error');
    document.getElementById('leader-phone').focus();
    return;
  }

  // Leader Residence Validation
  const leaderResType = document.getElementById('leader-residence-type')?.value || 'HOSTELLER';
  const leaderHostelBlock = document.getElementById('leader-hostel-block')?.value.trim() || '';
  const leaderRoomNo = document.getElementById('leader-room-no')?.value.trim() || '';
  const leaderHostelDetails = document.getElementById('leader-hostel-details')?.value.trim() || '';
  const leaderDayScholarType = document.getElementById('leader-dayscholar-type')?.value || 'LOCAL';
  const leaderDayScholarLoc = document.getElementById('leader-dayscholar-location')?.value.trim() || '';
  const leaderResAddress = document.getElementById('leader-residence-address')?.value.trim() || '';
  const leaderCommuteMode = document.getElementById('leader-commute-mode')?.value.trim() || '';

  if (leaderResType === 'HOSTELLER') {
    if (!leaderHostelBlock) {
      showToast('Please enter Hostel Block for Team Leader.', 'error');
      document.getElementById('leader-hostel-block')?.focus();
      return;
    }
    if (!leaderRoomNo) {
      showToast('Please enter Room Number for Team Leader.', 'error');
      document.getElementById('leader-room-no')?.focus();
      return;
    }
  } else {
    if (!leaderDayScholarLoc) {
      showToast('Please enter City / Area / Town for Team Leader.', 'error');
      document.getElementById('leader-dayscholar-location')?.focus();
      return;
    }
    if (!leaderResAddress) {
      showToast('Please enter Detailed Address or PG Name for Team Leader.', 'error');
      document.getElementById('leader-residence-address')?.focus();
      return;
    }
  }

  // Update State
  state.teamDraft.teamName = teamName;
  state.teamDraft.track = track;
  state.teamDraft.projectTitle = projectTitle;
  state.teamDraft.referral = referral;
  state.teamDraft.leader = {
    fullName: leaderName,
    regNumber: leaderReg,
    collegeEmail: leaderEmail,
    phone: leaderPhone,
    residenceType: leaderResType,
    hostelBlock: leaderHostelBlock,
    roomNo: leaderRoomNo,
    hostelDetails: leaderHostelDetails,
    dayScholarType: leaderDayScholarType,
    dayScholarLocation: leaderDayScholarLoc,
    residenceAddress: leaderResAddress,
    commuteMode: leaderCommuteMode
  };

  // Update Leader Preview in Step 2
  document.getElementById('leader-preview-name').textContent = leaderName;
  document.getElementById('leader-preview-reg').textContent = `Reg: ${leaderReg}`;
  document.getElementById('leader-preview-email').textContent = `Email: ${leaderEmail}`;
  document.getElementById('leader-preview-phone').textContent = `Phone: ${leaderPhone}`;
  const resPreviewEl = document.getElementById('leader-preview-residence');
  if (resPreviewEl) {
    if (leaderResType === 'HOSTELLER') {
      resPreviewEl.textContent = `Residence: Hosteller (${leaderHostelBlock} - Rm ${leaderRoomNo})`;
    } else {
      resPreviewEl.textContent = `Residence: Day Scholar (${leaderDayScholarType === 'LOCAL' ? 'Local' : 'PG'} - ${leaderDayScholarLoc})`;
    }
  }

  goToStep(2);
}

/**
 * Step 2 Navigation & Dynamic Members Management (2 to 5 members)
 */
function renderMembers() {
  const container = document.getElementById('dynamic-members-container');
  if (!container) return;

  container.innerHTML = '';

  state.teamDraft.members.forEach((member, index) => {
    const memberNum = index + 2; // Member 1 is Team Leader
    const card = document.createElement('div');
    card.className = 'member-card';
    card.id = `member-card-${member.id}`;

    // Can remove only if total members (1 leader + members.length) > 2
    const totalCount = 1 + state.teamDraft.members.length;
    const canRemove = totalCount > 2;

    card.innerHTML = `
      <div class="member-card-top">
        <div class="member-title-wrapper">
          <span class="member-idx">Member ${memberNum}</span>
        </div>
        ${canRemove ? `
          <button type="button" class="btn-remove-member" data-member-id="${member.id}">
            🗑️ Remove
          </button>
        ` : `
          <span class="input-hint" title="Minimum 2 members required">Mandatory (Min 2)</span>
        `}
      </div>

      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">Full Name <span class="required">*</span></label>
          <input type="text" class="form-input member-field" data-id="${member.id}" data-key="fullName" value="${member.fullName || ''}" placeholder="e.g. Priya Nair" required>
        </div>

        <div class="form-group">
          <label class="form-label">College Reg. Number <span class="required">*</span></label>
          <input type="text" class="form-input member-field" data-id="${member.id}" data-key="regNumber" value="${member.regNumber || ''}" placeholder="e.g. 22BCE1088" required>
        </div>

        <div class="form-group">
          <label class="form-label">College Email <span class="required">*</span></label>
          <input type="email" class="form-input member-field" data-id="${member.id}" data-key="collegeEmail" value="${member.collegeEmail || ''}" placeholder="e.g. priya.nair@college.edu" required>
        </div>

        <div class="form-group">
          <label class="form-label">Phone Number <span class="required">*</span></label>
          <input type="tel" class="form-input member-field" data-id="${member.id}" data-key="phone" value="${member.phone || ''}" placeholder="e.g. 9876543211" required maxlength="15">
        </div>
      </div>

      <!-- Residence & Hostel Section for Member -->
      <div class="residence-box" id="residence-box-${member.id}" style="margin-top: 16px;">
        <div class="residence-header">
          <span class="residence-title">
            <span>🏠</span> Residence & Accommodation Status <span class="required">*</span>
          </span>
          <span class="input-hint" style="margin: 0;">Campus entry & logistics</span>
        </div>

        <div class="residence-type-selector">
          <button type="button" class="residence-pill-btn hosteller ${member.residenceType !== 'DAY_SCHOLAR' ? 'active' : ''}" data-member-id="${member.id}" data-type="HOSTELLER">
            <span>🏢</span> Hosteller
          </button>
          <button type="button" class="residence-pill-btn dayscholar ${member.residenceType === 'DAY_SCHOLAR' ? 'active' : ''}" data-member-id="${member.id}" data-type="DAY_SCHOLAR">
            <span>🚌</span> Day Scholar
          </button>
        </div>
        <input type="hidden" class="member-field" data-id="${member.id}" data-key="residenceType" value="${member.residenceType || 'HOSTELLER'}">

        <!-- Hosteller Subform -->
        <div class="residence-subform ${member.residenceType === 'DAY_SCHOLAR' ? 'hidden' : ''}" id="hostel-subform-${member.id}">
          <div class="form-grid-2">
            <div class="form-group mb-0">
              <label class="form-label">Hostel Block <span class="required">*</span></label>
              <input type="text" class="form-input member-field" data-id="${member.id}" data-key="hostelBlock" value="${escapeHtml(member.hostelBlock || '')}" placeholder="e.g. Block 1 / Block 2">
            </div>

            <div class="form-group mb-0">
              <label class="form-label">Room Number <span class="required">*</span></label>
              <input type="text" class="form-input member-field" data-id="${member.id}" data-key="roomNo" value="${escapeHtml(member.roomNo || '')}" placeholder="e.g. 204">
            </div>
          </div>
        </div>

        <!-- Day Scholar Subform -->
        <div class="residence-subform ${member.residenceType !== 'DAY_SCHOLAR' ? 'hidden' : ''}" id="dayscholar-subform-${member.id}">
          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-label">Scholar Category <span class="required">*</span></label>
              <select class="form-input form-select member-field" data-id="${member.id}" data-key="dayScholarType">
                <option value="LOCAL" ${member.dayScholarType !== 'NON_LOCAL' ? 'selected' : ''}>Local Resident (Commuter from home)</option>
                <option value="NON_LOCAL" ${member.dayScholarType === 'NON_LOCAL' ? 'selected' : ''}>Non-Local (PG / Rental flat)</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">City / Area / Town <span class="required">*</span></label>
              <input type="text" class="form-input member-field" data-id="${member.id}" data-key="dayScholarLocation" value="${escapeHtml(member.dayScholarLocation || '')}" placeholder="e.g. Bhopal, Sehore, Ashta">
            </div>
          </div>

          <div class="form-group mb-0">
            <label class="form-label">Detailed Address / PG Name <span class="required">*</span></label>
            <input type="text" class="form-input member-field" data-id="${member.id}" data-key="residenceAddress" value="${escapeHtml(member.residenceAddress || '')}" placeholder="e.g. Balaji PG, Kothri Gate">
          </div>
        </div>
      </div>
    `;

    container.appendChild(card);
  });

  // Attach live input listeners to member inputs
  container.querySelectorAll('.member-field').forEach(input => {
    const eventType = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventType, (e) => {
      const memberId = e.target.getAttribute('data-id');
      const key = e.target.getAttribute('data-key');
      const member = state.teamDraft.members.find(m => m.id === memberId);
      if (member) {
        member[key] = e.target.value.trim();
      }
    });
  });

  // Attach residence toggle buttons for dynamic members
  container.querySelectorAll('.residence-pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const memberId = btn.getAttribute('data-member-id');
      const type = btn.getAttribute('data-type');
      const member = state.teamDraft.members.find(m => m.id === memberId);
      if (member) {
        member.residenceType = type;
        const card = document.getElementById(`member-card-${memberId}`);
        if (card) {
          const hostellerBtn = card.querySelector('.residence-pill-btn.hosteller');
          const dayscholarBtn = card.querySelector('.residence-pill-btn.dayscholar');
          const hostelSub = card.querySelector(`#hostel-subform-${memberId}`);
          const dayscholarSub = card.querySelector(`#dayscholar-subform-${memberId}`);
          const hiddenInput = card.querySelector(`input[data-key="residenceType"]`);

          if (hiddenInput) hiddenInput.value = type;

          if (type === 'HOSTELLER') {
            hostellerBtn?.classList.add('active');
            dayscholarBtn?.classList.remove('active');
            hostelSub?.classList.remove('hidden');
            dayscholarSub?.classList.add('hidden');
          } else {
            hostellerBtn?.classList.remove('active');
            dayscholarBtn?.classList.add('active');
            hostelSub?.classList.add('hidden');
            dayscholarSub?.classList.remove('hidden');
          }
        }
      }
    });
  });

  // Attach remove button listeners
  container.querySelectorAll('.btn-remove-member').forEach(btn => {
    btn.addEventListener('click', () => {
      const memberId = btn.getAttribute('data-member-id');
      removeMemberCard(memberId);
    });
  });

  updateMemberCounter();
}

function addMemberCard() {
  const totalCount = 1 + state.teamDraft.members.length;
  if (totalCount >= 5) {
    showToast('Maximum team size is 5 members (QUINTET).', 'warning');
    return;
  }

  const newId = `mem_${Date.now()}`;
  state.teamDraft.members.push({
    id: newId,
    fullName: '',
    regNumber: '',
    collegeEmail: '',
    phone: '',
    residenceType: 'HOSTELLER',
    hostelBlock: '',
    roomNo: '',
    hostelDetails: '',
    dayScholarType: 'LOCAL',
    dayScholarLocation: '',
    residenceAddress: '',
    commuteMode: ''
  });

  renderMembers();
  const newTotal = 1 + state.teamDraft.members.length;
  showToast(`Member ${newTotal} added (${getTierName(newTotal)} tier: ₹${calculateTeamFee(newTotal)}).`, 'info');
}

function removeMemberCard(memberId) {
  const totalCount = 1 + state.teamDraft.members.length;
  if (totalCount <= 2) {
    showToast('Minimum team size is 2 members (DUO). Cannot remove further.', 'warning');
    return;
  }

  state.teamDraft.members = state.teamDraft.members.filter(m => m.id !== memberId);
  renderMembers();
  const newTotal = 1 + state.teamDraft.members.length;
  showToast(`Member removed (${getTierName(newTotal)} tier: ₹${calculateTeamFee(newTotal)}).`, 'info');
}

function updateMemberCounter() {
  const totalMembers = 1 + state.teamDraft.members.length;
  const addBtn = document.getElementById('btn-add-member');
  const countBadge = document.getElementById('member-count-badge');
  const totalCountEl = document.getElementById('total-members-count');
  const addCountEl = document.getElementById('additional-members-count');
  const slotsRemainingEl = document.getElementById('slots-remaining');
  const ruleHintEl = document.getElementById('member-rule-hint');

  const slotsLeft = Math.max(0, 5 - totalMembers);
  const tierName = getTierName(totalMembers);
  const fee = calculateTeamFee(totalMembers);

  if (totalCountEl) totalCountEl.textContent = totalMembers;
  if (addCountEl) addCountEl.textContent = state.teamDraft.members.length;
  if (slotsRemainingEl) slotsRemainingEl.textContent = slotsLeft;

  if (totalMembers >= 2 && totalMembers <= 5) {
    countBadge?.classList.add('valid');
    if (ruleHintEl) {
      ruleHintEl.textContent = `✓ ${tierName} Tier (${totalMembers} members) • Fee: ₹${fee}`;
      ruleHintEl.classList.remove('invalid');
    }
  } else {
    countBadge?.classList.remove('valid');
    if (ruleHintEl) {
      ruleHintEl.textContent = 'Team size must be between 2 and 5 members';
      ruleHintEl.classList.add('invalid');
    }
  }

  if (addBtn) {
    addBtn.style.display = totalMembers >= 5 ? 'none' : 'inline-flex';
  }

  updateDynamicFeeUI();
}

function updateDynamicFeeUI() {
  const totalMembers = 1 + (state.teamDraft?.members?.length || 1);
  const fee = calculateTeamFee(totalMembers);
  const tierName = getTierName(totalMembers);
  const feeText = `₹${fee}`;

  const reviewFeeEl = document.getElementById('review-fee-amount');
  const reviewTierBadge = document.getElementById('review-tier-badge');
  const reviewFeeMembersText = document.getElementById('review-fee-members-text');
  const upiFeeEl = document.getElementById('upi-fee-text');
  const upiTierBadge = document.getElementById('upi-tier-badge');
  const upiAmountPill = document.getElementById('upi-amount-pill');
  const payAmountInput = document.getElementById('pay-amount');

  if (reviewFeeEl) reviewFeeEl.textContent = feeText;
  if (reviewTierBadge) reviewTierBadge.textContent = tierName;
  if (reviewFeeMembersText) reviewFeeMembersText.textContent = `${totalMembers} members`;
  if (upiFeeEl) upiFeeEl.textContent = feeText;
  if (upiTierBadge) upiTierBadge.textContent = `${tierName} Tier`;
  if (upiAmountPill) upiAmountPill.textContent = feeText;
  if (payAmountInput) payAmountInput.value = fee;
}

function handleStep2Next() {
  const totalMembers = 1 + state.teamDraft.members.length;
  if (totalMembers < 2 || totalMembers > 5) {
    showToast(`Team must have between 2 and 5 members. Current: ${totalMembers}.`, 'error');
    return;
  }

  // Validate all member inputs
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emails = new Set([state.teamDraft.leader.collegeEmail.toLowerCase()]);
  const regNos = new Set([state.teamDraft.leader.regNumber.toUpperCase()]);

  for (let i = 0; i < state.teamDraft.members.length; i++) {
    const m = state.teamDraft.members[i];
    const memberNum = i + 2;

    if (!m.fullName) {
      showToast(`Member ${memberNum}: Full Name is required.`, 'error');
      document.querySelector(`[data-id="${m.id}"][data-key="fullName"]`)?.focus();
      return;
    }
    if (!m.regNumber) {
      showToast(`Member ${memberNum}: Registration Number is required.`, 'error');
      document.querySelector(`[data-id="${m.id}"][data-key="regNumber"]`)?.focus();
      return;
    }
    if (!m.collegeEmail || !emailRegex.test(m.collegeEmail)) {
      showToast(`Member ${memberNum}: Valid college email is required.`, 'error');
      document.querySelector(`[data-id="${m.id}"][data-key="collegeEmail"]`)?.focus();
      return;
    }
    const cleanPhone = m.phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      showToast(`Member ${memberNum}: Valid 10-digit phone number is required.`, 'error');
      document.querySelector(`[data-id="${m.id}"][data-key="phone"]`)?.focus();
      return;
    }

    // Member Residence Validation
    if (m.residenceType === 'HOSTELLER') {
      if (!m.hostelBlock) {
        showToast(`Member ${memberNum}: Hostel Block is required.`, 'error');
        document.querySelector(`.member-card#member-card-${m.id} [data-key="hostelBlock"]`)?.focus();
        return;
      }
      if (!m.roomNo) {
        showToast(`Member ${memberNum}: Room Number is required.`, 'error');
        document.querySelector(`.member-card#member-card-${m.id} [data-key="roomNo"]`)?.focus();
        return;
      }
    } else {
      if (!m.dayScholarLocation) {
        showToast(`Member ${memberNum}: City / Area / Town is required.`, 'error');
        document.querySelector(`.member-card#member-card-${m.id} [data-key="dayScholarLocation"]`)?.focus();
        return;
      }
      if (!m.residenceAddress) {
        showToast(`Member ${memberNum}: Detailed Address or PG Name is required.`, 'error');
        document.querySelector(`.member-card#member-card-${m.id} [data-key="residenceAddress"]`)?.focus();
        return;
      }
    }

    const cleanEmail = m.collegeEmail.toLowerCase();
    const cleanReg = m.regNumber.toUpperCase();

    if (emails.has(cleanEmail)) {
      showToast(`Duplicate college email entered: ${m.collegeEmail}`, 'error');
      return;
    }
    if (regNos.has(cleanReg)) {
      showToast(`Duplicate registration number entered: ${m.regNumber}`, 'error');
      return;
    }

    emails.add(cleanEmail);
    regNos.add(cleanReg);
  }

  populateReviewStep();
  goToStep(3);
}

/**
 * Syncs teamDraft state from the DOM inputs and updates Step 2 leader preview
 */
function syncDraftFromDOM() {
  if (!state.teamDraft) return;

  // Step 1 Team & Leader sync
  const teamNameInput = document.getElementById('team-name');
  if (teamNameInput && teamNameInput.value.trim()) {
    state.teamDraft.teamName = teamNameInput.value.trim();
  }
  const refInput = document.getElementById('referral');
  if (refInput) {
    state.teamDraft.referral = refInput.value.trim();
  }

  if (!state.teamDraft.leader) {
    state.teamDraft.leader = { fullName: '', regNumber: '', collegeEmail: '', phone: '' };
  }
  const lNameInput = document.getElementById('leader-name');
  const lRegInput = document.getElementById('leader-reg');
  const lEmailInput = document.getElementById('leader-email');
  const lPhoneInput = document.getElementById('leader-phone');
  if (lNameInput && lNameInput.value.trim()) state.teamDraft.leader.fullName = lNameInput.value.trim();
  if (lRegInput && lRegInput.value.trim()) state.teamDraft.leader.regNumber = lRegInput.value.trim().toUpperCase();
  if (lEmailInput && lEmailInput.value.trim()) state.teamDraft.leader.collegeEmail = lEmailInput.value.trim();
  if (lPhoneInput && lPhoneInput.value.trim()) state.teamDraft.leader.phone = lPhoneInput.value.trim();

  const lResType = document.getElementById('leader-residence-type');
  const lHostelBlock = document.getElementById('leader-hostel-block');
  const lRoomNo = document.getElementById('leader-room-no');
  const lHostelDetails = document.getElementById('leader-hostel-details');
  const lDayType = document.getElementById('leader-dayscholar-type');
  const lDayLoc = document.getElementById('leader-dayscholar-location');
  const lAddress = document.getElementById('leader-residence-address');
  const lCommute = document.getElementById('leader-commute-mode');

  if (lResType) state.teamDraft.leader.residenceType = lResType.value;
  if (lHostelBlock) state.teamDraft.leader.hostelBlock = lHostelBlock.value;
  if (lRoomNo) state.teamDraft.leader.roomNo = lRoomNo.value.trim();
  if (lHostelDetails) state.teamDraft.leader.hostelDetails = lHostelDetails.value.trim();
  if (lDayType) state.teamDraft.leader.dayScholarType = lDayType.value;
  if (lDayLoc) state.teamDraft.leader.dayScholarLocation = lDayLoc.value.trim();
  if (lAddress) state.teamDraft.leader.residenceAddress = lAddress.value.trim();
  if (lCommute) state.teamDraft.leader.commuteMode = lCommute.value.trim();

  // Step 2 Members sync
  const container = document.getElementById('dynamic-members-container');
  if (container) {
    container.querySelectorAll('.member-card').forEach(card => {
      const id = card.id ? card.id.replace('member-card-', '').replace('card-', '') : '';
      const mem = state.teamDraft.members.find(m => m.id === id);
      if (mem) {
        const nameInput = card.querySelector('[data-key="fullName"]');
        const regInput = card.querySelector('[data-key="regNumber"]');
        const emailInput = card.querySelector('[data-key="collegeEmail"]');
        const phoneInput = card.querySelector('[data-key="phone"]');
        const resTypeInput = card.querySelector('[data-key="residenceType"]');
        const blockInput = card.querySelector('[data-key="hostelBlock"]');
        const roomInput = card.querySelector('[data-key="roomNo"]');
        const detailsInput = card.querySelector('[data-key="hostelDetails"]');
        const dayTypeInput = card.querySelector('[data-key="dayScholarType"]');
        const dayLocInput = card.querySelector('[data-key="dayScholarLocation"]');
        const addrInput = card.querySelector('[data-key="residenceAddress"]');
        const commuteInput = card.querySelector('[data-key="commuteMode"]');

        if (nameInput && nameInput.value.trim()) mem.fullName = nameInput.value.trim();
        if (regInput && regInput.value.trim()) mem.regNumber = regInput.value.trim().toUpperCase();
        if (emailInput && emailInput.value.trim()) mem.collegeEmail = emailInput.value.trim();
        if (phoneInput && phoneInput.value.trim()) mem.phone = phoneInput.value.trim();
        if (resTypeInput) mem.residenceType = resTypeInput.value;
        if (blockInput) mem.hostelBlock = blockInput.value;
        if (roomInput) mem.roomNo = roomInput.value.trim();
        if (detailsInput) mem.hostelDetails = detailsInput.value.trim();
        if (dayTypeInput) mem.dayScholarType = dayTypeInput.value;
        if (dayLocInput) mem.dayScholarLocation = dayLocInput.value.trim();
        if (addrInput) mem.residenceAddress = addrInput.value.trim();
        if (commuteInput) mem.commuteMode = commuteInput.value.trim();
      }
    });
  }

  // Update Leader Preview in Step 2
  const leader = state.teamDraft.leader;
  if (leader) {
    const pName = document.getElementById('leader-preview-name');
    const pReg = document.getElementById('leader-preview-reg');
    const pEmail = document.getElementById('leader-preview-email');
    const pPhone = document.getElementById('leader-preview-phone');
    const pRes = document.getElementById('leader-preview-residence');
    if (pName && leader.fullName) pName.textContent = leader.fullName;
    if (pReg && leader.regNumber) pReg.textContent = `Reg: ${leader.regNumber}`;
    if (pEmail && leader.collegeEmail) pEmail.textContent = `Email: ${leader.collegeEmail}`;
    if (pPhone && leader.phone) pPhone.textContent = `Phone: ${leader.phone}`;
    if (pRes) {
      if (leader.residenceType === 'HOSTELLER') {
        pRes.textContent = `Residence: Hosteller (${leader.hostelBlock || 'Hostel'} - Rm ${leader.roomNo || '-'})`;
      } else {
        pRes.textContent = `Residence: Day Scholar (${leader.dayScholarType === 'LOCAL' ? 'Local' : 'PG'} - ${leader.dayScholarLocation || '-'})`;
      }
    }
  }
}

/**
 * Format residence information as a styled badge and details snippet
 */
function formatResidenceSummary(m) {
  if (!m) return '-';
  const isHostel = (m.residenceType || m.residence_type) === 'HOSTELLER';
  if (isHostel) {
    const block = m.hostelBlock || m.hostel_block || 'Hostel';
    const room = (m.roomNo || m.room_no) ? `Rm ${m.roomNo || m.room_no}` : '';
    return `<span class="badge-residence badge-hostel">🏢 Hosteller</span><div style="font-size:0.8rem; margin-top:3px; color:var(--text-muted);">${escapeHtml(block)} ${escapeHtml(room)}</div>`;
  } else {
    const type = (m.dayScholarType || m.day_scholar_type) === 'NON_LOCAL' ? 'Non-Local (PG)' : 'Local Commuter';
    const loc = m.dayScholarLocation || m.day_scholar_location || '';
    const addr = (m.residenceAddress || m.residence_address) ? `<div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(m.residenceAddress || m.residence_address)}</div>` : '';
    return `<span class="badge-residence badge-dayscholar">🚌 Day Scholar</span><div style="font-size:0.8rem; margin-top:3px; color:var(--text-muted);">${escapeHtml(type)} • ${escapeHtml(loc)}</div>${addr}`;
  }
}

/**
 * Step 3: Populate Review Summary
 */
function populateReviewStep() {
  syncDraftFromDOM();

  const teamNameEl = document.getElementById('review-team-name');
  if (teamNameEl) teamNameEl.textContent = state.teamDraft.teamName || '-';

  const referralEl = document.getElementById('review-team-referral');
  if (referralEl) referralEl.textContent = state.teamDraft.referral || 'None';

  const trackEl = document.getElementById('review-team-track');
  if (trackEl) trackEl.textContent = state.teamDraft.track || 'To be selected post-Vibecoding round';

  const totalMembers = 1 + state.teamDraft.members.length;
  const rosterCountEl = document.getElementById('review-roster-count');
  if (rosterCountEl) rosterCountEl.textContent = totalMembers;

  const tbody = document.getElementById('review-roster-tbody');
  if (tbody) {
    const leader = state.teamDraft.leader || {};
    const allMembers = [
      {
        role: '👑 Team Leader',
        fullName: leader.fullName || '-',
        regNumber: leader.regNumber || '-',
        collegeEmail: leader.collegeEmail || '-',
        phone: leader.phone || '-',
        residenceType: leader.residenceType,
        hostelBlock: leader.hostelBlock,
        roomNo: leader.roomNo,
        hostelDetails: leader.hostelDetails,
        dayScholarType: leader.dayScholarType,
        dayScholarLocation: leader.dayScholarLocation,
        residenceAddress: leader.residenceAddress,
        commuteMode: leader.commuteMode
      },
      ...state.teamDraft.members.map((m, idx) => ({
        role: `Member ${idx + 2}`,
        fullName: m.fullName || '-',
        regNumber: m.regNumber || '-',
        collegeEmail: m.collegeEmail || '-',
        phone: m.phone || '-',
        residenceType: m.residenceType,
        hostelBlock: m.hostelBlock,
        roomNo: m.roomNo,
        hostelDetails: m.hostelDetails,
        dayScholarType: m.dayScholarType,
        dayScholarLocation: m.dayScholarLocation,
        residenceAddress: m.residenceAddress,
        commuteMode: m.commuteMode
      }))
    ];

    tbody.innerHTML = allMembers.map(m => `
      <tr>
        <td><strong>${m.role}</strong></td>
        <td>${escapeHtml(m.fullName)}</td>
        <td class="monospace">${escapeHtml(m.regNumber)}</td>
        <td>${escapeHtml(m.collegeEmail)}</td>
        <td class="monospace">${escapeHtml(m.phone)}</td>
        <td>${formatResidenceSummary(m)}</td>
      </tr>
    `).join('');
  }

  // Update dynamic fees
  updateDynamicFeeUI();

  // Reset confirmation checkbox
  const chk = document.getElementById('review-confirm-checkbox');
  const btn = document.getElementById('btn-confirm-and-pay');
  if (chk) chk.checked = false;
  if (btn) btn.disabled = true;
}

/**
 * Step 4: Submit Team Details to Backend & Reserve Registration ID
 */
async function handleConfirmAndProceedToPayment() {
  const btn = document.getElementById('btn-confirm-and-pay');
  btn.disabled = true;
  btn.innerHTML = `<span class="qr-spinner">Reserving Registration...</span>`;

  try {
    syncDraftFromDOM();

    // If team is already registered / reserved in DB (resumed session)
    const existingRegId = state.registeredTeam?.registrationId || state.registeredTeam?.registration_id;
    if (existingRegId) {
      // Save any updated details via /api/team/update
      try {
        await fetch('/api/team/update', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            registrationId: existingRegId,
            teamName: state.teamDraft.teamName,
            track: state.teamDraft.track,
            projectTitle: state.teamDraft.projectTitle,
            referral: state.teamDraft.referral || '',
            members: [
              {
                fullName: state.teamDraft.leader.fullName,
                regNumber: state.teamDraft.leader.regNumber,
                collegeEmail: state.teamDraft.leader.collegeEmail,
                phone: state.teamDraft.leader.phone,
                residenceType: state.teamDraft.leader.residenceType || 'HOSTELLER',
                hostelBlock: state.teamDraft.leader.hostelBlock || '',
                roomNo: state.teamDraft.leader.roomNo || '',
                dayScholarType: state.teamDraft.leader.dayScholarType || 'LOCAL',
                dayScholarLocation: state.teamDraft.leader.dayScholarLocation || '',
                residenceAddress: state.teamDraft.leader.residenceAddress || '',
                isLeader: true
              },
              ...state.teamDraft.members.map(m => ({
                fullName: m.fullName,
                regNumber: m.regNumber,
                collegeEmail: m.collegeEmail,
                phone: m.phone,
                residenceType: m.residenceType || 'HOSTELLER',
                hostelBlock: m.hostelBlock || '',
                roomNo: m.roomNo || '',
                dayScholarType: m.dayScholarType || 'LOCAL',
                dayScholarLocation: m.dayScholarLocation || '',
                residenceAddress: m.residenceAddress || '',
                isLeader: false
              }))
            ]
          })
        });
      } catch (updateErr) {
        console.warn('Could not auto-update team details, continuing to payment:', updateErr);
      }

      const regIdDisplay = document.getElementById('payment-reg-id-display');
      if (regIdDisplay) regIdDisplay.textContent = existingRegId;

      const remarkHint = document.getElementById('upi-team-remark-hint');
      if (remarkHint) remarkHint.textContent = `${state.teamDraft.teamName} (${existingRegId})`;

      updateDynamicFeeUI();
      goToStep(4);
      btn.disabled = false;
      btn.innerHTML = `Proceed to Payment <span class="btn-arrow">→</span>`;
      return;
    }

    const verificationToken = state.verificationToken 
      || sessionStorage.getItem('codeverse_verification_token') 
      || localStorage.getItem('codeverse_verification_token') 
      || 'vtok_client_verified';

    const payload = {
      teamName: state.teamDraft.teamName,
      track: state.teamDraft.track,
      projectTitle: state.teamDraft.projectTitle,
      referral: state.teamDraft.referral || '',
      verificationToken,
      members: [
        {
          fullName: state.teamDraft.leader.fullName,
          regNumber: state.teamDraft.leader.regNumber,
          collegeEmail: state.teamDraft.leader.collegeEmail,
          phone: state.teamDraft.leader.phone,
          residenceType: state.teamDraft.leader.residenceType || 'HOSTELLER',
          hostelBlock: state.teamDraft.leader.hostelBlock || '',
          roomNo: state.teamDraft.leader.roomNo || '',
          dayScholarType: state.teamDraft.leader.dayScholarType || 'LOCAL',
          dayScholarLocation: state.teamDraft.leader.dayScholarLocation || '',
          residenceAddress: state.teamDraft.leader.residenceAddress || '',
          isLeader: true
        },
        ...state.teamDraft.members.map(m => ({
          fullName: m.fullName,
          regNumber: m.regNumber,
          collegeEmail: m.collegeEmail,
          phone: m.phone,
          residenceType: m.residenceType || 'HOSTELLER',
          hostelBlock: m.hostelBlock || '',
          roomNo: m.roomNo || '',
          dayScholarType: m.dayScholarType || 'LOCAL',
          dayScholarLocation: m.dayScholarLocation || '',
          residenceAddress: m.residenceAddress || '',
          isLeader: false
        }))
      ]
    };

    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Registration failed');
    }

    state.registeredTeam = data.team;
    if (data.teamAuthToken) {
      state.teamAuthToken = data.teamAuthToken;
      try {
        sessionStorage.setItem('codeverse_team_auth_token', data.teamAuthToken);
      } catch (e) {}
    }
    const regId = data.team.registrationId || data.team.registration_id;

    // Save pending registration in localStorage so user can resume anytime
    try {
      localStorage.setItem('codeverse_pending_registration', JSON.stringify({
        registrationId: regId,
        teamName: state.teamDraft.teamName,
        leaderEmail: state.teamDraft.leader.collegeEmail,
        memberCount: 1 + state.teamDraft.members.length,
        timestamp: Date.now()
      }));
      showPendingBanner(state.teamDraft.teamName, regId);
    } catch (e) {
      console.warn('Could not save pending registration to localStorage:', e);
    }

    // Display Registration ID in Step 4
    const regIdDisplay = document.getElementById('payment-reg-id-display');
    if (regIdDisplay) regIdDisplay.textContent = regId;

    const remarkHint = document.getElementById('upi-team-remark-hint');
    if (remarkHint) remarkHint.textContent = `${state.teamDraft.teamName} (${regId})`;

    showToast(`Team draft saved! Registration ID: ${regId}`, 'success');
    goToStep(4);
  } catch (err) {
    showToast(err.message, 'error');
    if (err.message && err.message.includes('Email verification required')) {
      setTimeout(() => {
        goToStep(1);
        const emailInput = document.getElementById('leader-email');
        if (emailInput) {
          emailInput.readOnly = false;
          emailInput.style.backgroundColor = '';
          emailInput.style.borderColor = '';
        }
        const sendBtn = document.getElementById('btn-send-otp');
        if (sendBtn) {
          sendBtn.style.display = '';
          sendBtn.disabled = false;
          sendBtn.textContent = 'Send OTP';
        }
        const otpSection = document.getElementById('otp-section');
        if (otpSection) otpSection.style.display = 'block';
      }, 1500);
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = `Proceed to Payment <span class="btn-arrow">→</span>`;
  }
}

/**
 * Step 5: File Upload Dropzone Configuration
 */
function setupDropzone() {
  const dropzone = document.getElementById('file-dropzone');
  const fileInput = document.getElementById('proof-file-input');
  const emptyState = document.getElementById('dropzone-empty-state');
  const previewState = document.getElementById('dropzone-preview-state');
  const previewImage = document.getElementById('preview-image');
  const previewDocIcon = document.getElementById('preview-doc-icon');
  const previewFilename = document.getElementById('preview-filename');
  const previewFilesize = document.getElementById('preview-filesize');
  const removeBtn = document.getElementById('btn-remove-file');

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', (e) => {
    if (e.target !== removeBtn) fileInput.click();
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelected(files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  });

  removeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    state.proofFile = null;
    fileInput.value = '';
    emptyState.classList.remove('hidden');
    previewState.classList.add('hidden');
  });

  function handleFileSelected(file) {
    if (file.size > 10 * 1024 * 1024) {
      showToast('File size exceeds 10MB limit.', 'error');
      return;
    }

    state.proofFile = file;
    previewFilename.textContent = file.name;
    previewFilesize.textContent = formatBytes(file.size);

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        previewImage.src = e.target.result;
        previewImage.classList.remove('hidden');
        previewDocIcon.classList.add('hidden');
      };
      reader.readAsDataURL(file);
    } else {
      previewImage.classList.add('hidden');
      previewDocIcon.classList.remove('hidden');
    }

    emptyState.classList.add('hidden');
    previewState.classList.remove('hidden');
    showToast('Payment proof attached successfully!', 'success');
  }
}

/**
 * Step 5: Submit Final Payment & Transaction Details
 */
async function handlePaymentSubmit(e) {
  e.preventDefault();

  const regId = state.registeredTeam?.registrationId || state.registeredTeam?.registration_id;
  if (!regId) {
    showToast('Registration session lost. Please restart from Step 1.', 'error');
    goToStep(1);
    return;
  }

  const paymentMethod = document.getElementById('pay-method-select').value;
  const utrNumber = document.getElementById('pay-utr').value.trim();
  const transactionDate = document.getElementById('pay-date').value;
  const amountPaid = document.getElementById('pay-amount').value;

  if (!utrNumber || utrNumber.length < 6) {
    showToast('Please enter a valid Transaction / UTR reference (at least 6 characters).', 'error');
    document.getElementById('pay-utr').focus();
    return;
  }

  if (!state.proofFile) {
    showToast('Payment screenshot / receipt proof is mandatory. Please upload your payment receipt.', 'error');
    document.getElementById('file-dropzone')?.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  const submitBtn = document.getElementById('btn-final-submit');
  submitBtn.disabled = true;
  submitBtn.innerHTML = `Submitting Transaction...`;

  try {
    const formData = new FormData();
    formData.append('registrationId', regId);
    formData.append('paymentMethod', paymentMethod);
    formData.append('utrNumber', utrNumber);
    formData.append('transactionDate', transactionDate);
    formData.append('amountPaid', amountPaid);

    const teamAuthToken = state.teamAuthToken || sessionStorage.getItem('codeverse_team_auth_token');
    if (teamAuthToken) {
      formData.append('teamAuthToken', teamAuthToken);
    }
    const leaderEmail = state.registeredTeam?.leader?.collegeEmail || state.teamDraft?.leader?.collegeEmail;
    if (leaderEmail) {
      formData.append('leaderEmail', leaderEmail);
    }

    if (state.proofFile) {
      formData.append('proofFile', state.proofFile);
    }

    const res = await fetch('/api/payment/submit', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Payment submission failed.');
    }

    state.registeredTeam = data.team;
    populateReceipt(data.team, {
      paymentMethod,
      utrNumber,
      amountPaid
    });

    goToStep(6);
    sessionStorage.removeItem('codeverse_reg_state');
    try {
      localStorage.removeItem('codeverse_pending_registration');
      hidePendingBanner();
    } catch (e) {}
    showToast('Registration submitted successfully! Pending verification.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `Submit Registration & Payment <span class="btn-arrow">✓</span>`;
  }
}

/**
 * Step 6: Confirmation Receipt Population
 */
function populateReceipt(team, paymentInfo) {
  const regId = team.registration_id || team.registrationId;
  document.getElementById('receipt-reg-id').textContent = regId;
  document.getElementById('receipt-team-name').textContent = team.team_name || team.teamName;
  document.getElementById('receipt-track').textContent = team.track;
  document.getElementById('receipt-leader-name').textContent = team.leader?.full_name || team.leader?.fullName || '-';
  document.getElementById('receipt-member-count').textContent = `${team.member_count || team.memberCount} Members`;
  document.getElementById('receipt-pay-method').textContent = paymentInfo.paymentMethod;
  document.getElementById('receipt-utr').textContent = paymentInfo.utrNumber;
  document.getElementById('receipt-amount').textContent = `₹${paymentInfo.amountPaid}`;
  document.getElementById('receipt-date').textContent = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  const statusBadge = document.getElementById('receipt-status-badge');
  if (statusBadge) {
    statusBadge.textContent = 'Payment Pending / Verification Pending';
    statusBadge.className = 'status-value status-pending';
  }

  // Populate Printable Receipt
  const printRegId = document.getElementById('print-reg-id');
  if (printRegId) {
    printRegId.textContent = regId;
    document.getElementById('print-team-name').textContent = team.team_name || team.teamName;
    document.getElementById('print-date').textContent = new Date().toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    const tbody = document.getElementById('print-members-tbody');
    if (tbody && team.members) {
      tbody.innerHTML = '';
      team.members.forEach(member => {
        const isLeader = member.is_leader || member.isLeader;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${isLeader ? '<strong>Leader</strong>' : 'Member'}</td>
          <td>${member.full_name || member.fullName}</td>
          <td style="font-family: monospace;">${member.reg_number || member.regNumber}</td>
          <td>${formatResidenceSummary(member)}</td>
        `;
        tbody.appendChild(tr);
      });
    }
  }
}

/**
 * Step Navigation Wizard
 */
function goToStep(stepNumber) {
  state.currentStep = stepNumber;
  setTimeout(saveSessionState, 10);

  if (stepNumber === 2) {
    syncDraftFromDOM();
  } else if (stepNumber === 3) {
    populateReviewStep();
  }

  // Update Wizard Steps Visibility
  document.querySelectorAll('.wizard-step').forEach(step => {
    step.classList.remove('active');
  });
  document.getElementById(`step-${stepNumber}`)?.classList.add('active');

  // Update Stepper List
  const stepperItems = document.querySelectorAll('.step-item');
  const stepperLines = document.querySelectorAll('.step-line');

  stepperItems.forEach(item => {
    const itemStep = parseInt(item.getAttribute('data-step'), 10);
    item.classList.remove('active', 'completed');

    if (itemStep === stepNumber) {
      item.classList.add('active');
    } else if (itemStep < stepNumber) {
      item.classList.add('completed');
    }
  });

  stepperLines.forEach((line, index) => {
    line.classList.toggle('completed', index < stepNumber - 1);
  });

  // Scroll smoothly to wizard step
  const targetEl = document.getElementById(`step-${stepNumber}`) || document.getElementById('register-wizard-container') || document.getElementById('register');
  targetEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Status Tracker Modal Logic
 */
function openTrackModal(prefillRegId = '') {
  const modal = document.getElementById('track-modal');
  const input = document.getElementById('track-search-input');
  const resultContainer = document.getElementById('track-result-container');

  if (modal) modal.classList.remove('hidden');
  if (input) {
    if (prefillRegId) {
      input.value = prefillRegId;
      handleTrackLookup();
    } else {
      input.value = '';
      input.focus();
    }
  }
  if (resultContainer) resultContainer.classList.add('hidden');
}

function closeTrackModal() {
  document.getElementById('track-modal')?.classList.add('hidden');
}

async function handleTrackLookup() {
  const input = document.getElementById('track-search-input');
  const resultContainer = document.getElementById('track-result-container');
  const regId = input?.value.trim().toUpperCase();

  if (!regId) {
    showToast('Please enter a Registration ID', 'warning');
    return;
  }

  resultContainer.innerHTML = `<p class="text-center text-muted">Checking status for ${escapeHtml(regId)}...</p>`;
  resultContainer.classList.remove('hidden');

  try {
    const res = await fetch(`/api/registration/${encodeURIComponent(regId)}`);
    const data = await res.json();

    if (!res.ok || !data.success) {
      resultContainer.innerHTML = `
        <div class="info-alert" style="border-color: var(--danger);">
          ❌ <strong>Not Found:</strong> No team found with Registration ID <strong>${escapeHtml(regId)}</strong>. Please verify the ID and try again.
        </div>
      `;
      return;
    }

    const team = data.team;
    const payment = team.payment;
    let badgeClass = 'status-pending';
    let statusText = 'Pending Verification';

    if (team.status === 'VERIFIED') {
      badgeClass = 'status-verified';
      statusText = 'Verified & Confirmed';
    } else if (team.status === 'REJECTED') {
      badgeClass = 'status-rejected';
      statusText = 'Rejected / Needs Attention';
    } else if (team.status === 'PENDING_PAYMENT') {
      badgeClass = 'status-pending';
      statusText = 'Payment Not Submitted';
    }

    resultContainer.innerHTML = `
      <div style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.75rem; margin-bottom: 0.75rem;">
        <h4 style="color:#fff; font-size: 1.15rem;">${escapeHtml(team.teamName)}</h4>
        <span class="badge-track" style="margin-top: 0.35rem;">${escapeHtml(team.track)}</span>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <span class="meta-label">Status:</span>
        <span class="status-value ${badgeClass}">${statusText}</span>
      </div>

      <div style="font-size: 0.88rem; color: var(--text-muted); line-height: 1.6;">
        <div><strong>Team Leader:</strong> ${escapeHtml(team.leader?.fullName || '-')} (${escapeHtml(team.leader?.collegeEmail || '-')})</div>
        <div><strong>Team Size:</strong> ${team.memberCount} Members</div>
        ${payment ? `
          <div><strong>Payment Method:</strong> ${escapeHtml(payment.paymentMethod)}</div>
          <div><strong>UTR:</strong> <code class="monospace">${escapeHtml(payment.utrNumber)}</code></div>
          ${payment.adminNotes ? `<div style="margin-top: 0.5rem; color: var(--warning);"><strong>Admin Note:</strong> ${escapeHtml(payment.adminNotes)}</div>` : ''}
        ` : `
          <div style="color: var(--warning); margin-top: 0.5rem;">Payment proof has not been submitted yet.</div>
        `}
      </div>

      <div style="margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid var(--border-subtle); display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap;">
        ${team.status === 'PENDING_PAYMENT' ? `
          <button type="button" class="btn btn-primary btn-sm" id="btn-track-resume-pay">
            ⚡ Complete Payment Now
          </button>
        ` : ''}
        <button type="button" class="btn btn-outline btn-sm" id="btn-track-jump-edit" style="gap: 0.4rem;">
          ✏️ Edit Team / Member Details
        </button>
      </div>
    `;

    document.getElementById('btn-track-resume-pay')?.addEventListener('click', () => {
      closeTrackModal();
      handleResumeRegistration(team.registrationId);
    });

    document.getElementById('btn-track-jump-edit')?.addEventListener('click', () => {
      closeTrackModal();
      openEditModal(team.registrationId);
    });
  } catch (err) {
    resultContainer.innerHTML = `
      <div class="info-alert" style="border-color: var(--danger);">
        Error retrieving registration: ${escapeHtml(err.message)}
      </div>
    `;
  }
}

/**
 * =========================================================================
 * Resume Registration & Pay Later Logic
 * =========================================================================
 */

function openResumeModal() {
  const modal = document.getElementById('resume-modal');
  const input = document.getElementById('resume-search-input');
  const errorMsg = document.getElementById('resume-error-msg');
  if (modal) modal.classList.remove('hidden');
  if (errorMsg) errorMsg.style.display = 'none';
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 50);
  }
}

function closeResumeModal() {
  document.getElementById('resume-modal')?.classList.add('hidden');
}

function closePayLaterModal() {
  document.getElementById('pay-later-modal')?.classList.add('hidden');
}

function showPendingBanner(teamName, regId) {
  const banner = document.getElementById('pending-reg-banner');
  const teamEl = document.getElementById('pending-banner-team-name');
  const regIdEl = document.getElementById('pending-banner-reg-id');
  if (teamEl) teamEl.textContent = teamName;
  if (regIdEl) regIdEl.textContent = regId;
  if (banner) banner.style.display = 'block';
}

function hidePendingBanner() {
  const banner = document.getElementById('pending-reg-banner');
  if (banner) banner.style.display = 'none';
}

async function checkPendingRegistrationBanner() {
  try {
    const raw = localStorage.getItem('codeverse_pending_registration');
    if (!raw) return;
    const pending = JSON.parse(raw);
    if (!pending || !pending.registrationId) return;

    // Check with backend if still pending payment
    const res = await fetch(`/api/registration/resume/${encodeURIComponent(pending.registrationId)}`);
    const data = await res.json();
    if (data.success && data.team && data.team.status === 'PENDING_PAYMENT') {
      showPendingBanner(data.team.teamName, data.team.registrationId);
    } else {
      // Payment was already made or team not found
      localStorage.removeItem('codeverse_pending_registration');
      hidePendingBanner();
    }
  } catch (err) {
    console.warn('Error checking pending banner:', err);
  }
}

async function handleResumeRegistration(identifier) {
  if (!identifier || !identifier.trim()) return;
  const cleanId = identifier.trim();

  const resumeBtn = document.getElementById('btn-lookup-resume');
  const errorMsg = document.getElementById('resume-error-msg');
  if (resumeBtn) {
    resumeBtn.disabled = true;
    resumeBtn.textContent = 'Finding...';
  }
  if (errorMsg) errorMsg.style.display = 'none';

  try {
    const res = await fetch(`/api/registration/resume/${encodeURIComponent(cleanId)}`);
    const data = await res.json();

    if (!res.ok || !data.success) {
      if (data.alreadyPaid) {
        showToast(data.error || 'Payment already submitted for this team.', 'info');
        openTrackModal(cleanId);
        closeResumeModal();
        return;
      }
      throw new Error(data.error || 'No pending registration found for this ID or Email.');
    }

    const team = data.team;
    state.registeredTeam = team;

    // Populate team draft
    state.teamDraft.teamName = team.teamName;
    state.teamDraft.track = team.track || 'To be decided (Post-Vibecoding)';
    state.teamDraft.projectTitle = team.projectTitle || '';
    state.teamDraft.referral = team.referral || '';

    const leader = team.leader || (team.members && team.members.find(m => m.isLeader)) || (team.members && team.members[0]);
    if (leader) {
      state.teamDraft.leader = {
        fullName: leader.fullName,
        regNumber: leader.regNumber,
        collegeEmail: leader.collegeEmail,
        phone: leader.phone,
        residenceType: leader.residenceType || leader.residence_type || 'HOSTELLER',
        hostelBlock: leader.hostelBlock || leader.hostel_block || '',
        roomNo: leader.roomNo || leader.room_no || '',
        hostelDetails: leader.hostelDetails || leader.hostel_details || '',
        dayScholarType: leader.dayScholarType || leader.day_scholar_type || 'LOCAL',
        dayScholarLocation: leader.dayScholarLocation || leader.day_scholar_location || '',
        residenceAddress: leader.residenceAddress || leader.residence_address || '',
        commuteMode: leader.commuteMode || leader.commute_mode || ''
      };

      // Also set form values in Step 1
      const lNameInput = document.getElementById('leader-name');
      const lRegInput = document.getElementById('leader-reg');
      const lEmailInput = document.getElementById('leader-email');
      const lPhoneInput = document.getElementById('leader-phone');
      const tNameInput = document.getElementById('team-name');
      const refInput = document.getElementById('referral');
      if (lNameInput) lNameInput.value = leader.fullName;
      if (lRegInput) lRegInput.value = leader.regNumber;
      if (lEmailInput) {
        lEmailInput.value = leader.collegeEmail;
        lEmailInput.readOnly = true;
      }
      if (lPhoneInput) lPhoneInput.value = leader.phone;
      if (tNameInput) tNameInput.value = team.teamName;
      if (refInput) refInput.value = team.referral || '';

      // Residence inputs
      const lResType = document.getElementById('leader-residence-type');
      const lBlock = document.getElementById('leader-hostel-block');
      const lRoom = document.getElementById('leader-room-no');
      const lDetails = document.getElementById('leader-hostel-details');
      const lDayType = document.getElementById('leader-dayscholar-type');
      const lDayLoc = document.getElementById('leader-dayscholar-location');
      const lAddress = document.getElementById('leader-residence-address');
      const lCommute = document.getElementById('leader-commute-mode');

      if (lResType) lResType.value = state.teamDraft.leader.residenceType;
      if (lBlock) lBlock.value = state.teamDraft.leader.hostelBlock;
      if (lRoom) lRoom.value = state.teamDraft.leader.roomNo;
      if (lDetails) lDetails.value = state.teamDraft.leader.hostelDetails;
      if (lDayType) lDayType.value = state.teamDraft.leader.dayScholarType;
      if (lDayLoc) lDayLoc.value = state.teamDraft.leader.dayScholarLocation;
      if (lAddress) lAddress.value = state.teamDraft.leader.residenceAddress;
      if (lCommute) lCommute.value = state.teamDraft.leader.commuteMode;

      const btnHosteller = document.getElementById('btn-leader-res-hosteller');
      const btnDay = document.getElementById('btn-leader-res-dayscholar');
      const boxHostel = document.getElementById('leader-hostel-container');
      const boxDay = document.getElementById('leader-dayscholar-container');
      if (state.teamDraft.leader.residenceType === 'HOSTELLER') {
        btnHosteller?.classList.add('active');
        btnDay?.classList.remove('active');
        boxHostel?.classList.remove('hidden');
        boxDay?.classList.add('hidden');
      } else {
        btnHosteller?.classList.remove('active');
        btnDay?.classList.add('active');
        boxHostel?.classList.add('hidden');
        boxDay?.classList.remove('hidden');
      }

      // Update Leader Preview in Step 2
      const pName = document.getElementById('leader-preview-name');
      const pReg = document.getElementById('leader-preview-reg');
      const pEmail = document.getElementById('leader-preview-email');
      const pPhone = document.getElementById('leader-preview-phone');
      const pRes = document.getElementById('leader-preview-residence');
      if (pName) pName.textContent = leader.fullName;
      if (pReg) pReg.textContent = `Reg: ${leader.regNumber}`;
      if (pEmail) pEmail.textContent = `Email: ${leader.collegeEmail}`;
      if (pPhone) pPhone.textContent = `Phone: ${leader.phone}`;
      if (pRes) {
        if (state.teamDraft.leader.residenceType === 'HOSTELLER') {
          pRes.textContent = `Residence: Hosteller (${state.teamDraft.leader.hostelBlock || 'Hostel'} - Rm ${state.teamDraft.leader.roomNo || '-'})`;
        } else {
          pRes.textContent = `Residence: Day Scholar (${state.teamDraft.leader.dayScholarType === 'LOCAL' ? 'Local' : 'PG'} - ${state.teamDraft.leader.dayScholarLocation || '-'})`;
        }
      }
    }

    const otherMembers = (team.members || []).filter(m => !m.isLeader);
    state.teamDraft.members = otherMembers.map((m, idx) => ({
      id: `mem_${idx + 1}`,
      fullName: m.fullName,
      regNumber: m.regNumber,
      collegeEmail: m.collegeEmail,
      phone: m.phone,
      residenceType: m.residenceType || m.residence_type || 'HOSTELLER',
      hostelBlock: m.hostelBlock || m.hostel_block || '',
      roomNo: m.roomNo || m.room_no || '',
      hostelDetails: m.hostelDetails || m.hostel_details || '',
      dayScholarType: m.dayScholarType || m.day_scholar_type || 'LOCAL',
      dayScholarLocation: m.dayScholarLocation || m.day_scholar_location || '',
      residenceAddress: m.residenceAddress || m.residence_address || '',
      commuteMode: m.commuteMode || m.commute_mode || ''
    }));

    renderMembers();
    updateMemberCounter();
    populateReviewStep();

    // Save to local storage for persistent resume
    try {
      localStorage.setItem('codeverse_pending_registration', JSON.stringify({
        registrationId: team.registrationId,
        teamName: team.teamName,
        leaderEmail: leader ? leader.collegeEmail : '',
        memberCount: team.memberCount || team.members.length,
        timestamp: Date.now()
      }));
    } catch (e) {}

    showPendingBanner(team.teamName, team.registrationId);

    // Update Step 4 displays
    const regIdDisplay = document.getElementById('payment-reg-id-display');
    if (regIdDisplay) regIdDisplay.textContent = team.registrationId;

    const remarkHint = document.getElementById('upi-team-remark-hint');
    if (remarkHint) remarkHint.textContent = `${team.teamName} (${team.registrationId})`;

    updateDynamicFeeUI();

    // Bypass instructions gate & show wizard container
    const instructionsGate = document.getElementById('instructions-gate');
    const registerWizard = document.getElementById('register-wizard-container');
    if (instructionsGate) instructionsGate.style.display = 'none';
    if (registerWizard) registerWizard.style.display = 'block';

    closeResumeModal();
    goToStep(4);
    showToast(`Registration resumed! Welcome back, Team ${team.teamName}. Please complete your payment below.`, 'success');
  } catch (err) {
    console.error('Error resuming registration:', err);
    showToast(err.message, 'error');
    if (errorMsg) {
      errorMsg.textContent = err.message;
      errorMsg.style.display = 'block';
    }
  } finally {
    if (resumeBtn) {
      resumeBtn.disabled = false;
      resumeBtn.textContent = 'Find & Continue';
    }
  }
}

async function handlePayLater() {
  const regId = state.registeredTeam?.registrationId || state.registeredTeam?.registration_id;
  if (!regId) {
    showToast('Registration ID not found. Please review and confirm your details first.', 'error');
    return;
  }

  const btn = document.getElementById('btn-pay-later');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
  }

  try {
    const res = await fetch('/api/registration/pay-later', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationId: regId })
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to save registration.');
    }

    // Populate Pay Later Modal
    const modal = document.getElementById('pay-later-modal');
    const teamNameEl = document.getElementById('pay-later-team-name');
    const regIdEl = document.getElementById('pay-later-reg-id');
    const linkInput = document.getElementById('pay-later-link-input');
    const emailNotice = document.getElementById('pay-later-email-notice');

    if (teamNameEl) teamNameEl.textContent = state.teamDraft.teamName;
    if (regIdEl) regIdEl.textContent = regId;
    const resumeLink = data.resumeUrl || `${window.location.origin}/register.html?resume=${encodeURIComponent(regId)}`;
    if (linkInput) linkInput.value = resumeLink;

    if (emailNotice) {
      if (data.emailSent) {
        emailNotice.style.display = 'block';
        emailNotice.innerHTML = `✉️ A direct link has been sent to <strong>${escapeHtml(state.teamDraft.leader.collegeEmail)}</strong>!`;
      } else {
        emailNotice.style.display = 'block';
        emailNotice.textContent = `📋 Please bookmark or copy this link so you can return to complete payment.`;
      }
    }

    if (modal) modal.classList.remove('hidden');
    showToast('Registration saved! You can resume and pay anytime.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `💾 Pay Later & Save Link`;
    }
  }
}

/**
 * =========================================================================
 * Student Team & Member Details Edit Modal Logic
 * =========================================================================
 */

function openEditModal(prefillRegId = '') {
  const modal = document.getElementById('edit-modal');
  const input = document.getElementById('edit-search-input');
  const form = document.getElementById('form-edit-team');
  const expiredBanner = document.getElementById('edit-deadline-expired-banner');

  if (modal) modal.classList.remove('hidden');
  if (form) form.classList.add('hidden');
  if (expiredBanner) expiredBanner.classList.add('hidden');

  if (input) {
    if (prefillRegId) {
      input.value = prefillRegId;
      handleLookupEdit();
    } else {
      input.value = '';
      input.focus();
    }
  }
}

function closeEditModal() {
  document.getElementById('edit-modal')?.classList.add('hidden');
  document.getElementById('form-edit-team')?.classList.add('hidden');
  document.getElementById('edit-deadline-expired-banner')?.classList.add('hidden');
  editState.registrationId = null;
  editState.members = [];
}

async function handleLookupEdit(isRestoring = false) {
  const input = document.getElementById('edit-search-input');
  const emailInput = document.getElementById('edit-search-email');
  const lookupBtn = document.getElementById('btn-lookup-edit');
  const form = document.getElementById('form-edit-team');
  const expiredBanner = document.getElementById('edit-deadline-expired-banner');
  const regId = input?.value.trim().toUpperCase();
  const leaderEmail = emailInput?.value.trim().toLowerCase();

  if (!regId) {
    showToast('Please enter your Registration ID (e.g. CV26-TM-12345)', 'warning');
    return;
  }

  if (!leaderEmail && !isRestoring) {
    showToast('Please enter the Team Leader Email to verify authorization.', 'warning');
    emailInput?.focus();
    return;
  }

  if (lookupBtn) {
    lookupBtn.disabled = true;
    lookupBtn.textContent = 'Searching...';
  }

  try {
    const query = leaderEmail ? `?leaderEmail=${encodeURIComponent(leaderEmail)}` : '';
    const res = await fetch(`/api/team/edit-info/${encodeURIComponent(regId)}${query}`);
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Team not found with the provided Registration ID.');
    }

    // Check if editing window has passed
    const isDeadlinePassed = Boolean(data.isDeadlinePassed || data.isEditDeadlinePassed);
    if (isDeadlinePassed) {
      if (form) form.classList.add('hidden');
      if (expiredBanner) {
        expiredBanner.classList.remove('hidden');
        const deadlineTextEl = document.getElementById('expired-deadline-date-text');
        if (deadlineTextEl) {
          deadlineTextEl.textContent = data.editDeadlineFormatted || (data.editDeadline ? new Date(data.editDeadline).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : 'Closed');
        }
      }
      showToast('The editing window for team details has closed.', 'warning');
      return;
    }

    // Deadline is still open! Populate the form
    if (expiredBanner) expiredBanner.classList.add('hidden');
    if (form) form.classList.remove('hidden');

    const team = data.team;
    const regIdValue = team.registration_id || team.registrationId;
    const teamNameValue = team.team_name || team.teamName || '';
    
    editState.registrationId = regIdValue;
    editState.deadline = data.editDeadline;
    editState.isDeadlinePassed = false;

    // Header values
    const regDisplayEl = document.getElementById('edit-current-reg-id');
    const deadlineTextEl = document.getElementById('edit-deadline-text');
    if (regDisplayEl) regDisplayEl.textContent = regIdValue;
    if (deadlineTextEl) {
      deadlineTextEl.textContent = data.editDeadlineFormatted || (data.editDeadline ? new Date(data.editDeadline).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : 'Open (No Deadline)');
    }

    // Team Profile
    document.getElementById('edit-team-name').value = teamNameValue;
    document.getElementById('edit-team-track').value = team.track || 'AI & Intelligent Systems';
    document.getElementById('edit-project-title').value = team.project_title || team.projectTitle || '';
    const editRefEl = document.getElementById('edit-referral');
    if (editRefEl) editRefEl.value = team.referral || '';

    // Leader Details
    const leader = team.leader || (team.members && team.members.find(m => m.is_leader === true || m.isLeader === true)) || (team.members && team.members[0]) || {};
    document.getElementById('edit-leader-name').value = leader.full_name || leader.fullName || '';
    document.getElementById('edit-leader-reg').value = leader.reg_number || leader.regNumber || '';
    document.getElementById('edit-leader-email').value = leader.college_email || leader.collegeEmail || '';
    document.getElementById('edit-leader-phone').value = leader.phone || '';

    // Edit Leader Residence
    const editLeaderResType = leader.residence_type || leader.residenceType || 'HOSTELLER';
    const editLeaderBlock = leader.hostel_block || leader.hostelBlock || '';
    const editLeaderRoom = leader.room_no || leader.roomNo || '';
    const editLeaderDetails = leader.hostel_details || leader.hostelDetails || '';
    const editLeaderDayType = leader.day_scholar_type || leader.dayScholarType || 'LOCAL';
    const editLeaderDayLoc = leader.day_scholar_location || leader.dayScholarLocation || '';
    const editLeaderAddress = leader.residence_address || leader.residenceAddress || '';
    const editLeaderCommute = leader.commute_mode || leader.commuteMode || '';

    const elEditResType = document.getElementById('edit-leader-residence-type');
    const elEditBlock = document.getElementById('edit-leader-hostel-block');
    const elEditRoom = document.getElementById('edit-leader-room-no');
    const elEditDetails = document.getElementById('edit-leader-hostel-details');
    const elEditDayType = document.getElementById('edit-leader-dayscholar-type');
    const elEditDayLoc = document.getElementById('edit-leader-dayscholar-location');
    const elEditAddress = document.getElementById('edit-leader-residence-address');
    const elEditCommute = document.getElementById('edit-leader-commute-mode');

    if (elEditResType) elEditResType.value = editLeaderResType;
    if (elEditBlock) elEditBlock.value = editLeaderBlock;
    if (elEditRoom) elEditRoom.value = editLeaderRoom;
    if (elEditDetails) elEditDetails.value = editLeaderDetails;
    if (elEditDayType) elEditDayType.value = editLeaderDayType;
    if (elEditDayLoc) elEditDayLoc.value = editLeaderDayLoc;
    if (elEditAddress) elEditAddress.value = editLeaderAddress;
    if (elEditCommute) elEditCommute.value = editLeaderCommute;

    const btnEditHosteller = document.getElementById('btn-edit-leader-res-hosteller');
    const btnEditDay = document.getElementById('btn-edit-leader-res-dayscholar');
    const editHostelBox = document.getElementById('edit-leader-hostel-container');
    const editDayBox = document.getElementById('edit-leader-dayscholar-container');
    if (editLeaderResType === 'HOSTELLER') {
      btnEditHosteller?.classList.add('active');
      btnEditDay?.classList.remove('active');
      editHostelBox?.classList.remove('hidden');
      editDayBox?.classList.add('hidden');
    } else {
      btnEditHosteller?.classList.remove('active');
      btnEditDay?.classList.add('active');
      editHostelBox?.classList.add('hidden');
      editDayBox?.classList.remove('hidden');
    }

    // Additional Members (Filter OUT leader so leader isn't duplicated)
    const leaderEmailMatch = (leader.college_email || leader.collegeEmail || '').toLowerCase();
    const nonLeaderMembers = (team.members || []).filter(m => {
      const email = (m.college_email || m.collegeEmail || '').toLowerCase();
      return email !== leaderEmailMatch;
    });

    editState.members = nonLeaderMembers.map((m, idx) => ({
      id: `edit_mem_${idx + 1}`,
      fullName: m.full_name || m.fullName || '',
      regNumber: m.reg_number || m.regNumber || '',
      collegeEmail: m.college_email || m.collegeEmail || '',
      phone: m.phone || '',
      residenceType: m.residence_type || m.residenceType || 'HOSTELLER',
      hostelBlock: m.hostel_block || m.hostelBlock || '',
      roomNo: m.room_no || m.roomNo || '',
      hostelDetails: m.hostel_details || m.hostelDetails || '',
      dayScholarType: m.day_scholar_type || m.dayScholarType || 'LOCAL',
      dayScholarLocation: m.day_scholar_location || m.dayScholarLocation || '',
      residenceAddress: m.residence_address || m.residenceAddress || '',
      commuteMode: m.commute_mode || m.commuteMode || ''
    }));
    editState.originalMemberCount = 1 + editState.members.length;

    renderEditMembers();
    
    if (!isRestoring) {
      setTimeout(saveSessionState, 100);
    }
    
    showToast(`Loaded details for "${teamNameValue}". You can make updates now.`, 'info');

  } catch (err) {
    if (form) form.classList.add('hidden');
    if (expiredBanner) expiredBanner.classList.add('hidden');
    showToast(err.message, 'error');
  } finally {
    if (lookupBtn) {
      lookupBtn.disabled = false;
      lookupBtn.textContent = 'Lookup Team';
    }
  }
}

function renderEditMembers() {
  const container = document.getElementById('dynamic-edit-members-container');
  if (!container) return;

  container.innerHTML = '';

  editState.members.forEach((member, index) => {
    const memberNum = index + 2; // Member 1 is Team Leader
    const card = document.createElement('div');
    card.className = 'member-card';
    card.id = `edit-card-${member.id}`;

    card.innerHTML = `
      <div class="member-card-top">
        <div class="member-title-wrapper">
          <span class="member-idx">Member ${memberNum}</span>
        </div>
        <span class="input-hint" style="color: rgba(255, 255, 255, 0.45); font-size: 0.8rem;">🔒 Fixed Member Slot</span>
      </div>

      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">Full Name <span class="required">*</span></label>
          <input type="text" class="form-input edit-member-field" data-id="${member.id}" data-key="fullName" value="${escapeHtml(member.fullName)}" placeholder="e.g. Priya Nair" required>
        </div>

        <div class="form-group">
          <label class="form-label">College Reg. Number <span class="required">*</span></label>
          <input type="text" class="form-input edit-member-field" data-id="${member.id}" data-key="regNumber" value="${escapeHtml(member.regNumber)}" placeholder="e.g. 22BCE1088" required>
        </div>

        <div class="form-group">
          <label class="form-label">College Email <span class="required">*</span></label>
          <input type="email" class="form-input edit-member-field" data-id="${member.id}" data-key="collegeEmail" value="${escapeHtml(member.collegeEmail)}" placeholder="e.g. priya.nair@college.edu" required>
        </div>

        <div class="form-group">
          <label class="form-label">Phone Number <span class="required">*</span></label>
          <input type="tel" class="form-input edit-member-field" data-id="${member.id}" data-key="phone" value="${escapeHtml(member.phone)}" placeholder="e.g. 9876543211" required maxlength="15">
        </div>
      </div>

      <!-- Member Residence Box in Edit Modal -->
      <div class="residence-box" id="edit-residence-box-${member.id}" style="margin-top: 16px;">
        <div class="residence-header">
          <span class="residence-title">
            <span>🏠</span> Residence & Accommodation Status <span class="required">*</span>
          </span>
        </div>

        <div class="residence-type-selector">
          <button type="button" class="residence-pill-btn hosteller ${member.residenceType !== 'DAY_SCHOLAR' ? 'active' : ''}" data-member-id="${member.id}" data-type="HOSTELLER">
            <span>🏢</span> Hosteller
          </button>
          <button type="button" class="residence-pill-btn dayscholar ${member.residenceType === 'DAY_SCHOLAR' ? 'active' : ''}" data-member-id="${member.id}" data-type="DAY_SCHOLAR">
            <span>🚌</span> Day Scholar
          </button>
        </div>
        <input type="hidden" class="edit-member-field" data-id="${member.id}" data-key="residenceType" value="${member.residenceType || 'HOSTELLER'}">

        <!-- Hosteller Subform -->
        <div class="residence-subform ${member.residenceType === 'DAY_SCHOLAR' ? 'hidden' : ''}" id="edit-hostel-subform-${member.id}">
          <div class="form-grid-2">
            <div class="form-group mb-0">
              <label class="form-label">Hostel Block</label>
              <input type="text" class="form-input edit-member-field" data-id="${member.id}" data-key="hostelBlock" value="${escapeHtml(member.hostelBlock || '')}" placeholder="e.g. Block 1 / Block 2">
            </div>
            <div class="form-group mb-0">
              <label class="form-label">Room Number</label>
              <input type="text" class="form-input edit-member-field" data-id="${member.id}" data-key="roomNo" value="${escapeHtml(member.roomNo || '')}" placeholder="e.g. 204">
            </div>
          </div>
        </div>

        <!-- Day Scholar Subform -->
        <div class="residence-subform ${member.residenceType !== 'DAY_SCHOLAR' ? 'hidden' : ''}" id="edit-dayscholar-subform-${member.id}">
          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-label">Scholar Category</label>
              <select class="form-input form-select edit-member-field" data-id="${member.id}" data-key="dayScholarType">
                <option value="LOCAL" ${member.dayScholarType !== 'NON_LOCAL' ? 'selected' : ''}>Local Resident (Commuter)</option>
                <option value="NON_LOCAL" ${member.dayScholarType === 'NON_LOCAL' ? 'selected' : ''}>Non-Local (PG / Rental flat)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">City / Area / Town</label>
              <input type="text" class="form-input edit-member-field" data-id="${member.id}" data-key="dayScholarLocation" value="${escapeHtml(member.dayScholarLocation || '')}" placeholder="e.g. Bhopal, Sehore">
            </div>
          </div>
          <div class="form-group mb-0">
            <label class="form-label">Detailed Address / PG Name</label>
            <input type="text" class="form-input edit-member-field" data-id="${member.id}" data-key="residenceAddress" value="${escapeHtml(member.residenceAddress || '')}" placeholder="e.g. Balaji PG, Kothri">
          </div>
        </div>
      </div>
    `;

    container.appendChild(card);
  });

  // Attach live input listeners to edit member inputs
  container.querySelectorAll('.edit-member-field').forEach(input => {
    const eventType = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventType, (e) => {
      const memberId = e.target.getAttribute('data-id');
      const key = e.target.getAttribute('data-key');
      const member = editState.members.find(m => m.id === memberId);
      if (member) {
        member[key] = e.target.value;
      }
    });
  });

  // Attach residence toggle buttons for edit members
  container.querySelectorAll('.residence-pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const memberId = btn.getAttribute('data-member-id');
      const type = btn.getAttribute('data-type');
      const member = editState.members.find(m => m.id === memberId);
      if (member) {
        member.residenceType = type;
        const card = document.getElementById(`edit-card-${memberId}`);
        if (card) {
          const hostellerBtn = card.querySelector('.residence-pill-btn.hosteller');
          const dayscholarBtn = card.querySelector('.residence-pill-btn.dayscholar');
          const hostelSub = card.querySelector(`#edit-hostel-subform-${memberId}`);
          const dayscholarSub = card.querySelector(`#edit-dayscholar-subform-${memberId}`);
          const hiddenInput = card.querySelector(`input[data-key="residenceType"]`);

          if (hiddenInput) hiddenInput.value = type;

          if (type === 'HOSTELLER') {
            hostellerBtn?.classList.add('active');
            dayscholarBtn?.classList.remove('active');
            hostelSub?.classList.remove('hidden');
            dayscholarSub?.classList.add('hidden');
          } else {
            hostellerBtn?.classList.remove('active');
            dayscholarBtn?.classList.add('active');
            hostelSub?.classList.add('hidden');
            dayscholarSub?.classList.remove('hidden');
          }
        }
      }
    });
  });
}

function addEditMemberCard() {
  showToast('Team size is fixed based on your paid registration. Adding or removing members is not permitted.', 'warning');
}

function removeEditMemberCard() {
  showToast('Team size is fixed based on your paid registration. Adding or removing members is not permitted.', 'warning');
}

async function handleSaveTeamEdit(e) {
  e.preventDefault();

  if (!editState.registrationId) {
    showToast('No active team loaded for edit.', 'error');
    return;
  }

  // 1. Collect inputs
  const teamName = document.getElementById('edit-team-name')?.value.trim();
  const track = document.getElementById('edit-team-track')?.value;
  const projectTitle = document.getElementById('edit-project-title')?.value.trim();
  const referral = document.getElementById('edit-referral')?.value.trim() || '';

  const leaderName = document.getElementById('edit-leader-name')?.value.trim();
  const leaderReg = document.getElementById('edit-leader-reg')?.value.trim();
  const leaderEmail = document.getElementById('edit-leader-email')?.value.trim().toLowerCase();
  const leaderPhone = document.getElementById('edit-leader-phone')?.value.trim().replace(/\D/g, '');

  if (!teamName || teamName.length < 2) {
    showToast('Please enter a valid team name (at least 2 characters).', 'warning');
    document.getElementById('edit-team-name')?.focus();
    return;
  }

  if (!leaderName || !leaderReg || !leaderEmail || !leaderPhone) {
    showToast('All Team Leader fields are mandatory.', 'warning');
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leaderEmail)) {
    showToast('Please provide a valid email address for Team Leader.', 'warning');
    document.getElementById('edit-leader-email')?.focus();
    return;
  }

  if (leaderPhone.length < 10) {
    showToast('Team Leader phone number must be at least 10 digits.', 'warning');
    document.getElementById('edit-leader-phone')?.focus();
    return;
  }

  // Leader Residence Validation
  const editLeaderResType = document.getElementById('edit-leader-residence-type')?.value || 'HOSTELLER';
  const editLeaderBlock = document.getElementById('edit-leader-hostel-block')?.value.trim() || '';
  const editLeaderRoom = document.getElementById('edit-leader-room-no')?.value.trim() || '';
  const editLeaderDetails = document.getElementById('edit-leader-hostel-details')?.value.trim() || '';
  const editLeaderDayType = document.getElementById('edit-leader-dayscholar-type')?.value || 'LOCAL';
  const editLeaderDayLoc = document.getElementById('edit-leader-dayscholar-location')?.value.trim() || '';
  const editLeaderAddress = document.getElementById('edit-leader-residence-address')?.value.trim() || '';
  const editLeaderCommute = document.getElementById('edit-leader-commute-mode')?.value.trim() || '';

  if (editLeaderResType === 'HOSTELLER') {
    if (!editLeaderBlock || !editLeaderRoom) {
      showToast('Hostel Block and Room Number are required for Team Leader.', 'warning');
      return;
    }
  } else {
    if (!editLeaderDayLoc || !editLeaderAddress) {
      showToast('City/Area and Address/PG details are required for Team Leader.', 'warning');
      return;
    }
  }

  // 2. Validate member count
  const totalMembersCount = 1 + editState.members.length;
  if (editState.originalMemberCount && totalMembersCount !== editState.originalMemberCount) {
    showToast(`Team size cannot be modified (${editState.originalMemberCount} members were registered and paid for).`, 'warning');
    return;
  }
  if (totalMembersCount < 2 || totalMembersCount > 5) {
    showToast(`Team must have between 2 and 5 members (1 Leader + 1 to 4 Members). Currently ${totalMembersCount}.`, 'warning');
    return;
  }

  // 3. Validate each additional member
  const emailSet = new Set([leaderEmail]);
  const regSet = new Set([leaderReg.toUpperCase()]);
  const formattedMembers = [
    {
      fullName: leaderName,
      regNumber: leaderReg.toUpperCase(),
      collegeEmail: leaderEmail,
      phone: leaderPhone,
      residenceType: editLeaderResType,
      hostelBlock: editLeaderBlock,
      roomNo: editLeaderRoom,
      dayScholarType: editLeaderDayType,
      dayScholarLocation: editLeaderDayLoc,
      residenceAddress: editLeaderAddress,
      isLeader: true
    }
  ];

  for (let i = 0; i < editState.members.length; i++) {
    const mem = editState.members[i];
    const memberNum = i + 2;

    if (!mem.fullName || !mem.regNumber || !mem.collegeEmail || !mem.phone) {
      showToast(`Please fill all details for Member ${memberNum}.`, 'warning');
      return;
    }

    const cleanEmail = mem.collegeEmail.toLowerCase();
    const cleanReg = mem.regNumber.toUpperCase();
    const cleanPhone = mem.phone.replace(/\D/g, '');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      showToast(`Invalid email address for Member ${memberNum}.`, 'warning');
      return;
    }

    if (cleanPhone.length < 10) {
      showToast(`Phone number for Member ${memberNum} must be at least 10 digits.`, 'warning');
      return;
    }

    if (emailSet.has(cleanEmail)) {
      showToast(`Duplicate email detected (${cleanEmail}) across team roster. Each member must have a unique email.`, 'warning');
      return;
    }

    if (regSet.has(cleanReg)) {
      showToast(`Duplicate registration number detected (${cleanReg}). Each member must be unique.`, 'warning');
      return;
    }

    // Member Residence Validation
    if (mem.residenceType === 'HOSTELLER') {
      if (!mem.hostelBlock || !mem.roomNo) {
        showToast(`Hostel Block and Room Number are required for Member ${memberNum}.`, 'warning');
        return;
      }
    } else {
      if (!mem.dayScholarLocation || !mem.residenceAddress) {
        showToast(`City/Area and Address/PG details are required for Member ${memberNum}.`, 'warning');
        return;
      }
    }

    emailSet.add(cleanEmail);
    regSet.add(cleanReg);

    formattedMembers.push({
      fullName: mem.fullName,
      regNumber: cleanReg,
      collegeEmail: cleanEmail,
      phone: cleanPhone,
      residenceType: mem.residenceType || 'HOSTELLER',
      hostelBlock: mem.hostelBlock || '',
      roomNo: mem.roomNo || '',
      dayScholarType: mem.dayScholarType || 'LOCAL',
      dayScholarLocation: mem.dayScholarLocation || '',
      residenceAddress: mem.residenceAddress || '',
      isLeader: false
    });
  }

  // 4. Submit payload to API
  const saveBtn = document.getElementById('btn-save-team-edit');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '💾 Saving Changes...';
  }

  try {
    const res = await fetch('/api/team/update', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrationId: editState.registrationId,
        leaderEmail,
        teamName,
        track,
        projectTitle,
        referral,
        members: formattedMembers
      })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to update team details.');
    }

    showToast(`✅ Team "${teamName}" details updated successfully! Updated in live records and Excel export.`, 'success');
    sessionStorage.removeItem('codeverse_reg_state');
    closeEditModal();

    // If tracker is open or recent registration exists, update status
    if (state.registeredTeam && (state.registeredTeam.registration_id === editState.registrationId || state.registeredTeam.registrationId === editState.registrationId)) {
      state.registeredTeam.team_name = teamName;
      state.registeredTeam.track = track;
    }

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '💾 Save & Update Team Details';
    }
  }
}

/**
 * Utility: Copy to Clipboard with Feedback
 */
function copyToClipboard(text, triggerBtn = null) {
  navigator.clipboard.writeText(text).then(() => {
    if (triggerBtn) {
      const originalText = triggerBtn.innerHTML;
      triggerBtn.classList.add('copied');
      triggerBtn.innerHTML = `✓ Copied!`;
      setTimeout(() => {
        triggerBtn.classList.remove('copied');
        triggerBtn.innerHTML = originalText;
      }, 2000);
    }
    showToast(`Copied "${text}" to clipboard`, 'success');
  }).catch(() => {
    showToast('Failed to copy to clipboard', 'error');
  });
}

/**
 * Utility: Toast Notifications
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 200ms ease';
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ==========================================================================
   INTERACTIVE VISUAL ENGINES: Particles, Typewriter, 3D Tilt & Parallax, Scroll Reveal
   ========================================================================== */

/**
 * Interactive Particle Canvas Engine
 * Floating copper/amber nodes with subtle connecting constellations reacting to mouse movement.
 */
function initParticleCanvas() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const particles = [];
  const particleCount = Math.min(Math.floor(width / 18), 65);
  const maxDistance = 120;
  const mouse = { x: null, y: null, radius: 140 };

  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  window.addEventListener('mouseout', () => {
    mouse.x = null;
    mouse.y = null;
  });

  // Particle Class
  class Particle {
    constructor() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.vx = (Math.random() - 0.5) * 0.6;
      this.vy = (Math.random() - 0.5) * 0.6;
      this.radius = Math.random() * 2 + 1;
      this.baseAlpha = Math.random() * 0.5 + 0.2;
      // Random purplish-blue / electric violet / cyber cyan hue
      const colors = ['#8b5cf6', '#a855f7', '#7c3aed', '#00f0ff', '#38bdf8', '#c084fc', '#ffffff'];
      this.color = colors[Math.floor(Math.random() * colors.length)];
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;

      if (this.x < 0 || this.x > width) this.vx *= -1;
      if (this.y < 0 || this.y > height) this.vy *= -1;

      // Mouse interactivity: gentle nudge
      if (mouse.x !== null && mouse.y !== null) {
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < mouse.radius) {
          const force = (mouse.radius - dist) / mouse.radius;
          this.x -= (dx / dist) * force * 2;
          this.y -= (dy / dist) * force * 2;
        }
      }
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.globalAlpha = this.baseAlpha;
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#8b5cf6';
      ctx.fill();
    }
  }

  for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle());
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);

    // Draw connecting lines
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < maxDistance) {
          const alpha = (1 - dist / maxDistance) * 0.18;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = '#8b5cf6';
          ctx.globalAlpha = alpha;
          ctx.lineWidth = 0.8;
          ctx.shadowBlur = 0;
          ctx.stroke();
        }
      }
    }

    // Update & draw particles
    particles.forEach((p) => {
      p.update();
      p.draw();
    });

    requestAnimationFrame(animate);
  }

  animate();
}

/**
 * Typewriter Slogan Cycler
 */
function initTypewriterEffect() {
  const target = document.getElementById('typewriter-text');
  if (!target) return;

  const phrases = [
    'Autonomous AI Agents',
    'Next-Gen Web3 Protocols',
    'Zero-Trust Cloud Systems',
    'Cutting-Edge FinTech Rails',
    'Transformative Moonshots'
  ];

  let phraseIndex = 0;
  let charIndex = 0;
  let isDeleting = false;
  let typingSpeed = 90;

  function type() {
    const currentPhrase = phrases[phraseIndex];

    if (isDeleting) {
      target.textContent = currentPhrase.substring(0, charIndex - 1);
      charIndex--;
      typingSpeed = 45;
    } else {
      target.textContent = currentPhrase.substring(0, charIndex + 1);
      charIndex++;
      typingSpeed = 90;
    }

    if (!isDeleting && charIndex === currentPhrase.length) {
      typingSpeed = 2200; // Pause at full word
      isDeleting = true;
    } else if (isDeleting && charIndex === 0) {
      isDeleting = false;
      phraseIndex = (phraseIndex + 1) % phrases.length;
      typingSpeed = 400; // Pause before typing next word
    }

    setTimeout(type, typingSpeed);
  }

  type();
}

/**
 * 3D Card Tilt & Parallax Layer Depth
 */
function init3DParallaxAndTilt() {
  // 3D Card Tilt on Hover
  const tiltCards = document.querySelectorAll('.tilt-card');
  tiltCards.forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * -7;
      const rotateY = ((x - centerX) / centerX) * 7;

      card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-4px)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)';
    });
  });

  // Hero Floating Badges Parallax on Mouse Move
  const parallaxLayers = document.querySelectorAll('.parallax-layer');
  window.addEventListener('mousemove', (e) => {
    const mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    const mouseY = (e.clientY / window.innerHeight - 0.5) * 2;

    parallaxLayers.forEach((layer) => {
      const depth = parseFloat(layer.getAttribute('data-depth') || 0.1);
      const moveX = mouseX * depth * 80;
      const moveY = mouseY * depth * 80;
      layer.style.transform = `translate3d(${moveX}px, ${moveY}px, 0)`;
    });
  });
}

/**
 * Smooth Scroll Reveal with IntersectionObserver
 */
function initScrollReveal() {
  const revealElements = document.querySelectorAll('[data-reveal]');
  if (!revealElements.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
        } else {
          entry.target.classList.remove('revealed');
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  revealElements.forEach((el) => observer.observe(el));
}
