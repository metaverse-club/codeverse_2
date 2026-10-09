/**
 * CodeVerse Hackathon 2026 - Organizer Admin Dashboard Controller
 * Enforces Metaversity_Admin authentication barrier, loads only fully submitted teams with proof,
 * manages UTR verification, roster inspection modal, proof lightbox, and Excel downloads.
 */

let allTeams = [];
let selectedTeam = null;
const TOKEN_KEY = 'cv_admin_auth_token';

document.addEventListener('DOMContentLoaded', () => {
  initAdminAuthFlow();
});

/**
 * Initialize Authentication State
 */
async function initAdminAuthFlow() {
  bindAuthEvents();

  const token = getAuthToken();
  if (!token) {
    showLoginScreen();
    return;
  }

  // Verify stored token with backend
  try {
    const res = await fetch('/api/admin/check-auth', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (res.ok && data.success && data.authenticated) {
      showDashboardScreen(data.username || 'Metaversity_Admin');
      await Promise.all([loadMetrics(), loadTeams(), loadDeadlineSettings(), loadRegistrationDeadlineSettings()]);
      bindDashboardEvents();
    } else {
      clearAuthToken();
      showLoginScreen();
    }
  } catch (err) {
    clearAuthToken();
    showLoginScreen();
  }
}

function getAuthToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

function setAuthToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(TOKEN_KEY, token);
}

function clearAuthToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

function showLoginScreen() {
  document.getElementById('admin-login-screen')?.classList.remove('hidden');
  document.getElementById('admin-dashboard-screen')?.classList.add('hidden');
  document.getElementById('nav-auth-controls')?.classList.add('hidden');
}

function showDashboardScreen(username = 'Metaversity_Admin') {
  document.getElementById('admin-login-screen')?.classList.add('hidden');
  document.getElementById('admin-dashboard-screen')?.classList.remove('hidden');
  document.getElementById('nav-auth-controls')?.classList.remove('hidden');

  const userEl = document.getElementById('nav-user-display');
  if (userEl) userEl.textContent = username;
}

/**
 * Authentication Events
 */
function bindAuthEvents() {
  // Login form submit
  const loginForm = document.getElementById('admin-login-form');
  const alertBox = document.getElementById('login-error-alert');
  const passInput = document.getElementById('admin-login-pass');
  const togglePassBtn = document.getElementById('btn-toggle-pass');

  togglePassBtn?.addEventListener('click', () => {
    if (passInput) {
      const isPass = passInput.type === 'password';
      passInput.type = isPass ? 'text' : 'password';
      togglePassBtn.textContent = isPass ? '🙈' : '👁️';
    }
  });

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (alertBox) alertBox.classList.add('hidden');

    const username = document.getElementById('admin-login-user')?.value.trim();
    const password = document.getElementById('admin-login-pass')?.value;
    const submitBtn = document.getElementById('btn-submit-login');

    if (!username || !password) {
      if (alertBox) {
        alertBox.textContent = 'Please enter both username and password.';
        alertBox.classList.remove('hidden');
      }
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Verifying Credentials...';

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Authentication failed. Please verify credentials.');
      }

      setAuthToken(data.token);
      showDashboardScreen(data.username);
      showToast(`Welcome back, ${data.username}!`, 'success');

      await Promise.all([loadMetrics(), loadTeams(), loadDeadlineSettings(), loadRegistrationDeadlineSettings()]);
      bindDashboardEvents();
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = `❌ ${err.message}`;
        alertBox.classList.remove('hidden');
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `Sign In to Admin Console <span class="btn-arrow">→</span>`;
    }
  });

  // Logout button -> redirects directly to landing page
  document.getElementById('btn-admin-logout')?.addEventListener('click', async () => {
    const token = getAuthToken();
    if (token) {
      try {
        await fetch('/api/admin/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (e) {
        // Ignored
      }
      clearAuthToken();
    }
    window.location.href = 'index.html';
  });

  // Student Portal link -> logs out admin session and redirects to landing page
  document.getElementById('link-student-portal')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const token = getAuthToken();
    if (token) {
      try {
        await fetch('/api/admin/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (e) {
        // Ignored
      }
      clearAuthToken();
    }
    window.location.href = 'index.html';
  });
}

