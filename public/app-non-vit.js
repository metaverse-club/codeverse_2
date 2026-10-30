/**
 * CodeVerse Hackathon 2026 - Non-VIT Student Registration & Cart Controller
 * Dedicated multi-step wizard for external participants:
 * - Direct Entry to Round 2 Offline Hackathon
 * - Academic info: Name, College, Year, Degree
 * - Interactive Cart with optional Dinner Pass (₹200/person)
 * - Dynamic UPI QR code generation
 */

// Application Constants & State
const PRICING_TIERS = {
  2: { fee: 250, name: 'DUO' },
  3: { fee: 330, name: 'TRIO' },
  4: { fee: 400, name: 'QUARTET' },
  5: { fee: 470, name: 'QUINTET' }
};

let DINNER_FEE_PER_PERSON = 200;

function calculateBaseFee(memberCount) {
  const tier = PRICING_TIERS[memberCount];
  return tier ? tier.fee : 250;
}

function getTierName(memberCount) {
  const tier = PRICING_TIERS[memberCount];
  return tier ? tier.name : 'DUO';
}

const state = {
  currentStep: 1,
  instructionsAgreed: false,
  hackathonConfig: null,
  registeredTeam: null,
  teamAuthToken: null,
  turnstileWidgetId: null,
  isEmailVerified: false,
  verifiedEmail: null,
  teamDraft: {
    teamName: '',
    teamType: 'NON_VIT',
    referral: '',
    track: 'AI & Intelligent Systems',
    projectTitle: '',
    hasFood: false,
    foodCount: 0,
    foodAmount: 0,
    totalFee: 250,
    leader: {
      fullName: '',
      collegeName: '',
      yearOfStudy: '2nd Year',
      degree: '',
      collegeEmail: '',
      phone: '',
      wantsFood: false
    },
    // Default 1 additional member = 2 members total (DUO)
    members: [
      {
        id: 'mem_1',
        fullName: '',
        collegeName: '',
        yearOfStudy: '2nd Year',
        degree: '',
        collegeEmail: '',
        phone: '',
        wantsFood: false
      }
    ]
  },
  proofFile: null
};

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupDropzone();
  renderMembers();
  updateCart();

  await loadHackathonConfig();
  updateCart();

  // 1. Check URL parameters for direct resume (?resume=CV26-TM-XXXXX or ?openResume=1)
  const urlParams = new URLSearchParams(window.location.search);
  const resumeParam = urlParams.get('resume');
  if (resumeParam) {
    await handleResumeRegistration(resumeParam);
  } else if (urlParams.get('openResume')) {
    openResumeModal();
  } else {
    // 2. Restore session state so page refresh preserves all user inputs and active step!
    const restored = restoreSessionState();
    if (!restored) {
      // 3. If no active session state, check if there is an uncompleted registration from past session
      checkPendingRegistrationBanner();
    }
  }

  // 4. Bind auto-save listeners so user never loses any data on refresh
  document.addEventListener('input', () => setTimeout(saveSessionState, 100));
  document.addEventListener('change', () => setTimeout(saveSessionState, 100));
});

// Cloudflare Turnstile explicit callback
window.onloadTurnstileCallback = function () {
  const container = document.getElementById('cf-turnstile-container');
  if (!container || !window.turnstile) return;

  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  // Use Cloudflare's official always-pass test key on localhost to prevent domain mismatch "Troubleshoot" error
  const sitekey = isLocal
    ? '1x00000000000000000000AA'
    : ((state.hackathonConfig && state.hackathonConfig.turnstileSiteKey) || '0x4AAAAAAFe4Z-FGGrCOS8QK');

  try {
    state.turnstileWidgetId = turnstile.render('#cf-turnstile-container', {
      sitekey: sitekey,
      theme: 'dark',
      callback: function (token) {
        const input = document.getElementById('turnstile-token');
        if (input) input.value = token;
      },
      'error-callback': function () {
        console.warn('Turnstile widget failed to load challenge');
      }
    });
  } catch (err) {
    console.warn('Turnstile render exception:', err);
  }
};

/**
 * Fetch Hackathon Configuration from server
 */
async function loadHackathonConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    if (data.success && data.config) {
      state.hackathonConfig = data.config;
      if (data.config.foodDetails && data.config.foodDetails.dinnerFeePerPerson) {
        DINNER_FEE_PER_PERSON = data.config.foodDetails.dinnerFeePerPerson;
      }

      // Check Registration Deadline
      if (data.config.registrationDeadline) {
        const deadline = new Date(data.config.registrationDeadline);
        if (!isNaN(deadline.getTime()) && Date.now() > deadline.getTime()) {
          displayRegistrationClosed(deadline);
        }
      }
    }
  } catch (err) {
    console.warn('Could not load config from server:', err);
  }
}

function displayRegistrationClosed(deadline) {
  const closedBanner = document.getElementById('reg-deadline-closed-banner');
  const wizardContainer = document.getElementById('register-wizard-container');
  const msgEl = document.getElementById('reg-closed-message');

  if (closedBanner) {
    const dateFormatted = deadline.toLocaleString('en-IN', {
      dateStyle: 'full',
      timeStyle: 'short'
    });
    if (msgEl) {
      msgEl.innerHTML = `New registrations for CodeVerse 2.0 closed on <strong>${dateFormatted}</strong>. No further squad submissions can be accepted.`;
    }
    closedBanner.style.display = 'block';
  }
  if (wizardContainer) {
    wizardContainer.style.display = 'none';
  }
}

// ==========================================
// DYNAMIC CART CALCULATOR
// ==========================================
function updateCart() {
  const memberCount = 1 + state.teamDraft.members.length;
  const baseFee = calculateBaseFee(memberCount);
  const tierName = getTierName(memberCount);

  // Count food passes
  let foodCount = 0;
  if (state.teamDraft.leader.wantsFood) foodCount++;
  state.teamDraft.members.forEach(m => {
    if (m.wantsFood) foodCount++;
  });

  const foodAmount = foodCount * DINNER_FEE_PER_PERSON;
  const totalFee = baseFee + foodAmount;

  state.teamDraft.hasFood = foodCount > 0;
  state.teamDraft.foodCount = foodCount;
  state.teamDraft.foodAmount = foodAmount;
  state.teamDraft.totalFee = totalFee;

  // Update Cart UI Elements
  const cartTierName = document.getElementById('cart-tier-name');
  if (cartTierName) cartTierName.textContent = tierName;

  const cartTierDesc = document.getElementById('cart-tier-desc');
  if (cartTierDesc) {
    cartTierDesc.textContent = `Squad Pass for ${memberCount} members • Direct Entry to Round 2 Offline Hackathon`;
  }

  const cartBaseFee = document.getElementById('cart-base-fee');
  if (cartBaseFee) cartBaseFee.textContent = `₹${baseFee}`;

  const cartFoodDesc = document.getElementById('cart-food-desc');
  if (cartFoodDesc) {
    cartFoodDesc.textContent = `${foodCount} dinner pass(es) selected @ ₹${DINNER_FEE_PER_PERSON} each`;
  }

  const cartFoodAmount = document.getElementById('cart-food-amount');
  if (cartFoodAmount) cartFoodAmount.textContent = `₹${foodAmount}`;

  const cartAllFoodCount = document.getElementById('cart-all-food-count');
  if (cartAllFoodCount) cartAllFoodCount.textContent = String(memberCount);

  const cartTotalAmount = document.getElementById('cart-total-amount');
  if (cartTotalAmount) cartTotalAmount.textContent = `₹${totalFee}`;

  const cartTotalBreakdown = document.getElementById('cart-total-breakdown');
  if (cartTotalBreakdown) {
    cartTotalBreakdown.textContent = `Base Registration (₹${baseFee}) + Dinner Passes (${foodCount} × ₹${DINNER_FEE_PER_PERSON} = ₹${foodAmount})`;
  }

  // Update Step 4 payment amount displays
  const upiAmountPill = document.getElementById('upi-amount-pill');
  if (upiAmountPill) upiAmountPill.textContent = `₹${totalFee}`;

  const upiFeeText = document.getElementById('upi-fee-text');
  if (upiFeeText) upiFeeText.textContent = `₹${totalFee}`;

  const upiTierBadge = document.getElementById('upi-tier-badge');
  if (upiTierBadge) {
    upiTierBadge.textContent = foodCount > 0 ? `${tierName} + ${foodCount} Food Pass(es)` : `${tierName} Pass`;
  }

  return { baseFee, foodCount, foodAmount, totalFee, tierName };
}

