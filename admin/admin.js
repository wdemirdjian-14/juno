/* Back-office JUNO — interface */
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // création d'éléments sans innerHTML (les messages viennent de visiteurs : jamais interprétés comme du HTML)
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') Object.assign(el.style, v); // via le DOM : autorisé par la politique de sécurité
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    el.append(...children.flat().filter(c => c != null && c !== false));
    return el;
  }
  const SVG = 'http://www.w3.org/2000/svg';
  function s(tag, attrs = {}) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  const nf = new Intl.NumberFormat('fr-FR');
  const fmtDate = iso => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fmtDay = (day, opts = { day: 'numeric', month: 'short' }) => new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', opts);

  async function api(path, opts = {}) {
    const res = await fetch(`/api/admin/${path}`, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== 'login') { showLogin(); throw new Error('Session expirée'); }
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
    return data;
  }

  let toastTimer;
  function toast(text) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------- Connexion ---------- */
  function showLogin() {
    $('#app').hidden = true;
    $('#login').hidden = false;
    $('#password').focus();
  }

  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#login-error');
    err.hidden = true;
    try {
      await api('login', { method: 'POST', body: { password: $('#password').value } });
      $('#password').value = '';
      start();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  });

  $('#logout').addEventListener('click', async () => {
    await api('logout', { method: 'POST' }).catch(() => {});
    showLogin();
  });

  /* ---------- Navigation ---------- */
  const views = { dashboard: loadDashboard, messages: loadMessages, content: loadContent, settings: loadSettings };

  function currentView() {
    const v = location.hash.slice(1);
    return v in views ? v : 'dashboard';
  }

  function show() {
    if ($('#app').hidden) return;
    const v = currentView();
    $$('.view').forEach(el => { el.hidden = el.id !== `view-${v}`; });
    $$('.tabs a').forEach(a => (a.dataset.view === v ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    views[v]();
  }
  addEventListener('hashchange', show);

  async function refreshBadge() {
    const me = await api('me');
    const b = $('#badge');
    b.hidden = !me.unread;
    b.textContent = me.unread;
    return me;
  }

  async function start() {
    try {
      await refreshBadge();
    } catch {
      return; // non connecté : l'écran de connexion est affiché
    }
    $('#login').hidden = true;
    $('#app').hidden = false;
    show();
  }

  /* ---------- Info-bulle des graphiques ---------- */
  const tip = $('#tooltip');
  function showTip(evt, title, lines) {
    tip.replaceChildren(h('b', {}, title), ...lines.map(l => h('div', {}, l)));
    tip.hidden = false;
    const x = Math.min(evt.clientX + 14, innerWidth - tip.offsetWidth - 8);
    const y = Math.max(evt.clientY - tip.offsetHeight - 12, 8);
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }
  const hideTip = () => { tip.hidden = true; };

  /* ---------- Statistiques ---------- */
  let days = 30;
  $$('#period button').forEach(b => b.addEventListener('click', () => {
    days = Number(b.dataset.days);
    $$('#period button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    loadDashboard();
  }));

  const SECTION_LABELS = { accueil: 'Accueil', cabinet: 'Le cabinet', competences: 'Domaines d’intervention', equipe: 'L’équipe', honoraires: 'Honoraires', contact: 'Contact' };

  async function loadDashboard() {
    const st = await api(`stats?days=${days}`);
    const t = st.total;
    const opens = t.events.contact_open || 0;
    const rate = t.visitors ? (st.messages / t.visitors) * 100 : 0;
    $('#kpis').replaceChildren(
      kpi('Visiteurs', nf.format(t.visitors), 'uniques par jour, cumulés'),
      kpi('Pages vues', nf.format(t.views), t.visitors ? `${(t.views / t.visitors).toFixed(1).replace('.', ',')} par visiteur` : ''),
      kpi('Messages reçus', nf.format(st.messages), `${nf.format(opens)} ouverture${opens > 1 ? 's' : ''} du formulaire`),
      kpi('Taux de contact', `${rate.toFixed(1).replace('.', ',')} %`, 'messages / visiteurs'),
    );

    barChart($('#chart-days'), st.series.length > 120 ? byMonth(st.series) : st.series.map(d => ({
      label: fmtDay(d.day), value: d.visitors, tip: [`${nf.format(d.visitors)} visiteur${d.visitors > 1 ? 's' : ''}`, `${nf.format(d.views)} page${d.views > 1 ? 's' : ''} vue${d.views > 1 ? 's' : ''}`],
    })), { height: 220 });

    barChart($('#chart-hours'), t.hours.map((n, i) => ({ label: `${i} h`, value: n, tip: [`${nf.format(n)} page${n > 1 ? 's' : ''} vue${n > 1 ? 's' : ''}`] })), { height: 150, every: 3 });

    hbars($('#list-refs'), sortEntries(t.refs), t.views);
    hbars($('#list-devices'), sortEntries(t.devices), t.views);
    hbars($('#list-browsers'), sortEntries(t.browsers), t.views);
    hbars($('#list-sections'), Object.keys(SECTION_LABELS).map(k => [SECTION_LABELS[k], t.sections[k] || 0]), t.views, true);
  }

  function byMonth(series) {
    const months = new Map();
    for (const d of series) {
      const key = d.day.slice(0, 7);
      const m = months.get(key) || { visitors: 0, views: 0 };
      m.visitors += d.visitors;
      m.views += d.views;
      months.set(key, m);
    }
    return [...months].map(([key, m]) => ({
      label: fmtDay(`${key}-15`, { month: 'short' }), value: m.visitors,
      tip: [`${nf.format(m.visitors)} visiteurs`, `${nf.format(m.views)} pages vues`], title: fmtDay(`${key}-15`, { month: 'long', year: 'numeric' }),
    }));
  }

  const sortEntries = obj => Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const kpi = (label, value, note) => h('div', { class: 'kpi' }, h('span', {}, label), h('strong', {}, value), h('small', {}, note));

  function hbars(root, entries, total, keepOrder) {
    if (!entries.length || !total) { root.replaceChildren(h('p', { class: 'empty' }, 'Pas encore de données sur la période.')); return; }
    const max = keepOrder ? total : Math.max(...entries.map(e => e[1]));
    root.replaceChildren(h('ul', { class: 'hbars' }, entries.map(([name, n]) => {
      const pct = Math.round((n / total) * 100);
      return h('li', {},
        h('span', { class: 'name', title: name }, name),
        h('span', { class: 'val' }, nf.format(n), h('small', {}, `${pct} %`)),
        h('span', { class: 'track' }, h('span', { class: 'fill', style: { width: `${max ? Math.max((n / max) * 100, n ? 1.5 : 0) : 0}%` } })));
    })));
  }

  // histogramme simple : une série, barres fines à bouts arrondis, info-bulle au survol
  function barChart(root, data, { height = 200, every } = {}) {
    if (!data.some(d => d.value)) { root.replaceChildren(h('p', { class: 'empty' }, 'Pas encore de visites sur la période.')); return; }
    const W = Math.max(root.clientWidth, 280);
    const H = height;
    const pad = { l: 34, r: 6, t: 8, b: 24 };
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const max = niceMax(Math.max(...data.map(d => d.value)));
    const step = iw / data.length;
    const bw = Math.max(Math.min(step - 2, 28), 2);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Histogramme' });

    const grid = s('g', { class: 'grid' });
    const axis = s('g', { class: 'axis' });
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + ih - (ih * i) / 4;
      grid.append(s('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y }));
      const tx = s('text', { x: pad.l - 6, y: y + 4, 'text-anchor': 'end' });
      tx.textContent = nf.format(Math.round((max * i) / 4));
      axis.append(tx);
    }
    svg.append(grid, axis);

    const labelEvery = every || Math.ceil(data.length / Math.floor(iw / 46));
    data.forEach((d, i) => {
      const x = pad.l + i * step + (step - bw) / 2;
      const bh = d.value ? Math.max((d.value / max) * ih, 2) : 0;
      const r = Math.min(4, bw / 2, bh);
      const y0 = pad.t + ih;
      // barre posée sur l'axe, seul le haut est arrondi
      const bar = s('path', {
        class: 'bar',
        d: bh ? `M${x},${y0}V${y0 - bh + r}Q${x},${y0 - bh} ${x + r},${y0 - bh}H${x + bw - r}Q${x + bw},${y0 - bh} ${x + bw},${y0 - bh + r}V${y0}Z` : '',
      });
      const hit = s('rect', { class: 'hit', x: pad.l + i * step, y: pad.t, width: step, height: ih });
      hit.addEventListener('pointermove', e => { bar.classList.add('on'); showTip(e, d.title || d.label, d.tip); });
      hit.addEventListener('pointerleave', () => { bar.classList.remove('on'); hideTip(); });
      svg.append(bar, hit);
      if (i % labelEvery === 0) {
        const tx = s('text', { x: pad.l + i * step + step / 2, y: H - 6, 'text-anchor': 'middle' });
        tx.textContent = d.label;
        axis.append(tx);
      }
    });
    root.replaceChildren(svg);
  }

  function niceMax(v) {
    if (v <= 4) return 4;
    const p = 10 ** Math.floor(Math.log10(v));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return Math.ceil((m * p) / 4) * 4;
    return v;
  }

  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (currentView() === 'dashboard' && !$('#app').hidden) loadDashboard(); }, 250);
  });

  /* ---------- Messages ---------- */
  let msgs = [];
  let filter = 'todo';
  let selected = null;
  const STATUS = { nouveau: 'Nouveau', en_cours: 'En cours', traite: 'Traité' };

  $$('#msg-filter button').forEach(b => b.addEventListener('click', () => {
    filter = b.dataset.filter;
    $$('#msg-filter button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    selected = null;
    renderMessages();
  }));
  $('#msg-search').addEventListener('input', renderMessages);

  async function loadMessages() {
    msgs = await api('messages');
    renderMessages();
  }

  const inFilter = (m, f) => (f === 'archived' ? m.archived : !m.archived && (f === 'done' ? m.status === 'traite' : m.status !== 'traite'));

  function renderMessages() {
    for (const f of ['todo', 'done', 'archived']) $(`#count-${f}`).textContent = msgs.filter(m => inFilter(m, f)).length;
    const q = $('#msg-search').value.trim().toLowerCase();
    const list = msgs.filter(m => inFilter(m, filter) && (!q || `${m.nom} ${m.email} ${m.sujet} ${m.message} ${m.telephone}`.toLowerCase().includes(q)));
    if (!list.some(m => m.id === selected)) selected = innerWidth >= 900 ? list[0]?.id || null : null;

    $('#msg-list').replaceChildren(...(list.length ? list.map(m => h('li', {},
      h('button', {
        type: 'button', class: `msg-item${m.status === 'nouveau' && !m.archived ? ' unread' : ''}`, 'aria-current': String(m.id === selected),
        onclick: () => {
          selected = m.id;
          // un message ouvert passe de « Nouveau » à « En cours »
          if (m.status === 'nouveau' && !m.archived) patch(m, { status: 'en_cours' }); else renderMessages();
        },
      },
      h('span', { class: 'msg-top' }, h('span', { class: 'msg-name' }, m.nom), h('span', { class: 'msg-date' }, fmtDate(m.date))),
      h('span', { class: 'msg-subject' }, m.sujet),
      h('span', { class: 'msg-excerpt' }, m.message)))) : [h('li', { class: 'empty' }, q ? 'Aucun message ne correspond.' : filter === 'todo' ? 'Aucun message à traiter.' : 'Aucun message.')]));

    renderDetail(msgs.find(m => m.id === selected));
  }

  function replace(item) {
    msgs = msgs.map(m => (m.id === item.id ? item : m));
    renderMessages();
    refreshBadge().catch(() => {});
  }

  async function patch(m, body, done) {
    try {
      replace(await api(`messages/${m.id}`, { method: 'PATCH', body }));
      if (done) toast(done);
    } catch (e) { toast(e.message); }
  }

  function renderDetail(m) {
    const box = $('#msg-detail');
    $('.inbox').classList.toggle('detail-open', Boolean(m));
    if (!m) { box.hidden = true; return; }
    box.hidden = false;

    const noteInput = h('textarea', { rows: 3, placeholder: 'Ajouter une information (appel passé, rendez-vous, devis envoyé…)', 'aria-label': 'Nouvelle note' });
    box.replaceChildren(
      h('button', { type: 'button', class: 'detail-back', onclick: () => { selected = null; renderMessages(); } }, '← Retour à la liste'),
      h('div', { class: 'detail-head' }, h('span', { class: `pill ${m.status}` }, STATUS[m.status]), ' ', m.archived ? h('span', { class: 'pill' }, 'Archivé') : null, h('h2', {}, m.nom)),
      h('div', { class: 'detail-meta' },
        h('a', { href: `mailto:${m.email}?subject=${encodeURIComponent(`Votre demande — ${m.sujet}`)}` }, m.email),
        m.telephone ? h('a', { href: `tel:${m.telephone.replace(/[^\d+]/g, '')}` }, m.telephone) : null,
        h('span', {}, fmtDate(m.date))),
      h('p', { class: 'msg-subject' }, m.sujet),
      h('div', { class: 'detail-body' }, m.message),

      h('div', { class: 'detail-section' },
        h('h3', {}, 'Suivi'),
        h('div', { class: 'segmented', role: 'group', 'aria-label': 'Statut' }, Object.entries(STATUS).map(([k, label]) => h('button', {
          type: 'button', 'aria-pressed': String(m.status === k), onclick: () => m.status !== k && patch(m, { status: k }, `Statut : ${label}`),
        }, label)))),

      h('div', { class: 'detail-section' },
        h('h3', {}, `Notes internes (${m.notes.length})`),
        m.notes.length ? h('ul', { class: 'notes' }, m.notes.map(n => h('li', { class: 'note' },
          h('time', {}, fmtDate(n.date)), n.text,
          h('button', {
            type: 'button', 'aria-label': 'Supprimer la note', title: 'Supprimer la note',
            onclick: async () => { if (confirm('Supprimer cette note ?')) replace(await api(`messages/${m.id}/notes/${n.id}`, { method: 'DELETE' })); },
          }, '×')))) : null,
        h('form', {
          class: 'note-form',
          onsubmit: async e => {
            e.preventDefault();
            if (!noteInput.value.trim()) return;
            try { replace(await api(`messages/${m.id}/notes`, { method: 'POST', body: { text: noteInput.value } })); toast('Note ajoutée'); } catch (ex) { toast(ex.message); }
          },
        }, noteInput, h('button', { class: 'btn', type: 'submit' }, 'Ajouter la note'))),

      h('div', { class: 'detail-section detail-actions' },
        m.archived
          ? [h('button', { type: 'button', class: 'btn', onclick: () => patch(m, { archived: false }, 'Message restauré') }, 'Désarchiver'),
            h('button', {
              type: 'button', class: 'btn danger',
              onclick: async () => {
                if (!confirm('Supprimer définitivement ce message et ses notes ?')) return;
                await api(`messages/${m.id}`, { method: 'DELETE' });
                msgs = msgs.filter(x => x.id !== m.id);
                renderMessages();
                toast('Message supprimé');
              },
            }, 'Supprimer définitivement')]
          : h('button', { type: 'button', class: 'btn', onclick: () => patch(m, { archived: true }, 'Message archivé') }, 'Archiver')),
    );

  }

  /* ---------- Textes ---------- */
  const GROUPS = {
    meta: 'Onglet du navigateur', accueil: 'Accueil', bandeau: 'Bandeau sous l’accueil', cabinet: 'Le cabinet',
    competences: 'Domaines d’intervention', equipe: 'L’équipe', honoraires: 'Honoraires', contact: 'Contact', pied: 'Pied de page',
  };
  let fields = [];
  const pending = new Map();

  async function loadContent() {
    if (pending.size) return; // ne pas écraser une saisie en cours
    fields = await api('content');
    renderContent();
  }

  function renderContent() {
    const q = $('#content-search').value.trim().toLowerCase();
    const openGroups = new Set($$('#content-groups details[open]').map(d => d.dataset.group));
    const groups = Object.keys(GROUPS).map(g => {
      const list = fields.filter(f => f.group === g && (!q || f.value.toLowerCase().includes(q) || f.default.toLowerCase().includes(q)));
      if (!list.length) return null;
      const modified = list.filter(f => f.modified).length;
      return h('details', { class: 'group', 'data-group': g, open: q || openGroups.has(g) },
        h('summary', {}, GROUPS[g], h('small', {}, `${list.length} texte${list.length > 1 ? 's' : ''}${modified ? ` · ${modified} modifié${modified > 1 ? 's' : ''}` : ''}`)),
        h('div', { class: 'fields' }, list.map(fieldEditor)));
    }).filter(Boolean);
    $('#content-groups').replaceChildren(...(groups.length ? groups : [h('p', { class: 'empty' }, 'Aucun texte ne correspond.')]));
    updateSavebar();
  }

  function fieldEditor(f) {
    const value = pending.has(f.key) ? pending.get(f.key) : f.value;
    const id = `f-${f.key}`;
    const ta = h('textarea', { id, rows: f.long ? 4 : 1 });
    ta.value = value;
    const wrap = h('div', { class: `field${pending.has(f.key) ? ' changed' : ''}` },
      h('label', { for: id }, f.type, f.modified ? h('span', { class: 'tag' }, 'modifié') : null,
        f.modified || pending.has(f.key) ? h('button', {
          type: 'button', class: 'reset', title: f.default,
          onclick: () => { pending.set(f.key, f.default); if (f.default === f.value) pending.delete(f.key); renderContent(); },
        }, 'Rétablir l’original') : null),
      ta);
    ta.addEventListener('input', () => {
      if (ta.value === f.value) pending.delete(f.key); else pending.set(f.key, ta.value);
      wrap.classList.toggle('changed', pending.has(f.key));
      updateSavebar();
    });
    return wrap;
  }

  function updateSavebar() {
    $('#savebar').hidden = !pending.size;
    $('#savebar-text').textContent = `${pending.size} modification${pending.size > 1 ? 's' : ''}`;
  }

  $('#content-search').addEventListener('input', renderContent);
  $('#content-cancel').addEventListener('click', () => { pending.clear(); renderContent(); });
  $('#content-save').addEventListener('click', async () => {
    const btn = $('#content-save');
    btn.disabled = true;
    try {
      fields = await api('content', { method: 'PUT', body: { values: Object.fromEntries(pending) } });
      pending.clear();
      renderContent();
      toast('Textes enregistrés : le site est à jour');
    } catch (e) {
      toast(e.message);
    } finally {
      btn.disabled = false;
    }
  });
  addEventListener('beforeunload', e => { if (pending.size) e.preventDefault(); });

  /* ---------- Réglages ---------- */
  async function loadSettings() {
    const me = await refreshBadge();
    $('#mail-status').textContent = me.mail
      ? 'Activées : un e-mail est envoyé à chaque nouveau message reçu.'
      : 'Désactivées : les messages arrivent uniquement ici. Elles s’activent en renseignant un compte e-mail d’envoi (SMTP) sur le serveur, voir README.';
  }

  $('#pw-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const out = $('#pw-msg');
    out.className = 'error';
    out.hidden = false;
    if (f.next.value !== f.confirm.value) { out.textContent = 'Les deux nouveaux mots de passe ne correspondent pas.'; return; }
    try {
      await api('password', { method: 'POST', body: { current: f.current.value, next: f.next.value } });
      f.reset();
      out.className = 'error ok';
      out.textContent = 'Mot de passe mis à jour.';
    } catch (ex) {
      out.textContent = ex.message;
    }
  });

  start().then(() => { if ($('#app').hidden) showLogin(); });
})();
