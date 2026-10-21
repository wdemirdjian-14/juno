// Accès unique au back-office : un mot de passe (haché en scrypt) et un cookie de session signé
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { readJSON, writeJSON } = require('./store');

const SESSION_HOURS = 12;
const COOKIE = 'juno_admin';

function create(dataDir) {
  const authFile = path.join(dataDir, 'auth.json');
  const secretFile = path.join(dataDir, 'secret.key');

  let secret;
  try {
    secret = fs.readFileSync(secretFile);
  } catch {
    secret = crypto.randomBytes(48);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(secretFile, secret, { mode: 0o600 });
  }

  const hasPassword = () => Boolean(readJSON(authFile, null)?.hash);

  function setPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    // la date invalide toutes les sessions ouvertes avant le changement
    writeJSON(authFile, { salt, hash, changedAt: Date.now() });
  }

  function checkPassword(password) {
    const auth = readJSON(authFile, null);
    if (!auth?.hash || typeof password !== 'string') return false;
    const hash = crypto.scryptSync(password, auth.salt, 64);
    return crypto.timingSafeEqual(hash, Buffer.from(auth.hash, 'hex'));
  }

  const sign = value => crypto.createHmac('sha256', secret).update(value).digest('base64url');

  function issueCookie(secure) {
    const payload = Buffer.from(JSON.stringify({ iat: Date.now(), exp: Date.now() + SESSION_HOURS * 3600e3 })).toString('base64url');
    const flags = `Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}${secure ? '; Secure' : ''}`;
    return `${COOKIE}=${payload}.${sign(payload)}; ${flags}`;
  }

  const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

  function isAuthenticated(req) {
    const raw = (req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(`${COOKIE}=`));
    if (!raw) return false;
    const [payload, sig] = raw.slice(COOKIE.length + 1).split('.');
    if (!payload || !sig) return false;
    const expected = Buffer.from(sign(payload));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return false;
    try {
      const { iat, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
      const changedAt = readJSON(authFile, {}).changedAt || 0;
      return exp > Date.now() && iat >= changedAt;
    } catch {
      return false;
    }
  }

  return { hasPassword, setPassword, checkPassword, issueCookie, clearCookie, isAuthenticated };
}

module.exports = { create };
