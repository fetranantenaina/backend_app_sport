// Applique les migrations SQL de db/migrations (dans l'ordre des noms) qui ne l'ont pas encore été.
// Usage : npm run migrer   (utilise DATABASE_URL pour Neon, sinon la base locale DB_*)
// Les fichiers sont idempotents : en cas d'interruption, relancer suffit.
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const DOSSIER = path.join(__dirname, 'migrations');

// Découpe un fichier en requêtes : une requête se termine par ";" en fin de ligne (hors lignes de commentaire)
function decouper(sql) {
  const sansCommentaires = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  return sansCommentaires.split(/;\s*$/m).map((r) => r.trim()).filter(Boolean);
}

async function migrer({ silencieux = false } = {}) {
  const log = silencieux ? () => {} : console.log;
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    nom VARCHAR(200) PRIMARY KEY, appliquee_le TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  const faites = new Set((await pool.query('SELECT nom FROM schema_migrations')).rows.map((r) => r.nom));
  const fichiers = fs.readdirSync(DOSSIER).filter((f) => f.endsWith('.sql')).sort();
  const appliquees = [];
  for (const f of fichiers) {
    if (faites.has(f)) continue;
    log(`→ ${f}`);
    for (const requete of decouper(fs.readFileSync(path.join(DOSSIER, f), 'utf8'))) await pool.query(requete);
    await pool.query('INSERT INTO schema_migrations (nom) VALUES ($1)', [f]);
    appliquees.push(f);
  }
  log(appliquees.length ? `${appliquees.length} migration(s) appliquée(s).` : 'Base déjà à jour.');
  return appliquees;
}

if (require.main === module) {
  migrer()
    .then(() => process.exit(0))
    .catch((err) => { console.error('Échec de la migration :', err.message); process.exit(1); });
}

module.exports = { migrer, decouper };