// ==========================================
// STEPPER & WIZARD NAVIGATION
// ==========================================
function goToStep(targetStep) {
  if (targetStep < 1 || targetStep > 6) return;

  state.currentStep = targetStep;
  setTimeout(saveSessionState, 10);

  // Update Step views
  document.querySelectorAll('.wizard-step').forEach(step => {
    step.classList.remove('active');
  });
  const currentStepEl = document.getElementById(`step-${targetStep}`);
  if (currentStepEl) currentStepEl.classList.add('active');

  // Update Stepper indicators
  document.querySelectorAll('.step-item').forEach(item => {
    const stepNum = parseInt(item.getAttribute('data-step'), 10);
    item.classList.remove('active', 'completed');
    if (stepNum === targetStep) {
      item.classList.add('active');
    } else if (stepNum < targetStep) {
      item.classList.add('completed');
    }
  });

  // Scroll smoothly to top of wizard
  window.scrollTo({ top: 120, behavior: 'smooth' });

  // Step specific preparations
  if (targetStep === 2) {
    renderMembers();
    updateMemberCounters();
  } else if (targetStep === 3) {
    populateReviewStep();
  } else if (targetStep === 4) {
    loadPaymentQrCode();
  }
}

function setupNavigation() {
  // Instructions Gate logic
  const agreeCheck = document.getElementById('instructions-agree-check');
  const proceedBtn = document.getElementById('proceed-to-register-btn');
  const instructionsGate = document.getElementById('instructions-gate');
  const registerWizard = document.getElementById('register-wizard-container');

  agreeCheck?.addEventListener('change', (e) => {
    if (proceedBtn) {
      if (e.target.checked) {
        proceedBtn.disabled = false;
        proceedBtn.style.opacity = '1';
        proceedBtn.style.cursor = 'pointer';
      } else {
        proceedBtn.disabled = true;
        proceedBtn.style.opacity = '0.5';
        proceedBtn.style.cursor = 'not-allowed';
      }
    }
  });

  proceedBtn?.addEventListener('click', () => {
    if (!agreeCheck?.checked) return;
    state.instructionsAgreed = true;
    if (instructionsGate) instructionsGate.style.display = 'none';
    if (registerWizard) registerWizard.style.display = 'block';
    window.scrollTo({ top: 120, behavior: 'smooth' });
    saveSessionState();
  });

  // Resume / Continue Registration modal bindings
  document.getElementById('nav-resume-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    openResumeModal();
  });
  document.getElementById('btn-open-resume-modal')?.addEventListener('click', (e) => {
    e.preventDefault();
    openResumeModal();
  });
  document.getElementById('modal-resume-close')?.addEventListener('click', closeResumeModal);

  document.getElementById('btn-lookup-resume')?.addEventListener('click', () => {
    const val = document.getElementById('resume-search-input')?.value.trim();
    if (val) handleResumeRegistration(val);
    else showToast('Please enter your Registration ID or Leader Email', 'warning');
  });

  document.getElementById('resume-search-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = document.getElementById('resume-search-input')?.value.trim();
      if (val) handleResumeRegistration(val);
      else showToast('Please enter your Registration ID or Leader Email', 'warning');
    }
  });

  // Pending Banner buttons
  const resumePendingHandler = () => {
    const regId = document.getElementById('pending-banner-reg-id')?.textContent ||
      document.getElementById('pending-banner-id')?.textContent;
    if (regId && regId !== '-') handleResumeRegistration(regId);
  };
  document.getElementById('btn-banner-resume')?.addEventListener('click', resumePendingHandler);
  document.getElementById('btn-resume-pending')?.addEventListener('click', resumePendingHandler);

  const dismissPendingHandler = () => {
    const banner = document.getElementById('pending-reg-banner');
    if (banner) banner.style.display = 'none';
    try { localStorage.removeItem('codeverse_pending_registration'); } catch (e) {}
  };
  document.getElementById('btn-banner-dismiss')?.addEventListener('click', dismissPendingHandler);
  document.getElementById('btn-dismiss-pending')?.addEventListener('click', dismissPendingHandler);

  // Stepper item clicks for easy navigation back to previous steps
  document.querySelectorAll('.step-item').forEach(item => {
    item.style.cursor = 'pointer';
    item.addEventListener('click', () => {
      const stepNum = parseInt(item.getAttribute('data-step'), 10);
      if (stepNum && stepNum < state.currentStep) {
        if (state.currentStep === 2) saveMembersFromInputs();
        goToStep(stepNum);
      }
    });
  });

  // Step 1 -> Step 2
  document.getElementById('btn-goto-step-2')?.addEventListener('click', handleStep1Next);

  // Step 2 navigation
  document.getElementById('btn-back-to-step-1')?.addEventListener('click', () => {
    saveMembersFromInputs();
    goToStep(1);
  });
  document.getElementById('btn-goto-step-3')?.addEventListener('click', handleStep2Next);

  // Step 3 navigation
  document.getElementById('btn-back-to-step-2')?.addEventListener('click', () => goToStep(2));
  document.getElementById('btn-confirm-and-pay')?.addEventListener('click', handleConfirmAndPay);

  // Step 4 navigation
  document.getElementById('btn-back-to-step-3')?.addEventListener('click', () => goToStep(3));
  document.getElementById('btn-goto-step-5')?.addEventListener('click', () => goToStep(5));

  // Step 5 navigation
  document.getElementById('btn-back-to-step-4')?.addEventListener('click', () => goToStep(4));

  // Review confirmation checkbox
  const confirmCheckbox = document.getElementById('review-confirm-checkbox');
  const confirmBtn = document.getElementById('btn-confirm-and-pay');
  confirmCheckbox?.addEventListener('change', () => {
    if (confirmBtn) confirmBtn.disabled = !confirmCheckbox.checked;
  });

  // Cart quick food toggle buttons
  document.getElementById('btn-cart-add-all-food')?.addEventListener('click', () => {
    state.teamDraft.leader.wantsFood = true;
    const leaderFoodCheckbox = document.getElementById('leader-food-pass');
    if (leaderFoodCheckbox) leaderFoodCheckbox.checked = true;

    state.teamDraft.members.forEach((m, idx) => {
      m.wantsFood = true;
      const el = document.getElementById(`member-food-${idx}`);
      if (el) el.checked = true;
    });

    updateCart();
    populateReviewRoster();
    showToast('🍽️ Dinner pass added for all squad members!', 'info');
  });

  document.getElementById('btn-cart-remove-all-food')?.addEventListener('click', () => {
    state.teamDraft.leader.wantsFood = false;
    const leaderFoodCheckbox = document.getElementById('leader-food-pass');
    if (leaderFoodCheckbox) leaderFoodCheckbox.checked = false;

    state.teamDraft.members.forEach((m, idx) => {
      m.wantsFood = false;
      const el = document.getElementById(`member-food-${idx}`);
      if (el) el.checked = false;
    });

    updateCart();
    populateReviewRoster();
    showToast('Dinner passes removed from cart.', 'info');
  });

  // Add Member button
  document.getElementById('btn-add-member')?.addEventListener('click', addMember);

  // Track Status modal
  document.getElementById('nav-track-btn')?.addEventListener('click', openTrackModal);
  document.getElementById('btn-track-this-team')?.addEventListener('click', () => {
    const regId = state.registeredTeam?.registrationId;
    if (regId) {
      openTrackModal();
      const input = document.getElementById('track-search-input');
      if (input) input.value = regId;
      lookupTeamStatus();
    }
  });
  document.getElementById('modal-track-close')?.addEventListener('click', closeTrackModal);
  document.getElementById('btn-lookup-status')?.addEventListener('click', lookupTeamStatus);

  // Print Receipt
  document.getElementById('btn-print-receipt')?.addEventListener('click', () => {
    window.print();
  });

  // Copy ID buttons
  document.getElementById('btn-copy-receipt-id')?.addEventListener('click', () => {
    const id = document.getElementById('receipt-reg-id')?.textContent;
    if (id) copyToClipboard(id, 'Registration ID copied to clipboard!');
  });

  // Copy Helpers on Payment Page
  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-copy-target');
      const textEl = document.getElementById(targetId);
      if (textEl) {
        copyToClipboard(textEl.textContent.trim(), 'Copied to clipboard!');
      }
    });
  });

  // Payment Tabs (UPI vs Bank)
  document.querySelectorAll('.payment-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.payment-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.payment-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const tabName = tab.getAttribute('data-tab');
      const targetContent = document.getElementById(`tab-content-${tabName}`);
      if (targetContent) targetContent.classList.add('active');
    });
  });

  // OTP Handlers
  document.getElementById('btn-send-otp')?.addEventListener('click', handleSendOtp);
  document.getElementById('btn-verify-otp')?.addEventListener('click', handleVerifyOtp);

  // Payment Form submit
  document.getElementById('form-payment-submit')?.addEventListener('submit', handlePaymentSubmit);

  // Leader food pass checkbox listener
  document.getElementById('leader-food-pass')?.addEventListener('change', (e) => {
    state.teamDraft.leader.wantsFood = e.target.checked;
    updateCart();
  });
}

