/* JUNO AVOCAT·ES — animations au défilement, menu et widget de contact */

// Adresse proposée au visiteur si l'envoi par le formulaire échoue
const CONTACT_EMAIL = 'j.tellini@juno-avocates.fr';

const root = document.documentElement;
const motion = root.classList.contains('motion');
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

/* ---------- Mesure d'audience (sans cookie, envoyée au back-office du site) ---------- */
function track(hit) {
  if (location.protocol === 'file:' || navigator.doNotTrack === '1') return;
  const body = JSON.stringify(hit);
  if (!(navigator.sendBeacon && navigator.sendBeacon('/api/t', new Blob([body], { type: 'application/json' })))) {
    fetch('/api/t', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
  }
}
track({ t: 'pv', p: location.pathname, r: document.referrer, w: innerWidth });

// sections atteintes pendant la visite (une fois chacune)
if ('IntersectionObserver' in window) {
  const seen = new Set();
  const so = new IntersectionObserver(entries => entries.forEach(e => {
    const g = e.target.id;
    if (e.isIntersecting && !seen.has(g)) { seen.add(g); track({ t: 'sec', v: g }); so.unobserve(e.target); }
  }), { threshold: 0.25 });
  ['accueil', 'cabinet', 'competences', 'commercial', 'equipe', 'honoraires', 'contact'].forEach(id => {
    const el = document.getElementById(id);
    if (el) so.observe(el);
  });
}

/* ---------- En-tête et menu ---------- */
const header = document.querySelector('.site-header');
const toggle = document.querySelector('.menu-toggle');

function setMenu(open) {
  root.classList.toggle('menu-open', open);
  toggle.setAttribute('aria-expanded', String(open));
}
toggle.addEventListener('click', () => setMenu(!root.classList.contains('menu-open')));
document.querySelectorAll('.main-nav a').forEach(a => a.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

/* ---------- Mots du manifeste ---------- */
document.querySelectorAll('[data-words]').forEach(el => {
  let i = 0;
  const wrap = node => {
    if (node.nodeType === Node.TEXT_NODE) {
      const frag = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach(part => {
        if (!part.trim()) { frag.append(part); return; }
        const s = document.createElement('span');
        s.className = 'w';
        s.style.setProperty('--i', i++);
        s.textContent = part;
        frag.append(s);
      });
      node.replaceWith(frag);
    } else {
      [...node.childNodes].forEach(wrap);
    }
  };
  [...el.childNodes].forEach(wrap);
  el.style.setProperty('--n', i);
});

/* ---------- Apparition des blocs ---------- */
if (motion && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -10% 0px' });
  // léger décalage entre voisins pour un effet en cascade
  document.querySelectorAll('.reveal').forEach(el => {
    const sibs = [...el.parentElement.children].filter(c => c.classList.contains('reveal'));
    el.style.setProperty('--d', `${Math.min(sibs.indexOf(el), 4) * 0.08}s`);
    io.observe(el);
  });
} else {
  document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
  document.querySelector('.team-scene')?.classList.add('names');
}

/* ---------- Scènes épinglées et cartes empilées ---------- */
const scenes = [...document.querySelectorAll('[data-scene]')];
// --p est posé directement sur chaque élément animé : Safari (iPhone) ne rafraîchit pas
// toujours les enfants quand seule la variable du parent change
const ANIMATED = '.hero-logo, .hero-copy .eyebrow, .hero h1 span, .lead, .hero-actions, .scroll-hint, .w, .frame, .frame img, .team-photo figcaption, .commercial-bignum, .deals, .deal, .deal-icon path, .deal-icon circle';
const sceneParts = new Map(scenes.map(s => [s, [s, ...s.querySelectorAll(ANIMATED)]]));
const hero = document.querySelector('.hero');
const team = document.querySelector('.team-scene');
const cards = [...document.querySelectorAll('.stack .card')];
const navLinks = [...document.querySelectorAll('.main-nav a')];
const sections = navLinks.map(a => document.querySelector(a.getAttribute('href')));
let ticking = false;

function layoutCards() {
  // une carte plus haute que l'écran se fixe par le bas, pour rester lisible en entier
  const hh = header.offsetHeight;
  cards.forEach((card, i) => {
    const top = hh + 12 + i * 10;
    card.style.top = `${Math.min(top, innerHeight - card.offsetHeight - 16)}px`;
  });
}

function update() {
  ticking = false;
  const vh = innerHeight;
  header.classList.toggle('scrolled', scrollY > 8);

  if (motion) {
    scenes.forEach(s => {
      const r = s.getBoundingClientRect();
      if (r.bottom < -50 || r.top > vh + 50) return;
      const p = clamp(-r.top / (s.offsetHeight - vh), 0, 1).toFixed(4);
      if (s.dataset.p === p) return;
      s.dataset.p = p;
      sceneParts.get(s).forEach(el => el.style.setProperty('--p', p));
      if (s === hero) hero.classList.toggle('ready', p > .4);
      if (s === team) team.classList.toggle('names', p > .45);
    });

    cards.forEach((card, i) => {
      const next = cards[i + 1];
      if (!next) return;
      const d = next.getBoundingClientRect().top - card.getBoundingClientRect().top;
      card.style.setProperty('--s', clamp(1 - d / card.offsetHeight, 0, 1).toFixed(3));
    });
  }

  // lien actif dans le menu
  let current = -1;
  sections.forEach((sec, i) => { if (sec && sec.getBoundingClientRect().top < vh * .4) current = i; });
  navLinks.forEach((a, i) => a.classList.toggle('active', i === current));
}

function requestUpdate() {
  if (!ticking) { ticking = true; requestAnimationFrame(update); }
}
addEventListener('scroll', requestUpdate, { passive: true });
addEventListener('resize', () => { layoutCards(); requestUpdate(); });
addEventListener('load', () => { layoutCards(); update(); });
layoutCards();
update();

/* ---------- Widget enveloppe ---------- */
const dialog = document.getElementById('mail-dialog');
const form = document.getElementById('mail-form');
const sent = dialog.querySelector('.mail-sent');
const errorBox = form.querySelector('.form-error');
const sendBtn = form.querySelector('.send');

function openContact() {
  setMenu(false);
  form.hidden = false;
  sent.hidden = true;
  sent.classList.remove('show');
  errorBox.hidden = true;
  root.classList.add('dialog-open');
  dialog.showModal();
  track({ t: 'ev', v: 'contact_open' });
}

function closeContact() {
  if (!dialog.open) return;
  dialog.classList.add('closing');
  const done = () => {
    dialog.classList.remove('closing');
    dialog.close();
  };
  if (motion) dialog.addEventListener('animationend', done, { once: true });
  else done();
}

dialog.addEventListener('close', () => root.classList.remove('dialog-open'));
dialog.addEventListener('cancel', e => { e.preventDefault(); closeContact(); });
dialog.addEventListener('click', e => { if (e.target === dialog) closeContact(); }); // clic sur le fond
document.querySelectorAll('[data-open-contact]').forEach(b => b.addEventListener('click', openContact));
document.querySelectorAll('[data-close-contact]').forEach(b => b.addEventListener('click', closeContact));

function showError(html) {
  errorBox.innerHTML = html;
  errorBox.hidden = false;
}

function mailtoFallback(data) {
  const body = `${data.message}\n\n${data.nom}\n${data.email}${data.telephone ? `\n${data.telephone}` : ''}`;
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Demande de renseignement — ${data.sujet}`)}&body=${encodeURIComponent(body)}`;
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  errorBox.hidden = true;

  // vérification des champs obligatoires
  let firstInvalid = null;
  form.querySelectorAll('[required]').forEach(f => {
    const ok = f.type === 'checkbox' ? f.checked : f.value.trim() && f.checkValidity();
    (f.type === 'checkbox' ? f.closest('.consent') : f).classList.toggle('invalid', !ok);
    if (!ok && !firstInvalid) firstInvalid = f;
  });
  if (firstInvalid) {
    showError('Merci de compléter les champs obligatoires (nom, e-mail valide, message et consentement).');
    firstInvalid.focus();
    return;
  }

  const data = Object.fromEntries(new FormData(form));
  if (data._honey) return; // robot

  sendBtn.disabled = true;
  sendBtn.querySelector('span').textContent = 'Envoi…';
  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 429) { showError(json.error); return; }
    if (!res.ok || !json.success) throw new Error(json.error || res.status);

    form.reset();
    form.hidden = true;
    sent.hidden = false;
    requestAnimationFrame(() => sent.classList.add('show'));
  } catch (err) {
    showError(`L’envoi n’a pas abouti. Vous pouvez <a href="${mailtoFallback(data)}">nous écrire directement depuis votre messagerie</a>.`);
  } finally {
    sendBtn.disabled = false;
    sendBtn.querySelector('span').textContent = 'Envoyer';
  }
});

form.addEventListener('input', e => {
  const f = e.target;
  (f.type === 'checkbox' ? f.closest('.consent') : f).classList.remove('invalid');
});
