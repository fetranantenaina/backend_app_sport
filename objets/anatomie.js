// =========================================================
// MODULE 2 bis — Vue anatomique 3D
//   - Référentiel des muscles (nom français, explication, objets du modèle 3D)
//   - Intitulés du journal (TARGET) -> muscles, avec la part du volume de chacun
//   - Charge par muscle sur une période, badges cardio / échauffement / récupération
//   - Fiche muscle (stats + derniers exercices) et muscles d'un exercice
// =========================================================

const pool = require('../config/db');

const ACTIVITES = ['cardio', 'echauffement', 'recuperation', 'qualite'];
const REGIONS = ['épaules', 'bras', 'poitrine', 'dos', 'tronc', 'hanches', 'jambes'];
const VUES = ['face', 'dos', 'cote'];
const PERIODES = { '7j': 7, '30j': 30, '90j': 90, '6m': 182, '1an': 365 };
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

class ErreurValidation extends Error {}

// Libellé tel que saisi -> forme canonique ("  glutes " -> "GLUTES")
const normaliserLibelle = (l) => String(l || '').trim().replace(/\s+/g, ' ').toUpperCase();

// Période : ?periode=30j ou ?from=AAAA-MM-JJ&to=AAAA-MM-JJ (sans rien : tout l'historique)
function resoudrePeriode({ periode, from, to } = {}, aujourdhui = new Date()) {
  if (from && !DATE_ISO.test(from)) throw new ErreurValidation('from doit être au format AAAA-MM-JJ');
  if (to && !DATE_ISO.test(to)) throw new ErreurValidation('to doit être au format AAAA-MM-JJ');
  if (periode && periode !== 'tout') {
    const jours = PERIODES[periode];
    if (!jours) throw new ErreurValidation(`periode inconnue (valeurs : ${Object.keys(PERIODES).join(', ')}, tout)`);
    const debut = new Date(Date.UTC(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate() - (jours - 1)));
    return { periode, from: debut.toISOString().slice(0, 10), to: to || null };
  }
  return { periode: from || to ? 'personnalisee' : 'tout', from: from || null, to: to || null };
}

// Lignes de journal faites, une par intitulé ciblé (les cibles de la ligne, sinon celles de l'exercice)
function sqlLignes(params, { from, to }) {
  const conditions = ['s.utilisateur_id = $1', 'se.fait = TRUE'];
  if (from) { params.push(from); conditions.push(`s.date_seance >= $${params.length}`); }
  if (to) { params.push(to); conditions.push(`s.date_seance <= $${params.length}`); }
  return `lignes AS (
    SELECT se.id AS ligne_id, s.id AS seance_id, s.date_seance, e.nom AS exercice,
           COALESCE(se.series, 1) AS series, se.repetitions, se.poids_kg, se.duree_secondes, se.charge, se.rep_temps,
           UPPER(regexp_replace(TRIM(c.libelle), '\\s+', ' ', 'g')) AS libelle
    FROM seance_exercices se
    JOIN seances s ON s.id = se.seance_id
    JOIN exercices e ON e.id = se.exercice_id
    CROSS JOIN LATERAL unnest(string_to_array(COALESCE(NULLIF(se.cibles, ''), e.groupe_musculaire), ',')) AS c(libelle)
    WHERE ${conditions.join(' AND ')} AND TRIM(c.libelle) <> ''
  ),
  -- une ligne par (exercice fait, muscle) : la part est plafonnée à 1 si deux intitulés visent le même muscle
  lignes_muscles AS (
    SELECT li.ligne_id, li.seance_id, li.date_seance, li.exercice, li.series, li.repetitions, li.poids_kg,
           li.charge, li.rep_temps, lm.muscle_id, LEAST(SUM(lm.part), 1) AS part,
           string_agg(DISTINCT li.libelle, ', ') AS libelles
    FROM lignes li
    JOIN libelles_cibles lc ON lc.libelle = li.libelle AND lc.type = 'muscle'
    JOIN libelle_muscles lm ON lm.libelle_id = lc.id
    GROUP BY li.ligne_id, li.seance_id, li.date_seance, li.exercice, li.series, li.repetitions, li.poids_kg,
             li.charge, li.rep_temps, lm.muscle_id
  )`;
}

