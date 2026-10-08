// =========================================================
// MODULE 4 — Glossaire
// Couche d'accès aux données :
//   - Base de termes + moteur de recherche
//   - Fiches détaillées avec liens croisés entre termes
// =========================================================

const pool = require('../config/db');

// Moteur de recherche : texte libre (terme ou définition) et/ou catégorie
// Les termes qui commencent par la recherche sont remontés en premier
async function rechercherTermes({ q, categorie, limit } = {}) {
  const conditions = [];
  const params = [];

  if (q) {
    params.push(`%${q}%`);
    conditions.push(`(terme ILIKE $${params.length} OR definition ILIKE $${params.length})`);
  }
  if (categorie) {
    params.push(categorie);
    conditions.push(`categorie = $${params.length}`);
  }

  let ordre = 'terme ASC';
  if (q) {
    params.push(`${q}%`);
    ordre = `(terme ILIKE $${params.length}) DESC, terme ASC`;
  }

  let requete = `SELECT id, terme, categorie, definition FROM glossaire
                 ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
                 ORDER BY ${ordre}`;
  if (limit) {
    params.push(limit);
    requete += ` LIMIT $${params.length}`;
  }

  const result = await pool.query(requete, params);
  return result.rows;
}

// Liste des catégories disponibles (pour les filtres de l'interface)
async function getCategories() {
  const result = await pool.query(
    'SELECT DISTINCT categorie FROM glossaire WHERE categorie IS NOT NULL ORDER BY categorie'
  );
  return result.rows.map((r) => r.categorie);
}

// Fiche détaillée d'un terme + termes liés (les liens sont lus dans les deux sens)
async function getFiche(id) {
  const terme = await pool.query('SELECT * FROM glossaire WHERE id = $1', [id]);
  if (!terme.rows[0]) return null;

  const liens = await pool.query(
    `SELECT g.id, g.terme, g.categorie
     FROM glossaire_liens l
     JOIN glossaire g ON g.id = CASE WHEN l.terme_id = $1 THEN l.terme_lie_id ELSE l.terme_id END
     WHERE l.terme_id = $1 OR l.terme_lie_id = $1
     ORDER BY g.terme`,
    [id]
  );

  return { ...terme.rows[0], termes_lies: liens.rows };
}

async function creerTerme({ terme, definition, categorie }) {
  const result = await pool.query(
    'INSERT INTO glossaire (terme, definition, categorie) VALUES ($1, $2, $3) RETURNING *',
    [terme, definition, categorie ?? null]
  );
  return result.rows[0];
}

async function updateTerme(id, { terme, definition, categorie }) {
  const result = await pool.query(
    `UPDATE glossaire SET
       terme = COALESCE($2, terme),
       definition = COALESCE($3, definition),
       categorie = COALESCE($4, categorie)
     WHERE id = $1 RETURNING *`,
    [id, terme ?? null, definition ?? null, categorie ?? null]
  );
  return result.rows[0] || null;
}

async function supprimerTerme(id) {
  const result = await pool.query('DELETE FROM glossaire WHERE id = $1 RETURNING id', [id]);
  return result.rowCount > 0;
}

// Crée un lien croisé entre deux termes (sans doublon dans l'un ou l'autre sens)
async function ajouterLien(termeId, termeLieId) {
  const existant = await pool.query(
    `SELECT 1 FROM glossaire_liens
     WHERE (terme_id = $1 AND terme_lie_id = $2) OR (terme_id = $2 AND terme_lie_id = $1)`,
    [termeId, termeLieId]
  );
  if (existant.rows.length > 0) return null;

  const result = await pool.query(
    'INSERT INTO glossaire_liens (terme_id, terme_lie_id) VALUES ($1, $2) RETURNING *',
    [termeId, termeLieId]
  );
  return result.rows[0];
}

// Supprime le lien entre deux termes, quel que soit le sens dans lequel il a été créé
async function supprimerLien(termeId, termeLieId) {
  const result = await pool.query(
    `DELETE FROM glossaire_liens
     WHERE (terme_id = $1 AND terme_lie_id = $2) OR (terme_id = $2 AND terme_lie_id = $1)
     RETURNING id`,
    [termeId, termeLieId]
  );
  return result.rowCount > 0;
}

module.exports = {
  rechercherTermes,
  getCategories,
  getFiche,
  creerTerme,
  updateTerme,
  supprimerTerme,
  ajouterLien,
  supprimerLien,
};
