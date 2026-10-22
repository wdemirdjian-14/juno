// Vérifie la connexion à la boîte d'envoi et envoie un e-mail de test au cabinet.
// Usage : sudo node /var/www/juno/server/send-test.js
const fs = require('fs');
const path = require('path');

// mêmes réglages que le service (fichier /etc/juno-admin.env)
for (const line of fs.readFileSync(process.env.JUNO_ENV || '/etc/juno-admin.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
}

const mailer = require('./lib/mailer').create({ siteDir: path.join(__dirname, '..') });
if (!mailer.enabled()) { console.error('E-mails non configurés (SMTP_HOST absent ou nodemailer non installé).'); process.exit(1); }

mailer.verify()
  .then(() => mailer.test())
  .then(() => console.log(`Connexion réussie. E-mail de test envoyé à ${process.env.NOTIFY_TO || process.env.SMTP_USER}.`))
  .catch(err => {
    console.error(`Échec : ${err.message}`);
    if (/535|Username and Password not accepted|BadCredentials/i.test(err.message)) {
      console.error('→ Google refuse l’identifiant : utilisez un « mot de passe d’application » (16 lettres), pas le mot de passe habituel.');
    }
    if (/relay|5\.7\.1|550/i.test(err.message) && /relay/.test(process.env.SMTP_HOST)) {
      console.error('→ Google refuse le relais : vérifiez dans admin.google.com que l’adresse IP du serveur est autorisée (le réglage peut mettre jusqu’à une heure à s’appliquer).');
    }
    process.exit(1);
  });
