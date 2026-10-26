// =========================================================
// MODULE 3 — Routes : guide alimentaire
// Lecture pour tout utilisateur connecté ; modification réservée à l'admin
// =========================================================

const express = require('express');
const router = express.Router();
const { authenticateToken, autoriserRoles } = require('../middleware/auth');
const alimentsService = require('../objets/aliments');

// GET /aliments -> catégories + aliments (protéines / glucides / lipides pour 100 g)
router.get('/aliments', authenticateToken, async (req, res) => {
  try {
    res.json(await alimentsService.getGuide());
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// POST /aliments -> ajoute un aliment (admin). Body : { categorie, nom, proteines_g?, glucides_g?, lipides_g? }
router.post('/aliments', authenticateToken, autoriserRoles('admin'), async (req, res) => {
  const { categorie, nom } = req.body;
  if (!categorie || !nom) return res.status(400).send('categorie et nom sont requis');
  try {
    res.status(201).json(await alimentsService.ajouterAliment(req.body));
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de l\'ajout de l\'aliment');
  }
});

// DELETE /aliments/:id -> supprime un aliment (admin)
router.delete('/aliments/:id', authenticateToken, autoriserRoles('admin'), async (req, res) => {
  try {
    const supprime = await alimentsService.supprimerAliment(req.params.id);
    if (!supprime) return res.status(404).send('Aliment non trouvé');
    res.json({ message: 'Aliment supprimé' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de la suppression');
  }
});

module.exports = router;
