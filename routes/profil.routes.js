// =========================================================
// MODULE 1 — Routes : Informations personnelles (Profil / Mensurations)
// =========================================================

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const profilService = require('../objets/profil');

// ---------------------------------------------------------
// PROFIL (sexe, âge, PAL, statut de santé)
// ---------------------------------------------------------

// GET /profil -> récupère le profil de l'utilisateur connecté
router.get('/profil', authenticateToken, async (req, res) => {
  try {
    const profil = await profilService.getProfilByUtilisateur(req.user.id);
    if (!profil) {
      return res.status(404).send('Profil non renseigné');
    }
    res.json(profil);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// POST /profil -> crée ou met à jour le profil de l'utilisateur connecté
// Body attendu : { sexe, date_naissance, pal, statut_sante }
router.post('/profil', authenticateToken, async (req, res) => {
  const { sexe, date_naissance, pal, statut_sante } = req.body;

  if (sexe && !['homme', 'femme', 'autre'].includes(sexe)) {
    return res.status(400).send('Sexe invalide (valeurs acceptées : homme, femme, autre)');
  }

  try {
    const profil = await profilService.upsertProfil(req.user.id, {
      sexe,
      date_naissance,
      pal,
      statut_sante,
    });
    res.json({
      ...profil,
      age: profilService.calculerAge(profil.date_naissance),
      pal_recommandation: profilService.interpreterPAL(profil.pal),
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de l\'enregistrement du profil');
  }
});

// GET /profil/:utilisateurId -> consultation par un coach/admin du profil d'un utilisateur
router.get('/profil/:utilisateurId', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'coach' && String(req.user.id) !== req.params.utilisateurId) {
    return res.status(403).send('Accès non autorisé');
  }

  try {
    const profil = await profilService.getProfilByUtilisateur(req.params.utilisateurId);
    if (!profil) {
      return res.status(404).send('Profil non trouvé');
    }
    res.json(profil);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// ---------------------------------------------------------
// RELEVÉS PHYSIQUES (mensurations, poids, IMC, taux de graisse...)
// ---------------------------------------------------------

// POST /releves -> ajoute un nouveau relevé physique (IMC et % masse grasse auto-calculés)
// Body attendu : { date_releve?, poids_kg, taille_cm, taux_graisse?,
//                   cou_cm?, poitrine_cm?, taille_tour_cm?, bras_cm?, fessiers_cm?, cuisses_cm?, mollets_cm? }
router.post('/releves', authenticateToken, async (req, res) => {
  try {
    const releve = await profilService.ajouterReleve(req.user.id, req.body);
    res.status(201).json(releve);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de l\'enregistrement du relevé physique');
  }
});

// GET /releves -> historique des relevés physiques de l'utilisateur connecté
// Query params optionnels : ?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=50
router.get('/releves', authenticateToken, async (req, res) => {
  try {
    const { from, to, limit } = req.query;
    const releves = await profilService.getReleves(req.user.id, {
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
    res.json(releves);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// GET /releves/dernier -> dernier relevé physique enregistré
router.get('/releves/dernier', authenticateToken, async (req, res) => {
  try {
    const dernier = await profilService.getDernierReleve(req.user.id);
    if (!dernier) {
      return res.status(404).send('Aucun relevé enregistré');
    }
    res.json(dernier);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// GET /releves/histogramme -> données formatées pour l'histogramme d'évolution physique
// Query params optionnels : ?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/releves/histogramme', authenticateToken, async (req, res) => {
  try {
    const { from, to } = req.query;
    const data = await profilService.getHistogrammeEvolution(req.user.id, { from, to });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

module.exports = router;
