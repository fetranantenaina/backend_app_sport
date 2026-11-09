// =========================================================
// MODULE 4 — Routes : Glossaire
// Consultable par tout utilisateur connecté ; gestion réservée admin/coach
// =========================================================

const express = require('express');
const router = express.Router();
const { authenticateToken, autoriserRoles } = require('../middleware/auth');
const glossaireService = require('../objets/glossaire');

const adminOuCoach = autoriserRoles('admin', 'coach');

// GET /glossaire?q=&categorie=&limit= -> recherche / liste des termes
router.get('/glossaire', authenticateToken, async (req, res) => {
  try {
    const { q, categorie, limit } = req.query;
    const termes = await glossaireService.rechercherTermes({
      q,
      categorie,
      limit: limit ? Number(limit) : undefined,
    });
    res.json(termes);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// GET /glossaire/categories -> catégories disponibles (déclaré avant /:id)
router.get('/glossaire/categories', authenticateToken, async (req, res) => {
  try {
    res.json(await glossaireService.getCategories());
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// GET /glossaire/:id -> fiche détaillée avec termes liés (liens croisés)
router.get('/glossaire/:id', authenticateToken, async (req, res) => {
  try {
    const fiche = await glossaireService.getFiche(req.params.id);
    if (!fiche) return res.status(404).send('Terme non trouvé');
    res.json(fiche);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// POST /glossaire -> ajoute un terme (admin/coach)
// Body : { terme, definition, categorie? }
router.post('/glossaire', authenticateToken, adminOuCoach, async (req, res) => {
  const { terme, definition } = req.body;
  if (!terme || !definition) return res.status(400).send('terme et definition sont requis');

  try {
    res.status(201).json(await glossaireService.creerTerme(req.body));
  } catch (err) {
    if (err.code === '23505') return res.status(409).send('Ce terme existe déjà');
    console.error(err);
    res.status(500).send('Erreur lors de la création du terme');
  }
});

// PUT /glossaire/:id -> modifie un terme (admin/coach)
router.put('/glossaire/:id', authenticateToken, adminOuCoach, async (req, res) => {
  try {
    const terme = await glossaireService.updateTerme(req.params.id, req.body);
    if (!terme) return res.status(404).send('Terme non trouvé');
    res.json(terme);
  } catch (err) {
    if (err.code === '23505') return res.status(409).send('Ce terme existe déjà');
    console.error(err);
    res.status(500).send('Erreur lors de la mise à jour');
  }
});

// DELETE /glossaire/:id -> supprime un terme et ses liens (admin/coach)
router.delete('/glossaire/:id', authenticateToken, adminOuCoach, async (req, res) => {
  try {
    const supprime = await glossaireService.supprimerTerme(req.params.id);
    if (!supprime) return res.status(404).send('Terme non trouvé');
    res.json({ message: 'Terme supprimé' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de la suppression');
  }
});

// POST /glossaire/:id/liens -> relie ce terme à un autre (admin/coach)
// Body : { terme_lie_id }
router.post('/glossaire/:id/liens', authenticateToken, adminOuCoach, async (req, res) => {
  const termeId = Number(req.params.id);
  const termeLieId = Number(req.body.terme_lie_id);

  if (!termeLieId) return res.status(400).send('terme_lie_id est requis');
  if (termeId === termeLieId) return res.status(400).send('Un terme ne peut pas être lié à lui-même');

  try {
    const lien = await glossaireService.ajouterLien(termeId, termeLieId);
    if (!lien) return res.status(409).send('Ce lien existe déjà');
    res.status(201).json(lien);
  } catch (err) {
    if (err.code === '23503') return res.status(404).send('Terme non trouvé');
    console.error(err);
    res.status(500).send('Erreur lors de la création du lien');
  }
});

// DELETE /glossaire/:id/liens/:termeLieId -> supprime un lien (admin/coach)
router.delete('/glossaire/:id/liens/:termeLieId', authenticateToken, adminOuCoach, async (req, res) => {
  try {
    const supprime = await glossaireService.supprimerLien(req.params.id, req.params.termeLieId);
    if (!supprime) return res.status(404).send('Lien non trouvé');
    res.json({ message: 'Lien supprimé' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de la suppression du lien');
  }
});

module.exports = router;