/**
 * Dashboard Event Handlers
 */
let dashboardBound = false;
function bindDashboardEvents() {
  if (dashboardBound) return;
  dashboardBound = true;

  // Search & Filter
  const searchInput = document.getElementById('admin-search-input');
  const filterSelect = document.getElementById('admin-filter-status');

  let debounceTimer;
  searchInput?.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(loadTeams, 250);
  });

  filterSelect?.addEventListener('change', loadTeams);

  // Refresh
  document.getElementById('btn-refresh-data')?.addEventListener('click', async () => {
    await Promise.all([loadMetrics(), loadTeams(), loadDeadlineSettings(), loadRegistrationDeadlineSettings()]);
    showToast('Dashboard refreshed with latest data.', 'info');
  });

  // Export Excel (.xlsx) with auth token
  document.getElementById('btn-export-excel')?.addEventListener('click', () => {
    const token = getAuthToken();
    if (!token) {
      showLoginScreen();
      return;
    }
    window.location.href = `/api/admin/export?token=${encodeURIComponent(token)}`;
  });

  // Deadline Setting Handlers
  document.getElementById('btn-save-deadline')?.addEventListener('click', saveDeadlineSettings);
  document.getElementById('btn-clear-deadline')?.addEventListener('click', clearDeadlineSettings);
  
  document.getElementById('btn-save-reg-deadline')?.addEventListener('click', saveRegistrationDeadlineSettings);
  document.getElementById('btn-clear-reg-deadline')?.addEventListener('click', clearRegistrationDeadlineSettings);

  // Modal Closures & Back buttons
  document.getElementById('modal-detail-close')?.addEventListener('click', closeDetailModal);
  document.getElementById('btn-modal-header-back')?.addEventListener('click', closeDetailModal);
  document.getElementById('btn-modal-back')?.addEventListener('click', closeDetailModal);
  document.getElementById('lightbox-close')?.addEventListener('click', closeLightbox);

  // Edit Modal Closures
  document.getElementById('btn-admin-edit-close')?.addEventListener('click', closeAdminEditModal);
  document.getElementById('btn-admin-edit-cancel')?.addEventListener('click', closeAdminEditModal);
  document.getElementById('btn-admin-edit-cancel-bottom')?.addEventListener('click', closeAdminEditModal);

  // Click-away to close modals
  document.getElementById('team-detail-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'team-detail-modal') closeDetailModal();
  });

  document.getElementById('admin-edit-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'admin-edit-modal') closeAdminEditModal();
  });

  document.getElementById('lightbox-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'lightbox-modal') closeLightbox();
  });

  // ESC key to close any open modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDetailModal();
      closeAdminEditModal();
      closeLightbox();
    }
  });

  // Verification Decision Buttons
  document.getElementById('btn-action-verify')?.addEventListener('click', () => submitVerificationDecision('VERIFIED'));
  document.getElementById('btn-action-reject')?.addEventListener('click', () => submitVerificationDecision('REJECTED'));
  document.getElementById('btn-action-pending')?.addEventListener('click', () => submitVerificationDecision('PENDING_VERIFICATION'));

  // Action Bar Edit & Delete
  document.getElementById('btn-action-open-edit')?.addEventListener('click', () => {
    if (selectedTeam) {
      closeDetailModal();
      openAdminEditModal(selectedTeam);
    }
  });

  document.getElementById('btn-action-delete-team')?.addEventListener('click', () => {
    if (selectedTeam) {
      confirmDeleteTeam(selectedTeam.registrationId, selectedTeam.teamName);
    }
  });

  // Admin Edit Form Submit
  document.getElementById('admin-edit-form')?.addEventListener('submit', handleAdminEditSubmit);
}

