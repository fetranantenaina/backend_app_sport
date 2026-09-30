// =========================================================
// MODULE 1 — Informations personnelles (Profil / Mensurations)
// Couche d'accès aux données + calculs métier associés :
//   - Sexe et âge
//   - Calcul automatique de l'IMC
//   - Calcul du PAL + recommandations
//   - Mensurations (saisie multi-champs + historique)
//   - Estimation du taux de masse grasse
//   - Statut de santé
//   - Données pour l'histogramme d'évolution physique
// =========================================================

const pool = require('../config/db');

// ---------------------------------------------------------
// Sous-fonctionnalité : Sexe et âge / Statut de santé / PAL
// (table `profils`, relation 1-1 avec `utilisateurs`)
// ---------------------------------------------------------

// Calcule l'âge (en années) à partir d'une date de naissance
function calculerAge(dateNaissance) {
  if (!dateNaissance) return null;
  const naissance = new Date(dateNaissance);
  if (Number.isNaN(naissance.getTime())) return null;

  const aujourdHui = new Date();
  let age = aujourdHui.getFullYear() - naissance.getFullYear();
  const moisDiff = aujourdHui.getMonth() - naissance.getMonth();
  if (moisDiff < 0 || (moisDiff === 0 && aujourdHui.getDate() < naissance.getDate())) {
    age--;
  }
  return age;
}

// Récupère le profil (sexe, âge, PAL, statut de santé...) d'un utilisateur
async function getProfilByUtilisateur(utilisateurId) {
  const result = await pool.query(
    'SELECT * FROM profils WHERE utilisateur_id = $1',
    [utilisateurId]
  );
  const profil = result.rows[0];
  if (!profil) return null;

  return {
    ...profil,
    age: calculerAge(profil.date_naissance),
    pal_recommandation: interpreterPAL(profil.pal),
  };
}

// Crée le profil s'il n'existe pas encore, ou le met à jour sinon (upsert)
async function upsertProfil(utilisateurId, { sexe, date_naissance, pal, statut_sante }) {
  const result = await pool.query(
    `INSERT INTO profils (utilisateur_id, sexe, date_naissance, pal, statut_sante)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (utilisateur_id)
     DO UPDATE SET
       sexe = COALESCE(EXCLUDED.sexe, profils.sexe),
       date_naissance = COALESCE(EXCLUDED.date_naissance, profils.date_naissance),
       pal = COALESCE(EXCLUDED.pal, profils.pal),
       statut_sante = COALESCE(EXCLUDED.statut_sante, profils.statut_sante),
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [utilisateurId, sexe || null, date_naissance || null, pal || null, statut_sante || null]
  );
  return result.rows[0];
}

// Interprète le niveau d'activité physique (PAL) et fournit une recommandation
// Bornes usuelles : 1.2 (sédentaire) à 2.4 (athlète de haut niveau)
function interpreterPAL(pal) {
  if (pal === null || pal === undefined) return null;
  const valeur = Number(pal);

  if (valeur < 1.375) {
    return {
      categorie: 'Sédentaire',
      description: 'Peu ou pas d\'exercice, travail de bureau.',
      recommandation: 'Essaie d\'intégrer 20 à 30 minutes de marche ou d\'activité légère par jour.',
    };
  }
  if (valeur < 1.55) {
    return {
      categorie: 'Légèrement actif',
      description: 'Exercice léger 1 à 3 jours par semaine.',
      recommandation: 'Ajoute une séance de renforcement musculaire par semaine pour progresser.',
    };
  }
  if (valeur < 1.725) {
    return {
      categorie: 'Modérément actif',
      description: 'Exercice modéré 3 à 5 jours par semaine.',
      recommandation: 'Bon rythme : veille à varier cardio et musculation et à bien récupérer.',
    };
  }
  if (valeur < 1.9) {
    return {
      categorie: 'Très actif',
      description: 'Exercice intense 6 à 7 jours par semaine.',
      recommandation: 'Surveille ton apport calorique et ton sommeil pour soutenir cette charge.',
    };
  }
  return {
    categorie: 'Extrêmement actif',
    description: 'Exercice très intense ou travail physique + entraînement quotidien.',
    recommandation: 'Priorise la récupération active et un suivi nutritionnel rapproché.',
  };
}

// ---------------------------------------------------------
// Sous-fonctionnalité : Calcul automatique de l'IMC
// ---------------------------------------------------------

// IMC = poids (kg) / taille (m)²
function calculerIMC(poidsKg, tailleCm) {
  if (!poidsKg || !tailleCm) return null;
  const tailleM = tailleCm / 100;
  if (tailleM <= 0) return null;
  const imc = poidsKg / (tailleM * tailleM);
  return Math.round(imc * 100) / 100; // arrondi à 2 décimales
}

// Interprète la valeur de l'IMC selon les seuils de l'OMS
function interpreterIMC(imc) {
  if (imc === null || imc === undefined) return null;
  if (imc < 16.5) return 'Dénutrition';
  if (imc < 18.5) return 'Maigreur';
  if (imc < 25) return 'Corpulence normale';
  if (imc < 30) return 'Surpoids';
  if (imc < 35) return 'Obésité modérée';
  if (imc < 40) return 'Obésité sévère';
  return 'Obésité morbide';
}

// ---------------------------------------------------------
// Sous-fonctionnalité : Estimation du taux de masse grasse
// (méthode US Navy, à partir des mensurations déjà saisies)
// ---------------------------------------------------------

function estimerTauxGraisse({ sexe, taille_cm, cou_cm, taille_tour_cm, fessiers_cm }) {
  if (!sexe || !taille_cm || !cou_cm || !taille_tour_cm) return null;

  const log10 = (x) => Math.log(x) / Math.LN10;

  if (sexe === 'homme') {
    if (taille_tour_cm - cou_cm <= 0) return null;
    const taux =
      495 /
        (1.0324 -
          0.19077 * log10(taille_tour_cm - cou_cm) +
          0.15456 * log10(taille_cm)) -
      450;
    return Math.round(taux * 100) / 100;
  }

  // Pour 'femme' et 'autre' : la formule Navy nécessite un tour de hanches,
  // on utilise la mesure des fessiers comme approximation du tour de hanches
  if (!fessiers_cm || taille_tour_cm + fessiers_cm - cou_cm <= 0) return null;
  const taux =
    495 /
      (1.29579 -
        0.35004 * log10(taille_tour_cm + fessiers_cm - cou_cm) +
        0.221 * log10(taille_cm)) -
    450;
  return Math.round(taux * 100) / 100;
}

// ---------------------------------------------------------
// Sous-fonctionnalité : Mensurations (saisie + historique)
// & Histogramme d'évolution physique
// (table `releves_physiques`)
// ---------------------------------------------------------

// Ajoute un relevé physique. L'IMC et le taux de masse grasse sont calculés
// automatiquement s'ils ne sont pas fournis explicitement.
async function ajouterReleve(utilisateurId, releve) {
  const {
    date_releve,
    poids_kg,
    taille_cm,
    taux_graisse,
    cou_cm,
    poitrine_cm,
    taille_tour_cm,
    bras_cm,
    fessiers_cm,
    cuisses_cm,
    mollets_cm,
  } = releve;

  // IMC auto-calculé si poids + taille disponibles et pas déjà fourni
  const imc = releve.imc !== undefined && releve.imc !== null
    ? releve.imc
    : calculerIMC(poids_kg, taille_cm);

  // Taux de masse grasse : valeur saisie sinon estimation automatique
  let tauxGraisseFinal = taux_graisse;
  if (tauxGraisseFinal === undefined || tauxGraisseFinal === null) {
    const profil = await getProfilByUtilisateur(utilisateurId);
    tauxGraisseFinal = estimerTauxGraisse({
      sexe: profil ? profil.sexe : null,
      taille_cm,
      cou_cm,
      taille_tour_cm,
      fessiers_cm,
    });
  }

  const result = await pool.query(
    `INSERT INTO releves_physiques (
       utilisateur_id, date_releve, poids_kg, taille_cm, imc, taux_graisse,
       cou_cm, poitrine_cm, taille_tour_cm, bras_cm, fessiers_cm, cuisses_cm, mollets_cm
     ) VALUES ($1, COALESCE($2, CURRENT_DATE), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      utilisateurId,
      date_releve || null,
      poids_kg || null,
      taille_cm || null,
      imc,
      tauxGraisseFinal,
      cou_cm || null,
      poitrine_cm || null,
      taille_tour_cm || null,
      bras_cm || null,
      fessiers_cm || null,
      cuisses_cm || null,
      mollets_cm || null,
    ]
  );

  const nouveauReleve = result.rows[0];
  return { ...nouveauReleve, imc_categorie: interpreterIMC(nouveauReleve.imc) };
}