// ==========================================
// OTP SEND & VERIFICATION
// ==========================================
async function handleSendOtp() {
  const emailInput = document.getElementById('leader-email');
  const btn = document.getElementById('btn-send-otp');
  const statusEl = document.getElementById('otp-status-msg');
  const otpSection = document.getElementById('otp-section');
  const email = emailInput?.value.trim();

  if (!email || !email.includes('@')) {
    showToast('Please enter a valid email address.', 'warning');
    emailInput?.focus();
    return;
  }

  // Turnstile token check
  const turnstileToken = document.getElementById('turnstile-token')?.value;

  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const res = await fetch('/api/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, turnstileToken })
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to send OTP.');
    }

    showToast('6-digit OTP sent to your email!', 'success');
    if (otpSection) otpSection.style.display = 'block';
    if (statusEl) {
      statusEl.textContent = `OTP dispatched to ${email}. Check inbox and spam folder.`;
      statusEl.style.color = '#38bdf8';
    }
    document.getElementById('leader-otp')?.focus();
  } catch (err) {
    showToast(err.message, 'error');
    if (statusEl) {
      statusEl.textContent = err.message;
      statusEl.style.color = '#ef4444';
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Resend OTP';
  }
}

async function handleVerifyOtp() {
  const email = document.getElementById('leader-email')?.value.trim();
  const otpInput = document.getElementById('leader-otp');
  const otp = otpInput?.value.trim();
  const btn = document.getElementById('btn-verify-otp');
  const statusEl = document.getElementById('otp-status-msg');

  if (!otp || otp.length !== 6) {
    showToast('Please enter the 6-digit verification code.', 'warning');
    otpInput?.focus();
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Verifying...';

  try {
    const res = await fetch('/api/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp })
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Incorrect or expired OTP.');
    }

    state.isEmailVerified = true;
    state.verifiedEmail = email;
    state.verificationToken = data.verificationToken;
    try {
      sessionStorage.setItem('codeverse_verification_token', data.verificationToken);
    } catch (e) {}

    showToast('Email verified successfully! ✓', 'success');
    if (statusEl) {
      statusEl.innerHTML = '<span style="color: #10b981; font-weight: 600;">✓ Email Verified Successfully</span>';
    }
    const sendBtn = document.getElementById('btn-send-otp');
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Verified ✓';
    }
    const emailField = document.getElementById('leader-email');
    if (emailField) emailField.readOnly = true;
    const otpSection = document.getElementById('otp-section');
    if (otpSection) otpSection.style.display = 'none';
  } catch (err) {
    showToast(err.message, 'error');
    if (statusEl) {
      statusEl.textContent = err.message;
      statusEl.style.color = '#ef4444';
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Verify';
  }
}

// ==========================================
// STEP 1 VALIDATION & PROCEED
// ==========================================
function handleStep1Next() {
  const teamName = document.getElementById('team-name')?.value.trim();
  const referral = document.getElementById('referral')?.value.trim() || '';
  const track = document.getElementById('team-track')?.value;
  const projectTitle = document.getElementById('project-title')?.value.trim();

  const leaderName = document.getElementById('leader-name')?.value.trim();
  const leaderCollege = document.getElementById('leader-college')?.value.trim();
  const leaderYear = document.getElementById('leader-year')?.value;
  const leaderDegree = document.getElementById('leader-degree')?.value.trim();
  const leaderEmail = document.getElementById('leader-email')?.value.trim();
  const leaderPhone = document.getElementById('leader-phone')?.value.trim();
  const leaderFood = document.getElementById('leader-food-pass')?.checked || false;

  if (!teamName || teamName.length < 3) {
    showToast('Please enter a valid Squad / Team Name (min 3 chars).', 'warning');
    document.getElementById('team-name')?.focus();
    return;
  }

  if (!projectTitle || projectTitle.length < 3) {
    showToast('Please provide your Project Title or Idea Scope.', 'warning');
    document.getElementById('project-title')?.focus();
    return;
  }

  if (!leaderName) {
    showToast('Please enter Team Leader full name.', 'warning');
    document.getElementById('leader-name')?.focus();
    return;
  }

  if (!leaderCollege) {
    showToast('Please enter your College or University name.', 'warning');
    document.getElementById('leader-college')?.focus();
    return;
  }

  if (!leaderDegree) {
    showToast('Please enter Leader Degree & Branch.', 'warning');
    document.getElementById('leader-degree')?.focus();
    return;
  }

  if (!leaderEmail || !leaderEmail.includes('@')) {
    showToast('Please enter a valid Leader email address.', 'warning');
    document.getElementById('leader-email')?.focus();
    return;
  }

  if (!leaderPhone || leaderPhone.replace(/\D/g, '').length < 10) {
    showToast('Please enter a 10-digit WhatsApp / Phone number for the Leader.', 'warning');
    document.getElementById('leader-phone')?.focus();
    return;
  }

  // Check email verification before allowing to leave Step 1
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!isLocal && (!state.isEmailVerified || state.verifiedEmail !== leaderEmail)) {
    const savedToken = sessionStorage.getItem('codeverse_verification_token');
    if (savedToken && state.verifiedEmail === leaderEmail) {
      state.verificationToken = savedToken;
      state.isEmailVerified = true;
    } else {
      showToast('Please verify the Team Leader email with OTP before proceeding.', 'warning');
      document.getElementById('btn-send-otp')?.focus();
      return;
    }
  }

  // Save Leader and Squad draft
  state.teamDraft.teamName = teamName;
  state.teamDraft.referral = referral;
  state.teamDraft.track = track;
  state.teamDraft.projectTitle = projectTitle;
  state.teamDraft.leader = {
    fullName: leaderName,
    collegeName: leaderCollege,
    yearOfStudy: leaderYear,
    degree: leaderDegree,
    collegeEmail: leaderEmail,
    phone: leaderPhone,
    wantsFood: leaderFood
  };

  // Update Leader preview in Step 2
  const prevName = document.getElementById('leader-preview-name');
  if (prevName) prevName.textContent = leaderName;

  const prevCollege = document.getElementById('leader-preview-college');
  if (prevCollege) prevCollege.textContent = `College: ${leaderCollege}`;

  const prevEmail = document.getElementById('leader-preview-email');
  if (prevEmail) prevEmail.textContent = `Email: ${leaderEmail}`;

  const prevPhone = document.getElementById('leader-preview-phone');
  if (prevPhone) prevPhone.textContent = `Phone: ${leaderPhone}`;

  const prevFood = document.getElementById('leader-preview-food');
  if (prevFood) prevFood.textContent = leaderFood ? 'Dinner: Yes (+₹200)' : 'Dinner: No';

  updateCart();
  goToStep(2);
}

