// E-mails du site, envoyés depuis la boîte du cabinet (SMTP) :
// - notification au cabinet pour chaque message reçu (« Répondre » va directement au visiteur)
// - accusé de réception automatique au visiteur
// - réponses rédigées dans le back-office
// Actif seulement si SMTP_HOST est défini dans /etc/juno-admin.env et si nodemailer est installé.
const path = require('path');

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nl2br = s => esc(s).replace(/\r?\n/g, '<br>');

// sujets proposés par le formulaire : seuls ceux-ci sont repris dans l'accusé de réception
const TOPICS = [
  'Propriété littéraire et artistique', 'Droit de la musique', 'Droit de l’audiovisuel', 'Droit de l’édition',
  'Propriété industrielle (marques, dessins et modèles)', 'Droit commercial et concurrence déloyale', 'Image et vie privée', 'Autre demande',
];

const C = { ink: '#161616', muted: '#5f5d59', blue: '#1527ac', pink: '#f6c1b4', paper: '#fbf8f3', line: '#e6e0d7', gold: '#ddae35' };
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

// gabarit commun : tableaux et styles en ligne, compatibles avec Outlook, Gmail et Apple Mail
function layout({ preheader, body }) {
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>JUNO Avocat·es</title></head>
<body style="margin:0;padding:0;background:${C.paper};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};">
<tr><td align="center" style="padding:32px 14px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid ${C.line};">
    <tr><td style="height:6px;background:${C.blue};font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td style="padding:30px 36px 6px;">
      <img src="cid:logo@juno" width="120" height="65" alt="JUNO Avocat·es" style="display:block;border:0;width:120px;height:auto;">
    </td></tr>
    <tr><td style="padding:14px 36px 34px;font-family:${FONT};font-size:16px;line-height:1.65;color:${C.ink};">
${body}
    </td></tr>
    <tr><td style="padding:22px 36px;background:${C.pink};font-family:${FONT};font-size:13px;line-height:1.6;color:${C.ink};">
      <strong>JUNO Avocat·es</strong> — Propriété intellectuelle &amp; droit commercial<br>
      Judith Caillot &amp; Jade Tellini, avocates au Barreau de Paris<br>
      49 rue Saint-Roch, 75001 Paris
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
}

const h1 = t => `<h1 style="margin:0 0 18px;font-family:${FONT};font-size:26px;line-height:1.2;letter-spacing:-.5px;color:${C.ink};">${t}</h1>`;
const p = (t, extra = '') => `<p style="margin:0 0 16px;${extra}">${t}</p>`;
const box = inner => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 22px;"><tr><td style="padding:16px 18px;background:${C.paper};border-radius:12px;border-left:4px solid ${C.gold};font-size:15px;line-height:1.6;">${inner}</td></tr></table>`;
const signature = `<p style="margin:22px 0 0;">Bien cordialement,<br><strong>L’équipe JUNO Avocat·es</strong><br><span style="color:${C.muted};font-size:14px;">Judith Caillot &amp; Jade Tellini</span></p>`;