// Historique des relevés physiques d'un utilisateur, du plus récent au plus ancien
// Filtrable par période (from / to) et limitable (limit)
async function getReleves(utilisateurId, { from, to, limit } = {}) {
  const conditions = ['utilisateur_id = $1'];
  const params = [utilisateurId];

  if (from) {
    params.push(from);
    conditions.push(`date_releve >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conditions.push(`date_releve <= $${params.length}`);
  }

  let requete = `SELECT * FROM releves_physiques WHERE ${conditions.join(' AND ')} ORDER BY date_releve DESC, id DESC`;

  if (limit) {
    params.push(limit);
    requete += ` LIMIT $${params.length}`;
  }

  const result = await pool.query(requete, params);
  return result.rows;
}

// Dernier relevé physique en date d'un utilisateur
async function getDernierReleve(utilisateurId) {
  const result = await pool.query(
    'SELECT * FROM releves_physiques WHERE utilisateur_id = $1 ORDER BY date_releve DESC, id DESC LIMIT 1',
    [utilisateurId]
  );
  return result.rows[0] || null;
}

// Données prêtes à être consommées par un graphique (histogramme d'évolution physique) :
// une série de points chronologiques pour le poids, l'IMC, le taux de graisse
// et chacune des mensurations.
async function getHistogrammeEvolution(utilisateurId, { from, to } = {}) {
  const releves = await getReleves(utilisateurId, { from, to });
  // On remet dans l'ordre chronologique croissant pour l'affichage du graphique
  const chronologique = [...releves].reverse();

  return {
    dates: chronologique.map((r) => r.date_releve),
    poids_kg: chronologique.map((r) => r.poids_kg),
    imc: chronologique.map((r) => r.imc),
    taux_graisse: chronologique.map((r) => r.taux_graisse),
    cou_cm: chronologique.map((r) => r.cou_cm),
    poitrine_cm: chronologique.map((r) => r.poitrine_cm),
    taille_tour_cm: chronologique.map((r) => r.taille_tour_cm),
    bras_cm: chronologique.map((r) => r.bras_cm),
    fessiers_cm: chronologique.map((r) => r.fessiers_cm),
    cuisses_cm: chronologique.map((r) => r.cuisses_cm),
    mollets_cm: chronologique.map((r) => r.mollets_cm),
  };
}

module.exports = {
  // Profil
  getProfilByUtilisateur,
  upsertProfil,
  calculerAge,
  interpreterPAL,
  // IMC
  calculerIMC,
  interpreterIMC,
  // Masse grasse
  estimerTauxGraisse,
  // Relevés / historique / histogramme
  ajouterReleve,
  getReleves,
  getDernierReleve,
  getHistogrammeEvolution,
};
