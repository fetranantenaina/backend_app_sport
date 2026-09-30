// =========================================================
// MODULE 2 — Routes : Journal d'entraînement (Workout log)
// =========================================================

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const entrainementService = require('../objets/entrainement');

// Autorise uniquement les coachs/admins (ex: gestion du référentiel d'exercices)
function autoriserCoachOuAdmin(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'coach') {
    return res.status(403).send('Accès réservé aux coachs/admins');
  }
  next();
}

// ---------------------------------------------------------
// RÉFÉRENTIEL D'EXERCICES
// ---------------------------------------------------------

// GET /exercices -> liste du référentiel (filtrable par ?groupe_musculaire=&methode=)
router.get('/exercices', authenticateToken, async (req, res) => {
  try {
    const { groupe_musculaire, methode } = req.query;
    const exercices = await entrainementService.getExercices({ groupe_musculaire, methode });
    res.json(exercices);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// GET /exercices/:id -> détail d'un exercice
router.get('/exercices/:id', authenticateToken, async (req, res) => {
  try {
    const exercice = await entrainementService.getExerciceById(req.params.id);
    if (!exercice) return res.status(404).send('Exercice non trouvé');
    res.json(exercice);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// POST /exercices -> ajoute un exercice au référentiel (coach/admin uniquement)
// Body attendu : { nom, groupe_musculaire, methode, description }
router.post('/exercices', authenticateToken, autoriserCoachOuAdmin, async (req, res) => {
  const { nom, groupe_musculaire, methode, description } = req.body;
  if (!nom) return res.status(400).send('Le nom de l\'exercice est requis');

  try {
    const exercice = await entrainementService.creerExercice({ nom, groupe_musculaire, methode, description });
    res.status(201).json(exercice);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de la création de l\'exercice');
  }
});

// ---------------------------------------------------------
// SÉANCES (structure : date, session, cible, notes)
// ---------------------------------------------------------

// POST /seances -> crée une nouvelle séance
// Body attendu : { date_seance?, nom_session, cible, notes }
router.post('/seances', authenticateToken, async (req, res) => {
  try {
    const seance = await entrainementService.creerSeance(req.user.id, req.body);
    res.status(201).json(seance);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de la création de la séance');
  }
});

// GET /seances -> historique des séances de l'utilisateur connecté
// Query params optionnels : ?from=&to=&limit=
router.get('/seances', authenticateToken, async (req, res) => {
  try {
    const { from, to, limit } = req.query;
    const seances = await entrainementService.getSeances(req.user.id, {
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
    res.json(seances);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// GET /seances/:id -> détail d'une séance (avec ses exercices, niveau, poids, fait/non fait...)
router.get('/seances/:id', authenticateToken, async (req, res) => {
  try {
    const seance = await entrainementService.getSeanceDetail(req.params.id, req.user.id);
    if (!seance) return res.status(404).send('Séance non trouvée');
    res.json(seance);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// PUT /seances/:id -> met à jour les informations d'une séance
router.put('/seances/:id', authenticateToken, async (req, res) => {
  try {
    const seance = await entrainementService.updateSeance(req.params.id, req.user.id, req.body);
    if (!seance) return res.status(404).send('Séance non trouvée');
    res.json(seance);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de la mise à jour de la séance');
  }
});

// DELETE /seances/:id -> supprime une séance (et ses exercices associés, en cascade)
router.delete('/seances/:id', authenticateToken, async (req, res) => {
  try {
    const supprime = await entrainementService.supprimerSeance(req.params.id, req.user.id);
    if (!supprime) return res.status(404).send('Séance non trouvée');
    res.json({ message: 'Séance supprimée' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de la suppression de la séance');
  }
});

// ---------------------------------------------------------
// DÉTAIL EXERCICE PAR EXERCICE AU SEIN D'UNE SÉANCE
// (paramètres d'exécution + case à cocher fait/non fait)
// ---------------------------------------------------------

// POST /seances/:id/exercices -> ajoute un exercice exécuté à la séance
// Body attendu : { exercice_id, niveau, poids_kg, vitesse, repetitions,
//                   duree_secondes, series, repos_secondes, ordre, fait? }
router.post('/seances/:id/exercices', authenticateToken, async (req, res) => {
  const { exercice_id } = req.body;
  if (!exercice_id) return res.status(400).send('exercice_id est requis');

  try {
    const seance = await entrainementService.getSeanceForUtilisateur(req.params.id, req.user.id);
    if (!seance) return res.status(404).send('Séance non trouvée');

    const exerciceExiste = await entrainementService.getExerciceById(exercice_id);
    if (!exerciceExiste) return res.status(400).send('exercice_id invalide');

    const ligne = await entrainementService.ajouterExerciceASeance(req.params.id, req.body);
    res.status(201).json(ligne);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de l\'ajout de l\'exercice à la séance');
  }
});

// PUT /seance-exercices/:id -> met à jour les paramètres d'exécution d'une ligne
router.put('/seance-exercices/:id', authenticateToken, async (req, res) => {
  try {
    const ligne = await entrainementService.updateSeanceExercice(req.params.id, req.user.id, req.body);
    if (!ligne) return res.status(404).send('Ligne non trouvée');
    res.json(ligne);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de la mise à jour');
  }
});

// PATCH /seance-exercices/:id/fait -> bascule rapide la case à cocher fait/non fait
// Body attendu : { fait: true|false }
router.patch('/seance-exercices/:id/fait', authenticateToken, async (req, res) => {
  if (typeof req.body.fait !== 'boolean') {
    return res.status(400).send('Le champ "fait" doit être un booléen');
  }
  try {
    const ligne = await entrainementService.basculerFait(req.params.id, req.user.id, req.body.fait);
    if (!ligne) return res.status(404).send('Ligne non trouvée');
    res.json(ligne);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de la mise à jour');
  }
});

// DELETE /seance-exercices/:id -> retire un exercice d'une séance
router.delete('/seance-exercices/:id', authenticateToken, async (req, res) => {
  try {
    const supprime = await entrainementService.supprimerSeanceExercice(req.params.id, req.user.id);
    if (!supprime) return res.status(404).send('Ligne non trouvée');
    res.json({ message: 'Exercice retiré de la séance' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de la suppression');
  }
});

// ---------------------------------------------------------
// INDICATEURS ATHLÉTIQUES (force, endurance, résistance, puissance)
// ---------------------------------------------------------

// POST /indicateurs-athletiques -> enregistre une nouvelle mesure
router.post('/indicateurs-athletiques', authenticateToken, async (req, res) => {
  try {
    const indicateur = await entrainementService.ajouterIndicateurAthletique(req.user.id, req.body);
    res.status(201).json(indicateur);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de l\'enregistrement de l\'indicateur');
  }
});

// GET /indicateurs-athletiques -> historique des mesures
router.get('/indicateurs-athletiques', authenticateToken, async (req, res) => {
  try {
    const { from, to, limit } = req.query;
    const indicateurs = await entrainementService.getIndicateursAthletiques(req.user.id, {
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
    res.json(indicateurs);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// GET /indicateurs-athletiques/histogramme -> données formatées pour l'histogramme athlétique
router.get('/indicateurs-athletiques/histogramme', authenticateToken, async (req, res) => {
  try {
    const { from, to } = req.query;
    const data = await entrainementService.getHistogrammeAthletique(req.user.id, { from, to });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// ---------------------------------------------------------
// VUE ANATOMIQUE INTERACTIVE (groupes musculaires sollicités)
// ---------------------------------------------------------

// GET /vue-anatomique -> volume d'entraînement agrégé par groupe musculaire
// Query params optionnels : ?from=&to=
router.get('/vue-anatomique', authenticateToken, async (req, res) => {
  try {
    const { from, to } = req.query;
    const data = await entrainementService.getVueAnatomique(req.user.id, { from, to });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

module.exports = router;