// ==========================================
// REGISTRATION DEADLINE LOGIC
// ==========================================

async function loadRegistrationDeadlineSettings() {
  try {
    const res = await authFetch('/api/admin/settings/registration-deadline');
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to load registration deadline settings.');
    }

    const input = document.getElementById('admin-reg-deadline-input');
    const displayEl = document.getElementById('current-reg-deadline-display');
    const pill = document.getElementById('reg-deadline-status-pill');
    const statusTextEl = document.getElementById('reg-deadline-status-text');

    if (data.deadline) {
      if (input) input.value = formatToDatetimeLocal(data.deadline);
      const formatted = new Date(data.deadline).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium',
        timeStyle: 'short'
      });

      if (displayEl) displayEl.innerHTML = `<strong style="color:var(--text-main)">${formatted}</strong>`;

      if (data.isPassed) {
        if (pill) {
          pill.className = 'badge-deadline expired';
          statusTextEl.textContent = 'Registrations: Closed (Deadline Passed)';
        }
      } else {
        if (pill) {
          pill.className = 'badge-deadline open';
          statusTextEl.textContent = 'Registrations: Open (Active)';
        }
      }
    } else {
      if (input) input.value = '';
      if (displayEl) {
        displayEl.innerHTML = `<strong>No deadline set</strong> (Registrations are open indefinitely)`;
      }
      if (pill) {
        pill.className = 'badge-deadline open';
        statusTextEl.textContent = 'Registrations: Open (No Deadline)';
      }
    }
  } catch (err) {
    console.error('Failed to load registration deadline settings:', err);
    showToast('Failed to load registration deadline setting.', 'error');
  }
}

async function saveRegistrationDeadlineSettings() {
  const input = document.getElementById('admin-reg-deadline-input');
  const val = input?.value;

  if (!val) {
    showToast('Please select a date and time to set a registration deadline.', 'warning');
    return;
  }

  const isoDeadline = new Date(val).toISOString();
  const saveBtn = document.getElementById('btn-save-reg-deadline');

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '💾 Saving...';
  }

  try {
    const res = await authFetch('/api/admin/settings/registration-deadline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deadline: isoDeadline })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to save registration deadline.');
    }

    showToast('✅ Registration deadline updated successfully!', 'success');
    await loadRegistrationDeadlineSettings();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '💾 Save Deadline';
    }
  }
}

async function clearRegistrationDeadlineSettings() {
  const clearBtn = document.getElementById('btn-clear-reg-deadline');
  const input = document.getElementById('admin-reg-deadline-input');

  if (clearBtn) {
    clearBtn.disabled = true;
    clearBtn.innerHTML = '🔓 Clearing...';
  }

  try {
    const res = await authFetch('/api/admin/settings/registration-deadline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deadline: null })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to clear registration deadline.');
    }

    if (input) input.value = '';
    showToast('🔓 Registration deadline removed. Registrations are now open indefinitely.', 'info');
    await loadRegistrationDeadlineSettings();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (clearBtn) {
      clearBtn.disabled = false;
      clearBtn.innerHTML = '🔓 Open Indefinitely';
    }
  }
}

// ==========================================
// EDIT DEADLINE LOGIC
// ==========================================

/**
 * Load Deadline Configuration
 */