// ==========================================
// STEP 2: MEMBERS MANAGEMENT (2 to 5)
// ==========================================
function renderMembers() {
  const container = document.getElementById('dynamic-members-container');
  if (!container) return;

  // Ensure at least 1 member is present (Member 2) so squad has min 2 members
  if (!state.teamDraft.members || state.teamDraft.members.length === 0) {
    state.teamDraft.members = [
      {
        id: 'mem_1',
        fullName: '',
        collegeName: state.teamDraft.leader?.collegeName || '',
        yearOfStudy: '2nd Year',
        degree: '',
        collegeEmail: '',
        phone: '',
        wantsFood: false
      }
    ];
  }

  const leaderCollege = state.teamDraft.leader?.collegeName || '';

  container.innerHTML = state.teamDraft.members.map((m, idx) => {
    const memberNum = idx + 2; // Member 2, 3, etc.
    return `
      <div class="member-card" id="member-card-${idx}">
        <div class="member-card-top">
          <div class="member-title-wrapper">
            <span class="member-idx">Member ${memberNum}</span>
            <span class="badge-status-pill text-xs">Squad Member</span>
          </div>
          ${state.teamDraft.members.length > 1 ? `
            <button type="button" class="btn-remove-member" onclick="removeMember(${idx})" title="Remove this member">
              ✕ Remove
            </button>
          ` : ''}
        </div>

        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label">Full Name <span class="required">*</span></label>
            <input type="text" class="form-input member-field" id="member-name-${idx}" data-idx="${idx}" data-field="fullName" value="${escapeHtml(m.fullName)}" placeholder="e.g. Priya Sharma" required>
          </div>

          <div class="form-group">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label class="form-label" style="margin-bottom: 0;">College / University <span class="required">*</span></label>
              ${leaderCollege ? `
                <button type="button" class="btn-copy-college" style="background: none; border: none; color: #38bdf8; font-size: 0.78rem; cursor: pointer; text-decoration: underline;" onclick="copyLeaderCollege(${idx})">
                  Same as Leader
                </button>
              ` : ''}
            </div>
            <input type="text" class="form-input member-field" id="member-college-${idx}" data-idx="${idx}" data-field="collegeName" value="${escapeHtml(m.collegeName || '')}" placeholder="e.g. IIT Delhi / DTU" required>
          </div>

          <div class="form-group">
            <label class="form-label">Year of Study <span class="required">*</span></label>
            <select class="form-input form-select member-field" id="member-year-${idx}" data-idx="${idx}" data-field="yearOfStudy" required>
              <option value="1st Year" ${m.yearOfStudy === '1st Year' ? 'selected' : ''}>1st Year</option>
              <option value="2nd Year" ${m.yearOfStudy === '2nd Year' || !m.yearOfStudy ? 'selected' : ''}>2nd Year</option>
              <option value="3rd Year" ${m.yearOfStudy === '3rd Year' ? 'selected' : ''}>3rd Year</option>
              <option value="4th Year" ${m.yearOfStudy === '4th Year' ? 'selected' : ''}>4th Year</option>
              <option value="5th Year" ${m.yearOfStudy === '5th Year' ? 'selected' : ''}>5th Year</option>
              <option value="Postgraduate" ${m.yearOfStudy === 'Postgraduate' ? 'selected' : ''}>Postgraduate</option>
              <option value="Other" ${m.yearOfStudy === 'Other' ? 'selected' : ''}>Other</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Degree & Branch <span class="required">*</span></label>
            <input type="text" class="form-input member-field" id="member-degree-${idx}" data-idx="${idx}" data-field="degree" value="${escapeHtml(m.degree || '')}" placeholder="e.g. B.Tech IT / BCA" required>
          </div>

          <div class="form-group">
            <label class="form-label">Email Address <span class="required">*</span></label>
            <input type="email" class="form-input member-field" id="member-email-${idx}" data-idx="${idx}" data-field="collegeEmail" value="${escapeHtml(m.collegeEmail || '')}" placeholder="e.g. priya@college.edu" required>
          </div>

          <div class="form-group">
            <label class="form-label">WhatsApp / Phone Number <span class="required">*</span></label>
            <input type="tel" class="form-input member-field" id="member-phone-${idx}" data-idx="${idx}" data-field="phone" value="${escapeHtml(m.phone || '')}" placeholder="e.g. 9812345678" required maxlength="15">
          </div>
        </div>

        <label class="member-food-checkbox-wrap" for="member-food-${idx}">
          <input type="checkbox" id="member-food-${idx}" ${m.wantsFood ? 'checked' : ''} onchange="toggleMemberFood(${idx}, this.checked)">
          <span class="member-food-label">
            🍽️ Include Day 1 Dinner Pass for Member ${memberNum}
            <span class="member-food-price-pill">+₹200</span>
          </span>
        </label>
      </div>
    `;
  }).join('');

  // Attach live input listeners to keep state instantly updated
  container.querySelectorAll('.member-field').forEach(input => {
    const eventType = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventType, (e) => {
      const idx = parseInt(e.target.getAttribute('data-idx'), 10);
      const field = e.target.getAttribute('data-field');
      if (state.teamDraft.members[idx] && field) {
        state.teamDraft.members[idx][field] = e.target.value.trim();
      }
    });
  });

  updateMemberCounters();
}

window.copyLeaderCollege = function (idx) {
  const college = state.teamDraft.leader?.collegeName || '';
  if (college) {
    const input = document.getElementById(`member-college-${idx}`);
    if (input) input.value = college;
    state.teamDraft.members[idx].collegeName = college;
    showToast(`Copied: ${college}`, 'info');
  }
};

window.toggleMemberFood = function (idx, isChecked) {
  if (state.teamDraft.members[idx]) {
    state.teamDraft.members[idx].wantsFood = isChecked;
    updateCart();
  }
};

function updateMemberCounters() {
  const count = 1 + state.teamDraft.members.length;
  const additional = state.teamDraft.members.length;
  const remaining = 5 - count;
  const tierName = getTierName(count);
  const baseFee = calculateBaseFee(count);

  const addlCountEl = document.getElementById('additional-members-count');
  if (addlCountEl) addlCountEl.textContent = String(additional);

  const totalCountEl = document.getElementById('total-members-count');
  if (totalCountEl) totalCountEl.textContent = String(count);

  const ruleHintEl = document.getElementById('member-rule-hint');
  if (ruleHintEl) {
    ruleHintEl.textContent = `${tierName} Tier (${count} members) • Base Fee: ₹${baseFee}`;
  }

  const remainingEl = document.getElementById('slots-remaining');
  if (remainingEl) remainingEl.textContent = String(remaining);

  const addBtn = document.getElementById('btn-add-member');
  if (addBtn) addBtn.disabled = remaining <= 0;
}

