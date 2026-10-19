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

  let statusColor = status === 'Verified' ? '#10b981' : '#ef4444';
  let statusMessage = status === 'Verified' 
    ? "Congratulations! Your team's registration has been successfully verified. You are now officially enrolled in CodeVerse 2.0."
    : "Unfortunately, your team's registration has been rejected.";

  let reasonHtml = '';
  if (status === 'Rejected' && reason) {
    reasonHtml = `
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 6px;">
        <strong style="color: #991b1b;">Reason for Rejection:</strong><br>
        <span style="color: #b91c1c; margin-top: 4px; display: inline-block;">${reason}</span>
      </div>
      <p style="color: #475569; font-size: 14px; line-height: 1.5;">If you believe this is a mistake or if you need to provide updated information (such as a corrected payment receipt or UTR number), you can update your registration on the portal using your Registration Number (<strong>${registrationId || teamName}</strong>) before the registration deadline.</p>
    `;
  }

  let verifiedInfoHtml = '';
  if (status === 'Verified') {
    verifiedInfoHtml = `
      <p style="color: #475569; font-size: 14px; line-height: 1.5;">
        Please save this email and keep your Registration Number (<strong>${registrationId || teamName}</strong>) handy for event check-in, badge verification, and project submission.
      </p>
    `;
  }

  const regBadgeHtml = registrationId ? `
    <div style="margin-top: 14px; padding-top: 14px; border-top: 1px dashed #cbd5e1;">
      <span style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Registration Number</span>
      <div style="font-family: 'Courier New', Courier, monospace; font-size: 18px; font-weight: bold; color: #4338ca; letter-spacing: 1px; margin-top: 4px;">
        ${registrationId}
      </div>
    </div>
  ` : '';

  const detailsTableHtml = `
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin: 22px 0; font-size: 14px;">
      <table style="width: 100%; border-collapse: collapse;">
        ${registrationId ? `
        <tr>
          <td style="padding: 6px 0; color: #64748b; width: 44%;">Registration Number:</td>
          <td style="padding: 6px 0; font-weight: bold; font-family: 'Courier New', Courier, monospace; font-size: 15px; color: #4338ca;">${registrationId}</td>
        </tr>` : ''}
        <tr>
          <td style="padding: 6px 0; color: #64748b; width: 44%;">Team Name:</td>
          <td style="padding: 6px 0; font-weight: bold; color: #0f172a;">${teamName}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b; width: 44%;">Current Status:</td>
          <td style="padding: 6px 0; font-weight: bold; color: ${statusColor}; text-transform: uppercase;">${status}</td>
        </tr>
      </table>
    </div>
  `;

  const subject = `CodeVerse 2.0 Registration Status - ${status}${registrationId ? ` (${registrationId})` : ''}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff; color: #1e293b;">
      <h2 style="color: #6366f1; margin-top: 0;">CodeVerse 2.0</h2>
      <p>Hello Team Leader (<strong>${teamName}</strong>),</p>
      <p>We are writing to update you on your hackathon registration status.</p>
      
      <div style="text-align: center; margin: 25px 0; padding: 18px; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h3 style="margin: 0; color: #374151; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Current Status:</h3>
        <h2 style="margin: 8px 0 0 0; color: ${statusColor}; text-transform: uppercase; letter-spacing: 2px; font-size: 26px;">${status}</h2>
        ${regBadgeHtml}
      </div>

      ${detailsTableHtml}

      <p style="font-size: 15px; line-height: 1.5;">${statusMessage}</p>
      
      ${verifiedInfoHtml}
      ${reasonHtml}

      <br>
      <p style="color: #334155;">Best regards,<br><strong>Metaversity Club, VIT Bhopal</strong></p>
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
