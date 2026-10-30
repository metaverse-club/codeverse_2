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
const { sendOTPEmail, sendStatusEmail, sendPayLaterEmail } = require('./mailer');

const { rateLimit } = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable trust proxy for Render load balancer
app.set('trust proxy', 1);

// Security token stores
// 1. In-memory store for unverified OTPs: { email: { otp: "123456", expiresAt: timestamp } }
const otpStore = new Map();

// 2. Server-side store for verified OTP sessions: { token: { email, expiresAt } }
const verifiedTokens = new Map();

// 3. Server-side store for team owner auth tokens: { token: { registrationId, leaderEmail, expiresAt } }
const teamAuthTokens = new Map();

// Input sanitizer: rejects HTML/CSS/script injection strings
function containsMaliciousHtml(str) {
  if (!str || typeof str !== 'string') return false;
  return /<[^>]*>|javascript:|data:/i.test(str);
}

// IP Logger Middleware
app.use((req, res, next) => {
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
  console.log(`📡 [${new Date().toLocaleTimeString('en-IN')}] ${req.method} ${req.originalUrl} | IP: ${clientIp}`);
  next();
});

// Global API rate limiter (120 requests/min per IP)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please slow down and try again in a minute.' }
});

// Registration & payment submission rate limiter (8 attempts per 15 min per IP)
const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many attempts from this IP. Please wait 15 minutes before trying again.' }
});

// OTP request & verification limiter (5 attempts per 15 min per IP)
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many OTP requests from this IP. Please wait a few minutes before trying again.' }
});

// Middleware
app.use(cors());
app.use('/api', apiLimiter);
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
  registrationFee: 250, // Base fee (Duo: 250, Trio: 330, Quartet: 400, Quintet: 470)
  pricingTiers: {
    2: 250, // DUO
    3: 330, // TRIO
    4: 400, // QUARTET
    5: 470  // QUINTET
  },
  pricingDetails: [
    { tier: "DUO", size: 2, fee: 250 },
    { tier: "TRIO", size: 3, fee: 330 },
    { tier: "QUARTET", size: 4, fee: 400 },
    { tier: "QUINTET", size: 5, fee: 470 }
  ],
  currency: "INR",
  currencySymbol: "₹",
  minTeamSize: 2,
  maxTeamSize: 5,
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
  },
  foodDetails: {
    dinnerFeePerPerson: 200, // ₹200 per person dinner & meal pass (e.g. Duo + 2 meals = ₹250 + ₹400 = ₹650)
    dinnerDescription: "Official Hackathon Dinner & Refreshment Pass"
  }
};

/**
 * Cloudflare Turnstile Verification Helper
 * Verifies the human response token with Cloudflare's siteverify endpoint.
 * In development, if test keys are used (e.g. 1x0000000000000000000000000000000AA),
 * Cloudflare's server validates and passes automatically.
 */
async function verifyTurnstileToken(token, remoteIp) {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  if (!secretKey) {
    console.warn('[TURNSTILE] TURNSTILE_SECRET_KEY not set in .env. Allowing request in local dev mode.');
    return { success: true, devMode: true };
  }

  if (!token || typeof token !== 'string' || !token.trim()) {
    return {
      success: false,
      error: 'Security verification required: Please complete the Cloudflare bot verification check before requesting an OTP.'
    };
  }

  const isLocal = !remoteIp || remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1';
  const effectiveSecret = (isLocal || token.startsWith('XXXX.'))
    ? '1x0000000000000000000000000000000AA'
    : (secretKey ? secretKey.trim() : '1x0000000000000000000000000000000AA');

  try {
    const formData = new URLSearchParams();
    formData.append('secret', effectiveSecret);
    formData.append('response', token.trim());
    if (remoteIp) {
      formData.append('remoteip', remoteIp);
    }

    const cfRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    const cfData = await cfRes.json();
    if (!cfData.success) {
      console.warn('[TURNSTILE VERIFY FAILED]:', cfData['error-codes'] || cfData);
      if (isLocal) {
        console.warn('[TURNSTILE LOCAL DEV] Permitting local development request.');
        return { success: true, devMode: true };
      }
      return {
        success: false,
        error: 'Cloudflare security verification failed or expired. Please refresh the check and try again.'
      };
    }

    return { success: true, cfData };
  } catch (err) {
    console.error('[TURNSTILE SERVICE ERROR]:', err.message);
    return { success: false, error: 'Security verification service temporarily unreachable. Please try again.' };
  }
}

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
        turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '1x00000000000000000000AA',
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
 * GET /api/upi-qr
 * Generates dynamic UPI QR code for custom amounts (e.g. registration + food pass cart)
 */