function addMember() {
  if (state.teamDraft.members.length >= 4) {
    showToast('Maximum 5 squad members allowed (1 Leader + 4 Members).', 'warning');
    return;
  }

  saveMembersFromInputs();
  state.teamDraft.members.push({
    id: `mem_${Date.now()}`,
    fullName: '',
    collegeName: state.teamDraft.leader.collegeName || '',
    yearOfStudy: '2nd Year',
    degree: '',
    collegeEmail: '',
    phone: '',
    wantsFood: false
  });

  renderMembers();
  updateCart();
}

window.removeMember = function (idx) {
  if (state.teamDraft.members.length <= 1) {
    showToast('A squad must have at least 2 members (1 Leader + 1 Member).', 'warning');
    return;
  }

  saveMembersFromInputs();
  state.teamDraft.members.splice(idx, 1);
  renderMembers();
  updateCart();
};

function saveMembersFromInputs() {
  state.teamDraft.members.forEach((m, idx) => {
    const nameEl = document.getElementById(`member-name-${idx}`);
    const clgEl = document.getElementById(`member-college-${idx}`);
    const yrEl = document.getElementById(`member-year-${idx}`);
    const degEl = document.getElementById(`member-degree-${idx}`);
    const emEl = document.getElementById(`member-email-${idx}`);
    const phEl = document.getElementById(`member-phone-${idx}`);
    const foodEl = document.getElementById(`member-food-${idx}`);

    if (nameEl) m.fullName = nameEl.value.trim();
    if (clgEl) m.collegeName = clgEl.value.trim();
    if (yrEl) m.yearOfStudy = yrEl.value;
    if (degEl) m.degree = degEl.value.trim();
    if (emEl) m.collegeEmail = emEl.value.trim();
    if (phEl) m.phone = phEl.value.trim();
    if (foodEl) m.wantsFood = foodEl.checked;
  });
}

function handleStep2Next() {
  saveMembersFromInputs();

  // Validate every member
  for (let i = 0; i < state.teamDraft.members.length; i++) {
    const m = state.teamDraft.members[i];
    const mNum = i + 2;

    if (!m.fullName) {
      showToast(`Please enter Full Name for Member ${mNum}.`, 'warning');
      document.getElementById(`member-name-${i}`)?.focus();
      return;
    }
    if (!m.collegeName) {
      showToast(`Please enter College for Member ${mNum}.`, 'warning');
      document.getElementById(`member-college-${i}`)?.focus();
      return;
    }
    if (!m.degree) {
      showToast(`Please enter Degree & Branch for Member ${mNum}.`, 'warning');
      document.getElementById(`member-degree-${i}`)?.focus();
      return;
    }
    if (!m.collegeEmail || !m.collegeEmail.includes('@')) {
      showToast(`Please enter a valid Email for Member ${mNum}.`, 'warning');
      document.getElementById(`member-email-${i}`)?.focus();
      return;
    }
    if (!m.phone || m.phone.replace(/\D/g, '').length < 10) {
      showToast(`Please enter a 10-digit Phone Number for Member ${mNum}.`, 'warning');
      document.getElementById(`member-phone-${i}`)?.focus();
      return;
    }
  }

  updateCart();
  goToStep(3);
}

// ==========================================
// STEP 3: REVIEW & CART POPULATION
// ==========================================
function populateReviewStep() {
  const d = state.teamDraft;
  const count = 1 + d.members.length;

  document.getElementById('review-team-name').textContent = d.teamName;
  document.getElementById('review-team-referral').textContent = d.referral || 'None';
  document.getElementById('review-team-track').textContent = d.track;
  document.getElementById('review-roster-count').textContent = String(count);

  updateCart();
  populateReviewRoster();
}

function populateReviewRoster() {
  const tbody = document.getElementById('review-roster-tbody');
  if (!tbody) return;

  const d = state.teamDraft;
  const leader = d.leader;

  const rows = [
    `
      <tr>
        <td><strong class="text-amber">👑 Leader</strong></td>
        <td><strong>${escapeHtml(leader.fullName)}</strong></td>
        <td>${escapeHtml(leader.collegeName)}</td>
        <td>${escapeHtml(leader.yearOfStudy)} • ${escapeHtml(leader.degree)}</td>
        <td>${escapeHtml(leader.collegeEmail)}</td>
        <td>${escapeHtml(leader.phone)}</td>
        <td>${leader.wantsFood ? '<span class="badge-status-pill badge-food">🍽️ Included (+₹200)</span>' : '<span class="text-dim">No</span>'}</td>
      </tr>
    `
  ];

  d.members.forEach((m, idx) => {
    rows.push(`
      <tr>
        <td>Member ${idx + 2}</td>
        <td><strong>${escapeHtml(m.fullName)}</strong></td>
        <td>${escapeHtml(m.collegeName)}</td>
        <td>${escapeHtml(m.yearOfStudy)} • ${escapeHtml(m.degree)}</td>
        <td>${escapeHtml(m.collegeEmail)}</td>
        <td>${escapeHtml(m.phone)}</td>
        <td>${m.wantsFood ? '<span class="badge-status-pill badge-food">🍽️ Included (+₹200)</span>' : '<span class="text-dim">No</span>'}</td>
      </tr>
    `);
  });

  tbody.innerHTML = rows.join('');
}

