// Définit le mot de passe du back-office. Usage : sudo -u www-data node server/set-password.js
const path = require('path');
const readline = require('readline');

const DATA_DIR = path.resolve(process.env.JUNO_DATA || '/var/lib/juno');
const auth = require('./lib/auth').create(DATA_DIR);

function ask(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = s => { if (s.includes(question)) process.stdout.write(s); }; // saisie masquée
    rl.question(question, answer => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

(async () => {
  const first = await ask('Nouveau mot de passe du back-office (10 caractères minimum) : ');
  if (first.length < 10) { console.error('Trop court.'); process.exit(1); }
  const second = await ask('Confirmez le mot de passe : ');
  if (first !== second) { console.error('Les deux saisies ne correspondent pas.'); process.exit(1); }
  auth.setPassword(first);
  console.log(`Mot de passe enregistré (${DATA_DIR}/auth.json).`);
})();
