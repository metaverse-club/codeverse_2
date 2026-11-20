require('dotenv').config();
const nodemailer = require('nodemailer');

function createTransporter(port = 465, secure = true) {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port,
    secure,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
}

async function sendMailWithFallback(mailOptions) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    const err = 'EMAIL_USER and/or EMAIL_PASS environment variables are not configured in the deployment dashboard.';
    console.error('[MAILER ERROR]', err);
    return { success: false, error: err };
  }

  // Attempt 1: Port 465 (Direct SSL)
  try {
    const t465 = createTransporter(465, true);
    await t465.sendMail(mailOptions);
    return { success: true };
  } catch (err465) {
    console.warn('[MAILER] Port 465 SSL failed, trying fallback Port 587 TLS:', err465.message);
    // Attempt 2: Port 587 (Explicit TLS)
    try {
      const t587 = createTransporter(587, false);
      await t587.sendMail(mailOptions);
      return { success: true };
    } catch (err587) {
      console.warn('[MAILER] Port 587 TLS failed, trying service: "gmail":', err587.message);
      // Attempt 3: service: 'gmail' default
      try {
        const tService = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });
        await tService.sendMail(mailOptions);
        return { success: true };
      } catch (errService) {
        console.error('[MAILER] All email transport methods failed:', errService.message);
        return { success: false, error: errService.message };
      }
    }
  }
}

async function sendViaAppsScript(to, subject, html) {
  try {
    console.log('Sending email via Google Apps Script Webhook...');
    
    let targetUrl = process.env.GOOGLE_SCRIPT_URL;
    let response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, subject, html })
    });

    // We expect the script to return plain text or JSON
    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch(e) {
      // If it's not JSON, just check if the text says success
      if (text.toLowerCase().includes('success')) {
        return true;
      }
      console.error('Apps script returned non-JSON:', text);
      return false;
    }

    if (!result.success) {
      console.error('Apps Script error:', result.error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Fetch error calling Apps Script:', err);
    return false;
  }
}

async function sendOTPEmail(toEmail, otp) {
  const subject = 'CodeVerse 2.0 - Team Leader Email Verification (OTP)';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
      <h2 style="color: #6366f1;">CodeVerse 2.0</h2>
      <p>Hello Team Leader,</p>
      <p>Use the following One-Time Password (OTP) to verify your email address for the CodeVerse Hackathon registration:</p>
      <div style="text-align: center; margin: 30px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; background-color: #f3f4f6; padding: 10px 20px; border-radius: 5px; color: #1f2937;">
          ${otp}
        </span>
      </div>
      <p style="color: #6b7280; font-size: 14px;">This OTP is valid for 10 minutes. Do not share this code with anyone.</p>
      <br>
      <p>Best regards,<br><strong>Metaversity Club, VIT Bhopal</strong></p>
    </div>
  `;

  if (process.env.GOOGLE_SCRIPT_URL) {
    const appsScriptResult = await sendViaAppsScript(toEmail, subject, html);
    if (appsScriptResult) return { success: true };
  }

  const mailOptions = {
    from: `"CodeVerse Organizers" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject,
    html
  };

  return await sendMailWithFallback(mailOptions);
}