async function loadDeadlineSettings() {
  try {
    const res = await authFetch('/api/admin/settings');
    const data = await res.json();

    if (!res.ok || !data.success) return;

    const input = document.getElementById('admin-deadline-input');
    const displayEl = document.getElementById('current-deadline-display');
    const pill = document.getElementById('deadline-status-pill');
    const statusTextEl = document.getElementById('deadline-status-text');

    if (data.deadline) {
      if (input) input.value = formatToDatetimeLocal(data.deadline);
      const formatted = new Date(data.deadline).toLocaleString('en-IN', {
        dateStyle: 'full',
        timeStyle: 'short'
      });

      if (displayEl) {
        displayEl.innerHTML = `Active until <strong>${formatted}</strong> (${data.isPassed ? '<span class="text-rose font-bold">Closed / Expired</span>' : '<span class="text-emerald font-bold">Open for Submissions</span>'})`;
      }

      if (pill && statusTextEl) {
        if (data.isPassed) {
          pill.className = 'badge-deadline expired';
          statusTextEl.textContent = 'Edit Window: Closed (Expired)';
        } else {
          pill.className = 'badge-deadline open';
          statusTextEl.textContent = 'Edit Window: Open';
        }
      }
    } else {
      if (input) input.value = '';
      if (displayEl) {
        displayEl.innerHTML = `<strong>No deadline set</strong> (Students can edit indefinitely)`;
      }
      if (pill && statusTextEl) {
        pill.className = 'badge-deadline open';
        statusTextEl.textContent = 'Edit Window: Open (No Deadline)';
      }
    }
  } catch (err) {
    console.error('Failed to load deadline settings:', err);
  }
}

/**
 * Save Deadline Setting
 */
async function saveDeadlineSettings() {
  const input = document.getElementById('admin-deadline-input');
  const val = input?.value;

  if (!val) {
    showToast('Please select a date and time to set a deadline.', 'warning');
    return;
  }

  const isoDeadline = new Date(val).toISOString();
  const saveBtn = document.getElementById('btn-save-deadline');

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
  }

  try {
    const res = await authFetch('/api/admin/settings/deadline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deadline: isoDeadline })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to save deadline.');
    }

    showToast('✅ Edit deadline updated successfully!', 'success');
    await loadDeadlineSettings();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '💾 Save Deadline';
    }
  }
}

/**
 * Clear Deadline Setting (Open Indefinitely)
 */
async function clearDeadlineSettings() {
  const clearBtn = document.getElementById('btn-clear-deadline');

  if (clearBtn) {
    clearBtn.disabled = true;
    clearBtn.textContent = 'Opening...';
  }

  try {
    const res = await authFetch('/api/admin/settings/deadline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deadline: null })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to clear deadline.');
    }

    showToast('🔓 Edit deadline removed. Edits are now open indefinitely.', 'info');
    await loadDeadlineSettings();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (clearBtn) {
      clearBtn.disabled = false;
      clearBtn.innerHTML = '🔓 Open Indefinitely';
    }
  }
}

function formatToDatetimeLocal(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Authenticated Fetch Helper
 */
async function authFetch(url, options = {}) {
  const token = getAuthToken();
  if (!token) {
    showLoginScreen();
    throw new Error('Not authenticated');
  }

  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`
  };

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    clearAuthToken();
    showLoginScreen();
    showToast('Session expired. Please log in again.', 'warning');
    throw new Error('Session expired');
  }
  return res;
}

/**
 * Fetch and Render Metrics
 */
async function loadMetrics() {
  try {
    const res = await authFetch('/api/admin/metrics');
    const data = await res.json();
    if (data.success) {
      const m = data.metrics;
      document.getElementById('stat-total-teams').textContent = m.totalTeams;
      document.getElementById('stat-pending-verification').textContent = m.pendingVerification;
      document.getElementById('stat-verified-teams').textContent = m.verifiedTeams;
      document.getElementById('stat-rejected-teams').textContent = m.rejected;
      document.getElementById('stat-total-revenue').textContent = `₹${m.totalRevenue.toLocaleString('en-IN')}`;
    }
  } catch (err) {
    console.error('Failed to load metrics:', err);
  }
}

/**
 * Fetch and Render Teams Table (Only fully completed submissions with proof)
 */
async function loadTeams() {
  const tbody = document.getElementById('admin-table-body');
  const search = document.getElementById('admin-search-input')?.value.trim() || '';
  const status = document.getElementById('admin-filter-status')?.value || 'ALL';

  try {
    const query = new URLSearchParams({ search, status });
    const res = await authFetch(`/api/admin/teams?${query.toString()}`);
    const data = await res.json();

    if (!data.success) throw new Error(data.error);

    allTeams = data.teams;
    renderTeamsTable(data.teams);
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-rose py-4">
            Error loading teams: ${escapeHtml(err.message)}
          </td>
        </tr>
      `;
    }
  }
}

