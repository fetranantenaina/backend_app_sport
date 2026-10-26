// =========================================================
// MODULE 3 — Guide alimentaire (feuille NUTRITION du fichier client)
// Aliments par catégorie avec protéines / glucides / lipides (pour 100 g)
// =========================================================

const pool = require('../config/db');

// Toutes les catégories avec leurs aliments, dans l'ordre du guide
async function getGuide() {
  const result = await pool.query(
    `SELECT c.id, c.nom,
            COALESCE(json_agg(json_build_object('id', a.id, 'nom', a.nom, 'proteines_g', a.proteines_g,
                                                'glucides_g', a.glucides_g, 'lipides_g', a.lipides_g)
                              ORDER BY a.ordre, a.id) FILTER (WHERE a.id IS NOT NULL), '[]') AS aliments
     FROM aliments_categories c
     LEFT JOIN aliments a ON a.categorie_id = c.id
     GROUP BY c.id
     ORDER BY c.ordre, c.id`
  );
  return result.rows;
}

// Ajoute un aliment ; la catégorie est créée si elle n'existe pas
async function ajouterAliment({ categorie, nom, proteines_g, glucides_g, lipides_g }) {
  const cat = await pool.query('SELECT id FROM aliments_categories WHERE UPPER(nom) = UPPER($1)', [categorie]);
  let categorieId = cat.rows[0] && cat.rows[0].id;
  if (!categorieId) {
    const nouvelle = await pool.query(
      `INSERT INTO aliments_categories (nom, ordre)
       VALUES ($1, (SELECT COALESCE(MAX(ordre), 0) + 1 FROM aliments_categories)) RETURNING id`,
      [categorie.toUpperCase()]
    );
    categorieId = nouvelle.rows[0].id;
  }
  const result = await pool.query(
    `INSERT INTO aliments (categorie_id, nom, proteines_g, glucides_g, lipides_g, ordre)
     VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(ordre), 0) + 1 FROM aliments WHERE categorie_id = $1))
     RETURNING *`,
    [categorieId, nom, proteines_g ?? null, glucides_g ?? null, lipides_g ?? null]
  );
  return result.rows[0];
}

async function supprimerAliment(id) {
  const result = await pool.query('DELETE FROM aliments WHERE id = $1 RETURNING id', [id]);
  return result.rowCount > 0;
}

module.exports = { getGuide, ajouterAliment, supprimerAliment };
