// Messages reçus par le formulaire du site : liste à traiter, notes internes, archivage
const crypto = require('crypto');
const path = require('path');
const { readJSON, writeJSON } = require('./store');

const STATUSES = ['nouveau', 'en_cours', 'traite'];
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function create(dataDir) {
  const file = path.join(dataDir, 'messages.json');
  const all = () => readJSON(file, []);
  const save = list => writeJSON(file, list);

  function validate(body) {
    const msg = {
      nom: clean(body.nom, 120),
      email: clean(body.email, 160),
      telephone: clean(body.telephone, 40),
      sujet: clean(body.sujet, 120) || 'Autre demande',
      message: clean(body.message, 5000),
    };
    const errors = [];
    if (!msg.nom) errors.push('nom');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msg.email)) errors.push('email');
    if (msg.message.length < 2) errors.push('message');
    if (body.consentement !== 'oui' && body.consentement !== true) errors.push('consentement');
    return { msg, errors };
  }

  function add(msg) {
    const list = all();
    const item = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      ...msg,
      status: 'nouveau',
      archived: false,
      notes: [],
    };
    list.unshift(item);
    save(list);
    return item;
  }

  function update(id, changes) {
    const list = all();
    const item = list.find(m => m.id === id);
    if (!item) return null;
    if (STATUSES.includes(changes.status)) item.status = changes.status;
    if (typeof changes.archived === 'boolean') {
      item.archived = changes.archived;
      item.archivedAt = changes.archived ? new Date().toISOString() : undefined;
    }
    save(list);
    return item;
  }

  function addNote(id, text) {
    const note = clean(text, 4000);
    if (!note) return null;
    const list = all();
    const item = list.find(m => m.id === id);
    if (!item) return null;
    item.notes.push({ id: crypto.randomUUID(), date: new Date().toISOString(), text: note });
    save(list);
    return item;
  }

  // résultat des e-mails automatiques (notification au cabinet, accusé de réception)
  function setMail(id, info) {
    const list = all();
    const item = list.find(m => m.id === id);
    if (!item) return;
    item.mail = info;
    save(list);
  }

  // réponse envoyée depuis le back-office : gardée dans l'historique du message
  function addReply(id, text) {
    const list = all();
    const item = list.find(m => m.id === id);
    item.replies = [...(item.replies || []), { id: crypto.randomUUID(), date: new Date().toISOString(), text }];
    if (item.status === 'nouveau') item.status = 'en_cours';
    save(list);
    return item;
  }

  function removeNote(id, noteId) {
    const list = all();
    const item = list.find(m => m.id === id);
    if (!item) return null;
    item.notes = item.notes.filter(n => n.id !== noteId);
    save(list);
    return item;
  }

  // suppression définitive, seulement pour un message déjà archivé
  function remove(id) {
    const list = all();
    const item = list.find(m => m.id === id);
    if (!item || !item.archived) return false;
    save(list.filter(m => m.id !== id));
    return true;
  }

  return { all, validate, add, update, addNote, removeNote, remove, setMail, addReply };
}

module.exports = { create, STATUSES };