/**
 * Render Teams Table with Inspect, Quick Verify, Edit, and Delete actions
 */
function renderTeamsTable(teams) {
  const tbody = document.getElementById('admin-table-body');
  if (!tbody) return;

  if (teams.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center text-muted py-5">
          <div style="font-size: 1.1rem; margin-bottom: 0.35rem;">No fully submitted teams found.</div>
          <span style="font-size: 0.85rem; color: var(--text-dim);">
            Only teams who have completely submitted the form along with payment details and screenshot proof appear here.
          </span>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = teams.map(team => {
    const leader = team.leader || {};
    const payment = team.payment || {};
    const status = team.status;

    let statusBadgeText = status;
    if (status === 'PENDING_VERIFICATION') statusBadgeText = 'Pending Verification';
    if (status === 'VERIFIED') statusBadgeText = 'Verified';
    if (status === 'REJECTED') statusBadgeText = 'Rejected';

    return `
      <tr>
        <td class="monospace font-bold">
          <a href="#" class="team-inspect-link" data-id="${team.id}">${escapeHtml(team.registrationId)}</a>
        </td>
        <td>
          <span class="table-team-name">${escapeHtml(team.teamName)}</span>
          <span class="table-team-track">${escapeHtml(team.track)}</span>
        </td>
        <td>
          <span class="table-contact-name">${escapeHtml(leader.fullName || 'N/A')}</span>
          <span class="table-contact-sub">${escapeHtml(leader.collegeEmail || '')} • ${escapeHtml(leader.phone || '')}</span>
        </td>
        <td>
          <span class="badge-status-pill">${team.memberCount} Members</span>
        </td>
        <td>
          <span class="font-bold">${escapeHtml(payment.paymentMethod)} (₹${payment.amountPaid || 400})</span>
          <div class="table-contact-sub monospace">UTR: ${escapeHtml(payment.utrNumber)}</div>
        </td>
        <td>
          ${payment.proofFilePath ? `
            <button type="button" class="proof-btn-thumb" data-proof-url="${payment.proofFilePath}">
              📷 View Screenshot
            </button>
          ` : `
            <span class="text-dim text-xs">—</span>
          `}
        </td>
        <td>
          <span class="badge-status-pill ${status}">${statusBadgeText}</span>
        </td>
        <td>
          <div class="table-actions-cell">
            <button type="button" class="btn btn-secondary btn-sm btn-inspect-team" data-id="${team.id}" title="Inspect full roster & verification details">
              Inspect
            </button>
            <button type="button" class="btn btn-sm btn-table-edit btn-edit-team-row" data-id="${team.id}" title="Edit team, member, and payment data">
              ✏️ Edit
            </button>
            ${status === 'PENDING_VERIFICATION' ? `
              <button type="button" class="btn btn-success btn-sm btn-quick-verify" data-reg="${team.registrationId}" title="Quick verify">
                ✓
              </button>
            ` : ''}
            <button type="button" class="btn btn-sm btn-table-delete btn-delete-team-row" data-id="${team.id}" data-reg="${team.registrationId}" data-name="${escapeHtml(team.teamName)}" title="Permanently delete registration">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Attach inspection handlers
  tbody.querySelectorAll('.btn-inspect-team, .team-inspect-link').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const teamId = btn.getAttribute('data-id');
      const team = allTeams.find(t => t.id === teamId);
      if (team) openDetailModal(team);
    });
  });

  // Attach edit row handlers
  tbody.querySelectorAll('.btn-edit-team-row').forEach(btn => {
    btn.addEventListener('click', () => {
      const teamId = btn.getAttribute('data-id');
      const team = allTeams.find(t => t.id === teamId);
      if (team) openAdminEditModal(team);
    });
  });

  // Attach quick verify handlers
  tbody.querySelectorAll('.btn-quick-verify').forEach(btn => {
    btn.addEventListener('click', () => {
      const regId = btn.getAttribute('data-reg');
      quickVerifyTeam(regId);
    });
  });

  // Attach delete row handlers
  tbody.querySelectorAll('.btn-delete-team-row').forEach(btn => {
    btn.addEventListener('click', () => {
      const regId = btn.getAttribute('data-reg');
      const name = btn.getAttribute('data-name');
      confirmDeleteTeam(regId, name);
    });
  });

  // Attach proof thumbnail lightbox handlers
  tbody.querySelectorAll('.proof-btn-thumb').forEach(btn => {
    btn.addEventListener('click', () => {
      const proofUrl = btn.getAttribute('data-proof-url');
      openLightbox(proofUrl);
    });
  });
}

/**
 * Quick Verify Team from Table
 */
async function quickVerifyTeam(registrationId) {
  try {
    const res = await authFetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrationId,
        status: 'VERIFIED',
        adminNotes: 'Quick-approved by Metaversity_Admin'
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    showToast(`Team ${registrationId} verified successfully!`, 'success');
    await Promise.all([loadMetrics(), loadTeams()]);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Delete Team Permanently (With Confirmation)
 */
async function confirmDeleteTeam(registrationId, teamName) {
  const confirmed = confirm(
    `⚠️ Are you sure you want to PERMANENTLY DELETE team "${teamName}" (${registrationId})?\n\n` +
    `• All 4 member details will be erased.\n` +
    `• Associated payment & proof records will be removed.\n` +
    `• This action is irreversible.`
  );

  if (!confirmed) return;

  try {
    const res = await authFetch(`/api/admin/teams/${encodeURIComponent(registrationId)}/delete`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to delete team.');
    }

    showToast(`🗑️ Team "${teamName}" (${registrationId}) permanently deleted.`, 'success');
    closeDetailModal();
    closeAdminEditModal();
    await Promise.all([loadMetrics(), loadTeams()]);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Open Detailed Team Inspection Modal
 */
function openDetailModal(team) {
  selectedTeam = team;
  const modal = document.getElementById('team-detail-modal');

  document.getElementById('modal-team-title').textContent = team.teamName;
  document.getElementById('modal-team-reg-id').textContent = team.registrationId;
  document.getElementById('modal-track-val').textContent = team.track;
  document.getElementById('modal-project-val').textContent = team.projectTitle || 'Not specified';
  document.getElementById('modal-created-val').textContent = new Date(team.createdAt).toLocaleString('en-IN');

  // Populate Roster Table
  const rosterTbody = document.getElementById('modal-roster-tbody');
  rosterTbody.innerHTML = (team.members || []).map(m => `
    <tr>
      <td>${m.isLeader ? '<strong class="text-amber">👑 Leader</strong>' : 'Member'}</td>
      <td><strong>${escapeHtml(m.fullName)}</strong></td>
      <td class="monospace">${escapeHtml(m.regNumber)}</td>
      <td>
        <a href="mailto:${escapeHtml(m.collegeEmail)}">${escapeHtml(m.collegeEmail)}</a>
      </td>
      <td class="monospace">
        <a href="tel:${escapeHtml(m.phone)}">${escapeHtml(m.phone)}</a>
      </td>
    </tr>
  `).join('');

  // Payment Details
  const p = team.payment;
  const proofContainer = document.getElementById('modal-proof-container');

  if (p) {
    document.getElementById('modal-pay-method').textContent = p.paymentMethod || 'UPI';
    document.getElementById('modal-pay-utr').textContent = p.utrNumber || 'N/A';
    document.getElementById('modal-pay-amount').textContent = `₹${p.amountPaid || 400}`;
    document.getElementById('modal-pay-date').textContent = p.transactionDate || '-';
    document.getElementById('modal-pay-submitted').textContent = p.submittedAt ? new Date(p.submittedAt).toLocaleString('en-IN') : '-';
    document.getElementById('modal-pay-notes').textContent = p.adminNotes || 'None';

    if (p.proofFilePath) {
      proofContainer.innerHTML = `
        <img src="${p.proofFilePath}" alt="Payment Proof" class="proof-thumbnail-img" title="Click to enlarge">
      `;
      proofContainer.querySelector('img').addEventListener('click', () => {
        openLightbox(p.proofFilePath);
      });
    } else {
      proofContainer.innerHTML = `<span class="text-muted text-xs">No screenshot uploaded</span>`;
    }
  }

  // Set existing admin notes
  const notesInput = document.getElementById('admin-action-notes');
  if (notesInput) {
    notesInput.value = p?.adminNotes || '';
  }

  modal.classList.remove('hidden');
}

function closeDetailModal() {
  document.getElementById('team-detail-modal')?.classList.add('hidden');
  selectedTeam = null;
}

/**
 * Open Admin Full Data Edit Modal
 */
let editingTeam = null;
function openAdminEditModal(team) {
  editingTeam = team;
  const modal = document.getElementById('admin-edit-modal');
  if (!modal) return;

  document.getElementById('edit-modal-team-title').textContent = team.teamName;
  document.getElementById('edit-modal-reg-id').textContent = team.registrationId;

  // Set team & track
  document.getElementById('edit-team-name').value = team.teamName || '';
  document.getElementById('edit-team-track').value = team.track || 'AI & Intelligent Systems';
  document.getElementById('edit-team-status').value = team.status || 'PENDING_VERIFICATION';
  document.getElementById('edit-project-title').value = team.projectTitle || '';

  // Set members (4 members)
  const members = team.members || [];
  const m1 = members.find(m => m.isLeader) || members[0] || {};
  const nonLeaders = members.filter(m => !m.isLeader);
  const m2 = nonLeaders[0] || members[1] || {};
  const m3 = nonLeaders[1] || members[2] || {};
  const m4 = nonLeaders[2] || members[3] || {};

  document.getElementById('edit-m1-name').value = m1.fullName || '';
  document.getElementById('edit-m1-reg').value = m1.regNumber || '';
  document.getElementById('edit-m1-email').value = m1.collegeEmail || '';
  document.getElementById('edit-m1-phone').value = m1.phone || '';

  document.getElementById('edit-m2-name').value = m2.fullName || '';
  document.getElementById('edit-m2-reg').value = m2.regNumber || '';
  document.getElementById('edit-m2-email').value = m2.collegeEmail || '';
  document.getElementById('edit-m2-phone').value = m2.phone || '';

  document.getElementById('edit-m3-name').value = m3.fullName || '';
  document.getElementById('edit-m3-reg').value = m3.regNumber || '';
  document.getElementById('edit-m3-email').value = m3.collegeEmail || '';
  document.getElementById('edit-m3-phone').value = m3.phone || '';

  document.getElementById('edit-m4-name').value = m4.fullName || '';
  document.getElementById('edit-m4-reg').value = m4.regNumber || '';
  document.getElementById('edit-m4-email').value = m4.collegeEmail || '';
  document.getElementById('edit-m4-phone').value = m4.phone || '';

  // Set payment
  const p = team.payment || {};
  document.getElementById('edit-pay-utr').value = p.utrNumber || '';
  document.getElementById('edit-pay-amount').value = p.amountPaid || 400;
  document.getElementById('edit-pay-method').value = p.paymentMethod || 'UPI';
  document.getElementById('edit-pay-notes').value = p.adminNotes || '';

  modal.classList.remove('hidden');
}

function closeAdminEditModal() {
  document.getElementById('admin-edit-modal')?.classList.add('hidden');
  editingTeam = null;
}

/**
 * Handle Admin Edit Form Submission
 */
async function handleAdminEditSubmit(e) {
  e.preventDefault();
  if (!editingTeam) return;

  const saveBtn = document.getElementById('btn-save-admin-edit');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving Updates...';
  }

  const payload = {
    teamName: document.getElementById('edit-team-name').value.trim(),
    track: document.getElementById('edit-team-track').value,
    status: document.getElementById('edit-team-status').value,
    projectTitle: document.getElementById('edit-project-title').value.trim(),
    members: [
      {
        fullName: document.getElementById('edit-m1-name').value.trim(),
        regNumber: document.getElementById('edit-m1-reg').value.trim(),
        collegeEmail: document.getElementById('edit-m1-email').value.trim(),
        phone: document.getElementById('edit-m1-phone').value.trim(),
        isLeader: true
      },
      {
        fullName: document.getElementById('edit-m2-name').value.trim(),
        regNumber: document.getElementById('edit-m2-reg').value.trim(),
        collegeEmail: document.getElementById('edit-m2-email').value.trim(),
        phone: document.getElementById('edit-m2-phone').value.trim(),
        isLeader: false
      },
      {
        fullName: document.getElementById('edit-m3-name').value.trim(),
        regNumber: document.getElementById('edit-m3-reg').value.trim(),
        collegeEmail: document.getElementById('edit-m3-email').value.trim(),
        phone: document.getElementById('edit-m3-phone').value.trim(),
        isLeader: false
      },
      {
        fullName: document.getElementById('edit-m4-name').value.trim(),
        regNumber: document.getElementById('edit-m4-reg').value.trim(),
        collegeEmail: document.getElementById('edit-m4-email').value.trim(),
        phone: document.getElementById('edit-m4-phone').value.trim(),
        isLeader: false
      }
    ],
    payment: {
      utrNumber: document.getElementById('edit-pay-utr').value.trim(),
      amountPaid: Number(document.getElementById('edit-pay-amount').value) || 400,
      paymentMethod: document.getElementById('edit-pay-method').value,
      adminNotes: document.getElementById('edit-pay-notes').value.trim(),
      status: document.getElementById('edit-team-status').value
    }
  };

  try {
    const res = await authFetch(`/api/admin/teams/${encodeURIComponent(editingTeam.registrationId)}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to update team.');
    }

    showToast(`✅ Team ${editingTeam.registrationId} updated successfully!`, 'success');
    closeAdminEditModal();
    await Promise.all([loadMetrics(), loadTeams()]);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Save All Updates';
    }
  }
}

/**
 * Submit Verification Decision (VERIFIED, REJECTED, PENDING)
 */
async function submitVerificationDecision(status) {
  if (!selectedTeam) return;

  const adminNotes = document.getElementById('admin-action-notes')?.value.trim();

  try {
    const res = await authFetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrationId: selectedTeam.registrationId,
        status,
        adminNotes
      })
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    showToast(`Team ${selectedTeam.registrationId} marked as ${status}!`, 'success');
    closeDetailModal();
    await Promise.all([loadMetrics(), loadTeams()]);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Proof Lightbox
 */
function openLightbox(imageUrl) {
  const modal = document.getElementById('lightbox-modal');
  const img = document.getElementById('lightbox-img');
  if (modal && img) {
    img.src = imageUrl;
    modal.classList.remove('hidden');
  }
}

function closeLightbox() {
  document.getElementById('lightbox-modal')?.classList.add('hidden');
}

/**
 * Toast and Helpers
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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