const nombre = (x) => (x === null || x === undefined ? 0 : Math.round(Number(x) * 100) / 100);

// ---------------------------------------------------------
// Vue anatomique : charge par muscle sur la période
// ---------------------------------------------------------
async function getVueAnatomique(utilisateurId, filtres = {}) {
  const periode = resoudrePeriode(filtres);

  const pMuscles = [utilisateurId];
  const lignes = sqlLignes(pMuscles, periode);
  const pActivites = [utilisateurId];
  const lignesA = sqlLignes(pActivites, periode);
  const pInconnus = [utilisateurId];
  const lignesI = sqlLignes(pInconnus, periode);

  const [muscles, stats, activites, inconnus] = await Promise.all([
    pool.query('SELECT code, nom_fr, region, vue, objets_3d FROM muscles ORDER BY ordre, id'),
    pool.query(
      `WITH ${lignes}
       SELECT m.code,
              COUNT(DISTINCT lm.seance_id) AS nb_seances,
              COUNT(DISTINCT lm.ligne_id) AS nb_exercices,
              SUM(lm.series * lm.part) AS nb_series,
              SUM(COALESCE(lm.poids_kg, 0) * COALESCE(lm.repetitions, 0) * lm.series * lm.part) AS volume_kg,
              to_char(MAX(lm.date_seance), 'YYYY-MM-DD') AS derniere_sollicitation
       FROM lignes_muscles lm JOIN muscles m ON m.id = lm.muscle_id
       GROUP BY m.code`,
      pMuscles
    ),
    pool.query(
      `WITH ${lignesA},
       uniques AS (
         SELECT DISTINCT li.ligne_id, li.seance_id, li.series, li.duree_secondes, li.date_seance, lc.activite
         FROM lignes li JOIN libelles_cibles lc ON lc.libelle = li.libelle AND lc.type = 'activite'
       )
       SELECT activite, COUNT(DISTINCT seance_id) AS nb_seances, COUNT(*) AS nb_exercices,
              SUM(COALESCE(duree_secondes, 0) * series) / 60.0 AS minutes,
              to_char(MAX(date_seance), 'YYYY-MM-DD') AS derniere_fois
       FROM uniques GROUP BY activite`,
      pActivites
    ),
    pool.query(
      `WITH ${lignesI}
       SELECT li.libelle, COUNT(DISTINCT li.ligne_id) AS nb_exercices
       FROM lignes li LEFT JOIN libelles_cibles lc ON lc.libelle = li.libelle
       WHERE lc.id IS NULL GROUP BY li.libelle ORDER BY nb_exercices DESC, li.libelle`,
      pInconnus
    ),
  ]);

  const parCode = new Map(stats.rows.map((r) => [r.code, r]));
  const lignesMuscles = muscles.rows.map((m) => {
    const s = parCode.get(m.code) || {};
    return {
      ...m,
      nb_seances: nombre(s.nb_seances),
      nb_exercices: nombre(s.nb_exercices),
      nb_series: nombre(s.nb_series),
      volume_kg: nombre(s.volume_kg),
      derniere_sollicitation: s.derniere_sollicitation || null,
    };
  });
  const max = (cle) => Math.max(0, ...lignesMuscles.map((m) => m[cle]));
  const parActivite = new Map(activites.rows.map((r) => [r.activite, r]));

  return {
    periode,
    muscles: lignesMuscles,
    maximums: { nb_seances: max('nb_seances'), nb_series: max('nb_series'), volume_kg: max('volume_kg') },
    activites: ACTIVITES.map((a) => {
      const r = parActivite.get(a) || {};
      return { activite: a, nb_seances: nombre(r.nb_seances), nb_exercices: nombre(r.nb_exercices),
        minutes: Math.round(Number(r.minutes || 0)), derniere_fois: r.derniere_fois || null };
    }),
    non_reconnus: inconnus.rows.map((r) => ({ libelle: r.libelle, nb_exercices: Number(r.nb_exercices) })),
  };
}

