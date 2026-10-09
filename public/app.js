/**
 * CodeVerse Hackathon 2026 - Student Registration & Payment Controller
 * Manages 6-step registration wizard, member cards (4-6 members), validations, UPI/Bank copy tools, and receipts.
 */

// Application State
const state = {
  currentStep: 1,
  hackathonConfig: null,
  registeredTeam: null,
  teamDraft: {
    teamName: '',
    track: 'AI & Intelligent Systems',
    projectTitle: '',
    leader: {
      fullName: '',
      regNumber: '',
      collegeEmail: '',
      phone: ''
    },
    // Starts with 3 additional members to make 4 total (1 leader + 3 members)
    members: [
      { id: 'mem_1', fullName: '', regNumber: '', collegeEmail: '', phone: '' },
      { id: 'mem_2', fullName: '', regNumber: '', collegeEmail: '', phone: '' },
      { id: 'mem_3', fullName: '', regNumber: '', collegeEmail: '', phone: '' }
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

// DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
  initApp();
});

async function initApp() {
  await fetchConfig();
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
  formData.otpVerified = sendBtn && sendBtn.disabled && sendBtn.textContent.includes('Verified');

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
      while(state.teamDraft.members.length < formData.memberCount) {
        state.teamDraft.members.push({ id: `mem_${state.teamDraft.members.length + 1}`, fullName: '', regNumber: '', collegeEmail: '', phone: '' });
      }
      while(state.teamDraft.members.length > formData.memberCount) {
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
      const emailInput = document.getElementById('leader-email');
      const sendBtn = document.getElementById('btn-send-otp');
      const otpSection = document.getElementById('otp-section');
      
      if (emailInput) {
        emailInput.disabled = true;
        emailInput.classList.add('verified-input');
      }
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '✓ Verified';
        sendBtn.classList.add('btn-success');
      }
      if (otpSection) otpSection.classList.add('hidden');
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
  // Update Fee Displays
  const feeText = `${config.currencySymbol || '₹'}${config.registrationFee}`;
  const reviewFeeEl = document.getElementById('review-fee-amount');
  const upiFeeEl = document.getElementById('upi-fee-text');
  const upiAmountPill = document.getElementById('upi-amount-pill');
  const payAmountInput = document.getElementById('pay-amount');

  if (reviewFeeEl) reviewFeeEl.textContent = feeText;
  if (upiFeeEl) upiFeeEl.textContent = feeText;
  if (upiAmountPill) upiAmountPill.textContent = feeText;
  if (payAmountInput) payAmountInput.value = config.registrationFee;

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
          For any queries, contact: <strong style="color:var(--text-main);">+91 99563 61794</strong>
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

    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';

    try {
      const response = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await response.json();

      if (data.success) {
        showToast('OTP sent! Please check your email.', 'success');
        otpSection.style.display = 'block';
        otpHint.style.display = 'none';
        
        // Cooldown for resend
        let countdown = 60;
        const interval = setInterval(() => {
          countdown--;
          sendBtn.textContent = `Resend in ${countdown}s`;
          if (countdown <= 0) {
            clearInterval(interval);
            sendBtn.disabled = false;
            sendBtn.textContent = 'Resend OTP';
          }
        }, 1000);
      } else {
        showToast(data.error || 'Failed to send OTP.', 'error');
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send OTP';
      }
    } catch (err) {
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
        showToast('Email verified successfully!', 'success');
        
        // Update UI to show verified state
        otpSection.style.display = 'none';
        sendBtn.style.display = 'none';
        emailInput.readOnly = true;
        emailInput.style.backgroundColor = 'rgba(16, 185, 129, 0.1)'; // green tint
        emailInput.style.borderColor = 'rgba(16, 185, 129, 0.5)';
        
        otpHint.style.display = 'block';
        otpHint.innerHTML = '✅ Email verified successfully.';
        otpHint.style.color = '#10b981';
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

  // Reset verification if email changes (though we make it readonly after verification)
  emailInput.addEventListener('input', () => {
    isLeaderEmailVerified = false;
    otpSection.style.display = 'none';
    otpHint.style.display = 'block';
    otpHint.innerHTML = 'Official updates & receipt will be sent here. Email verification required.';
    otpHint.style.color = 'var(--text-muted)';
  });
}

/**
 * Event Bindings
 */
function bindEvents() {
  initOTPLogic();
  
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
  document.getElementById('btn-edit-add-member')?.addEventListener('click', addEditMemberCard);
  document.getElementById('btn-edit-remove-member')?.addEventListener('click', () => {
    if (editState.members.length > 3) {
      editState.members.pop();
      renderEditMembers();
    } else {
      showToast('A team must have at least 4 members (1 leader + 3 members).', 'warning');
    }
  });
  document.getElementById('form-edit-team')?.addEventListener('submit', handleSaveTeamEdit);

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
  const track = document.getElementById('team-track').value;
  const projectTitle = document.getElementById('project-title').value.trim();

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

  // Update State
  state.teamDraft.teamName = teamName;
  state.teamDraft.track = track;
  state.teamDraft.projectTitle = projectTitle;
  state.teamDraft.leader = {
    fullName: leaderName,
    regNumber: leaderReg,
    collegeEmail: leaderEmail,
    phone: leaderPhone
  };

  // Update Leader Preview in Step 2
  document.getElementById('leader-preview-name').textContent = leaderName;
  document.getElementById('leader-preview-reg').textContent = `Reg: ${leaderReg}`;
  document.getElementById('leader-preview-email').textContent = `Email: ${leaderEmail}`;
  document.getElementById('leader-preview-phone').textContent = `Phone: ${leaderPhone}`;

  goToStep(2);
}

/**
 * Step 2 Navigation & Dynamic Members Management
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

    // Can remove only if total members (1 leader + members.length) > 4
    const totalCount = 1 + state.teamDraft.members.length;
    const canRemove = totalCount > 4;

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
          <span class="input-hint" title="Minimum 4 members required">Mandatory (Min 4)</span>
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
    `;

    container.appendChild(card);
  });

  // Attach live input listeners to member inputs
  container.querySelectorAll('.member-field').forEach(input => {
    input.addEventListener('input', (e) => {
      const memberId = e.target.getAttribute('data-id');
      const key = e.target.getAttribute('data-key');
      const member = state.teamDraft.members.find(m => m.id === memberId);
      if (member) {
        member[key] = e.target.value.trim();
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
  if (totalCount >= 6) {
    showToast('Maximum team size is 6 members.', 'warning');
    return;
  }

  const newId = `mem_${Date.now()}`;
  state.teamDraft.members.push({
    id: newId,
    fullName: '',
    regNumber: '',
    collegeEmail: '',
    phone: ''
  });

  renderMembers();
  showToast(`Member ${totalCount + 1} added.`, 'info');
}

function removeMemberCard(memberId) {
  const totalCount = 1 + state.teamDraft.members.length;
  if (totalCount <= 4) {
    showToast('Minimum team size is 4 members. Cannot remove further.', 'warning');
    return;
  }

  state.teamDraft.members = state.teamDraft.members.filter(m => m.id !== memberId);
  renderMembers();
  showToast('Member removed.', 'info');
}

function updateMemberCounter() {
  const totalMembers = 1 + state.teamDraft.members.length; // 1 leader + 3 members = 4
  const addBtn = document.getElementById('btn-add-member');
  const countBadge = document.getElementById('member-count-badge');
  const totalCountEl = document.getElementById('total-members-count');
  const addCountEl = document.getElementById('additional-members-count');
  const slotsRemainingEl = document.getElementById('slots-remaining');
  const ruleHintEl = document.getElementById('member-rule-hint');

  if (totalCountEl) totalCountEl.textContent = '4';
  if (addCountEl) addCountEl.textContent = '3';
  if (slotsRemainingEl) slotsRemainingEl.textContent = '0';

  if (totalMembers === 4) {
    countBadge?.classList.add('valid');
    if (ruleHintEl) {
      ruleHintEl.textContent = '✓ Fixed Team Size: Exactly 4 Members (1 Leader + 3 Members)';
      ruleHintEl.classList.remove('invalid');
    }
  }

  if (addBtn) {
    addBtn.style.display = 'none'; // Fixed to 4 members
  }
}

function handleStep2Next() {
  const totalMembers = 1 + state.teamDraft.members.length;
  if (totalMembers !== 4) {
    showToast(`Team must have exactly 4 members (1 leader + 3 members). Current: ${totalMembers}.`, 'error');
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
 * Step 3: Populate Review Summary
 */
function populateReviewStep() {
  document.getElementById('review-team-name').textContent = state.teamDraft.teamName;
  document.getElementById('review-team-track').textContent = state.teamDraft.track;

  const totalMembers = 1 + state.teamDraft.members.length;
  document.getElementById('review-roster-count').textContent = totalMembers;

  const tbody = document.getElementById('review-roster-tbody');
  if (!tbody) return;

  const allMembers = [
    { ...state.teamDraft.leader, role: '👑 Team Leader' },
    ...state.teamDraft.members.map((m, idx) => ({ ...m, role: `Member ${idx + 2}` }))
  ];

  tbody.innerHTML = allMembers.map(m => `
    <tr>
      <td><strong>${m.role}</strong></td>
      <td>${escapeHtml(m.fullName)}</td>
      <td class="monospace">${escapeHtml(m.regNumber)}</td>
      <td>${escapeHtml(m.collegeEmail)}</td>
      <td class="monospace">${escapeHtml(m.phone)}</td>
    </tr>
  `).join('');

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
    const payload = {
      teamName: state.teamDraft.teamName,
      track: state.teamDraft.track,
      projectTitle: state.teamDraft.projectTitle,
      members: [
        {
          fullName: state.teamDraft.leader.fullName,
          regNumber: state.teamDraft.leader.regNumber,
          collegeEmail: state.teamDraft.leader.collegeEmail,
          phone: state.teamDraft.leader.phone,
          isLeader: true
        },
        ...state.teamDraft.members.map(m => ({
          fullName: m.fullName,
          regNumber: m.regNumber,
          collegeEmail: m.collegeEmail,
          phone: m.phone,
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
    const regId = data.team.registrationId;

    // Display Registration ID in Step 4
    const regIdDisplay = document.getElementById('payment-reg-id-display');
    if (regIdDisplay) regIdDisplay.textContent = regId;

    const remarkHint = document.getElementById('upi-team-remark-hint');
    if (remarkHint) remarkHint.textContent = `${state.teamDraft.teamName} (${regId})`;

    showToast(`Team draft saved! Registration ID: ${regId}`, 'success');
    goToStep(4);
  } catch (err) {
    showToast(err.message, 'error');
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

  // Scroll smoothly to wizard top
  document.getElementById('register')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

      <div style="margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid var(--border-subtle); display: flex; justify-content: flex-end;">
        <button type="button" class="btn btn-outline btn-sm" id="btn-track-jump-edit" style="gap: 0.4rem;">
          ✏️ Edit Team / Member Details
        </button>
      </div>
    `;

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
  const lookupBtn = document.getElementById('btn-lookup-edit');
  const form = document.getElementById('form-edit-team');
  const expiredBanner = document.getElementById('edit-deadline-expired-banner');
  const regId = input?.value.trim().toUpperCase();

  if (!regId) {
    showToast('Please enter your Registration ID (e.g. CV26-TM-12345)', 'warning');
    return;
  }

  if (lookupBtn) {
    lookupBtn.disabled = true;
    lookupBtn.textContent = 'Searching...';
  }

  try {
    const res = await fetch(`/api/team/edit-info/${encodeURIComponent(regId)}`);
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

    // Leader Details
    const leader = team.leader || (team.members && team.members.find(m => m.is_leader === true || m.isLeader === true)) || (team.members && team.members[0]) || {};
    document.getElementById('edit-leader-name').value = leader.full_name || leader.fullName || '';
    document.getElementById('edit-leader-reg').value = leader.reg_number || leader.regNumber || '';
    document.getElementById('edit-leader-email').value = leader.college_email || leader.collegeEmail || '';
    document.getElementById('edit-leader-phone').value = leader.phone || '';

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
      phone: m.phone || ''
    }));

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
  const totalCount = 1 + editState.members.length;

  editState.members.forEach((member, index) => {
    const memberNum = index + 2; // Member 1 is Team Leader
    const card = document.createElement('div');
    card.className = 'member-card';
    card.id = `edit-card-${member.id}`;

    const canRemove = totalCount > 4;

    card.innerHTML = `
      <div class="member-card-top">
        <div class="member-title-wrapper">
          <span class="member-idx">Member ${memberNum}</span>
        </div>
        ${canRemove ? `
          <button type="button" class="btn-remove-member btn-edit-remove-member" data-member-id="${member.id}">
            🗑️ Remove
          </button>
        ` : `
          <span class="input-hint" title="Minimum 4 members required">Mandatory (Min 4)</span>
        `}
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
    `;

    container.appendChild(card);
  });

  // Attach live input listeners to edit member inputs
  container.querySelectorAll('.edit-member-field').forEach(input => {
    input.addEventListener('input', (e) => {
      const memberId = e.target.getAttribute('data-id');
      const key = e.target.getAttribute('data-key');
      const member = editState.members.find(m => m.id === memberId);
      if (member) {
        member[key] = e.target.value;
      }
    });
  });

  // Attach remove button listeners
  container.querySelectorAll('.btn-edit-remove-member').forEach(btn => {
    btn.addEventListener('click', () => {
      const memberId = btn.getAttribute('data-member-id');
      removeEditMemberCard(memberId);
    });
  });

  // Update remaining slots and button state
  const slotsRemaining = 6 - totalCount;
  const slotsEl = document.getElementById('edit-slots-remaining');
  if (slotsEl) slotsEl.textContent = Math.max(0, slotsRemaining);

  const addBtn = document.getElementById('btn-edit-add-member');
  if (addBtn) {
    addBtn.disabled = totalCount >= 6;
  }
}

function addEditMemberCard() {
  const totalCount = 1 + editState.members.length;
  if (totalCount >= 6) {
    showToast('Maximum team size is 6 members.', 'warning');
    return;
  }

  const newId = `edit_mem_${Date.now()}`;
  editState.members.push({
    id: newId,
    fullName: '',
    regNumber: '',
    collegeEmail: '',
    phone: ''
  });

  renderEditMembers();
  showToast(`Member ${totalCount + 1} added to edit roster.`, 'info');
}

function removeEditMemberCard(memberId) {
  const totalCount = 1 + editState.members.length;
  if (totalCount <= 4) {
    showToast('Minimum team size is 4 members. Cannot remove further.', 'warning');
    return;
  }

  editState.members = editState.members.filter(m => m.id !== memberId);
  renderEditMembers();
  showToast('Member removed from roster.', 'info');
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

  // 2. Validate member count
  const totalMembersCount = 1 + editState.members.length;
  if (totalMembersCount !== 4) {
    showToast(`Team must have exactly 4 members (1 Leader + 3 Members). Currently ${totalMembersCount}.`, 'warning');
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

    emailSet.add(cleanEmail);
    regSet.add(cleanReg);

    formattedMembers.push({
      fullName: mem.fullName,
      regNumber: cleanReg,
      collegeEmail: cleanEmail,
      phone: cleanPhone,
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
        teamName,
        track,
        projectTitle,
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
      // Random copper / warm orange / soft gold hue
      const colors = ['#ff5500', '#ff8534', '#ffa94d', '#ffb703', '#ffffff'];
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
      ctx.shadowColor = '#ff6b2b';
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
          ctx.strokeStyle = '#ff6b2b';
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
