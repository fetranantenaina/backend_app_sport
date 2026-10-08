// =========================================================
// MODULE 3 — Nutrition + Contenus de l'E-book
// Couche d'accès aux données + calculs métier :
//   - Suivi des apports nutritionnels (journal quotidien)
//   - Recommandations personnalisées (métabolisme, calories, macros, eau)
//   - Import et lecture in-app du contenu de l'e-book
//   - Progression de lecture par utilisateur
// =========================================================

const pool = require('../config/db');
const profilService = require('./profil');

// ---------------------------------------------------------
// Suivi nutritionnel (table `nutrition_journal`)
// ---------------------------------------------------------

async function ajouterEntreeNutrition(utilisateurId, { date_jour, calories, proteines_g, glucides_g, lipides_g, eau_ml, notes }) {
  const result = await pool.query(
    `INSERT INTO nutrition_journal (utilisateur_id, date_jour, calories, proteines_g, glucides_g, lipides_g, eau_ml, notes)
     VALUES ($1, COALESCE($2, CURRENT_DATE), $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      utilisateurId, date_jour ?? null, calories ?? null, proteines_g ?? null,
      glucides_g ?? null, lipides_g ?? null, eau_ml ?? null, notes ?? null,
    ]
  );
  return result.rows[0];
}

// Historique des entrées du journal, filtrable par période
async function getEntreesNutrition(utilisateurId, { from, to, limit } = {}) {
  const conditions = ['utilisateur_id = $1'];
  const params = [utilisateurId];

  if (from) {
    params.push(from);
    conditions.push(`date_jour >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conditions.push(`date_jour <= $${params.length}`);
  }

  let requete = `SELECT * FROM nutrition_journal WHERE ${conditions.join(' AND ')} ORDER BY date_jour DESC, id DESC`;
  if (limit) {
    params.push(limit);
    requete += ` LIMIT $${params.length}`;
  }

  const result = await pool.query(requete, params);
  return result.rows;
}

async function updateEntreeNutrition(id, utilisateurId, { date_jour, calories, proteines_g, glucides_g, lipides_g, eau_ml, notes }) {
  const result = await pool.query(
    `UPDATE nutrition_journal SET
       date_jour = COALESCE($3, date_jour),
       calories = COALESCE($4, calories),
       proteines_g = COALESCE($5, proteines_g),
       glucides_g = COALESCE($6, glucides_g),
       lipides_g = COALESCE($7, lipides_g),
       eau_ml = COALESCE($8, eau_ml),
       notes = COALESCE($9, notes)
     WHERE id = $1 AND utilisateur_id = $2
     RETURNING *`,
    [
      id, utilisateurId, date_jour ?? null, calories ?? null, proteines_g ?? null,
      glucides_g ?? null, lipides_g ?? null, eau_ml ?? null, notes ?? null,
    ]
  );
  return result.rows[0] || null;
}

async function supprimerEntreeNutrition(id, utilisateurId) {
  const result = await pool.query(
    'DELETE FROM nutrition_journal WHERE id = $1 AND utilisateur_id = $2 RETURNING id',
    [id, utilisateurId]
  );
  return result.rowCount > 0;
}

// Totaux d'une journée (somme de toutes les entrées de la date donnée)
async function getTotauxJour(utilisateurId, date) {
  const result = await pool.query(
    `SELECT
       COALESCE(SUM(calories), 0) AS calories,
       COALESCE(SUM(proteines_g), 0) AS proteines_g,
       COALESCE(SUM(glucides_g), 0) AS glucides_g,
       COALESCE(SUM(lipides_g), 0) AS lipides_g,
       COALESCE(SUM(eau_ml), 0) AS eau_ml,
       COUNT(*) AS nb_entrees
     FROM nutrition_journal
     WHERE utilisateur_id = $1 AND date_jour = COALESCE($2, CURRENT_DATE)`,
    [utilisateurId, date ?? null]
  );
  const row = result.rows[0];
  return {
    calories: Number(row.calories),
    proteines_g: Number(row.proteines_g),
    glucides_g: Number(row.glucides_g),
    lipides_g: Number(row.lipides_g),
    eau_ml: Number(row.eau_ml),
    nb_entrees: Number(row.nb_entrees),
  };
}