// ---------------------------------------------------------
// Fiche d'un muscle : explication + stats + derniers exercices
// ---------------------------------------------------------
async function getFicheMuscle(utilisateurId, code, filtres = {}) {
  const periode = resoudrePeriode(filtres);
  const muscle = (await pool.query(
    `SELECT m.*, COALESCE((SELECT array_agg(l.libelle ORDER BY l.libelle) FROM libelle_muscles lm
       JOIN libelles_cibles l ON l.id = lm.libelle_id WHERE lm.muscle_id = m.id), '{}') AS libelles
     FROM muscles m WHERE m.code = $1`, [code])).rows[0];
  if (!muscle) return null;

  const params = [utilisateurId];
  const lignes = sqlLignes(params, periode);
  params.push(muscle.id);
  const idx = params.length;
  const [stats, derniers] = await Promise.all([
    pool.query(
      `WITH ${lignes}
       SELECT COUNT(DISTINCT seance_id) AS nb_seances, COUNT(DISTINCT ligne_id) AS nb_exercices,
              SUM(series * part) AS nb_series,
              SUM(COALESCE(poids_kg, 0) * COALESCE(repetitions, 0) * series * part) AS volume_kg,
              to_char(MAX(date_seance), 'YYYY-MM-DD') AS derniere_sollicitation
       FROM lignes_muscles WHERE muscle_id = $${idx}`, params),
    pool.query(
      `WITH ${lignes}
       SELECT to_char(date_seance, 'YYYY-MM-DD') AS date_seance, exercice, libelles, series, repetitions,
              poids_kg, charge, rep_temps, part
       FROM lignes_muscles WHERE muscle_id = $${idx}
       ORDER BY date_seance DESC, ligne_id DESC LIMIT 10`, params),
  ]);
  const s = stats.rows[0] || {};
  return {
    periode,
    muscle,
    stats: {
      nb_seances: nombre(s.nb_seances), nb_exercices: nombre(s.nb_exercices), nb_series: nombre(s.nb_series),
      volume_kg: nombre(s.volume_kg), derniere_sollicitation: s.derniere_sollicitation || null,
    },
    derniers_exercices: derniers.rows.map((r) => ({
      ...r, series: Number(r.series), part: Number(r.part),
      poids_kg: r.poids_kg === null ? null : Number(r.poids_kg),
    })),
  };
}

// ---------------------------------------------------------
// Muscles d'une liste d'intitulés (fiche d'exercice, ligne de séance)
// ---------------------------------------------------------
async function analyserCibles(texte) {
  const libelles = [...new Set(String(texte || '').split(',').map(normaliserLibelle).filter(Boolean))];
  if (!libelles.length) return { muscles: [], activites: [], non_reconnus: [] };
  const connus = await pool.query(
    `SELECT l.libelle, l.type, l.activite, l.nom_fr AS libelle_fr, m.code, m.nom_fr, m.vue, m.objets_3d, lm.part
     FROM libelles_cibles l
     LEFT JOIN libelle_muscles lm ON lm.libelle_id = l.id
     LEFT JOIN muscles m ON m.id = lm.muscle_id
     WHERE l.libelle = ANY($1::text[])
     ORDER BY m.ordre`, [libelles]);

  const muscles = new Map();
  const activites = new Map();
  const vus = new Set();
  for (const r of connus.rows) {
    vus.add(r.libelle);
    if (r.type === 'activite') { activites.set(r.activite, { activite: r.activite, libelle: r.libelle, nom_fr: r.libelle_fr }); continue; }
    if (!r.code) continue;
    const m = muscles.get(r.code) || { code: r.code, nom_fr: r.nom_fr, vue: r.vue, objets_3d: r.objets_3d, part: 0, libelles: [] };
    m.part = Math.min(1, Math.round((m.part + Number(r.part)) * 1000) / 1000);
    m.libelles.push(r.libelle);
    muscles.set(r.code, m);
  }
  return {
    muscles: [...muscles.values()].sort((a, b) => b.part - a.part),
    activites: [...activites.values()],
    non_reconnus: libelles.filter((l) => !vus.has(l)),
  };
}

async function getMusclesExercice(exerciceId) {
  const exercice = (await pool.query('SELECT id, nom, groupe_musculaire FROM exercices WHERE id = $1', [exerciceId])).rows[0];
  if (!exercice) return null;
  return { exercice, ...(await analyserCibles(exercice.groupe_musculaire)) };
}

