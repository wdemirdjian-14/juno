// Back-office JUNO : API du formulaire, mesure d'audience, gestion des messages et des textes.
// Aucune dépendance obligatoire (Node.js 18+). Nginx relaie /api/ et /admin/ vers ce serveur.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3100);
const HOST = process.env.BIND || '127.0.0.1';
const SITE_DIR = path.resolve(process.env.JUNO_SITE || path.join(__dirname, '..'));
const DATA_DIR = path.resolve(process.env.JUNO_DATA || '/var/lib/juno');
const ADMIN_DIR = path.join(SITE_DIR, 'admin');

const auth = require('./lib/auth').create(DATA_DIR);
const content = require('./lib/content').create({ siteDir: SITE_DIR, dataDir: DATA_DIR });
const analytics = require('./lib/analytics').create(DATA_DIR);
const messages = require('./lib/messages').create(DATA_DIR);
const mailer = require('./lib/mailer');

content.render();

/* ---------- utilitaires ---------- */

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

function send(res, status, body, headers = {}) {
  const isJSON = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isJSON ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(isJSON ? JSON.stringify(body) : body);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Trop volumineux'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(Object.assign(new Error('JSON invalide'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

const clientIp = req => (req.headers['x-real-ip'] || req.socket.remoteAddress || '').toString();
const isHttps = req => req.headers['x-forwarded-proto'] === 'https';
const siteUrl = req => `${isHttps(req) ? 'https' : 'http'}://${req.headers.host}`;

// limite simple : n requêtes par fenêtre et par IP
function limiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, windowMs).unref();
  return key => {
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return true; }
    h.n++;
    return h.n <= max;
  };
}
const contactLimit = limiter(5, 10 * 60e3);
const loginLimit = limiter(8, 15 * 60e3);
const trackLimit = limiter(120, 60e3);

// les requêtes qui modifient quelque chose doivent venir du site lui-même
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

function serveAdminFile(res, rel) {
  const file = path.join(ADMIN_DIR, rel);
  if (!file.startsWith(ADMIN_DIR + path.sep)) return send(res, 404, 'Introuvable');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Introuvable');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'X-Robots-Tag': 'noindex, nofollow',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors 'none'",
    });
    res.end(buf);
  });
}

/* ---------- routes ---------- */

