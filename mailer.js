require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

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
    return await sendViaAppsScript(toEmail, subject, html);
  }

  const mailOptions = {
    from: `"CodeVerse Organizers" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject,
    html
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending OTP email:', error);
    return false;
  }
}

async function sendStatusEmail(toEmail, teamName, status, reason = '') {
  let statusColor = status === 'Verified' ? '#10b981' : '#ef4444';
  let statusMessage = status === 'Verified' 
    ? "Congratulations! Your team's registration has been successfully verified. You are now officially enrolled in CodeVerse 2.0."
    : "Unfortunately, your team's registration has been rejected.";

  let reasonHtml = '';
  if (status === 'Rejected' && reason) {
    reasonHtml = `
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0;">
        <strong style="color: #991b1b;">Reason for Rejection:</strong><br>
        <span style="color: #b91c1c;">${reason}</span>
      </div>
      <p>If you believe this is a mistake or if you need to provide updated information (like a correct payment screenshot), please reply to this email or edit your details via the registration portal before the deadline.</p>
    `;
  }

  const subject = `CodeVerse 2.0 Registration Status - ${status}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
      <h2 style="color: #6366f1;">CodeVerse 2.0</h2>
      <p>Hello Team Leader (<strong>${teamName}</strong>),</p>
      <p>We are writing to update you on your hackathon registration status.</p>
      
      <div style="text-align: center; margin: 25px 0; padding: 15px; background-color: #f9fafb; border-radius: 8px;">
        <h3 style="margin: 0; color: #374151;">Current Status:</h3>
        <h2 style="margin: 10px 0 0 0; color: ${statusColor}; text-transform: uppercase; letter-spacing: 2px;">${status}</h2>
      </div>

      <p>${statusMessage}</p>
      
      ${reasonHtml}

      <br>
      <p>Best regards,<br><strong>Metaversity Club, VIT Bhopal</strong></p>
    </div>
  `;

  if (process.env.GOOGLE_SCRIPT_URL) {
    return await sendViaAppsScript(toEmail, subject, html);
  }

  const mailOptions = {
    from: `"CodeVerse Organizers" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject,
    html
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending status email:', error);
    return false;
  }
}

module.exports = {
  sendOTPEmail,
  sendStatusEmail
};
