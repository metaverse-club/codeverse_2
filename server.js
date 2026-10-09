require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const QRCode = require('qrcode');
const crypto = require('crypto');
const db = require('./db');
const { generateRegistrationExcel } = require('./excelExport');
const { sendOTPEmail, sendStatusEmail } = require('./mailer');

const app = express();
const PORT = process.env.PORT || 3000;

// Temporary in-memory store for OTPs: { email: { otp: "123456", expiresAt: timestamp } }
const otpStore = new Map();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Uploads directory
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage for payment proofs
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|pdf/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext || mime) {
      return cb(null, true);
    }
    cb(new Error('Only image files (JPG, PNG, WEBP) or PDFs are allowed.'));
  }
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// Route for admin authentication page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Hackathon Payment & Registration Configuration
const HACKATHON_CONFIG = {
  eventName: "CodeVerse Hackathon 2026",
  tagline: "Innovate • Collaborate • Build the Future",
  registrationFee: 400, // INR per team (4 members)
  currency: "INR",
  currencySymbol: "₹",
  minTeamSize: 4,
  maxTeamSize: 4,
  tracks: [
    "AI & Intelligent Systems",
    "Web3, DeFi & Decentralized Apps",
    "Cybersecurity & Cloud Resilience",
    "HealthTech & Biomedical Engineering",
    "FinTech & Algorithmic Solutions",
    "Open Innovation / Student Track"
  ],
  bankDetails: {
    accountHolder: "Metaversity Club",
    bankName: "Indian Bank",
    accountNumber: "7967541510",
    ifscCode: "IDIB000V143",
    branch: "VIT Bhopal Campus",
    accountType: "Savings Account (SB)"
  },
  upiDetails: {
    upiId: "metaversevitb@indianbk",
    payeeName: "Metaversity Club",
    merchantCode: "METAVERSE_CLUB"
  }
};

// ----------------- API ROUTES -----------------

/**
 * GET /api/config
 * Returns hackathon metadata, banking instructions, fee amount, and UPI QR code.
 */
app.get('/api/config', async (req, res) => {
  try {
    // Prefer official static QR poster if present, otherwise dynamically generate QR
    let qrDataUrl = '/upi_qr.png';
    const qrImagePath = path.join(__dirname, 'public', 'upi_qr.png');
    
    if (!fs.existsSync(qrImagePath)) {
      const upiDeepLink = `upi://pay?pa=${encodeURIComponent(HACKATHON_CONFIG.upiDetails.upiId)}&pn=${encodeURIComponent(HACKATHON_CONFIG.upiDetails.payeeName)}&am=${HACKATHON_CONFIG.registrationFee}&cu=INR&tn=${encodeURIComponent('CodeVerse Registration')}`;
      qrDataUrl = await QRCode.toDataURL(upiDeepLink, {
        errorCorrectionLevel: 'H',
        margin: 2,
        width: 320,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      });
    }

    const editDeadline = await db.getEditDeadline();
    const isEditDeadlinePassed = await db.isEditDeadlinePassed();
    const registrationDeadline = await db.getRegistrationDeadline();
    const isRegistrationDeadlinePassed = await db.isRegistrationDeadlinePassed();

    res.json({
      success: true,
      config: {
        ...HACKATHON_CONFIG,
        editDeadline,
        isEditDeadlinePassed,
        registrationDeadline,
        isRegistrationDeadlinePassed,
        upiDetails: {
          ...HACKATHON_CONFIG.upiDetails,
          qrCodeDataUrl: qrDataUrl
        }
      }
    });
  } catch (err) {
    console.error('Error in /api/config:', err);
    res.status(500).json({ success: false, error: 'Failed to generate payment configuration' });
  }
});

/**
 * GET /api/team/edit-info/:registrationId
 * Look up team for editing and verify edit window status
 */