function create({ siteDir }) {
  let transport = null;
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS_B64 ? Buffer.from(process.env.SMTP_PASS_B64, 'base64').toString('utf8') : process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || (user ? `"JUNO Avocat·es" <${user}>` : '');
  const inbox = process.env.NOTIFY_TO || user;

  if (process.env.SMTP_HOST) {
    try {
      const nodemailer = require('nodemailer');
      const port = Number(process.env.SMTP_PORT || 587);
      transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        // relais SMTP Google Workspace : pas d'identifiant, le serveur est reconnu par son adresse IP
        auth: user ? { user, pass } : undefined,
        name: process.env.SMTP_HELO || undefined,
      });
    } catch (err) {
      console.error('E-mails désactivés (nodemailer absent) :', err.message);
    }
  }

  const logo = { filename: 'juno.png', path: path.join(siteDir, 'assets', 'img', 'juno-signature.png'), cid: 'logo@juno' };
  const send = opts => transport.sendMail({ from, attachments: [logo], ...opts });

  // 1. notification au cabinet
  function notify(msg, siteUrl) {
    const rows = [['Nom', esc(msg.nom)], ['E-mail', `<a href="mailto:${esc(msg.email)}" style="color:${C.blue};">${esc(msg.email)}</a>`],
      msg.telephone ? ['Téléphone', `<a href="tel:${esc(msg.telephone.replace(/[^\d+]/g, ''))}" style="color:${C.blue};">${esc(msg.telephone)}</a>`] : null,
      ['Sujet', esc(msg.sujet)]].filter(Boolean)
      .map(([k, v]) => `<tr><td style="padding:6px 14px 6px 0;color:${C.muted};font-size:14px;white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:6px 0;font-size:15px;">${v}</td></tr>`).join('');
    const html = layout({
      preheader: `${msg.nom} — ${msg.sujet}`,
      body: `${h1('Nouveau message reçu sur le site')}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">${rows}</table>
${box(nl2br(msg.message))}
${p('Répondez directement à cet e-mail : votre réponse partira vers le visiteur, depuis la boîte du cabinet.', `color:${C.muted};font-size:14px;`)}
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:999px;background:${C.blue};"><a href="${esc(siteUrl)}/admin/#messages" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">Ouvrir dans le back-office</a></td></tr></table>`,
    });
    return send({
      to: inbox,
      replyTo: { name: msg.nom, address: msg.email },
      subject: `Nouveau message du site — ${msg.sujet} — ${msg.nom}`,
      text: `Nouveau message reçu sur le site.\n\nNom : ${msg.nom}\nE-mail : ${msg.email}\n${msg.telephone ? `Téléphone : ${msg.telephone}\n` : ''}Sujet : ${msg.sujet}\n\n${msg.message}\n\nBack-office : ${siteUrl}/admin/#messages`,
      html,
    });
  }

  // 2. accusé de réception au visiteur.
  // Volontairement sans le texte du message : personne ne peut se servir du formulaire
  // pour faire envoyer un contenu de son choix à un tiers depuis l'adresse du cabinet.
  function acknowledge(msg) {
    const name = msg.nom.replace(/[^\p{L}\p{M}' .-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const topic = TOPICS.includes(msg.sujet) ? msg.sujet : null;
    const html = layout({
      preheader: 'Votre message a bien été envoyé. Notre équipe revient vers vous dans les plus brefs délais.',
      body: `${h1('Votre message a bien été envoyé')}
${p(`Bonjour${name ? ` ${esc(name)}` : ''},`)}
${p(`Merci d’avoir contacté le cabinet JUNO Avocat·es. Nous avons bien reçu votre demande${topic ? ` concernant <strong>${esc(topic)}</strong>` : ''}.`)}
${p('Notre équipe va l’étudier avec attention et revient vers vous <strong>dans les plus brefs délais</strong>.')}
${box(`<strong>Une précision à ajouter ?</strong><br>Répondez simplement à cet e-mail : votre message sera joint à votre demande.`)}
${signature}`,
    });
    return send({
      to: { name, address: msg.email },
      subject: 'Votre message a bien été envoyé — JUNO Avocat·es',
      text: `Bonjour${name ? ` ${name}` : ''},\n\nMerci d’avoir contacté le cabinet JUNO Avocat·es. Nous avons bien reçu votre demande${topic ? ` concernant « ${topic} »` : ''}.\nNotre équipe va l’étudier avec attention et revient vers vous dans les plus brefs délais.\n\nUne précision à ajouter ? Répondez simplement à cet e-mail.\n\nBien cordialement,\nL’équipe JUNO Avocat·es\n49 rue Saint-Roch, 75001 Paris`,
      html,
      headers: { 'Auto-Submitted': 'auto-replied' },
    });
  }

  // 3. réponse rédigée dans le back-office.
  // Gmail range de lui-même l'envoi dans « Messages envoyés » ; ailleurs, REPLY_BCC permet d'en garder une copie.
  function reply(msg, text) {
    const sent = new Date(msg.date).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });
    const html = layout({
      preheader: text.slice(0, 120),
      body: `${p(nl2br(text), 'margin:0 0 26px;')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:14px 0 0;border-top:1px solid ${C.line};font-size:13px;line-height:1.6;color:${C.muted};">
Le ${esc(sent)}, vous nous avez écrit (${esc(msg.sujet)}) :<br><br>${nl2br(msg.message)}
</td></tr></table>`,
    });
    return send({
      to: { name: msg.nom, address: msg.email },
      bcc: process.env.REPLY_BCC || undefined,
      subject: `Re: Votre demande — ${msg.sujet}`,
      text: `${text}\n\n—\nLe ${sent}, vous nous avez écrit (${msg.sujet}) :\n${msg.message.split('\n').map(l => `> ${l}`).join('\n')}`,
      html,
    });
  }

  return {
    enabled: () => Boolean(transport),
    copyTo: () => process.env.REPLY_BCC || '',
    sender: () => user || (from.match(/<([^>]+)>/) || [])[1] || from,
    verify: () => transport.verify(),
    notify,
    acknowledge,
    reply,
    test: () => send({ to: inbox, subject: 'Test des e-mails du site JUNO', text: 'Les e-mails du site fonctionnent.', html: layout({ preheader: 'Test', body: `${h1('Les e-mails du site fonctionnent')}${p('Ce message de test a été envoyé par le back-office du site JUNO.')}` }) }),
  };
}

module.exports = { create, TOPICS };
