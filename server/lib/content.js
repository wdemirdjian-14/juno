// Textes modifiables : index.html sert de modèle, les modifications sont enregistrées dans content.json
// et une page index.html à jour est générée dans le dossier public servi par Nginx
const fs = require('fs');
const path = require('path');
const { readJSON, writeJSON } = require('./store');

// élément « feuille » portant data-edit : <tag ... data-edit="cle">texte</tag>
const EDITABLE = /(<([a-z0-9]+)\b[^>]*\bdata-edit="([a-z]+-\d+)"[^>]*>)([^<]*)(<\/\2>)/g;

const TYPE_LABELS = {
  title: 'Titre de l’onglet', h1: 'Grand titre', h2: 'Titre de section', h3: 'Sous-titre',
  p: 'Paragraphe', li: 'Élément de liste', summary: 'Titre dépliable', button: 'Bouton', a: 'Lien',
  b: 'Mot clé', strong: 'Texte en gras', small: 'Petit texte', span: 'Texte', figcaption: 'Légende',
};

const decode = s => s
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const encode = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function create({ siteDir, dataDir }) {
  const templateFile = path.join(siteDir, 'index.html');
  const contentFile = path.join(dataDir, 'content.json');
  const publicFile = path.join(dataDir, 'public', 'index.html');

  const overrides = () => readJSON(contentFile, {});

  function fields() {
    const values = overrides();
    const html = fs.readFileSync(templateFile, 'utf8');
    return [...html.matchAll(EDITABLE)].map(m => {
      const key = m[3];
      const def = decode(m[4]).replace(/\s+/g, ' ').trim();
      return {
        key,
        group: key.split('-')[0],
        type: TYPE_LABELS[m[2]] || 'Texte',
        long: def.length > 90,
        default: def,
        value: values[key] ?? def,
        modified: key in values,
      };
    });
  }

  function render() {
    const values = overrides();
    const html = fs.readFileSync(templateFile, 'utf8')
      .replace(EDITABLE, (all, open, tag, key, text, close) => (key in values ? open + encode(values[key]) + close : all));
    fs.mkdirSync(path.dirname(publicFile), { recursive: true });
    const tmp = `${publicFile}.tmp`;
    fs.writeFileSync(tmp, html, { mode: 0o644 });
    fs.renameSync(tmp, publicFile);
  }

  function save(changes) {
    const known = new Map(fields().map(f => [f.key, f.default]));
    const values = overrides();
    for (const [key, raw] of Object.entries(changes || {})) {
      if (!known.has(key) || typeof raw !== 'string') continue;
      const text = raw.replace(/\s+/g, ' ').trim().slice(0, 4000);
      // texte vide ou identique à l'original : on revient au texte d'origine
      if (!text || text === known.get(key)) delete values[key];
      else values[key] = text;
    }
    writeJSON(contentFile, values);
    render();
    return fields();
  }

  return { fields, render, save };
}

module.exports = { create };