async function sendStatusEmail(toEmailOrOptions, teamNameParam, statusParam, reasonParam = '', registrationIdParam = '') {
  let toEmail, teamName, status, reason, registrationId;

  if (typeof toEmailOrOptions === 'object' && toEmailOrOptions !== null) {
    toEmail = toEmailOrOptions.toEmail || toEmailOrOptions.email;
    teamName = toEmailOrOptions.teamName;
    status = toEmailOrOptions.status;
    reason = toEmailOrOptions.reason || '';
    registrationId = toEmailOrOptions.registrationId || toEmailOrOptions.registrationNumber || '';
  } else {
    toEmail = toEmailOrOptions;
    teamName = teamNameParam;
    status = statusParam;
    reason = reasonParam || '';
    registrationId = registrationIdParam || '';
  }

  registrationId = (registrationId || '').toString().trim();
  teamName = (teamName || 'Team').toString().trim();

  const isVerified = status === 'Verified';
  const logoUrl = 'https://meusgghusvczisotyzoc.supabase.co/storage/v1/object/public/receipts/codeverse_logo.png';
  const waLink = 'https://chat.whatsapp.com/EEqc2L4goWxAVMKDfLyXFL?s=cl&p=a&iam=2';

  const statusBg = isVerified ? '#ecfdf5' : '#fef2f2';
  const statusBorder = isVerified ? '#a7f3d0' : '#fca5a5';
  const statusColor = isVerified ? '#059669' : '#dc2626';

  let statusBadgeHtml = `
    <div style="background-color: ${statusBg}; border: 2px solid ${statusBorder}; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
      <div style="font-size: 12px; color: ${statusColor}; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;">Registration Status</div>
      <div style="font-size: 28px; font-weight: 800; color: ${statusColor}; margin: 6px 0; letter-spacing: 1.5px;">${status.toUpperCase()}</div>
      ${registrationId ? `
      <div style="font-family: 'Courier New', Courier, monospace; font-size: 18px; font-weight: bold; color: #3730a3; background-color: #e0e7ff; padding: 7px 16px; border-radius: 6px; display: inline-block; margin-top: 6px; letter-spacing: 1px;">
        ${registrationId}
      </div>` : ''}
    </div>
  `;

  let actionCardHtml = '';
  if (isVerified) {
    actionCardHtml = `
      <div style="background-color: #f0fdf4; border: 1.5px solid #86efac; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
        <h4 style="margin: 0 0 6px 0; color: #166534; font-size: 15px; font-weight: 700;">📢 Official Participant WhatsApp Community</h4>
        <p style="font-size: 13.5px; color: #15803d; margin: 0 0 14px 0; line-height: 1.4;">
          Join the official WhatsApp group for important announcements, schedule updates, check-in instructions, and food coupons:
        </p>
        <a href="${waLink}" target="_blank" style="display: inline-block; background-color: #25D366; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; font-size: 14.5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          👉 Join WhatsApp Group
        </a>
      </div>
      <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin: 16px 0;">
        Please save this confirmation email and keep your Registration Number (<strong>${registrationId || teamName}</strong>) handy for venue gate entry, badge verification, and project submission at VIT Bhopal.
      </p>
    `;
  } else if (reason) {
    actionCardHtml = `
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin: 20px 0; border-radius: 6px;">
        <strong style="color: #991b1b; font-size: 14px;">Reason for Rejection:</strong><br>
        <span style="color: #b91c1c; margin-top: 4px; display: inline-block; font-size: 14px;">${reason}</span>
      </div>
      <p style="color: #475569; font-size: 14px; line-height: 1.5;">
        If you need to provide updated information (such as a corrected payment receipt or UTR number), you can update your registration on the portal using your Registration Number (<strong>${registrationId || teamName}</strong>) before the registration deadline.
      </p>
    `;
  }

  const subject = `CodeVerse 2.0 Registration Status - ${status}${registrationId ? ` (${registrationId})` : ''}`;
  const html = `
    <div style="background-color: #f1f5f9; margin: 0; padding: 30px 15px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.07); overflow: hidden;">
        
        <!-- Tech Indigo Header Banner -->
        <div style="background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
          <img src="${logoUrl}" alt="CodeVerse 2.0" style="width: 80px; height: 80px; border-radius: 16px; border: 3px solid rgba(255,255,255,0.3); display: block; margin: 0 auto;">
          <h1 style="margin: 14px 0 4px 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff;">CodeVerse 2.0</h1>
          <p style="margin: 0; font-size: 13px; color: #c7d2fe; letter-spacing: 1.5px; text-transform: uppercase;">Central India's Premier Hackathon</p>
        </div>

        <!-- Body Content -->
        <div style="padding: 28px 30px; color: #1e293b;">
          <h3 style="margin: 0 0 8px 0; color: #0f172a; font-size: 18px;">
            ${isVerified ? `Welcome to CodeVerse, ${teamName}! 🚀` : `Hello Team Leader (${teamName}),`}
          </h3>
          <p style="color: #475569; font-size: 14.5px; line-height: 1.5; margin: 0;">
            ${isVerified 
              ? "Your squad is locked in and officially confirmed! Here is your official registration verification badge:" 
              : "We are writing to update you regarding your team's hackathon registration status."}
          </p>

          ${statusBadgeHtml}
          ${actionCardHtml}

          <div style="border-top: 1px solid #f1f5f9; padding-top: 18px; margin-top: 24px; font-size: 13px; color: #475569; line-height: 1.5;">
            Warm regards,<br>
            <strong style="color: #0f172a; font-size: 14px;">Metaversity Club, VIT Bhopal University</strong>
          </div>
        </div>

      </div>
    </div>
  `;

  if (process.env.GOOGLE_SCRIPT_URL) {
    const appsScriptResult = await sendViaAppsScript(toEmail, subject, html);
    if (appsScriptResult) return true;
  }

  const mailOptions = {
    from: `"CodeVerse Organizers" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject,
    html
  };

  const res = await sendMailWithFallback(mailOptions);
  return res.success;
}

async function sendPayLaterEmail({ toEmail, teamName, registrationId, resumeUrl, memberCount, fee }) {
  const subject = `CodeVerse 2.0 - Complete Registration for Team ${teamName} (${registrationId})`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
      <div style="border-bottom: 2px solid #6366f1; padding-bottom: 15px; margin-bottom: 20px;">
        <h2 style="color: #6366f1; margin: 0; font-size: 24px;">CodeVerse 2.0 Hackathon</h2>
        <p style="color: #64748b; margin: 5px 0 0 0; font-size: 14px;">Innovate • Collaborate • Build the Future</p>
      </div>

      <p style="font-size: 16px;">Hello Team Leader,</p>
      <p style="line-height: 1.6; color: #334155;">
        Your squad details for <strong>${teamName}</strong> have been saved! Your team registration is currently 
        <strong style="color: #f59e0b;">PENDING PAYMENT</strong>.
      </p>

      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 25px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Registration ID:</td>
            <td style="padding: 6px 0; font-weight: bold; font-family: monospace; font-size: 16px; color: #0f172a;">${registrationId}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Team Name:</td>
            <td style="padding: 6px 0; font-weight: bold; color: #0f172a;">${teamName}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Squad Size:</td>
            <td style="padding: 6px 0; font-weight: bold; color: #0f172a;">${memberCount || 2} Members</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Registration Fee:</td>
            <td style="padding: 6px 0; font-weight: bold; color: #10b981; font-size: 17px;">₹${fee || 250}</td>
          </tr>
        </table>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${resumeUrl}" style="background-color: #6366f1; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.4);">
          Complete Payment & Registration →
        </a>
      </div>

      <p style="color: #64748b; font-size: 13px; line-height: 1.5;">
        Or copy and paste this direct resume link into your browser:<br>
        <a href="${resumeUrl}" style="color: #6366f1; word-break: break-all;">${resumeUrl}</a>
      </p>

      <div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid #e2e8f0; font-size: 13px; color: #94a3b8;">
        <p><strong>Note:</strong> Your registration slot is reserved temporarily until the registration deadline. Please complete your fee payment and submit the UTR screenshot to finalize your spot.</p>
        <p>Best regards,<br><strong>Metaversity Club, VIT Bhopal</strong></p>
      </div>
    </div>
  `;

  if (process.env.GOOGLE_SCRIPT_URL) {
    const appsScriptResult = await sendViaAppsScript(toEmail, subject, html);
    if (appsScriptResult) return true;
  }

  const mailOptions = {
    from: `"CodeVerse Organizers" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject,
    html
  };

  const res = await sendMailWithFallback(mailOptions);
  return res.success;
}

module.exports = {
  sendOTPEmail,
  sendStatusEmail,
  sendPayLaterEmail
};
