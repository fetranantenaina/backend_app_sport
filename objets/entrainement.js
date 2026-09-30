// =========================================================
// MODULE 2 — Journal d'entraînement (Workout log)
// Couche d'accès aux données + calculs métier associés :
//   - Référentiel d'exercices
//   - Structure de séance (date, session, cible, notes)
//   - Paramètres d'exécution par exercice (niveau, poids, vitesse,
//     répétitions/temps, séries, repos, case à cocher fait/non fait)
//   - Indicateurs athlétiques (force, endurance, résistance, puissance)
//     + histogramme athlétique
//   - Vue anatomique interactive (groupes musculaires sollicités)
// =========================================================

const pool = require('../config/db');

// ---------------------------------------------------------
// Référentiel des exercices
// ---------------------------------------------------------

// Liste les exercices du référentiel, avec filtres optionnels
async function getExercices({ groupe_musculaire, methode } = {}) {
  const conditions = [];
  const params = [];

  if (groupe_musculaire) {
    params.push(groupe_musculaire);
    conditions.push(`groupe_musculaire = $${params.length}`);
  }
  if (methode) {
    params.push(methode);
    conditions.push(`methode = $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query(`SELECT * FROM exercices ${whereClause} ORDER BY nom`, params);
  return result.rows;
}

async function getExerciceById(id) {
  const result = await pool.query('SELECT * FROM exercices WHERE id = $1', [id]);
  return result.rows[0] || null;
}

// Ajoute un exercice au référentiel (réservé aux coachs/admins)
async function creerExercice({ nom, groupe_musculaire, methode, description }) {
  const result = await pool.query(
    `INSERT INTO exercices (nom, groupe_musculaire, methode, description)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [nom, groupe_musculaire || null, methode || null, description || null]
  );
  return result.rows[0];
}

// ---------------------------------------------------------
// Séances (structure : date, session, cible, notes)
// ---------------------------------------------------------

async function creerSeance(utilisateurId, { date_seance, nom_session, cible, notes }) {
  const result = await pool.query(
    `INSERT INTO seances (utilisateur_id, date_seance, nom_session, cible, notes)
     VALUES ($1, COALESCE($2, CURRENT_DATE), $3, $4, $5) RETURNING *`,
    [utilisateurId, date_seance || null, nom_session || null, cible || null, notes || null]
  );
  return result.rows[0];
}

// Liste les séances d'un utilisateur (historique), filtrable par période
async function getSeances(utilisateurId, { from, to, limit } = {}) {
  const conditions = ['utilisateur_id = $1'];
  const params = [utilisateurId];

  if (from) {
    params.push(from);
    conditions.push(`date_seance >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conditions.push(`date_seance <= $${params.length}`);
  }

  let requete = `SELECT * FROM seances WHERE ${conditions.join(' AND ')} ORDER BY date_seance DESC, id DESC`;
  if (limit) {
    params.push(limit);
    requete += ` LIMIT $${params.length}`;
  }

  const result = await pool.query(requete, params);
  return result.rows;
}

// Vérifie que la séance appartient bien à l'utilisateur (contrôle d'accès)
async function getSeanceForUtilisateur(seanceId, utilisateurId) {
  const result = await pool.query(
    'SELECT * FROM seances WHERE id = $1 AND utilisateur_id = $2',
    [seanceId, utilisateurId]
  );
  return result.rows[0] || null;
}

// Détail complet d'une séance : infos + liste des exercices exécutés (avec fait/non fait)
async function getSeanceDetail(seanceId, utilisateurId) {
  const seance = await getSeanceForUtilisateur(seanceId, utilisateurId);
  if (!seance) return null;

  const exercicesResult = await pool.query(
    `SELECT se.*, e.nom AS exercice_nom, e.groupe_musculaire, e.methode AS exercice_methode
     FROM seance_exercices se
     JOIN exercices e ON e.id = se.exercice_id
     WHERE se.seance_id = $1
     ORDER BY se.ordre NULLS LAST, se.id`,
    [seanceId]
  );

  return { ...seance, exercices: exercicesResult.rows };
}

async function updateSeance(seanceId, utilisateurId, { date_seance, nom_session, cible, notes }) {
  const result = await pool.query(
    `UPDATE seances SET
       date_seance = COALESCE($3, date_seance),
       nom_session = COALESCE($4, nom_session),
       cible = COALESCE($5, cible),
       notes = COALESCE($6, notes)
     WHERE id = $1 AND utilisateur_id = $2
     RETURNING *`,
    [seanceId, utilisateurId, date_seance || null, nom_session || null, cible || null, notes || null]
  );
  return result.rows[0] || null;
}

async function supprimerSeance(seanceId, utilisateurId) {
  const result = await pool.query(
    'DELETE FROM seances WHERE id = $1 AND utilisateur_id = $2 RETURNING id',
    [seanceId, utilisateurId]
  );
  return result.rowCount > 0;
}

// ---------------------------------------------------------
// Détail exercice par exercice au sein d'une séance
// (paramètres d'exécution + case à cocher fait / non fait)
// ---------------------------------------------------------

async function ajouterExerciceASeance(seanceId, {
  exercice_id, niveau, poids_kg, vitesse, repetitions,
  duree_secondes, series, repos_secondes, ordre, fait,
}) {
  const result = await pool.query(
    `INSERT INTO seance_exercices (
       seance_id, exercice_id, niveau, poids_kg, vitesse, repetitions,
       duree_secondes, series, repos_secondes, ordre, fait
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, FALSE))
     RETURNING *`,
    [
      seanceId, exercice_id, niveau || null, poids_kg || null, vitesse || null,
      repetitions || null, duree_secondes || null, series || null,
      repos_secondes || null, ordre || null, fait,
    ]
  );
  return result.rows[0];
}

// Vérifie que la ligne seance_exercices appartient bien (via la séance) à l'utilisateur
async function getSeanceExerciceForUtilisateur(seanceExerciceId, utilisateurId) {
  const result = await pool.query(
    `SELECT se.* FROM seance_exercices se
     JOIN seances s ON s.id = se.seance_id
     WHERE se.id = $1 AND s.utilisateur_id = $2`,
    [seanceExerciceId, utilisateurId]
  );
  return result.rows[0] || null;
}

async function updateSeanceExercice(seanceExerciceId, utilisateurId, champs) {
  const existant = await getSeanceExerciceForUtilisateur(seanceExerciceId, utilisateurId);
  if (!existant) return null;

  const {
    niveau, poids_kg, vitesse, repetitions,
    duree_secondes, series, repos_secondes, ordre, fait,
  } = champs;

  const result = await pool.query(
    `UPDATE seance_exercices SET
       niveau = COALESCE($2, niveau),
       poids_kg = COALESCE($3, poids_kg),
       vitesse = COALESCE($4, vitesse),
       repetitions = COALESCE($5, repetitions),
       duree_secondes = COALESCE($6, duree_secondes),
       series = COALESCE($7, series),
       repos_secondes = COALESCE($8, repos_secondes),
       ordre = COALESCE($9, ordre),
       fait = COALESCE($10, fait)
     WHERE id = $1
     RETURNING *`,
    [
      seanceExerciceId, niveau || null, poids_kg || null, vitesse || null,
      repetitions || null, duree_secondes || null, series || null,
      repos_secondes || null, ordre || null,
      fait === undefined ? null : fait,
    ]
  );
  return result.rows[0];
}

// Bascule rapide de la case à cocher "fait / non fait"
async function basculerFait(seanceExerciceId, utilisateurId, fait) {
  const existant = await getSeanceExerciceForUtilisateur(seanceExerciceId, utilisateurId);
  if (!existant) return null;

  const result = await pool.query(
    'UPDATE seance_exercices SET fait = $2 WHERE id = $1 RETURNING *',
    [seanceExerciceId, fait]
  );
  return result.rows[0];
}

async function supprimerSeanceExercice(seanceExerciceId, utilisateurId) {
  const existant = await getSeanceExerciceForUtilisateur(seanceExerciceId, utilisateurId);
  if (!existant) return false;

  const result = await pool.query('DELETE FROM seance_exercices WHERE id = $1 RETURNING id', [seanceExerciceId]);
  return result.rowCount > 0;
}

// ---------------------------------------------------------
// Indicateurs athlétiques (force, endurance, résistance, puissance)
// + histogramme athlétique
// ---------------------------------------------------------

async function ajouterIndicateurAthletique(utilisateurId, { date_mesure, force, endurance, resistance, puissance }) {
  const result = await pool.query(
    `INSERT INTO indicateurs_athletiques (utilisateur_id, date_mesure, force, endurance, resistance, puissance)
     VALUES ($1, COALESCE($2, CURRENT_DATE), $3, $4, $5, $6)
     RETURNING *`,
    [utilisateurId, date_mesure || null, force || null, endurance || null, resistance || null, puissance || null]
  );
  return result.rows[0];
}

async function getIndicateursAthletiques(utilisateurId, { from, to, limit } = {}) {
  const conditions = ['utilisateur_id = $1'];
  const params = [utilisateurId];

  if (from) {
    params.push(from);
    conditions.push(`date_mesure >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conditions.push(`date_mesure <= $${params.length}`);
  }

  let requete = `SELECT * FROM indicateurs_athletiques WHERE ${conditions.join(' AND ')} ORDER BY date_mesure DESC, id DESC`;
  if (limit) {
    params.push(limit);
    requete += ` LIMIT $${params.length}`;
  }

  const result = await pool.query(requete, params);
  return result.rows;
}

// Données prêtes pour l'histogramme athlétique (force, endurance, résistance, puissance dans le temps)
async function getHistogrammeAthletique(utilisateurId, { from, to } = {}) {
  const indicateurs = await getIndicateursAthletiques(utilisateurId, { from, to });
  const chronologique = [...indicateurs].reverse();

  return {
    dates: chronologique.map((i) => i.date_mesure),
    force: chronologique.map((i) => i.force),
    endurance: chronologique.map((i) => i.endurance),
    resistance: chronologique.map((i) => i.resistance),
    puissance: chronologique.map((i) => i.puissance),
  };
}

// ---------------------------------------------------------
// Vue anatomique interactive (groupes musculaires sollicités)
// ---------------------------------------------------------

// Agrège, par groupe musculaire, le volume d'entraînement de l'utilisateur
// (nombre de séances, nombre de séries, volume total poids × répétitions × séries,
// et date de dernière sollicitation) sur une période optionnelle.
async function getVueAnatomique(utilisateurId, { from, to } = {}) {
  const conditions = ['s.utilisateur_id = $1'];
  const params = [utilisateurId];

  if (from) {
    params.push(from);
    conditions.push(`s.date_seance >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conditions.push(`s.date_seance <= $${params.length}`);
  }

  const result = await pool.query(
    `SELECT
       e.groupe_musculaire,
       COUNT(DISTINCT s.id) AS nb_seances,
       COUNT(se.id) AS nb_exercices,
       COALESCE(SUM(se.series), 0) AS nb_series_total,
       COALESCE(SUM(
         COALESCE(se.poids_kg, 0) * COALESCE(se.repetitions, 0) * COALESCE(se.series, 1)
       ), 0) AS volume_total,
       MAX(s.date_seance) AS derniere_sollicitation
     FROM seance_exercices se
     JOIN seances s ON s.id = se.seance_id
     JOIN exercices e ON e.id = se.exercice_id
     WHERE ${conditions.join(' AND ')}
     GROUP BY e.groupe_musculaire
     ORDER BY volume_total DESC`,
    params
  );

  return result.rows;
}

module.exports = {
  // Référentiel exercices
  getExercices,
  getExerciceById,
  creerExercice,
  // Séances
  creerSeance,
  getSeances,
  getSeanceForUtilisateur,
  getSeanceDetail,
  updateSeance,
  supprimerSeance,
  // Détail exercice / séance
  ajouterExerciceASeance,
  getSeanceExerciceForUtilisateur,
  updateSeanceExercice,
  basculerFait,
  supprimerSeanceExercice,
  // Indicateurs athlétiques
  ajouterIndicateurAthletique,
  getIndicateursAthletiques,
  getHistogrammeAthletique,
  // Vue anatomique
  getVueAnatomique,
};
