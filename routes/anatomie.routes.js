// =========================================================
// MODULE 2 bis — Routes : vue anatomique 3D et référentiel des muscles
// Lecture : tout utilisateur connecté (ses propres données ; l'admin peut cibler un client via X-Utilisateur-Id)
// Écriture du référentiel : admin uniquement
// =========================================================

const express = require('express');
const router = express.Router();
const { authenticateToken, autoriserRoles } = require('../middleware/auth');
const anatomie = require('../objets/anatomie');

// Erreurs de saisie -> 400, doublons -> 409, le reste -> 500
function gererErreur(res, err, message) {
  if (err instanceof anatomie.ErreurValidation) return res.status(400).send(err.message);
  if (err && err.code === '23505') return res.status(409).send('Cet élément existe déjà');
  console.error(err);
  res.status(500).send(message);
}

// GET /anatomie/vue?periode=7j|30j|90j|6m|1an|tout  ou  ?from=AAAA-MM-JJ&to=AAAA-MM-JJ
// -> { periode, muscles[], maximums, activites[], non_reconnus[] }
router.get('/anatomie/vue', authenticateToken, async (req, res) => {
  try {
    const { periode, from, to } = req.query;
    res.json(await anatomie.getVueAnatomique(req.user.id, { periode, from, to }));
  } catch (err) {
    gererErreur(res, err, 'Erreur serveur');
  }
});

// GET /anatomie/muscles -> référentiel complet (nom français, explication, objets 3D, intitulés liés)
router.get('/anatomie/muscles', authenticateToken, async (req, res) => {
  try {
    res.json(await anatomie.getMuscles());
  } catch (err) {
    gererErreur(res, err, 'Erreur serveur');
  }
});

// GET /anatomie/muscles/:code?periode= -> fiche muscle : explication, stats, 10 derniers exercices
router.get('/anatomie/muscles/:code', authenticateToken, async (req, res) => {
  try {
    const { periode, from, to } = req.query;
    const fiche = await anatomie.getFicheMuscle(req.user.id, req.params.code, { periode, from, to });
    if (!fiche) return res.status(404).send('Muscle non trouvé');
    res.json(fiche);
  } catch (err) {
    gererErreur(res, err, 'Erreur serveur');
  }
});

// GET /anatomie/libelles -> intitulés du journal et leurs muscles
router.get('/anatomie/libelles', authenticateToken, async (req, res) => {
  try {
    res.json(await anatomie.getLibelles());
  } catch (err) {
    gererErreur(res, err, 'Erreur serveur');
  }
});

// GET /anatomie/exercices/:id -> muscles travaillés par un exercice du référentiel (fiche d'exercice)
router.get('/anatomie/exercices/:id', authenticateToken, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).send('id invalide');
  try {
    const data = await anatomie.getMusclesExercice(req.params.id);
    if (!data) return res.status(404).send('Exercice non trouvé');
    res.json(data);
  } catch (err) {
    gererErreur(res, err, 'Erreur serveur');
  }
});

// GET /anatomie/cibles?texte=GLUTES, CORE -> muscles correspondant à une saisie libre (ligne de séance)
router.get('/anatomie/cibles', authenticateToken, async (req, res) => {
  try {
    res.json(await anatomie.analyserCibles(req.query.texte));
  } catch (err) {
    gererErreur(res, err, 'Erreur serveur');
  }
});

// ---------------- Écran admin : référentiel ----------------

// POST /anatomie/muscles  Body : { code, nom_fr, region, vue?, nom_latin?, description?, objets_3d?, ordre? }
router.post('/anatomie/muscles', authenticateToken, autoriserRoles('admin'), async (req, res) => {
  try {
    res.status(201).json(await anatomie.creerMuscle(req.body || {}));
  } catch (err) {
    gererErreur(res, err, 'Erreur lors de la création du muscle');
  }
});

// PUT /anatomie/muscles/:code  Body : champs à modifier
router.put('/anatomie/muscles/:code', authenticateToken, autoriserRoles('admin'), async (req, res) => {
  try {
    const muscle = await anatomie.modifierMuscle(req.params.code, req.body || {});
    if (!muscle) return res.status(404).send('Muscle non trouvé');
    res.json(muscle);
  } catch (err) {
    gererErreur(res, err, 'Erreur lors de la modification du muscle');
  }
});

// DELETE /anatomie/muscles/:code (ses correspondances sont retirées ; les intitulés restent)
router.delete('/anatomie/muscles/:code', authenticateToken, autoriserRoles('admin'), async (req, res) => {
  try {
    if (!(await anatomie.supprimerMuscle(req.params.code))) return res.status(404).send('Muscle non trouvé');
    res.json({ message: 'Muscle supprimé' });
  } catch (err) {
    gererErreur(res, err, 'Erreur lors de la suppression du muscle');
  }
});

// PUT /anatomie/libelles/:libelle  Body : { type:'muscle', nom_fr?, muscles:[{code, part?}] } | { type:'activite', activite, nom_fr? }
router.put('/anatomie/libelles/:libelle', authenticateToken, autoriserRoles('admin'), async (req, res) => {
  try {
    res.json(await anatomie.enregistrerLibelle(req.params.libelle, req.body || {}));
  } catch (err) {
    gererErreur(res, err, 'Erreur lors de l\'enregistrement de l\'intitulé');
  }
});

// DELETE /anatomie/libelles/:libelle
router.delete('/anatomie/libelles/:libelle', authenticateToken, autoriserRoles('admin'), async (req, res) => {
  try {
    if (!(await anatomie.supprimerLibelle(req.params.libelle))) return res.status(404).send('Intitulé non trouvé');
    res.json({ message: 'Intitulé supprimé' });
  } catch (err) {
    gererErreur(res, err, 'Erreur lors de la suppression de l\'intitulé');
  }
});

module.exports = router;