// ---------------------------------------------------------
// Référentiel (lecture pour tous, écriture admin)
// ---------------------------------------------------------
async function getMuscles() {
  const r = await pool.query(
    `SELECT m.*, COALESCE((SELECT array_agg(l.libelle ORDER BY l.libelle) FROM libelle_muscles lm
       JOIN libelles_cibles l ON l.id = lm.libelle_id WHERE lm.muscle_id = m.id), '{}') AS libelles
     FROM muscles m ORDER BY m.ordre, m.id`);
  return r.rows;
}

async function getLibelles() {
  const r = await pool.query(
    `SELECT l.id, l.libelle, l.type, l.activite, l.nom_fr,
       COALESCE(json_agg(json_build_object('code', m.code, 'nom_fr', m.nom_fr, 'part', lm.part) ORDER BY m.ordre)
         FILTER (WHERE m.id IS NOT NULL), '[]') AS muscles
     FROM libelles_cibles l
     LEFT JOIN libelle_muscles lm ON lm.libelle_id = l.id
     LEFT JOIN muscles m ON m.id = lm.muscle_id
     GROUP BY l.id ORDER BY l.type DESC, l.libelle`);
  return r.rows.map((x) => ({ ...x, muscles: x.muscles.map((m) => ({ ...m, part: Number(m.part) })) }));
}

function validerMuscle(d, creation) {
  const out = {};
  if (creation || d.code !== undefined) {
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(d.code || '')) throw new ErreurValidation('code : minuscules, chiffres et _ (2 à 40 caractères)');
    out.code = d.code;
  }
  if (creation || d.nom_fr !== undefined) {
    if (!String(d.nom_fr || '').trim()) throw new ErreurValidation('nom_fr est requis');
    out.nom_fr = String(d.nom_fr).trim().slice(0, 80);
  }
  if (creation || d.region !== undefined) {
    if (!REGIONS.includes(d.region)) throw new ErreurValidation(`region : ${REGIONS.join(', ')}`);
    out.region = d.region;
  }
  if (d.vue !== undefined) {
    if (!VUES.includes(d.vue)) throw new ErreurValidation(`vue : ${VUES.join(', ')}`);
    out.vue = d.vue;
  }
  if (d.objets_3d !== undefined) {
    if (!Array.isArray(d.objets_3d) || !d.objets_3d.every((o) => typeof o === 'string' && o.trim())) {
      throw new ErreurValidation('objets_3d doit être une liste de noms');
    }
    out.objets_3d = d.objets_3d.map((o) => o.trim());
  }
  if (d.nom_latin !== undefined) out.nom_latin = d.nom_latin ? String(d.nom_latin).slice(0, 120) : null;
  if (d.description !== undefined) out.description = d.description ? String(d.description) : null;
  if (d.ordre !== undefined) {
    if (!Number.isInteger(d.ordre)) throw new ErreurValidation('ordre doit être un entier');
    out.ordre = d.ordre;
  }
  return out;
}