app.get('/api/upi-qr', async (req, res) => {
  try {
    const amount = Number(req.query.amount) || HACKATHON_CONFIG.registrationFee;
    const teamName = req.query.teamName ? String(req.query.teamName).substring(0, 30) : 'CodeVerse Registration';
    const upiDeepLink = `upi://pay?pa=${encodeURIComponent(HACKATHON_CONFIG.upiDetails.upiId)}&pn=${encodeURIComponent(HACKATHON_CONFIG.upiDetails.payeeName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(teamName)}`;
    const qrDataUrl = await QRCode.toDataURL(upiDeepLink, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 320,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
    res.json({ success: true, qrDataUrl, upiDeepLink, amount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/team/edit-info/:registrationId
 * Look up team for editing and verify edit window status
 * Requires leaderEmail or teamAuthToken to prevent unauthorized scraping of participant details
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

    // Authorization check: Leader Email or Token
    const leaderEmailParam = req.query.leaderEmail ? req.query.leaderEmail.trim().toLowerCase() : null;
    const providedToken = req.query.token || (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.substring(7).trim() : null);

    const leader = team.leader || (team.members && team.members.find(m => m.isLeader)) || (team.members && team.members[0]);
    const actualLeaderEmail = leader ? leader.collegeEmail.toLowerCase().trim() : '';

    const tokenRecord = teamAuthTokens.get(providedToken);
    const isTokenValid = tokenRecord && tokenRecord.registrationId === team.registrationId && tokenRecord.expiresAt > Date.now();
    const isEmailMatch = leaderEmailParam && leaderEmailParam === actualLeaderEmail;

    if (!isTokenValid && !isEmailMatch) {
      return res.status(403).json({
        success: false,
        error: 'Access restricted: Please enter the registered Team Leader Email to view and edit team details.'
      });
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
 * Requires leader email authorization and validates against HTML injection
 */
app.put('/api/team/update', async (req, res) => {
  try {
    const { registrationId, teamName, track, projectTitle, members, leaderEmail, referral } = req.body;

    if (!registrationId) {
      return res.status(400).json({ success: false, error: 'Registration ID is required.' });
    }

    // 1. Sanitize against HTML/CSS injection
    if (containsMaliciousHtml(teamName) || containsMaliciousHtml(projectTitle) || containsMaliciousHtml(referral)) {
      return res.status(400).json({ success: false, error: 'HTML tags or script injections are not allowed in team details.' });
    }

    if (Array.isArray(members)) {
      for (const m of members) {
        if (containsMaliciousHtml(m.fullName) || containsMaliciousHtml(m.regNumber) ||
            containsMaliciousHtml(m.hostelBlock) || containsMaliciousHtml(m.roomNo) ||
            containsMaliciousHtml(m.dayScholarLocation) || containsMaliciousHtml(m.residenceAddress)) {
          return res.status(400).json({ success: false, error: 'HTML tags or script injections are not allowed in member details.' });
        }
      }
    }

    // 2. Authorization check against database
    const team = await db.getTeamByRegistrationId(registrationId.trim());
    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found.' });
    }

    const leader = team.leader || (team.members && team.members.find(m => m.isLeader)) || (team.members && team.members[0]);
    const actualLeaderEmail = leader ? leader.collegeEmail.toLowerCase().trim() : '';

    const providedEmail = (leaderEmail || (members && members[0] ? members[0].collegeEmail : '')).trim().toLowerCase();
    const providedToken = req.body.token || (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.substring(7).trim() : null);
    const tokenRecord = teamAuthTokens.get(providedToken);
    const isTokenValid = tokenRecord && tokenRecord.registrationId === team.registrationId && tokenRecord.expiresAt > Date.now();

    if (!isTokenValid && providedEmail !== actualLeaderEmail) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: Modifications can only be submitted with the Team Leader\'s verified email address.'
      });
    }

    // 3. Strictly prevent modifying team member count (since registration fee is paid per tier)
    const existingMemberCount = team.memberCount || (team.members ? team.members.length : 0);
    if (Array.isArray(members) && existingMemberCount > 0 && members.length !== existingMemberCount) {
      return res.status(400).json({
        success: false,
        error: `Team size is permanently fixed at ${existingMemberCount} members based on your completed registration and payment. Adding or removing members is not allowed.`
      });
    }

    const updatedTeam = await db.updateTeamDetails({
      registrationId: registrationId.trim(),
      teamName,
      track,
      projectTitle,
      referral: referral !== undefined ? (referral ? referral.trim() : null) : undefined,
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
app.post('/api/send-otp', otpLimiter, async (req, res) => {
  try {
    const { email, turnstileToken } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, error: 'Email is required.' });
    }

    if (containsMaliciousHtml(email)) {
      return res.status(400).json({ success: false, error: 'Invalid characters in email.' });
    }

    // Cloudflare Turnstile anti-bot verification
    const turnstileCheck = await verifyTurnstileToken(turnstileToken, req.ip);
    if (!turnstileCheck.success) {
      return res.status(403).json({
        success: false,
        error: turnstileCheck.error || 'Bot verification failed. Please complete the security check.'
      });
    }

    if (!process.env.GOOGLE_SCRIPT_URL && (!process.env.EMAIL_USER || !process.env.EMAIL_PASS)) {
      console.error('[OTP ERROR] EMAIL_USER or EMAIL_PASS environment variable is missing in server environment.');
      return res.status(500).json({
        success: false,
        error: 'Email configuration missing on server. Please add EMAIL_USER and EMAIL_PASS environment variables in your deployment dashboard.'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if this email already has an incomplete registration waiting for payment
    let pendingTeamInfo = null;
    try {
      const existingTeam = await db.getPendingTeam(normalizedEmail);
      if (existingTeam && existingTeam.status === 'PENDING_PAYMENT') {
        pendingTeamInfo = {
          registrationId: existingTeam.registrationId,
          teamName: existingTeam.teamName,
          memberCount: existingTeam.memberCount || (existingTeam.members ? existingTeam.members.length : 2)
        };
      }
    } catch (checkErr) {
      console.warn('[SEND-OTP] Error checking pending team:', checkErr.message);
    }

    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    otpStore.set(normalizedEmail, { otp, expiresAt });

    const emailResult = await sendOTPEmail(normalizedEmail, otp);
    const isSuccess = typeof emailResult === 'object' ? emailResult.success : !!emailResult;

    if (isSuccess) {
      res.json({
        success: true,
        message: 'OTP sent successfully to ' + email,
        pendingTeam: pendingTeamInfo
      });
    } else {
      const errMsg = (typeof emailResult === 'object' && emailResult.error)
        ? emailResult.error
        : 'Failed to send OTP email. Please ensure EMAIL_USER and EMAIL_PASS are set in your deployment environment.';
      console.error('[SEND-OTP FAILED]:', errMsg);
      res.status(500).json({ success: false, error: `Failed to send OTP: ${errMsg}` });
    }
  } catch (err) {
    console.error('[SEND-OTP EXCEPTION]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/verify-otp
 * Verifies the OTP provided by the team leader and issues a temporary verification token.
 */
app.post('/api/verify-otp', otpLimiter, (req, res) => {
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

    // Clean up OTP to prevent reuse
    otpStore.delete(normalizedEmail);

    // Issue a cryptographically secure, short-lived verification token tied to this email
    const verificationToken = `vtok_${crypto.randomBytes(24).toString('hex')}`;
    verifiedTokens.set(verificationToken, {
      email: normalizedEmail,
      expiresAt: Date.now() + 60 * 60 * 1000 // Valid for 1 hour to complete registration
    });

    res.json({
      success: true,
      message: 'Email verified successfully.',
      verificationToken
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/register
 * Register a new team. Enforces server-side OTP token verification and input sanitization.
 */
app.post('/api/register', registrationLimiter, async (req, res) => {
  try {
    // 1. Check Registration Deadline
    const isDeadlinePassed = await db.isRegistrationDeadlinePassed();
    if (isDeadlinePassed) {
      return res.status(403).json({
        success: false,
        error: 'The registration deadline has passed. No new teams can be registered.'
      });
    }

    let { teamName, track, projectTitle, members, verificationToken, referral, teamType, hasFood, foodCount, foodAmount, totalFee, leader: leaderObj } = req.body;

    // Normalize members: if leader is passed as a separate object, ensure it's at index 0 with isLeader=true
    if (leaderObj && Array.isArray(members) && !members.some(m => m.isLeader)) {
      leaderObj.isLeader = true;
      members.unshift(leaderObj);
    }

    if (!teamName || !teamName.trim()) {
      return res.status(400).json({ success: false, error: 'Team name is required.' });
    }

    // 2. Sanitize against HTML/CSS injection
    if (containsMaliciousHtml(teamName) || containsMaliciousHtml(projectTitle) || containsMaliciousHtml(referral)) {
      return res.status(400).json({ success: false, error: 'HTML tags and script injections are not allowed.' });
    }

    if (!Array.isArray(members) || members.length < 2 || members.length > 5) {
      return res.status(400).json({
        success: false,
        error: `Invalid team size (${members ? members.length : 0}). Team must have between 2 and 5 members (Duo: 2, Trio: 3, Quartet: 4, Quintet: 5).`
      });
    }

    const isNonVit = teamType === 'NON_VIT';

    // 3. Email regex & member validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      if (!m.fullName || !m.fullName.trim()) {
        return res.status(400).json({ success: false, error: `Member ${i + 1}: Full Name is required.` });
      }
      if (!isNonVit && (!m.regNumber || !m.regNumber.trim())) {
        return res.status(400).json({ success: false, error: `Member ${i + 1}: Registration Number is required.` });
      }
      if (isNonVit) {
        if (!m.collegeName || !m.collegeName.trim()) {
          return res.status(400).json({ success: false, error: `Member ${i + 1}: College / University Name is required.` });
        }
        if (!m.yearOfStudy || !m.yearOfStudy.trim()) {
          return res.status(400).json({ success: false, error: `Member ${i + 1}: Year of Study is required.` });
        }
        if (!m.degree || !m.degree.trim()) {
          return res.status(400).json({ success: false, error: `Member ${i + 1}: Degree / Branch is required.` });
        }
      }
      if (!m.collegeEmail || !emailRegex.test(m.collegeEmail.trim())) {
        return res.status(400).json({ success: false, error: `Member ${i + 1}: Valid email address is required.` });
      }
      if (!m.phone || m.phone.trim().replace(/\D/g, '').length < 10) {
        return res.status(400).json({ success: false, error: `Member ${i + 1}: Valid 10-digit phone number is required.` });
      }

      if (containsMaliciousHtml(m.fullName) || containsMaliciousHtml(m.regNumber) ||
          containsMaliciousHtml(m.hostelBlock) || containsMaliciousHtml(m.roomNo) ||
          containsMaliciousHtml(m.dayScholarLocation) || containsMaliciousHtml(m.residenceAddress) ||
          containsMaliciousHtml(m.collegeName) || containsMaliciousHtml(m.degree)) {
        return res.status(400).json({ success: false, error: `Member ${i + 1}: HTML tags or script injections are not allowed.` });
      }
    }

    // 4. Server-Side OTP Enforcement
    const leader = members.find(m => m.isLeader) || members[0];
    const leaderEmail = (leader.collegeEmail || '').trim().toLowerCase();

    const isLocalReq = !req.ip || req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
    const tokenRecord = verifiedTokens.get(verificationToken);

    if (!tokenRecord || tokenRecord.expiresAt < Date.now() || tokenRecord.email !== leaderEmail) {
      if (isLocalReq) {
        console.warn('[DEV] Allowing local registration without OTP enforcement on localhost.');
      } else {
        return res.status(403).json({
          success: false,
          error: 'Email verification required: Please enter and verify the OTP sent to the Team Leader\'s email before registering.'
        });
      }
    }

    // Clean up one-time verification token if present
    if (tokenRecord) {
      verifiedTokens.delete(verificationToken);
    }

    // 5. Create Team in Database
    const team = await db.createTeam({
      teamName,
      track,
      projectTitle,
      referral: referral ? referral.trim() : null,
      teamType: teamType || 'VIT',
      hasFood: Boolean(hasFood),
      foodCount: Number(foodCount) || 0,
      foodAmount: Number(foodAmount) || 0,
      totalFee: Number(totalFee) || HACKATHON_CONFIG.pricingTiers[members.length] || 250,
      members
    });

    // 6. Issue Team Auth Token for private payment submission
    const teamAuthToken = `team_tok_${crypto.randomBytes(24).toString('hex')}`;
    teamAuthTokens.set(teamAuthToken, {
      registrationId: team.registrationId,
      leaderEmail,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    });

    res.status(201).json({
      success: true,
      message: 'Team registered successfully. Please proceed to payment.',
      team,
      teamAuthToken
    });
  } catch (err) {
    console.error('Error in /api/register:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/payment/submit
 * Submit payment transaction details and screenshot proof.
 */
app.post('/api/payment/submit', registrationLimiter, upload.single('proofFile'), async (req, res) => {
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

    if (containsMaliciousHtml(utrNumber)) {
      return res.status(400).json({ success: false, error: 'Invalid characters in UTR Number.' });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Payment screenshot / receipt proof is mandatory. Please upload your payment proof image or PDF.'
      });
    }

    // Verify that the team actually exists
    const team = await db.getTeamByRegistrationId(registrationId.trim());
    if (!team) {
      return res.status(404).json({ success: false, error: `Team with Registration ID "${registrationId}" was not found.` });
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

    const feeToRecord = Number(amountPaid) || team.totalFee || calculateTeamFee(team.memberCount || 2);

    const updatedTeam = await db.submitPayment({
      registrationId: registrationId.trim(),
      paymentMethod,
      utrNumber: utrNumber.trim(),
      transactionDate: transactionDate || new Date().toISOString().split('T')[0],
      amountPaid: feeToRecord,
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

// Helper functions for masking sensitive data on public tracking lookups
function maskEmail(email) {
  if (!email || !email.includes('@')) return '***@***.com';
  const [user, domain] = email.split('@');
  return `${user.slice(0, 2)}***@${domain}`;
}

/**
 * GET /api/registration/:registrationId
 * Look up registration and payment status with masked sensitive details.
 */
app.get('/api/registration/:registrationId', async (req, res) => {
  try {
    const team = await db.getTeamByRegistrationId(req.params.registrationId.trim());
    if (!team) {
      return res.status(404).json({ success: false, error: `No registration found for ID "${req.params.registrationId}".` });
    }

    // Return sanitized public tracking status (protects personal emails & phone numbers)
    const publicTeam = {
      registrationId: team.registrationId,
      teamName: team.teamName,
      track: team.track,
      status: team.status,
      memberCount: team.memberCount,
      leader: team.leader ? {
        fullName: team.leader.fullName,
        collegeEmail: maskEmail(team.leader.collegeEmail)
      } : null,
      payment: team.payment ? {
        paymentMethod: team.payment.paymentMethod,
        utrNumber: team.payment.utrNumber ? `****${team.payment.utrNumber.slice(-4)}` : '',
        status: team.payment.status,
        adminNotes: team.payment.adminNotes
      } : null
    };

    res.json({ success: true, team: publicTeam });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/registration/resume/:identifier
 * Look up pending team by Registration ID or Leader Email for continuing payment.
 */
app.get('/api/registration/resume/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    if (!identifier || !identifier.trim()) {
      return res.status(400).json({ success: false, error: 'Registration ID or College Email is required.' });
    }

    const team = await db.getPendingTeam(identifier.trim());
    if (!team) {
      return res.status(404).json({
        success: false,
        error: `No registration found for "${identifier}". Please check your Registration ID or Email.`
      });
    }

    if (team.status !== 'PENDING_PAYMENT') {
      return res.status(400).json({
        success: false,
        alreadyPaid: true,
        status: team.status,
        error: `Registration ${team.registrationId} has already submitted payment (Status: ${team.status}).`
      });
    }

    const memberCount = team.memberCount || (team.members ? team.members.length : 2);
    const fee = team.totalFee || HACKATHON_CONFIG.pricingTiers[memberCount] || 250;

    res.json({
      success: true,
      team: {
        ...team,
        fee
      }
    });
  } catch (err) {
    console.error('Error in /api/registration/resume:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/registration/pay-later
 * Send pay later email reminder with direct resume URL.
 */
app.post('/api/registration/pay-later', async (req, res) => {
  try {
    const { registrationId } = req.body;
    if (!registrationId) {
      return res.status(400).json({ success: false, error: 'Registration ID is required.' });
    }

    const team = await db.getTeamByRegistrationId(registrationId.trim());
    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found.' });
    }

    const leader = team.leader || (team.members && team.members.find(m => m.isLeader)) || (team.members && team.members[0]);
    const leaderEmail = leader ? leader.collegeEmail : null;
    const memberCount = team.memberCount || (team.members ? team.members.length : 2);
    const fee = team.totalFee || HACKATHON_CONFIG.pricingTiers[memberCount] || 250;

    const protocol = req.protocol;
    const host = req.get('host');
    const pageTarget = team.teamType === 'NON_VIT' ? 'register-non-vit.html' : 'register.html';
    const resumeUrl = `${protocol}://${host}/${pageTarget}?resume=${encodeURIComponent(team.registrationId)}`;

    let emailSent = false;
    if (leaderEmail) {
      try {
        emailSent = await sendPayLaterEmail({
          toEmail: leaderEmail,
          teamName: team.teamName,
          registrationId: team.registrationId,
          resumeUrl,
          memberCount,
          fee
        });
      } catch (emailErr) {
        console.warn('[PAY LATER EMAIL ERROR]', emailErr.message);
      }
    }

    res.json({
      success: true,
      message: leaderEmail ? `Resume link sent to ${leaderEmail}` : 'Registration saved',
      registrationId: team.registrationId,
      resumeUrl,
      emailSent
    });
  } catch (err) {
    console.error('Error in /api/registration/pay-later:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------- ADMIN AUTHENTICATION & SECURITY -----------------

const ADMIN_CREDENTIALS = {
  get username() {
    return (process.env.ADMIN_USERNAME || '').trim();
  },
  get password() {
    return (process.env.ADMIN_PASSWORD || '').trim();
  }
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
 * Authenticates admin credentials with dynamic .env reload and trim verification
 */
app.post('/api/admin/login', (req, res) => {
  try {
    require('dotenv').config({ override: true });
  } catch (e) {}

  const expectedUser = ADMIN_CREDENTIALS.username;
  const expectedPass = ADMIN_CREDENTIALS.password;

  if (!expectedUser || !expectedPass) {
    console.error('[SECURITY ALERT] Admin credentials are not configured in environment variables.');
    return res.status(503).json({
      success: false,
      error: 'Admin login is not configured on this server.'
    });
  }

  const { username, password } = req.body || {};
  const inputUser = (username || '').trim();
  const inputPass = (password || '').trim();

  if (!inputUser || !inputPass) {
    return res.status(400).json({
      success: false,
      error: 'Username and password are required.'
    });
  }

  if (inputUser === expectedUser && inputPass === expectedPass) {
    const token = `meta_tok_${crypto.randomBytes(32).toString('hex')}`;
    adminSessions.add(token);
    return res.json({
      success: true,
      message: 'Admin authenticated successfully.',
      token,
      username: expectedUser
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
 * GET /api/admin/referrals
 * Returns all records from the team_referrals table.
 */
app.get('/api/admin/referrals', requireAdminAuth, async (req, res) => {
  try {
    const referrals = await db.getAllTeamReferrals();
    res.json({ success: true, count: referrals.length, referrals });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/vit-teams
 * Dedicated endpoint for VIT Bhopal teams
 */
app.get('/api/admin/vit-teams', requireAdminAuth, async (req, res) => {
  try {
    const teams = await db.getVitTeams();
    res.json({ success: true, count: teams.length, teams });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/non-vit-teams
 * Dedicated endpoint for External / Non-VIT teams
 */
app.get('/api/admin/non-vit-teams', requireAdminAuth, async (req, res) => {
  try {
    const teams = await db.getNonVitTeams();
    res.json({ success: true, count: teams.length, teams });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/all-participants
 * Master directory of all individual participants (VIT + Non-VIT)
 */
app.get('/api/admin/all-participants', requireAdminAuth, async (req, res) => {
  try {
    const participants = await db.getAllParticipants();
    res.json({ success: true, count: participants.length, participants });
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
        const teamRegId = updatedTeam.registrationId || updatedTeam.registration_id || registrationId;
        // We don't await this so it doesn't block the API response
        sendStatusEmail(
          leaderEmail,
          updatedTeam.team_name || updatedTeam.teamName,
          upperStatus === 'VERIFIED' ? 'Verified' : 'Rejected',
          adminNotes || '',
          teamRegId
        ).catch(err => {
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

    if (req.body.status) {
      const upperStatus = req.body.status.toUpperCase();
      if (upperStatus === 'VERIFIED' || upperStatus === 'REJECTED') {
        const leaderEmail = updatedTeam.leader 
          ? updatedTeam.leader.collegeEmail 
          : (updatedTeam.members && updatedTeam.members.length > 0 ? updatedTeam.members[0].collegeEmail : null);
        if (leaderEmail) {
          const teamRegId = updatedTeam.registrationId || updatedTeam.registration_id || id;
          sendStatusEmail(
            leaderEmail,
            updatedTeam.team_name || updatedTeam.teamName,
            upperStatus === 'VERIFIED' ? 'Verified' : 'Rejected',
            req.body.adminNotes || (updatedTeam.payment ? updatedTeam.payment.adminNotes : ''),
            teamRegId
          ).catch(err => console.error('Failed to send status email on adminUpdateTeam:', err));
        }
      }
    }

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
 * Optional CSV export fallback (Protected by Admin Auth)
 */
app.get('/api/admin/export-csv', requireAdminAuth, async (req, res) => {
  try {
    const teams = await db.getAllTeams();
    const formatResidence = (m) => {
      if (!m || !m.fullName) return 'N/A';
      if ((m.residenceType || m.residence_type) === 'DAY_SCHOLAR') {
        const type = (m.dayScholarType || m.day_scholar_type) === 'LOCAL' ? 'Local' : 'Non-Local';
        const loc = m.dayScholarLocation || m.day_scholar_location || '';
        const addr = m.residenceAddress || m.residence_address || '';
        return `Day Scholar [${type}] - ${loc} (${addr})`.trim();
      }
      const block = m.hostelBlock || m.hostel_block || '';
      const room = m.roomNo || m.room_no || '';
      return `Hosteller - ${block} Rm:${room}`.trim();
    };

    const headers = [
      'Registration ID', 'Team Name', 'Track', 'Member Count', 'Status',
      'Leader Name', 'Leader Email', 'Leader Phone', 'Leader Reg No', 'Leader Residence',
      'Member 2 Name', 'Member 2 Reg No', 'Member 2 Email', 'Member 2 Phone', 'Member 2 Residence',
      'Member 3 Name', 'Member 3 Reg No', 'Member 3 Email', 'Member 3 Phone', 'Member 3 Residence',
      'Member 4 Name', 'Member 4 Reg No', 'Member 4 Email', 'Member 4 Phone', 'Member 4 Residence',
      'Member 5 Name', 'Member 5 Reg No', 'Member 5 Email', 'Member 5 Phone', 'Member 5 Residence',
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
        `"${formatResidence(leader).replace(/"/g, '""')}"`,
        `"${(m2.fullName || '').replace(/"/g, '""')}"`, `"${(m2.regNumber || '').replace(/"/g, '""')}"`, `"${(m2.collegeEmail || '').replace(/"/g, '""')}"`, `"${(m2.phone || '').replace(/"/g, '""')}"`, `"${formatResidence(m2).replace(/"/g, '""')}"`,
        `"${(m3.fullName || '').replace(/"/g, '""')}"`, `"${(m3.regNumber || '').replace(/"/g, '""')}"`, `"${(m3.collegeEmail || '').replace(/"/g, '""')}"`, `"${(m3.phone || '').replace(/"/g, '""')}"`, `"${formatResidence(m3).replace(/"/g, '""')}"`,
        `"${(m4.fullName || '').replace(/"/g, '""')}"`, `"${(m4.regNumber || '').replace(/"/g, '""')}"`, `"${(m4.collegeEmail || '').replace(/"/g, '""')}"`, `"${(m4.phone || '').replace(/"/g, '""')}"`, `"${formatResidence(m4).replace(/"/g, '""')}"`,
        `"${(m5.fullName || '').replace(/"/g, '""')}"`, `"${(m5.regNumber || '').replace(/"/g, '""')}"`, `"${(m5.collegeEmail || '').replace(/"/g, '""')}"`, `"${(m5.phone || '').replace(/"/g, '""')}"`, `"${formatResidence(m5).replace(/"/g, '""')}"`,
        `"${payment.paymentMethod || 'N/A'}"`,
        `"${payment.utrNumber || 'N/A'}"`,
        payment.amountPaid || 0,
        `"${payment.transactionDate || 'N/A'}"`,
        `"${payment.status || 'N/A'}"`,
        `"${payment.proofFilePath ? payment.proofFilePath : 'N/A'}"`,
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
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON request body.'
    });
  }

  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) {
    console.error('Unhandled server error:', {
      method: req.method,
      path: req.path,
      errorName: err?.name || 'Error',
      message: err?.message
    });
  }

  return res.status(status).json({
    success: false,
    error: status >= 500 ? 'Internal server error occurred.' : (err?.message || 'Invalid request.')
  });
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 CodeVerse Hackathon Portal is running at:`);
  console.log(`   Student Portal: http://localhost:${PORT}`);
  console.log(`   Admin Dashboard: http://localhost:${PORT}/admin.html`);
  console.log(`=======================================================`);
});