// Totaux par jour sur une période (pour graphiques / suivi)
async function getTotauxParJour(utilisateurId, { from, to } = {}) {
  const conditions = ['utilisateur_id = $1'];
  const params = [utilisateurId];
  if (from) {
    params.push(from);
    conditions.push(`date_jour >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conditions.push(`date_jour <= $${params.length}`);
  }

  const result = await pool.query(
    `SELECT date_jour,
            COALESCE(SUM(calories), 0) AS calories,
            COALESCE(SUM(proteines_g), 0) AS proteines_g,
            COALESCE(SUM(glucides_g), 0) AS glucides_g,
            COALESCE(SUM(lipides_g), 0) AS lipides_g,
            COALESCE(SUM(eau_ml), 0) AS eau_ml
     FROM nutrition_journal
     WHERE ${conditions.join(' AND ')}
     GROUP BY date_jour
     ORDER BY date_jour ASC`,
    params
  );
  return result.rows.map((r) => ({
    date_jour: r.date_jour,
    calories: Number(r.calories),
    proteines_g: Number(r.proteines_g),
    glucides_g: Number(r.glucides_g),
    lipides_g: Number(r.lipides_g),
    eau_ml: Number(r.eau_ml),
  }));
}

// ---------------------------------------------------------
// Recommandations nutritionnelles personnalisées
// Basées sur le profil (sexe, âge, PAL) et le dernier relevé (poids, taille)
// ---------------------------------------------------------

const arrondi = (x) => Math.round(x);

// Métabolisme de base (formule de Mifflin-St Jeor)
function calculerMetabolismeBase({ sexe, poids_kg, taille_cm, age }) {
  const base = 10 * poids_kg + 6.25 * taille_cm - 5 * age;
  if (sexe === 'homme') return base + 5;
  if (sexe === 'femme') return base - 161;
  return base - 78; // 'autre' : moyenne des deux constantes
}

// Retourne les besoins journaliers recommandés, ou { manquants: [...] } si des données manquent
async function getRecommandations(utilisateurId) {
  const profil = await profilService.getProfilByUtilisateur(utilisateurId);
  const releve = await profilService.getDernierReleve(utilisateurId);

  const manquants = [];
  if (!profil || !profil.sexe) manquants.push('sexe (profil)');
  if (!profil || profil.age === null || profil.age === undefined) manquants.push('date de naissance (profil)');
  if (!releve || !releve.poids_kg) manquants.push('poids (relevé physique)');
  if (!releve || !releve.taille_cm) manquants.push('taille (relevé physique)');
  if (manquants.length) return { manquants };

  const poids = Number(releve.poids_kg);
  const pal = profil.pal ? Number(profil.pal) : 1.2; // sédentaire par défaut

  const bmr = calculerMetabolismeBase({
    sexe: profil.sexe,
    poids_kg: poids,
    taille_cm: Number(releve.taille_cm),
    age: profil.age,
  });
  const caloriesMaintien = bmr * pal;

  const proteines_g = poids * 1.6;                 // 1,6 g/kg
  const lipides_g = (caloriesMaintien * 0.25) / 9; // 25 % des calories
  const glucides_g = (caloriesMaintien - proteines_g * 4 - lipides_g * 9) / 4;

  return {
    metabolisme_base_kcal: arrondi(bmr),
    pal_utilise: pal,
    calories_maintien: arrondi(caloriesMaintien),
    objectifs: {
      perte_poids_kcal: arrondi(caloriesMaintien * 0.85),
      prise_masse_kcal: arrondi(caloriesMaintien * 1.1),
    },
    macros_maintien: {
      proteines_g: arrondi(proteines_g),
      glucides_g: arrondi(Math.max(glucides_g, 0)),
      lipides_g: arrondi(lipides_g),
    },
    eau_ml: arrondi(poids * 35), // ~35 ml/kg
    statut_sante: profil.statut_sante || null, // à prendre en compte (allergies, restrictions)
  };
}

// Bilan du jour : apports réels vs recommandations (maintien)
async function getBilanJour(utilisateurId, date) {
  const apports = await getTotauxJour(utilisateurId, date);
  const reco = await getRecommandations(utilisateurId);
  if (reco.manquants) return { apports, recommandations: null, manquants: reco.manquants };

  const pct = (valeur, cible) => (cible ? Math.round((valeur / cible) * 100) : null);
  return {
    apports,
    recommandations: reco,
    progression_pct: {
      calories: pct(apports.calories, reco.calories_maintien),
      proteines_g: pct(apports.proteines_g, reco.macros_maintien.proteines_g),
      glucides_g: pct(apports.glucides_g, reco.macros_maintien.glucides_g),
      lipides_g: pct(apports.lipides_g, reco.macros_maintien.lipides_g),
      eau_ml: pct(apports.eau_ml, reco.eau_ml),
    },
  };
}

// ---------------------------------------------------------
// E-book : chapitres (import + lecture in-app)
// ---------------------------------------------------------

// Liste des chapitres (sans le contenu) avec l'état de lecture de l'utilisateur
async function getChapitres(utilisateurId) {
  const result = await pool.query(
    `SELECT c.id, c.titre, c.ordre, c.image_url,
            COALESCE(p.lu, FALSE) AS lu, p.date_lecture
     FROM ebook_chapitres c
     LEFT JOIN ebook_progression p ON p.chapitre_id = c.id AND p.utilisateur_id = $1
     ORDER BY c.ordre`,
    [utilisateurId]
  );
  return result.rows;
}

// Lecture d'un chapitre complet (contenu inclus) + état de lecture
async function getChapitreById(id, utilisateurId) {
  const result = await pool.query(
    `SELECT c.*, COALESCE(p.lu, FALSE) AS lu, p.date_lecture
     FROM ebook_chapitres c
     LEFT JOIN ebook_progression p ON p.chapitre_id = c.id AND p.utilisateur_id = $2
     WHERE c.id = $1`,
    [id, utilisateurId]
  );
  return result.rows[0] || null;
}

async function creerChapitre({ titre, ordre, contenu, image_url }) {
  const result = await pool.query(
    `INSERT INTO ebook_chapitres (titre, ordre, contenu, image_url)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [titre, ordre, contenu, image_url ?? null]
  );
  return result.rows[0];
}

// Import en lot du contenu déjà rédigé (transaction : tout ou rien)
async function importerChapitres(chapitres) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const crees = [];
    for (const c of chapitres) {
      const r = await client.query(
        `INSERT INTO ebook_chapitres (titre, ordre, contenu, image_url)
         VALUES ($1, $2, $3, $4) RETURNING id, titre, ordre`,
        [c.titre, c.ordre, c.contenu, c.image_url ?? null]
      );
      crees.push(r.rows[0]);
    }
    await client.query('COMMIT');
    return crees;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateChapitre(id, { titre, ordre, contenu, image_url }) {
  const result = await pool.query(
    `UPDATE ebook_chapitres SET
       titre = COALESCE($2, titre),
       ordre = COALESCE($3, ordre),
       contenu = COALESCE($4, contenu),
       image_url = COALESCE($5, image_url)
     WHERE id = $1 RETURNING *`,
    [id, titre ?? null, ordre ?? null, contenu ?? null, image_url ?? null]
  );
  return result.rows[0] || null;
}

async function supprimerChapitre(id) {
  const result = await pool.query('DELETE FROM ebook_chapitres WHERE id = $1 RETURNING id', [id]);
  return result.rowCount > 0;
}

// ---------------------------------------------------------
// E-book : progression de lecture (table `ebook_progression`)
// ---------------------------------------------------------

// Marque un chapitre comme lu / non lu (upsert)
async function marquerChapitreLu(utilisateurId, chapitreId, lu) {
  const result = await pool.query(
    `INSERT INTO ebook_progression (utilisateur_id, chapitre_id, lu, date_lecture)
     VALUES ($1, $2, $3, CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE NULL END)
     ON CONFLICT (utilisateur_id, chapitre_id)
     DO UPDATE SET lu = EXCLUDED.lu, date_lecture = EXCLUDED.date_lecture
     RETURNING *`,
    [utilisateurId, chapitreId, lu]
  );
  return result.rows[0];
}

// Progression globale : nombre de chapitres lus / total et pourcentage
async function getProgression(utilisateurId) {
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM ebook_chapitres) AS total,
       (SELECT COUNT(*) FROM ebook_progression p
         JOIN ebook_chapitres c ON c.id = p.chapitre_id
         WHERE p.utilisateur_id = $1 AND p.lu = TRUE) AS lus`,
    [utilisateurId]
  );
  const total = Number(result.rows[0].total);
  const lus = Number(result.rows[0].lus);
  return {
    total_chapitres: total,
    chapitres_lus: lus,
    pourcentage: total ? Math.round((lus / total) * 100) : 0,
  };
}

module.exports = {
  // Journal nutritionnel
  ajouterEntreeNutrition,
  getEntreesNutrition,
  updateEntreeNutrition,
  supprimerEntreeNutrition,
  getTotauxJour,
  getTotauxParJour,
  // Recommandations
  calculerMetabolismeBase,
  getRecommandations,
  getBilanJour,
  // E-book
  getChapitres,
  getChapitreById,
  creerChapitre,
  importerChapitres,
  updateChapitre,
  supprimerChapitre,
  // Progression
  marquerChapitreLu,
  getProgression,
};