async function route(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  const method = req.method;

  if (method !== 'GET' && method !== 'HEAD' && !sameOrigin(req)) return send(res, 403, { error: 'Origine refusée' });

  // --- public ---
  if (p === '/api/t' && method === 'POST') {
    if (trackLimit(clientIp(req))) {
      const hit = await readBody(req, 4096).catch(() => null);
      if (hit) analytics.track(hit, { ip: clientIp(req), ua: req.headers['user-agent'] || '', host: (req.headers.host || '').split(':')[0] });
    }
    return send(res, 204, '');
  }

  if (p === '/api/contact' && method === 'POST') {
    const body = await readBody(req);
    if (body._honey) return send(res, 200, { success: true }); // robot : on fait comme si
    if (!contactLimit(clientIp(req))) return send(res, 429, { error: 'Trop de messages envoyés. Merci de réessayer plus tard.' });
    const { msg, errors } = messages.validate(body);
    if (errors.length) return send(res, 400, { error: 'Champs invalides', fields: errors });
    const item = messages.add(msg);
    analytics.event('contact_sent');
    mailer.notify(item, siteUrl(req));
    return send(res, 200, { success: true });
  }

  // --- back-office : pages ---
  if (p === '/admin') return send(res, 301, '', { Location: '/admin/' });
  if (p === '/admin/' && method === 'GET') return serveAdminFile(res, 'index.html');
  if (p.startsWith('/admin/') && method === 'GET') return serveAdminFile(res, p.slice('/admin/'.length));

  // --- aperçu local sans Nginx (SERVE_STATIC=1) : sert le site comme le ferait Nginx ---
  if (process.env.SERVE_STATIC && method === 'GET' && !p.startsWith('/api/')) {
    const file = p === '/' || p === '/index.html' ? path.join(DATA_DIR, 'public', 'index.html') : path.join(SITE_DIR, decodeURIComponent(p));
    if (!file.startsWith(SITE_DIR + path.sep) && !file.startsWith(DATA_DIR + path.sep)) return send(res, 404, 'Introuvable');
    return fs.readFile(file, (err, buf) => {
      if (err) return send(res, 404, 'Introuvable');
      const types = { ...MIME, '.jpg': 'image/jpeg', '.webp': 'image/webp' };
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'text/css' });
      res.end(buf);
    });
  }

  // --- back-office : API ---
  if (!p.startsWith('/api/admin/')) return send(res, 404, { error: 'Introuvable' });
  const route = p.slice('/api/admin/'.length);

  if (route === 'login' && method === 'POST') {
    if (!loginLimit(clientIp(req))) return send(res, 429, { error: 'Trop de tentatives. Réessayez dans 15 minutes.' });
    const { password } = await readBody(req);
    if (!auth.hasPassword()) return send(res, 503, { error: 'Aucun mot de passe défini sur le serveur.' });
    if (!auth.checkPassword(password)) return send(res, 401, { error: 'Mot de passe incorrect.' });
    return send(res, 200, { ok: true }, { 'Set-Cookie': auth.issueCookie(isHttps(req)) });
  }
  if (route === 'logout' && method === 'POST') return send(res, 200, { ok: true }, { 'Set-Cookie': auth.clearCookie() });

  if (!auth.isAuthenticated(req)) return send(res, 401, { error: 'Non connecté' });

  if (route === 'me' && method === 'GET') {
    return send(res, 200, { ok: true, mail: mailer.enabled(), unread: messages.all().filter(m => !m.archived && m.status === 'nouveau').length });
  }

  if (route === 'stats' && method === 'GET') {
    const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 30, 1), 365);
    const stats = analytics.stats(days);
    const since = Date.now() - days * 86400e3;
    stats.messages = messages.all().filter(m => Date.parse(m.date) >= since).length;
    return send(res, 200, stats);
  }

  if (route === 'messages' && method === 'GET') return send(res, 200, messages.all());

  let m = route.match(/^messages\/([\w-]+)$/);
  if (m && method === 'PATCH') {
    const item = messages.update(m[1], await readBody(req));
    return item ? send(res, 200, item) : send(res, 404, { error: 'Message introuvable' });
  }
  if (m && method === 'DELETE') {
    return messages.remove(m[1]) ? send(res, 200, { ok: true }) : send(res, 400, { error: 'Seul un message archivé peut être supprimé.' });
  }
  m = route.match(/^messages\/([\w-]+)\/notes$/);
  if (m && method === 'POST') {
    const item = messages.addNote(m[1], (await readBody(req)).text);
    return item ? send(res, 200, item) : send(res, 400, { error: 'Note vide ou message introuvable' });
  }
  m = route.match(/^messages\/([\w-]+)\/notes\/([\w-]+)$/);
  if (m && method === 'DELETE') {
    const item = messages.removeNote(m[1], m[2]);
    return item ? send(res, 200, item) : send(res, 404, { error: 'Message introuvable' });
  }

  if (route === 'content' && method === 'GET') return send(res, 200, content.fields());
  if (route === 'content' && method === 'PUT') return send(res, 200, content.save((await readBody(req, 512 * 1024)).values));

  if (route === 'password' && method === 'POST') {
    const { current, next } = await readBody(req);
    if (!auth.checkPassword(current)) return send(res, 400, { error: 'Mot de passe actuel incorrect.' });
    if (typeof next !== 'string' || next.length < 10) return send(res, 400, { error: 'Le nouveau mot de passe doit faire au moins 10 caractères.' });
    auth.setPassword(next);
    return send(res, 200, { ok: true }, { 'Set-Cookie': auth.issueCookie(isHttps(req)) });
  }

  return send(res, 404, { error: 'Introuvable' });
}

const server = http.createServer((req, res) => {
  route(req, res).catch(err => {
    if (!err.status) console.error(err);
    if (!res.headersSent) send(res, err.status || 500, { error: err.status ? err.message : 'Erreur serveur' });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Back-office JUNO sur http://${HOST}:${PORT} (site : ${SITE_DIR}, données : ${DATA_DIR})`);
  if (!auth.hasPassword()) console.log('Aucun mot de passe défini : lancez « node server/set-password.js ».');
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => { analytics.flush(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref(); });
}