// ==========================================
// REGISTRATION DRAFT SUBMISSION (Step 3 -> Step 4)
// ==========================================
async function handleConfirmAndPay() {
  const btn = document.getElementById('btn-confirm-and-pay');
  const d = state.teamDraft;

  btn.disabled = true;
  btn.innerHTML = 'Reserving Squad Slot...';

  try {
    const verificationToken = state.verificationToken || sessionStorage.getItem('codeverse_verification_token') || 'dev_local_token';

    const payload = {
      teamName: d.teamName,
      teamType: 'NON_VIT',
      referral: d.referral || '',
      verificationToken,
      track: d.track,
      projectTitle: d.projectTitle,
      hasFood: d.hasFood,
      foodCount: d.foodCount,
      foodAmount: d.foodAmount,
      totalFee: d.totalFee,
      members: [
        {
          fullName: d.leader.fullName,
          collegeName: d.leader.collegeName,
          yearOfStudy: d.leader.yearOfStudy,
          degree: d.leader.degree,
          collegeEmail: d.leader.collegeEmail,
          phone: d.leader.phone,
          wantsFood: d.leader.wantsFood,
          isLeader: true
        },
        ...d.members.map(m => ({
          fullName: m.fullName,
          collegeName: m.collegeName,
          yearOfStudy: m.yearOfStudy,
          degree: m.degree,
          collegeEmail: m.collegeEmail,
          phone: m.phone,
          wantsFood: m.wantsFood,
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
      throw new Error(data.error || 'Registration failed.');
    }

    state.registeredTeam = data.team;
    if (data.teamAuthToken) {
      state.teamAuthToken = data.teamAuthToken;
      try {
        sessionStorage.setItem('codeverse_team_auth_token', data.teamAuthToken);
      } catch (e) {}
    }

    const regId = data.team.registrationId;

    // Cache pending state in localStorage
    try {
      localStorage.setItem('codeverse_pending_registration', JSON.stringify({
        registrationId: regId,
        teamName: d.teamName,
        leaderEmail: d.leader.collegeEmail,
        memberCount: 1 + d.members.length,
        timestamp: Date.now()
      }));
    } catch (e) {}

    // Populate Step 4 display values
    const regIdDisplay = document.getElementById('payment-reg-id-display');
    if (regIdDisplay) regIdDisplay.textContent = regId;

    const remarkHint = document.getElementById('upi-team-remark-hint');
    if (remarkHint) remarkHint.textContent = `${d.teamName} (${regId})`;

    showToast(`Squad registered! ID: ${regId}`, 'success');
    goToStep(4);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `Proceed to Payment <span class="btn-arrow">→</span>`;
  }
}

// ==========================================
// STEP 4: DYNAMIC UPI QR CODE
// ==========================================
async function loadPaymentQrCode() {
  const qrImg = document.getElementById('upi-qr-image');
  const qrLoading = document.getElementById('qr-loading');
  const teamName = state.teamDraft.teamName;
  const regId = state.registeredTeam?.registrationId || '';
  const totalAmount = state.teamDraft.totalFee || 250;

  if (qrLoading) qrLoading.style.display = 'block';

  try {
    const query = new URLSearchParams({
      amount: String(totalAmount),
      teamName: `${teamName} ${regId}`.trim()
    });

    const res = await fetch(`/api/upi-qr?${query.toString()}`);
    const data = await res.json();

    if (data.success && data.qrDataUrl && qrImg) {
      qrImg.src = data.qrDataUrl;
      qrImg.style.display = 'block';
    }
  } catch (err) {
    console.warn('Dynamic QR fetch failed, using static fallback:', err);
    if (qrImg) {
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`upi://pay?pa=metaversevitb@indianbk&pn=Metaversity%20Club&am=${totalAmount}&cu=INR`)}`;
      qrImg.style.display = 'block';
    }
  } finally {
    if (qrLoading) qrLoading.style.display = 'none';
  }
}

// ==========================================
// STEP 5: FILE UPLOAD DROPZONE & UTR SUBMIT
// ==========================================
function setupDropzone() {
  const dropzone = document.getElementById('proof-dropzone');
  const fileInput = document.getElementById('proof-file-input');
  const emptyView = document.getElementById('dropzone-empty');
  const previewView = document.getElementById('dropzone-preview');
  const filenameEl = document.getElementById('preview-filename');
  const filesizeEl = document.getElementById('preview-filesize');
  const removeBtn = document.getElementById('btn-remove-file');

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', (e) => {
    if (e.target !== removeBtn) fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
      selectFile(fileInput.files[0]);
    }
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      selectFile(e.dataTransfer.files[0]);
    }
  });

  removeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    state.proofFile = null;
    fileInput.value = '';
    emptyView?.classList.remove('hidden');
    previewView?.classList.add('hidden');
  });

  function selectFile(file) {
    if (file.size > 5 * 1024 * 1024) {
      showToast('File size exceeds 5MB limit. Please upload a smaller image.', 'warning');
      return;
    }
    state.proofFile = file;
    if (filenameEl) filenameEl.textContent = file.name;
    if (filesizeEl) filesizeEl.textContent = `${(file.size / 1024).toFixed(1)} KB`;
    emptyView?.classList.add('hidden');
    previewView?.classList.remove('hidden');
  }
}

async function handlePaymentSubmit(e) {
  e.preventDefault();

  const utrInput = document.getElementById('pay-utr');
  const methodInput = document.getElementById('pay-method');
  const submitBtn = document.getElementById('btn-submit-payment');

  const utr = utrInput?.value.trim();
  const paymentMethod = methodInput?.value || 'UPI';
  const registrationId = state.registeredTeam?.registrationId;
  const totalFee = state.teamDraft.totalFee || 250;

  if (!registrationId) {
    showToast('Registration ID is missing. Please restart registration.', 'error');
    return;
  }

  if (!utr || utr.length < 6) {
    showToast('Please enter a valid Transaction ID / UTR Number (minimum 6 digits).', 'warning');
    utrInput?.focus();
    return;
  }

  if (!state.proofFile) {
    showToast('Payment screenshot proof is mandatory. Please upload your receipt.', 'warning');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = 'Submitting Payment Proof...';

  try {
    const formData = new FormData();
    formData.append('registrationId', registrationId);
    formData.append('paymentMethod', paymentMethod);
    formData.append('utrNumber', utr);
    formData.append('transactionDate', new Date().toISOString().split('T')[0]);
    formData.append('amountPaid', String(totalFee));
    formData.append('proofFile', state.proofFile);

    const res = await fetch('/api/payment/submit', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Payment submission failed.');
    }

    // Clear pending registration banner from local cache
    try {
      localStorage.removeItem('codeverse_pending_registration');
      const banner = document.getElementById('pending-reg-banner');
      if (banner) banner.style.display = 'none';
    } catch (e) {}

    // Populate Receipt in Step 6
    populateReceipt(data.team, utr, paymentMethod, totalFee);
    goToStep(6);
    try {
      sessionStorage.removeItem('codeverse_non_vit_reg_state');
      localStorage.removeItem('codeverse_pending_registration');
    } catch (e) {}
    showToast('🎉 Squad Registration & Payment Submitted!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Verify & Complete Registration 🚀';
  }
}

// ==========================================
// STEP 6: RECEIPT POPULATION
// ==========================================
function populateReceipt(team, utr, paymentMethod, amountPaid) {
  const d = state.teamDraft;
  const regId = team?.registrationId || state.registeredTeam?.registrationId;
  const squadSize = 1 + d.members.length;
  const foodCount = d.foodCount || 0;

  // On-screen Receipt
  document.getElementById('receipt-reg-id').textContent = regId;
  document.getElementById('receipt-team-name').textContent = d.teamName;
  document.getElementById('receipt-track').textContent = d.track;
  document.getElementById('receipt-leader-name').textContent = d.leader.fullName;
  document.getElementById('receipt-member-count').textContent = `${squadSize} Members`;
  document.getElementById('receipt-food-count').textContent = `${foodCount} Passes (${foodCount > 0 ? 'Day 1 Dinner' : 'No Food'})`;
  document.getElementById('receipt-utr').textContent = utr;
  document.getElementById('receipt-amount').textContent = `₹${amountPaid}`;

  // Printable Pass
  document.getElementById('print-reg-id').textContent = regId;
  document.getElementById('print-team-name').textContent = d.teamName;
  document.getElementById('print-track').textContent = d.track;
  document.getElementById('print-leader-name').textContent = d.leader.fullName;
  document.getElementById('print-squad-size').textContent = `${squadSize} Members`;
  document.getElementById('print-food-passes').textContent = `${foodCount} Passes`;
  document.getElementById('print-total-amount').textContent = `₹${amountPaid}`;
}

// ==========================================
// TRACK STATUS MODAL
// ==========================================
function openTrackModal() {
  document.getElementById('track-modal')?.classList.remove('hidden');
  document.getElementById('track-search-input')?.focus();
}

function closeTrackModal() {
  document.getElementById('track-modal')?.classList.add('hidden');
}

async function lookupTeamStatus() {
  const input = document.getElementById('track-search-input');
  const resultBox = document.getElementById('track-result-container');
  const regId = input?.value.trim().toUpperCase();

  if (!regId) {
    showToast('Please enter your Registration ID.', 'warning');
    return;
  }

  resultBox.innerHTML = '<div style="padding: 15px; text-align: center; color: var(--text-muted);">Looking up registration records...</div>';
  resultBox.classList.remove('hidden');

  try {
    const res = await fetch(`/api/registration/${encodeURIComponent(regId)}`);
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Team not found.');
    }

    const t = data.team;
    const isVerified = t.status === 'VERIFIED';
    const isPending = t.status === 'PENDING_VERIFICATION';

    let statusPill = `<span class="badge-status-pill ${t.status}">${t.status}</span>`;
    if (isVerified) {
      statusPill = `<span class="badge-status-pill VERIFIED">✓ Verified & Approved</span>`;
    } else if (isPending) {
      statusPill = `<span class="badge-status-pill PENDING_VERIFICATION">⏳ Payment Under Review</span>`;
    }

    resultBox.innerHTML = `
      <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border-glass); border-radius: 8px; padding: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 10px;">
          <div>
            <h4 style="margin: 0; color: #fff; font-size: 1.1rem;">${escapeHtml(t.teamName)}</h4>
            <span class="monospace" style="color: #38bdf8; font-size: 0.85rem;">${escapeHtml(t.registrationId)}</span>
          </div>
          <div>${statusPill}</div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.88rem;">
          <div><span style="color: var(--text-muted);">Category:</span> <strong class="text-cyan">${t.teamType === 'NON_VIT' ? '🌐 Non-VIT (Direct Entry)' : '🎓 VIT'}</strong></div>
          <div><span style="color: var(--text-muted);">Squad Size:</span> <strong>${t.memberCount} Members</strong></div>
          <div><span style="color: var(--text-muted);">Track:</span> <strong>${escapeHtml(t.track)}</strong></div>
          <div><span style="color: var(--text-muted);">Dinner Pass:</span> <strong>${t.hasFood ? `🍽️ Yes (${t.foodCount || 0})` : 'No'}</strong></div>
          <div><span style="color: var(--text-muted);">Leader:</span> <strong>${escapeHtml(t.leader?.fullName || '-')}</strong></div>
          <div><span style="color: var(--text-muted);">Fee:</span> <strong>₹${t.totalFee || t.payment?.amountPaid || 250}</strong></div>
        </div>
        ${isVerified ? `
          <div style="margin-top: 14px; padding: 10px; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px; color: #6ee7b7; font-size: 0.85rem;">
            ✓ Your squad is fully verified! Report directly to the offline registration desk at VIT Bhopal on March 27, 2026.
          </div>
        ` : ''}
      </div>
    `;
  } catch (err) {
    resultBox.innerHTML = `
      <div style="padding: 14px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; color: #fca5a5; font-size: 0.9rem;">
        ✕ ${escapeHtml(err.message)}
      </div>
    `;
  }
}

// ==========================================
// SESSION STATE AUTO-SAVE & RESTORE
// ==========================================
function saveSessionState() {
  if (state.currentStep === 6) return; // Do not save receipt

  // If currently on step 1 or 2, sync current inputs into state draft
  const teamNameEl = document.getElementById('team-name');
  if (teamNameEl) state.teamDraft.teamName = teamNameEl.value.trim();
  const refEl = document.getElementById('referral');
  if (refEl) state.teamDraft.referral = refEl.value.trim();
  const trackEl = document.getElementById('team-track');
  if (trackEl) state.teamDraft.track = trackEl.value;
  const projEl = document.getElementById('project-title');
  if (projEl) state.teamDraft.projectTitle = projEl.value.trim();

  const leadNameEl = document.getElementById('leader-name');
  if (leadNameEl) state.teamDraft.leader.fullName = leadNameEl.value.trim();
  const leadClgEl = document.getElementById('leader-college');
  if (leadClgEl) state.teamDraft.leader.collegeName = leadClgEl.value.trim();
  const leadYrEl = document.getElementById('leader-year');
  if (leadYrEl) state.teamDraft.leader.yearOfStudy = leadYrEl.value;
  const leadDegEl = document.getElementById('leader-degree');
  if (leadDegEl) state.teamDraft.leader.degree = leadDegEl.value.trim();
  const leadEmailEl = document.getElementById('leader-email');
  if (leadEmailEl) state.teamDraft.leader.collegeEmail = leadEmailEl.value.trim();
  const leadPhEl = document.getElementById('leader-phone');
  if (leadPhEl) state.teamDraft.leader.phone = leadPhEl.value.trim();
  const leadFoodEl = document.getElementById('leader-food-pass');
  if (leadFoodEl) state.teamDraft.leader.wantsFood = leadFoodEl.checked;

  if (state.currentStep === 2) {
    saveMembersFromInputs();
  }

  const sessionData = {
    currentStep: state.currentStep,
    instructionsAgreed: state.instructionsAgreed,
    otpVerified: state.isEmailVerified,
    verifiedEmail: state.verifiedEmail,
    verificationToken: state.verificationToken,
    registeredTeam: state.registeredTeam,
    teamAuthToken: state.teamAuthToken,
    teamDraft: state.teamDraft
  };

  try {
    sessionStorage.setItem('codeverse_non_vit_reg_state', JSON.stringify(sessionData));
  } catch (e) {}
}

function restoreSessionState() {
  const savedStr = sessionStorage.getItem('codeverse_non_vit_reg_state');
  if (!savedStr) return false;

  try {
    const data = JSON.parse(savedStr);
    if (!data) return false;

    // 1. Bypass instructions gate if user already agreed or progressed
    const instructionsGate = document.getElementById('instructions-gate');
    const registerWizard = document.getElementById('register-wizard-container');
    if (data.instructionsAgreed || (data.currentStep && data.currentStep > 1)) {
      state.instructionsAgreed = true;
      if (instructionsGate) instructionsGate.style.display = 'none';
      if (registerWizard) registerWizard.style.display = 'block';
    }

    // 2. Restore team draft object
    if (data.teamDraft) {
      state.teamDraft = Object.assign(state.teamDraft, data.teamDraft);
    }

    // 3. Restore Step 1 DOM inputs
    if (state.teamDraft.teamName) {
      const el = document.getElementById('team-name');
      if (el) el.value = state.teamDraft.teamName;
    }
    if (state.teamDraft.referral) {
      const el = document.getElementById('referral');
      if (el) el.value = state.teamDraft.referral;
    }
    if (state.teamDraft.track) {
      const el = document.getElementById('team-track');
      if (el) el.value = state.teamDraft.track;
    }
    if (state.teamDraft.projectTitle) {
      const el = document.getElementById('project-title');
      if (el) el.value = state.teamDraft.projectTitle;
    }

    const l = state.teamDraft.leader;
    if (l) {
      const n = document.getElementById('leader-name');
      if (n) n.value = l.fullName || '';
      const c = document.getElementById('leader-college');
      if (c) c.value = l.collegeName || '';
      const y = document.getElementById('leader-year');
      if (y && l.yearOfStudy) y.value = l.yearOfStudy;
      const d = document.getElementById('leader-degree');
      if (d) d.value = l.degree || '';
      const em = document.getElementById('leader-email');
      if (em) em.value = l.collegeEmail || '';
      const ph = document.getElementById('leader-phone');
      if (ph) ph.value = l.phone || '';
      const f = document.getElementById('leader-food-pass');
      if (f) f.checked = Boolean(l.wantsFood);

      // Step 2 Leader preview card
      const prevName = document.getElementById('leader-preview-name');
      if (prevName && l.fullName) prevName.textContent = l.fullName;
      const prevCollege = document.getElementById('leader-preview-college');
      if (prevCollege && l.collegeName) prevCollege.textContent = `College: ${l.collegeName}`;
      const prevEmail = document.getElementById('leader-preview-email');
      if (prevEmail && l.collegeEmail) prevEmail.textContent = `Email: ${l.collegeEmail}`;
      const prevPhone = document.getElementById('leader-preview-phone');
      if (prevPhone && l.phone) prevPhone.textContent = `Phone: ${l.phone}`;
      const prevFood = document.getElementById('leader-preview-food');
      if (prevFood) prevFood.textContent = l.wantsFood ? 'Dinner: Yes (+₹200)' : 'Dinner: No';
    }

    // 4. Restore OTP verification
    if (data.otpVerified) {
      state.isEmailVerified = true;
      state.verifiedEmail = data.verifiedEmail;
      state.verificationToken = data.verificationToken;

      const emailInput = document.getElementById('leader-email');
      const sendBtn = document.getElementById('btn-send-otp');
      const otpSection = document.getElementById('otp-section');
      const statusEl = document.getElementById('otp-status-msg');

      if (emailInput) emailInput.readOnly = true;
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.textContent = 'Verified ✓';
      }
      if (otpSection) otpSection.style.display = 'none';
      if (statusEl) {
        statusEl.innerHTML = '<span style="color: #10b981; font-weight: 600;">✓ Email Verified Successfully</span>';
      }
    }

    // 5. Restore Registered Team & Auth Token if draft was already confirmed
    if (data.registeredTeam) {
      state.registeredTeam = data.registeredTeam;
      state.teamAuthToken = data.teamAuthToken;
      const regId = data.registeredTeam.registrationId;
      const regIdDisplay = document.getElementById('payment-reg-id-display');
      if (regIdDisplay) regIdDisplay.textContent = regId;
      const remarkHint = document.getElementById('upi-team-remark-hint');
      if (remarkHint) remarkHint.textContent = `${state.teamDraft.teamName} (${regId})`;
    }

    // 6. Re-render dynamic members and cart
    renderMembers();
    updateCart();

    // 7. Stay on same step as refreshing!
    if (data.currentStep && data.currentStep >= 1 && data.currentStep <= 5) {
      goToStep(data.currentStep);
    }

    return true;
  } catch (err) {
    console.warn('Could not restore session state:', err);
    return false;
  }
}

// ==========================================
// RESUME INCOMPLETE REGISTRATION & MODAL
// ==========================================
function openResumeModal() {
  const modal = document.getElementById('resume-modal');
  const input = document.getElementById('resume-search-input');
  const errorMsg = document.getElementById('resume-error-msg');
  if (modal) modal.classList.remove('hidden');
  if (errorMsg) errorMsg.style.display = 'none';
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 60);
  }
}

function closeResumeModal() {
  document.getElementById('resume-modal')?.classList.add('hidden');
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
        showToast(data.error || 'Payment already submitted for this squad.', 'info');
        openTrackModal();
        const trackInput = document.getElementById('track-search-input');
        if (trackInput) trackInput.value = cleanId;
        lookupTeamStatus();
        closeResumeModal();
        return;
      }
      throw new Error(data.error || 'No pending registration found for this ID or Email.');
    }

    const team = data.team;
    state.registeredTeam = team;
    if (data.teamAuthToken) {
      state.teamAuthToken = data.teamAuthToken;
      try {
        sessionStorage.setItem('codeverse_team_auth_token', data.teamAuthToken);
      } catch (e) {}
    }

    // Sync squad draft
    state.teamDraft.teamName = team.teamName;
    state.teamDraft.track = team.track;
    state.teamDraft.projectTitle = team.projectTitle || '';
    state.teamDraft.referral = team.referral || '';
    state.teamDraft.totalFee = team.totalFee || team.fee || 250;
    state.teamDraft.hasFood = team.hasFood || false;
    state.teamDraft.foodCount = team.foodCount || 0;
    state.teamDraft.foodAmount = team.foodAmount || 0;

    if (team.leader) {
      state.teamDraft.leader = team.leader;
    } else if (team.members && team.members.length > 0) {
      const leaderMem = team.members.find(m => m.isLeader) || team.members[0];
      state.teamDraft.leader = {
        fullName: leaderMem.fullName || '',
        collegeName: leaderMem.collegeName || '',
        yearOfStudy: leaderMem.yearOfStudy || '2nd Year',
        degree: leaderMem.degree || '',
        collegeEmail: leaderMem.collegeEmail || '',
        phone: leaderMem.phone || '',
        wantsFood: leaderMem.wantsFood || false
      };
    }

    if (team.members) {
      state.teamDraft.members = team.members
        .filter(m => !m.isLeader)
        .map(m => ({
          id: m.id || `mem_${Math.random()}`,
          fullName: m.fullName || '',
          collegeName: m.collegeName || '',
          yearOfStudy: m.yearOfStudy || '2nd Year',
          degree: m.degree || '',
          collegeEmail: m.collegeEmail || '',
          phone: m.phone || '',
          wantsFood: m.wantsFood || false
        }));
    }

    // Populate payment step values
    const regIdDisplay = document.getElementById('payment-reg-id-display');
    if (regIdDisplay) regIdDisplay.textContent = team.registrationId;

    const remarkHint = document.getElementById('upi-team-remark-hint');
    if (remarkHint) remarkHint.textContent = `${team.teamName} (${team.registrationId})`;

    // Store in localStorage for pending banner
    try {
      localStorage.setItem('codeverse_pending_registration', JSON.stringify({
        registrationId: team.registrationId,
        teamName: team.teamName,
        leaderEmail: state.teamDraft.leader.collegeEmail,
        memberCount: team.memberCount,
        timestamp: Date.now()
      }));
    } catch (e) {}

    // Bypass instructions gate and open wizard directly to payment
    state.instructionsAgreed = true;
    const instructionsGate = document.getElementById('instructions-gate');
    const registerWizard = document.getElementById('register-wizard-container');
    if (instructionsGate) instructionsGate.style.display = 'none';
    if (registerWizard) registerWizard.style.display = 'block';

    closeResumeModal();
    goToStep(4);

    showToast(`Registration resumed! Welcome back, Squad ${team.teamName}. Please complete your payment below.`, 'success');
  } catch (err) {
    if (errorMsg) {
      errorMsg.textContent = err.message;
      errorMsg.style.display = 'block';
    }
    showToast(err.message, 'error');
  } finally {
    if (resumeBtn) {
      resumeBtn.disabled = false;
      resumeBtn.textContent = 'Find & Continue';
    }
  }
}

async function checkPendingRegistrationBanner() {
  try {
    const raw = localStorage.getItem('codeverse_pending_registration');
    if (!raw) return;
    const pending = JSON.parse(raw);
    if (!pending || !pending.registrationId) return;

    const res = await fetch(`/api/registration/resume/${encodeURIComponent(pending.registrationId)}`);
    const data = await res.json();
    if (data.success && data.team && data.team.status === 'PENDING_PAYMENT') {
      showPendingBanner(data.team.teamName, data.team.registrationId);
    } else {
      localStorage.removeItem('codeverse_pending_registration');
      const banner = document.getElementById('pending-reg-banner');
      if (banner) banner.style.display = 'none';
    }
  } catch (err) {
    console.warn('Error checking pending banner:', err);
  }
}

function showPendingBanner(teamName, regId) {
  const banner = document.getElementById('pending-reg-banner');
  const teamEl = document.getElementById('pending-banner-team-name') || document.getElementById('pending-banner-team');
  const idEl = document.getElementById('pending-banner-reg-id') || document.getElementById('pending-banner-id');

  if (banner && teamEl && idEl) {
    teamEl.textContent = teamName;
    idEl.textContent = regId;
    banner.style.display = 'block';
  }
}

// ==========================================
// UTILITY HELPERS
// ==========================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === 'success' ? '✓' : type === 'warning' ? '⚠️' : type === 'error' ? '✕' : 'ℹ️'}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function copyToClipboard(text, successMsg = 'Copied to clipboard!') {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMsg, 'success');
    }).catch(() => fallbackCopy(text, successMsg));
  } else {
    fallbackCopy(text, successMsg);
  }
}

function fallbackCopy(text, successMsg) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    showToast(successMsg, 'success');
  } catch (e) {
    showToast('Could not copy automatically.', 'warning');
  }
  document.body.removeChild(ta);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

