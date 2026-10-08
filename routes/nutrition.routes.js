// =========================================================
// MODULE 3 — Routes : Nutrition + Contenus de l'E-book
// =========================================================

const express = require('express');
const router = express.Router();
const { authenticateToken, autoriserRoles } = require('../middleware/auth');
const nutritionService = require('../objets/nutrition');

const adminOuCoach = autoriserRoles('admin', 'coach');

// ---------------------------------------------------------
// NUTRITION — journal des apports
// (les routes fixes sont déclarées avant les routes /:id)
// ---------------------------------------------------------

// GET /nutrition/recommandations -> besoins journaliers personnalisés (calories, macros, eau)
router.get('/nutrition/recommandations', authenticateToken, async (req, res) => {
  try {
    const reco = await nutritionService.getRecommandations(req.user.id);
    if (reco.manquants) {
      return res.status(400).json({
        message: 'Données insuffisantes pour calculer les recommandations',
        manquants: reco.manquants,
      });
    }
    res.json(reco);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// GET /nutrition/bilan?date=YYYY-MM-DD -> apports du jour vs recommandations (défaut : aujourd'hui)
router.get('/nutrition/bilan', authenticateToken, async (req, res) => {
  try {
    const bilan = await nutritionService.getBilanJour(req.user.id, req.query.date);
    res.json(bilan);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// GET /nutrition/jours?from=&to= -> totaux par jour (pour graphiques de suivi)
router.get('/nutrition/jours', authenticateToken, async (req, res) => {
  try {
    const { from, to } = req.query;
    const jours = await nutritionService.getTotauxParJour(req.user.id, { from, to });
    res.json(jours);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// POST /nutrition -> ajoute une entrée au journal
// Body : { date_jour?, calories?, proteines_g?, glucides_g?, lipides_g?, eau_ml?, notes? }
router.post('/nutrition', authenticateToken, async (req, res) => {
  try {
    const entree = await nutritionService.ajouterEntreeNutrition(req.user.id, req.body);
    res.status(201).json(entree);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de l\'enregistrement de l\'entrée nutritionnelle');
  }
});

// GET /nutrition?from=&to=&limit= -> historique des entrées
router.get('/nutrition', authenticateToken, async (req, res) => {
  try {
    const { from, to, limit } = req.query;
    const entrees = await nutritionService.getEntreesNutrition(req.user.id, {
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
    res.json(entrees);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// PUT /nutrition/:id -> modifie une entrée
router.put('/nutrition/:id', authenticateToken, async (req, res) => {
  try {
    const entree = await nutritionService.updateEntreeNutrition(req.params.id, req.user.id, req.body);
    if (!entree) return res.status(404).send('Entrée non trouvée');
    res.json(entree);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de la mise à jour');
  }
});

// DELETE /nutrition/:id -> supprime une entrée
router.delete('/nutrition/:id', authenticateToken, async (req, res) => {
  try {
    const supprime = await nutritionService.supprimerEntreeNutrition(req.params.id, req.user.id);
    if (!supprime) return res.status(404).send('Entrée non trouvée');
    res.json({ message: 'Entrée supprimée' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de la suppression');
  }
});

// ---------------------------------------------------------
// E-BOOK — lecture in-app, import, progression
// ---------------------------------------------------------

// GET /ebook/progression -> avancement global de lecture
router.get('/ebook/progression', authenticateToken, async (req, res) => {
  try {
    res.json(await nutritionService.getProgression(req.user.id));
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// POST /ebook/import -> import en lot du contenu déjà rédigé (admin/coach)
// Body : { chapitres: [ { titre, ordre, contenu, image_url? }, ... ] }
router.post('/ebook/import', authenticateToken, adminOuCoach, async (req, res) => {
  const { chapitres } = req.body;
  if (!Array.isArray(chapitres) || chapitres.length === 0) {
    return res.status(400).send('Un tableau "chapitres" non vide est requis');
  }
  const invalide = chapitres.some((c) => !c.titre || c.ordre === undefined || !c.contenu);
  if (invalide) {
    return res.status(400).send('Chaque chapitre doit avoir un titre, un ordre et un contenu');
  }

  try {
    const crees = await nutritionService.importerChapitres(chapitres);
    res.status(201).json({ message: `${crees.length} chapitre(s) importé(s)`, chapitres: crees });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de l\'import (aucun chapitre n\'a été enregistré)');
  }
});

// GET /ebook/chapitres -> liste des chapitres + état de lecture
router.get('/ebook/chapitres', authenticateToken, async (req, res) => {
  try {
    res.json(await nutritionService.getChapitres(req.user.id));
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// POST /ebook/chapitres -> ajoute un chapitre (admin/coach)
router.post('/ebook/chapitres', authenticateToken, adminOuCoach, async (req, res) => {
  const { titre, ordre, contenu } = req.body;
  if (!titre || ordre === undefined || !contenu) {
    return res.status(400).send('titre, ordre et contenu sont requis');
  }
  try {
    res.status(201).json(await nutritionService.creerChapitre(req.body));
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de la création du chapitre');
  }
});

// GET /ebook/chapitres/:id -> lecture d'un chapitre complet
router.get('/ebook/chapitres/:id', authenticateToken, async (req, res) => {
  try {
    const chapitre = await nutritionService.getChapitreById(req.params.id, req.user.id);
    if (!chapitre) return res.status(404).send('Chapitre non trouvé');
    res.json(chapitre);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// PUT /ebook/chapitres/:id -> modifie un chapitre (admin/coach)
router.put('/ebook/chapitres/:id', authenticateToken, adminOuCoach, async (req, res) => {
  try {
    const chapitre = await nutritionService.updateChapitre(req.params.id, req.body);
    if (!chapitre) return res.status(404).send('Chapitre non trouvé');
    res.json(chapitre);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de la mise à jour');
  }
});

// DELETE /ebook/chapitres/:id -> supprime un chapitre (admin/coach)
router.delete('/ebook/chapitres/:id', authenticateToken, adminOuCoach, async (req, res) => {
  try {
    const supprime = await nutritionService.supprimerChapitre(req.params.id);
    if (!supprime) return res.status(404).send('Chapitre non trouvé');
    res.json({ message: 'Chapitre supprimé' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de la suppression');
  }
});

// PUT /ebook/chapitres/:id/lu -> marque un chapitre comme lu / non lu
// Body : { lu: true|false }  (défaut : true)
router.put('/ebook/chapitres/:id/lu', authenticateToken, async (req, res) => {
  const lu = req.body.lu === undefined ? true : req.body.lu;
  if (typeof lu !== 'boolean') return res.status(400).send('Le champ "lu" doit être un booléen');

  try {
    const chapitre = await nutritionService.getChapitreById(req.params.id, req.user.id);
    if (!chapitre) return res.status(404).send('Chapitre non trouvé');
    res.json(await nutritionService.marquerChapitreLu(req.user.id, req.params.id, lu));
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de la mise à jour de la progression');
  }
});

module.exports = router;
