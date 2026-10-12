const nodemailer = require('nodemailer');

function buildTransport() {
  if (process.env.NODE_ENV === 'test') return null;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) return null;
  try {
    return nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
      secure: true,
      port: 465,
    });
  } catch {
    return null;
  }
}

async function sendMailSafe({ to, subject, html }) {
  const tx = buildTransport();
  const from = process.env.NOTIFY_FROM_EMAIL || process.env.EMAIL_USER || 'no-reply@example.com';
  if (!tx) {
    console.log('[email:mock]', { to, subject });
    return;
  }
  await tx.sendMail({ from, to, subject, html });
}

function wrapTemplate(title, bodyHtml) {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
    <div style="background:#111827;color:#fff;padding:12px 16px;border-radius:8px 8px 0 0;">${title}</div>
    <div style="border:1px solid #e5e7eb;border-top:0;padding:16px;border-radius:0 0 8px 8px;">
      ${bodyHtml}
    </div>
  </div>`;
}

async function sendRegistrationReceived(user, pharmacy) {
  if (!user?.email) return;
  const html = wrapTemplate('Registration received', `
    <p>Hi ${user.fullName || ''},</p>
    <p>We received your pharmacy registration: <b>${pharmacy.name}</b>. Our team will review it shortly.</p>
  `);
  await sendMailSafe({ to: user.email, subject: 'Pharmacy registration received', html });
}

async function sendAutoVerified(user, pharmacy) {
  if (!user?.email) return;
  const html = wrapTemplate('Auto verification', `
    <p>Hi ${user.fullName || ''},</p>
    <p>Your pharmacy <b>${pharmacy.name}</b> has been auto-verified based on a nearby public listing. An admin may still review it.</p>
  `);
  await sendMailSafe({ to: user.email, subject: 'Pharmacy auto-verified', html });
}

async function sendApproved(user, pharmacy) {
  if (!user?.email) return;
  const html = wrapTemplate('Verification approved', `
    <p>Hi ${user.fullName || ''},</p>
    <p>Your pharmacy <b>${pharmacy.name}</b> has been approved.</p>
  `);
  await sendMailSafe({ to: user.email, subject: 'Pharmacy verification approved', html });
}

async function sendRejected(user, pharmacy, note) {
  if (!user?.email) return;
  const more = note ? `<p><i>Reason:</i> ${note}</p>` : '';
  const html = wrapTemplate('Verification rejected', `
    <p>Hi ${user.fullName || ''},</p>
    <p>We could not verify your pharmacy <b>${pharmacy.name}</b> at this time.</p>
    ${more}
  `);
  await sendMailSafe({ to: user.email, subject: 'Pharmacy verification rejected', html });
}

module.exports = { sendRegistrationReceived, sendAutoVerified, sendApproved, sendRejected };
