// Notification par e-mail à chaque nouveau message (facultatif).
// Actif seulement si SMTP_HOST est défini dans /etc/juno-admin.env et si nodemailer est installé.
let transport = null;

if (process.env.SMTP_HOST) {
  try {
    const nodemailer = require('nodemailer');
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  } catch (err) {
    console.error('Notifications e-mail désactivées (nodemailer absent) :', err.message);
  }
}

async function notify(msg, siteUrl) {
  if (!transport) return;
  const to = process.env.NOTIFY_TO || 'j.tellini@juno-avocates.fr';
  const lines = [
    `Nouveau message reçu sur le site JUNO.`,
    '',
    `Nom : ${msg.nom}`,
    `E-mail : ${msg.email}`,
    msg.telephone ? `Téléphone : ${msg.telephone}` : null,
    `Sujet : ${msg.sujet}`,
    '',
    msg.message,
    '',
    `À traiter dans le back-office : ${siteUrl}/admin/`,
  ].filter(l => l !== null);
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      replyTo: msg.email,
      subject: `Site JUNO — ${msg.sujet} — ${msg.nom}`,
      text: lines.join('\n'),
    });
  } catch (err) {
    console.error('Échec de la notification e-mail :', err.message);
  }
}

module.exports = { notify, enabled: () => Boolean(transport) };
