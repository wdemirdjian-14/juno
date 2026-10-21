// Petits fichiers JSON écrits de façon atomique (fichier temporaire puis renommage)
const fs = require('fs');
const path = require('path');

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`Lecture impossible de ${file} :`, err.message);
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1), { mode: 0o640 });
  fs.renameSync(tmp, file);
}

module.exports = { readJSON, writeJSON };