app.get('/api/team/edit-info/:registrationId', async (req, res) => {
  try {
    const { registrationId } = req.params;
    if (!registrationId || !registrationId.trim()) {
      return res.status(400).json({ success: false, error: 'Registration ID is required.' });
    }

    const team = await db.getTeamByRegistrationId(registrationId.trim());
    if (!team) {
      return res.status(404).json({ success: false, error: `Team with Registration ID "${registrationId}" was not found.` });
    }

    const editDeadline = await db.getEditDeadline();
    const isEditDeadlinePassed = await db.isEditDeadlinePassed();

    res.json({
      success: true,
      team,
      editDeadline,
      isDeadlinePassed: isEditDeadlinePassed,
      isEditDeadlinePassed,
      editDeadlineFormatted: editDeadline ? new Date(editDeadline).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : 'Open (No Deadline)'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/team/update
 * Updates team name, track, project title, and member roster details
 */
app.put('/api/team/update', async (req, res) => {
  try {
    const { registrationId, teamName, track, projectTitle, members } = req.body;

    if (!registrationId) {
      return res.status(400).json({ success: false, error: 'Registration ID is required.' });
    }

    const updatedTeam = await db.updateTeamDetails({
      registrationId: registrationId.trim(),
      teamName,
      track,
      projectTitle,
      members
    });

    res.json({
      success: true,
      message: 'Team details updated successfully! The changes will be reflected in all official records.',
      team: updatedTeam
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/send-otp
 * Generates and sends a 6-digit OTP to the team leader's email.
 */
app.post('/api/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, error: 'Email is required.' });
    }

    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    otpStore.set(email.trim().toLowerCase(), { otp, expiresAt });

    const emailSent = await sendOTPEmail(email.trim().toLowerCase(), otp);
    
    if (emailSent) {
      res.json({ success: true, message: 'OTP sent successfully to ' + email });
    } else {
      res.status(500).json({ success: false, error: 'Failed to send OTP email. Check server configuration.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/verify-otp
 * Verifies the OTP provided by the team leader.
 */
app.post('/api/verify-otp', (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, error: 'Email and OTP are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const stored = otpStore.get(normalizedEmail);

    if (!stored) {
      return res.status(400).json({ success: false, error: 'No OTP requested for this email or it has expired.' });
    }

    if (Date.now() > stored.expiresAt) {
      otpStore.delete(normalizedEmail);
      return res.status(400).json({ success: false, error: 'OTP has expired. Please request a new one.' });
    }

    if (stored.otp !== otp.trim()) {
      return res.status(400).json({ success: false, error: 'Invalid OTP.' });
    }

    // Mark as verified by deleting the OTP so it can't be reused, or you could add a verified flag if needed.
    // We'll delete it to clean up, as the frontend will just proceed.
    otpStore.delete(normalizedEmail);

    res.json({ success: true, message: 'Email verified successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/register
 * Register a new team with 4 members.
 */
app.post('/api/register', async (req, res) => {
  try {
    // Check Registration Deadline
    const isDeadlinePassed = await db.isRegistrationDeadlinePassed();
    if (isDeadlinePassed) {
      return res.status(403).json({
        success: false,
        error: 'The registration deadline has passed. No new teams can be registered.'
      });
    }

    const { teamName, track, projectTitle, members } = req.body;

    if (!teamName || !teamName.trim()) {
      return res.status(400).json({ success: false, error: 'Team name is required.' });
    }

    if (!Array.isArray(members) || members.length !== 4) {
      return res.status(400).json({
        success: false,
        error: `Invalid team size (${members ? members.length : 0}). Team must have exactly 4 members.`
      });
    }

    // Email regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      if (!m.fullName || !m.fullName.trim()) {
        return res.status(400).json({ success: false, error: `Member ${i + 1}: Full Name is required.` });
      }
      if (!m.regNumber || !m.regNumber.trim()) {
        return res.status(400).json({ success: false, error: `Member ${i + 1}: Registration Number is required.` });
      }
      if (!m.collegeEmail || !emailRegex.test(m.collegeEmail.trim())) {
        return res.status(400).json({ success: false, error: `Member ${i + 1}: Valid college email is required.` });
      }
      if (!m.phone || m.phone.trim().replace(/\D/g, '').length < 10) {
        return res.status(400).json({ success: false, error: `Member ${i + 1}: Valid 10-digit phone number is required.` });
      }
    }

    const team = await db.createTeam({
      teamName,
      track,
      projectTitle,
      members
    });

    res.status(201).json({
      success: true,
      message: 'Team registered successfully. Please proceed to payment.',
      team
    });
  } catch (err) {
    console.error('Error in /api/register:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/payment/submit
 * Submit payment transaction details and optional screenshot proof.
 */
app.post('/api/payment/submit', upload.single('proofFile'), async (req, res) => {
  try {
    const { registrationId, paymentMethod, utrNumber, transactionDate, amountPaid } = req.body;

    if (!registrationId) {
      return res.status(400).json({ success: false, error: 'Registration ID is required.' });
    }

    if (!paymentMethod || !['UPI', 'Bank Transfer'].includes(paymentMethod)) {
      return res.status(400).json({ success: false, error: 'Valid payment method (UPI or Bank Transfer) is required.' });
    }

    if (!utrNumber || utrNumber.trim().length < 6) {
      return res.status(400).json({ success: false, error: 'Valid Transaction ID / UTR Number (minimum 6 characters) is required.' });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Payment screenshot / receipt proof is mandatory. Please upload your payment proof image or PDF.'
      });
    }

    const ext = path.extname(req.file.originalname);
    const cleanReg = registrationId.replace(/[^a-zA-Z0-9_-]/g, '');
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e5)}`;
    const filename = `proof-${cleanReg}-${uniqueSuffix}${ext}`;

    const { data, error } = await db.supabase.storage
      .from('receipts')
      .upload(filename, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (error) {
      console.error('Supabase Storage Error:', error);
      return res.status(500).json({ success: false, error: 'Failed to upload receipt to cloud storage.' });
    }

    const { data: publicUrlData } = db.supabase.storage.from('receipts').getPublicUrl(filename);
    const proofFilePath = publicUrlData.publicUrl;

    const updatedTeam = await db.submitPayment({
      registrationId: registrationId.trim(),
      paymentMethod,
      utrNumber: utrNumber.trim(),
      transactionDate: transactionDate || new Date().toISOString().split('T')[0],
      amountPaid: Number(amountPaid) || HACKATHON_CONFIG.registrationFee,
      proofFilePath
    });

    res.json({
      success: true,
      message: 'Payment details submitted successfully! Your registration is now pending verification.',
      team: updatedTeam
    });
  } catch (err) {
    console.error('Error in /api/payment/submit:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/registration/:registrationId
 * Look up registration and payment status.
 */
app.get('/api/registration/:registrationId', async (req, res) => {
  try {
    const team = await db.getTeamByRegistrationId(req.params.registrationId.trim());
    if (!team) {
      return res.status(404).json({ success: false, error: `No registration found for ID "${req.params.registrationId}".` });
    }
    res.json({ success: true, team });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------- ADMIN AUTHENTICATION & SECURITY -----------------

const ADMIN_CREDENTIALS = {
  username: process.env.ADMIN_USERNAME,
  password: process.env.ADMIN_PASSWORD
};

// In-memory set of active admin session tokens
const adminSessions = new Set();

function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  if (req.query && req.query.token) {
    return req.query.token.trim();
  }
  return null;
}

/**
 * Middleware: Enforces Metaversity_Admin authentication
 */
function requireAdminAuth(req, res, next) {
  const token = extractToken(req);
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({
      success: false,
      error: 'Access Denied: Admin authentication required. Please log in with Metaversity_Admin.'
    });
  }
  next();
}

/**
 * POST /api/admin/login
 * Authenticates admin credentials
 */
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
    const token = `meta_tok_${crypto.randomBytes(32).toString('hex')}`;
    adminSessions.add(token);
    return res.json({
      success: true,
      message: 'Admin authenticated successfully.',
      token,
      username: ADMIN_CREDENTIALS.username
    });
  }
  return res.status(401).json({
    success: false,
    error: 'Invalid admin username or password.'
  });
});

/**
 * GET /api/admin/check-auth
 * Validates current session token
 */
app.get('/api/admin/check-auth', (req, res) => {
  const token = extractToken(req);
  if (token && adminSessions.has(token)) {
    return res.json({ success: true, authenticated: true, username: ADMIN_CREDENTIALS.username });
  }
  return res.status(401).json({ success: false, authenticated: false, error: 'Session expired or invalid.' });
});

/**
 * POST /api/admin/logout
 */
app.post('/api/admin/logout', (req, res) => {
  const token = extractToken(req);
  if (token) adminSessions.delete(token);
  res.json({ success: true, message: 'Logged out successfully.' });
});

// ----------------- ADMIN API ROUTES (PROTECTED) -----------------

/**
 * GET /api/admin/metrics
 */
app.get('/api/admin/metrics', requireAdminAuth, async (req, res) => {
  try {
    const metrics = await db.getMetrics();
    res.json({ success: true, metrics });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/teams
 */
app.get('/api/admin/teams', requireAdminAuth, async (req, res) => {
  try {
    const { status, search } = req.query;
    const teams = await db.getAllTeams({ status, search });
    res.json({ success: true, count: teams.length, teams });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/verify
 * Mark payment & team as VERIFIED, REJECTED, or PENDING_VERIFICATION.
 */
app.post('/api/admin/verify', requireAdminAuth, async (req, res) => {
  try {
    const { registrationId, status, adminNotes } = req.body;
    if (!registrationId || !status) {
      return res.status(400).json({ success: false, error: 'Registration ID and status are required.' });
    }

    const updatedTeam = await db.updatePaymentStatus({
      registrationId,
      status,
      adminNotes: adminNotes || '',
      verifiedBy: 'Organizing Committee'
    });

    // Send status email to the team leader (member[0] or updatedTeam.leader)
    const upperStatus = status.toUpperCase();
    if (upperStatus === 'VERIFIED' || upperStatus === 'REJECTED') {
      // The database returns the column as `collegeEmail`
      const leaderEmail = updatedTeam.leader 
        ? updatedTeam.leader.collegeEmail 
        : (updatedTeam.members && updatedTeam.members.length > 0 ? updatedTeam.members[0].collegeEmail : null);
        
      if (leaderEmail) {
        // We don't await this so it doesn't block the API response
        sendStatusEmail(leaderEmail, updatedTeam.team_name || updatedTeam.teamName, upperStatus === 'VERIFIED' ? 'Verified' : 'Rejected', adminNotes || '').catch(err => {
          console.error('Failed to send status email:', err);
        });
      } else {
        console.warn('Leader email not found. Could not send status email.');
      }
    }

    res.json({
      success: true,
      message: `Team ${registrationId} marked as ${status}.`,
      team: updatedTeam
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/admin/teams/:id (and POST /api/admin/teams/:id/delete)
 * Permanently delete a team registration, members, and payment records
 */
app.all(['/api/admin/teams/:id/delete', '/api/admin/teams/:id'], requireAdminAuth, async (req, res) => {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
    const { id } = req.params;
    const result = await db.deleteTeam(id);
    res.json({
      success: true,
      message: `Team "${result.teamName}" (${result.deletedRegistrationId}) has been permanently deleted.`,
      result
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/admin/teams/:id (and POST /api/admin/teams/:id/update)
 * Admin override: update team details, members, track, project, payment details
 */
app.all(['/api/admin/teams/:id/update', '/api/admin/teams/:id'], requireAdminAuth, async (req, res) => {
  if (req.method !== 'PUT' && req.method !== 'POST' && req.method !== 'PATCH') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
    const { id } = req.params;
    const updatedTeam = await db.adminUpdateTeam({
      registrationId: id,
      ...req.body
    });

    res.json({
      success: true,
      message: `Team ${updatedTeam.registrationId} updated successfully.`,
      team: updatedTeam
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/export
 * Download all registered teams as CSV.
 */
/**
 * GET /api/admin/export (and /api/admin/export-excel)
 * Download all registered teams as a professional, multi-sheet formatted Excel workbook (.xlsx).
 */
app.get(['/api/admin/export', '/api/admin/export-excel'], requireAdminAuth, async (req, res) => {
  try {
    const teams = await db.getAllTeams();
    const metrics = await db.getMetrics();
    const workbook = await generateRegistrationExcel(teams, metrics);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=CodeVerse_2026_Team_Registrations_${Date.now()}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Excel Export Error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate Excel file: ' + err.message });
  }
});

/**
 * GET /api/admin/export-csv
 * Optional CSV export fallback
 */
app.get('/api/admin/export-csv', async (req, res) => {
  try {
    const teams = await db.getAllTeams();
    const headers = [
      'Registration ID', 'Team Name', 'Track', 'Member Count', 'Status',
      'Leader Name', 'Leader Email', 'Leader Phone', 'Leader Reg No',
      'Member 2 Name', 'Member 2 Reg No', 'Member 2 Email', 'Member 2 Phone',
      'Member 3 Name', 'Member 3 Reg No', 'Member 3 Email', 'Member 3 Phone',
      'Member 4 Name', 'Member 4 Reg No', 'Member 4 Email', 'Member 4 Phone',
      'Member 5 Name', 'Member 5 Reg No', 'Member 5 Email', 'Member 5 Phone',
      'Member 6 Name', 'Member 6 Reg No', 'Member 6 Email', 'Member 6 Phone',
      'Payment Method', 'UTR Number', 'Amount Paid', 'Transaction Date',
      'Payment Status', 'Proof Link', 'Admin Notes', 'Created At'
    ];

    const rows = teams.map(t => {
      const members = t.members || [];
      const leader = members.find(m => m.isLeader || m.is_leader) || members[0] || {};
      const nonLeaders = members.filter(m => !(m.isLeader || m.is_leader));
      const m2 = nonLeaders[0] || {};
      const m3 = nonLeaders[1] || {};
      const m4 = nonLeaders[2] || {};
      const m5 = nonLeaders[3] || {};
      const m6 = nonLeaders[4] || {};
      const payment = t.payment || {};

      return [
        `"${t.registrationId}"`,
        `"${(t.teamName || '').replace(/"/g, '""')}"`,
        `"${(t.track || '').replace(/"/g, '""')}"`,
        t.memberCount,
        `"${t.status}"`,
        `"${(leader.fullName || '').replace(/"/g, '""')}"`,
        `"${(leader.collegeEmail || '').replace(/"/g, '""')}"`,
        `"${(leader.phone || '').replace(/"/g, '""')}"`,
        `"${(leader.regNumber || '').replace(/"/g, '""')}"`,
        `"${(m2.fullName || '').replace(/"/g, '""')}"`, `"${(m2.regNumber || '').replace(/"/g, '""')}"`, `"${(m2.collegeEmail || '').replace(/"/g, '""')}"`, `"${(m2.phone || '').replace(/"/g, '""')}"`,
        `"${(m3.fullName || '').replace(/"/g, '""')}"`, `"${(m3.regNumber || '').replace(/"/g, '""')}"`, `"${(m3.collegeEmail || '').replace(/"/g, '""')}"`, `"${(m3.phone || '').replace(/"/g, '""')}"`,
        `"${(m4.fullName || '').replace(/"/g, '""')}"`, `"${(m4.regNumber || '').replace(/"/g, '""')}"`, `"${(m4.collegeEmail || '').replace(/"/g, '""')}"`, `"${(m4.phone || '').replace(/"/g, '""')}"`,
        `"${(m5.fullName || '').replace(/"/g, '""')}"`, `"${(m5.regNumber || '').replace(/"/g, '""')}"`, `"${(m5.collegeEmail || '').replace(/"/g, '""')}"`, `"${(m5.phone || '').replace(/"/g, '""')}"`,
        `"${(m6.fullName || '').replace(/"/g, '""')}"`, `"${(m6.regNumber || '').replace(/"/g, '""')}"`, `"${(m6.collegeEmail || '').replace(/"/g, '""')}"`, `"${(m6.phone || '').replace(/"/g, '""')}"`,
        `"${payment.paymentMethod || 'N/A'}"`,
        `"${payment.utrNumber || 'N/A'}"`,
        payment.amountPaid || 0,
        `"${payment.transactionDate || 'N/A'}"`,
        `"${payment.status || 'N/A'}"`,
        `"${payment.proofFilePath ? 'http://localhost:' + PORT + payment.proofFilePath : 'N/A'}"`,
        `"${(payment.adminNotes || '').replace(/"/g, '""')}"`,
        `"${t.createdAt}"`
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=codeverse_registrations_${Date.now()}.csv`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/settings
 * Retrieve hackathon system settings including team edit deadline
 */
app.get('/api/admin/settings', requireAdminAuth, async (req, res) => {
  try {
    const editDeadline = await db.getEditDeadline();
    const isPassed = await db.isEditDeadlinePassed();
    res.json({
      success: true,
      deadline: editDeadline,
      isPassed
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/settings/deadline
 * Set or clear the student team edit deadline date/time
 */
app.post('/api/admin/settings/deadline', requireAdminAuth, async (req, res) => {
  try {
    const { deadline } = req.body;
    const savedDeadline = await db.setEditDeadline(deadline);
    const isPassed = await db.isEditDeadlinePassed();

    res.json({
      success: true,
      message: savedDeadline ? 'Team edit deadline updated successfully.' : 'Team edit deadline cleared (edits open indefinitely).',
      deadline: savedDeadline,
      isPassed
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/settings/registration-deadline
 * Fetch the current student registration deadline date/time
 */
app.get('/api/admin/settings/registration-deadline', requireAdminAuth, async (req, res) => {
  try {
    const registrationDeadline = await db.getRegistrationDeadline();
    const isPassed = await db.isRegistrationDeadlinePassed();
    
    res.json({
      success: true,
      deadline: registrationDeadline,
      isPassed
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/settings/registration-deadline
 * Set or clear the student registration deadline date/time
 */
app.post('/api/admin/settings/registration-deadline', requireAdminAuth, async (req, res) => {
  try {
    const { deadline } = req.body;
    const savedDeadline = await db.setRegistrationDeadline(deadline);
    const isPassed = await db.isRegistrationDeadlinePassed();

    res.json({
      success: true,
      message: savedDeadline ? 'Registration deadline updated successfully.' : 'Registration deadline cleared (registrations open indefinitely).',
      deadline: savedDeadline,
      isPassed
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * Seed initial sample teams if empty (for convenient demoing)
 */
app.post('/api/admin/seed-demo', requireAdminAuth, async (req, res) => {
  try {
    const sampleTeams = [
      {
        teamName: 'CyberKnights',
        track: 'Cybersecurity & Cloud Resilience',
        projectTitle: 'Zero-Trust Distributed Auth Gateway',
        members: [
          { fullName: 'Ananya Deshmukh', regNumber: '22BCS1001', collegeEmail: 'ananya.d@univ.ac.in', phone: '9820112345', isLeader: true },
          { fullName: 'Devansh Roy', regNumber: '22BCS1045', collegeEmail: 'devansh.r@univ.ac.in', phone: '9820112346', isLeader: false },
          { fullName: 'Meera Iyer', regNumber: '22BCS1089', collegeEmail: 'meera.i@univ.ac.in', phone: '9820112347', isLeader: false },
          { fullName: 'Kabir Singhania', regNumber: '22BCS1120', collegeEmail: 'kabir.s@univ.ac.in', phone: '9820112348', isLeader: false }
        ],
        payment: {
          paymentMethod: 'UPI',
          utrNumber: '428910482910',
          transactionDate: '2026-10-03',
          amountPaid: 600,
          status: 'VERIFIED'
        }
      },
      {
        teamName: 'NeuralNexus',
        track: 'AI & Intelligent Systems',
        projectTitle: 'Multimodal Vision Diagnostic Copilot',
        members: [
          { fullName: 'Vikramaditya Rao', regNumber: '21BCE2001', collegeEmail: 'vikram.rao@univ.ac.in', phone: '9876500001', isLeader: true },
          { fullName: 'Sanya Mirza', regNumber: '21BCE2002', collegeEmail: 'sanya.m@univ.ac.in', phone: '9876500002', isLeader: false },
          { fullName: 'Tanmay Bhatt', regNumber: '21BCE2003', collegeEmail: 'tanmay.b@univ.ac.in', phone: '9876500003', isLeader: false },
          { fullName: 'Ayesha Kapoor', regNumber: '21BCE2004', collegeEmail: 'ayesha.k@univ.ac.in', phone: '9876500004', isLeader: false },
          { fullName: 'Zaid Khan', regNumber: '21BCE2005', collegeEmail: 'zaid.k@univ.ac.in', phone: '9876500005', isLeader: false }
        ],
        payment: {
          paymentMethod: 'Bank Transfer',
          utrNumber: 'CMS981240182',
          transactionDate: '2026-10-04',
          amountPaid: 600,
          status: 'PENDING_VERIFICATION'
        }
      }
    ];

    const results = [];
    for (const t of sampleTeams) {
      try {
        const team = await db.createTeam({
          teamName: t.teamName,
          track: t.track,
          projectTitle: t.projectTitle,
          members: t.members
        });

        if (t.payment) {
          await db.submitPayment({
            registrationId: team.registration_id,
            paymentMethod: t.payment.paymentMethod,
            utrNumber: t.payment.utrNumber,
            transactionDate: t.payment.transactionDate,
            amountPaid: t.payment.amountPaid,
            proofFilePath: null
          });

          if (t.payment.status === 'VERIFIED') {
            await db.updatePaymentStatus({
              registrationId: team.registration_id,
              status: 'VERIFIED',
              adminNotes: 'Verified via bank ledger'
            });
          }
        }
        results.push(team.registration_id);
      } catch (e) {
        // Ignored if already seeded
      }
    }

    res.json({ success: true, message: `Seeded ${results.length} demo teams.`, teams: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error occurred.'
  });
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 CodeVerse Hackathon Portal is running at:`);
  console.log(`   Student Portal: http://localhost:${PORT}`);
  console.log(`   Admin Dashboard: http://localhost:${PORT}/admin.html`);
  console.log(`=======================================================`);
});