async function creerMuscle(d) {
  const v = validerMuscle(d, true);
  if (!v.objets_3d) v.objets_3d = [`${v.code}_g`, `${v.code}_d`];
  const cles = Object.keys(v);
  const r = await pool.query(
    `INSERT INTO muscles (${cles.join(', ')}) VALUES (${cles.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    cles.map((k) => v[k]));
  return r.rows[0];
}

async function modifierMuscle(code, d) {
  const v = validerMuscle(d, false);
  const cles = Object.keys(v);
  if (!cles.length) throw new ErreurValidation('Aucun champ à modifier');
  const r = await pool.query(
    `UPDATE muscles SET ${cles.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE code = $1 RETURNING *`,
    [code, ...cles.map((k) => v[k])]);
  return r.rows[0] || null;
}

async function supprimerMuscle(code) {
  const r = await pool.query('DELETE FROM muscles WHERE code = $1 RETURNING id', [code]);
  return r.rowCount > 0;
}

// Crée ou remplace un intitulé et ses correspondances.
// Body : { type: 'muscle', nom_fr?, muscles: [{ code, part? }] }  ou  { type: 'activite', activite, nom_fr? }
// Sans "part", le volume est réparti à parts égales entre les muscles.
async function enregistrerLibelle(libelleBrut, d) {
  const libelle = normaliserLibelle(libelleBrut);
  if (!libelle || libelle.length > 60) throw new ErreurValidation('Intitulé invalide (1 à 60 caractères)');
  if (!['muscle', 'activite'].includes(d.type)) throw new ErreurValidation('type : muscle ou activite');

  let liens = [];
  if (d.type === 'activite') {
    if (!ACTIVITES.includes(d.activite)) throw new ErreurValidation(`activite : ${ACTIVITES.join(', ')}`);
  } else {
    if (!Array.isArray(d.muscles) || !d.muscles.length) throw new ErreurValidation('muscles : au moins un muscle');
    const codes = d.muscles.map((m) => m.code);
    if (new Set(codes).size !== codes.length) throw new ErreurValidation('muscles : un même muscle est cité deux fois');
    const egal = Math.floor(1000 / codes.length) / 1000;
    liens = d.muscles.map((m, i) => ({
      code: m.code,
      part: m.part !== undefined ? Number(m.part) : (i === codes.length - 1 ? Math.round((1 - egal * (codes.length - 1)) * 1000) / 1000 : egal),
    }));
    if (liens.some((l) => !(l.part > 0 && l.part <= 1))) throw new ErreurValidation('part doit être comprise entre 0 (exclu) et 1');
    const existants = (await pool.query('SELECT code, id FROM muscles WHERE code = ANY($1::text[])', [codes])).rows;
    const inconnus = codes.filter((c) => !existants.some((e) => e.code === c));
    if (inconnus.length) throw new ErreurValidation(`Muscle(s) inconnu(s) : ${inconnus.join(', ')}`);
    liens = liens.map((l) => ({ ...l, id: existants.find((e) => e.code === l.code).id }));
  }

  const nomFr = d.nom_fr ? String(d.nom_fr).trim().slice(0, 80) : null;
  const ligne = (await pool.query(
    `INSERT INTO libelles_cibles (libelle, type, activite, nom_fr) VALUES ($1, $2, $3, $4)
     ON CONFLICT (libelle) DO UPDATE SET type = EXCLUDED.type, activite = EXCLUDED.activite,
       nom_fr = COALESCE(EXCLUDED.nom_fr, libelles_cibles.nom_fr)
     RETURNING id`,
    [libelle, d.type, d.type === 'activite' ? d.activite : null, nomFr])).rows[0];

  // Remplacement des correspondances : ajout/mise à jour puis retrait des anciennes
  // (pas de transaction en mode HTTP Neon ; rejouer la même requête donne le même résultat)
  const ids = liens.map((l) => l.id);
  if (liens.length) {
    await pool.query(
      `INSERT INTO libelle_muscles (libelle_id, muscle_id, part)
       SELECT $1, x.muscle_id, x.part FROM unnest($2::int[], $3::numeric[]) AS x(muscle_id, part)
       ON CONFLICT (libelle_id, muscle_id) DO UPDATE SET part = EXCLUDED.part`,
      [ligne.id, ids, liens.map((l) => l.part)]);
  }
  await pool.query('DELETE FROM libelle_muscles WHERE libelle_id = $1 AND NOT (muscle_id = ANY($2::int[]))', [ligne.id, ids]);

  return (await getLibelles()).find((l) => l.id === ligne.id);
}

async function supprimerLibelle(libelleBrut) {
  const r = await pool.query('DELETE FROM libelles_cibles WHERE libelle = $1 RETURNING id', [normaliserLibelle(libelleBrut)]);
  return r.rowCount > 0;
}

module.exports = {
  ErreurValidation,
  PERIODES,
  ACTIVITES,
  normaliserLibelle,
  resoudrePeriode,
  getVueAnatomique,
  getFicheMuscle,
  analyserCibles,
  getMusclesExercice,
  getMuscles,
  getLibelles,
  creerMuscle,
  modifierMuscle,
  supprimerMuscle,
  enregistrerLibelle,
  supprimerLibelle,
};
