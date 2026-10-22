// Mesure d'audience maison, sans cookie : compteurs agrégés par jour.
// Un visiteur est reconnu dans la journée par une empreinte (IP + navigateur + sel du jour).
// Le sel et les empreintes sont effacés à la fin de chaque journée : rien ne permet ensuite de retrouver une personne.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { readJSON, writeJSON } = require('./store');

const BOTS = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|curl|wget|python|monitor/i;
const SECTIONS = ['accueil', 'cabinet', 'competences', 'commercial', 'equipe', 'honoraires', 'contact'];
const EVENTS = ['contact_open', 'contact_sent'];

const dayKey = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }); // AAAA-MM-JJ
const hourParis = () => Number(new Date().toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false })) % 24;

const emptyDay = () => ({
  views: 0, visitors: 0, pages: {}, refs: {}, devices: {}, browsers: {}, sections: {}, events: {}, hours: Array(24).fill(0),
});

function browserOf(ua) {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
  if (/Chrome\//.test(ua) || /CriOS/.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Autre';
}

function deviceOf(width, ua) {
  const w = Number(width) || 0;
  if (w && w < 700) return 'Mobile';
  if (w && w < 1100) return 'Tablette';
  if (!w && /Mobi|Android/.test(ua)) return 'Mobile';
  return 'Ordinateur';
}

function refOf(ref, host) {
  try {
    const u = new URL(ref);
    if (!/^https?:$/.test(u.protocol) || u.hostname === host) return null;
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

const bump = (obj, key, n = 1) => { obj[key] = (obj[key] || 0) + n; };

function create(dataDir) {
  const dir = path.join(dataDir, 'analytics');
  fs.mkdirSync(dir, { recursive: true });
  const file = day => path.join(dir, `${day}.json`);

  let today = null; // { key, data, salt, seen:Set }
  let dirty = false;

  function load() {
    const key = dayKey();
    if (today?.key === key) return today;
    if (today) flush(true); // journée terminée : on enregistre sans le sel ni les empreintes
    const saved = readJSON(file(key), null);
    today = {
      key,
      data: { ...emptyDay(), ...(saved?.data || {}) },
      salt: saved?.salt || crypto.randomBytes(16).toString('hex'),
      seen: new Set(saved?.seen || []),
    };
    return today;
  }

  function flush(final = false) {
    if (!today || (!dirty && !final)) return;
    const body = final ? { data: today.data } : { data: today.data, salt: today.salt, seen: [...today.seen] };
    writeJSON(file(today.key), body);
    dirty = false;
  }

  // purge des empreintes des jours passés (au cas où le serveur aurait été arrêté pendant la nuit)
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || f === `${dayKey()}.json`) continue;
    const saved = readJSON(path.join(dir, f), null);
    if (saved && (saved.salt || saved.seen)) writeJSON(path.join(dir, f), { data: saved.data });
  }

  setInterval(() => flush(), 30e3).unref();

  function track(hit, { ip, ua, host }) {
    if (!ua || BOTS.test(ua)) return;
    const t = load();
    const d = t.data;
    const visitor = crypto.createHash('sha256').update(`${t.salt}|${ip}|${ua}`).digest('base64url').slice(0, 16);

    if (hit.t === 'pv') {
      d.views++;
      if (!t.seen.has(visitor)) { t.seen.add(visitor); d.visitors++; }
      bump(d.pages, String(hit.p || '/').slice(0, 80));
      bump(d.refs, refOf(hit.r, host) || 'Accès direct');
      bump(d.devices, deviceOf(hit.w, ua));
      bump(d.browsers, browserOf(ua));
      d.hours[hourParis()]++;
    } else if (hit.t === 'sec' && SECTIONS.includes(hit.v)) {
      bump(d.sections, hit.v);
    } else if (hit.t === 'ev' && EVENTS.includes(hit.v)) {
      bump(d.events, hit.v);
    } else {
      return;
    }
    dirty = true;
  }

  // événement compté côté serveur (message reçu)
  function event(name) {
    bump(load().data.events, name);
    dirty = true;
  }

  function stats(days) {
    load();
    flush();
    const series = [];
    const total = { ...emptyDay() };
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86400e3);
      const key = dayKey(date);
      const d = key === today.key ? today.data : { ...emptyDay(), ...(readJSON(file(key), null)?.data || {}) };
      series.push({ day: key, views: d.views, visitors: d.visitors });
      total.views += d.views;
      total.visitors += d.visitors;
      for (const k of ['pages', 'refs', 'devices', 'browsers', 'sections', 'events']) {
        for (const [name, n] of Object.entries(d[k] || {})) bump(total[k], name, n);
      }
      (d.hours || []).forEach((n, h) => { total.hours[h] += n; });
    }
    return { days, series, total };
  }

  return { track, event, stats, flush: () => flush() };
}

module.exports = { create, SECTIONS };
