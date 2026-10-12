const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const bdd = require('./objets/bdd');
const pool = require('./config/db');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken, autoriserRoles, SECRET_KEY } = require('./middleware/auth');
const profilRoutes = require('./routes/profil.routes');
const entrainementRoutes = require('./routes/entrainement.routes');
const nutritionRoutes = require('./routes/nutrition.routes');
const glossaireRoutes = require('./routes/glossaire.routes');
const chatRoutes = require('./routes/chat.routes');
const { initialiserSocket } = require('./socket/chat.socket');


const app = express();
const port = 3000;

app.use(express.json());

// Module 1 — Informations personnelles (profil, mensurations, IMC, PAL...)
app.use(profilRoutes);

// Module 2 — Journal d'entraînement (séances, exercices, indicateurs athlétiques, vue anatomique)
app.use(entrainementRoutes);

// Module 3 — Nutrition + E-book (journal, recommandations, chapitres, progression)
app.use(nutritionRoutes);

// Module 4 — Glossaire (termes, recherche, fiches, liens croisés)
app.use(glossaireRoutes);

// Module 5 — Chat Utilisateur <-> Coach/Support (REST ; le temps réel passe par Socket.io plus bas)
app.use(chatRoutes);

// Route pour récupérer tous les utilisateurs (protégée)
app.get('/utilisateurs', authenticateToken, autoriserRoles('admin'), async (req, res) => {
  try {
    const utilisateurs = await bdd.getAllUtilisateurs();
    res.json(utilisateurs);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// Route pour récupérer un utilisateur par ID (protégée)
app.get('/utilisateur/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && String(req.user.id) !== req.params.id) return res.status(403).send('Accès non autorisé');
  try {
    const utilisateur = await bdd.getUtilisateurById(req.params.id);
    if (!utilisateur) {
      return res.status(404).send('Utilisateur non trouvé');
    }
    res.json(utilisateur);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// Route register
app.post('/register', authenticateToken, autoriserRoles('admin'), async (req, res) => {
  const { name, mdp, email } = req.body;
  const role = 'user'; // le rôle n'est jamais choisi par le client (admin/coach créés en base)
  if (!name || !mdp || !email) return res.status(400).send('name, mdp et email sont requis');
  try {
    const newUser = await bdd.registerUtilisateur(role, name, mdp, email);
    res.json(newUser);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de l’inscription');
  }
});

// Route login (génère un token JWT)
// Route login (génère un token JWT)
app.post('/login', async (req, res) => {
  const { name, mdp } = req.body;
  try {
    const user = await bdd.loginUtilisateur(name, mdp);
    if (!user) {
      return res.status(401).send('User ou mot de passe incorrect');
    }

    // Générer un token JWT unique valable 1h
    const token = jwt.sign(
      { id: user.id, role: user.role, uniq: uuidv4() }, // uniq garantit un token différent
      SECRET_KEY,
      { expiresIn: '1h' }
    );

    res.json({ message: 'Connexion réussie', token });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de la connexion');
  }
});


// Route logout (invalide le token côté serveur)
app.post('/logout', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    await pool.query('INSERT INTO tokens_blacklist (token) VALUES ($1)', [token]);
    // Coupe les connexions WebSocket ouvertes avec ce token
    io.sockets.sockets.forEach((sock) => { if (sock.token === token) sock.disconnect(true); });
    res.json({ message: 'Déconnecté avec succès, token invalidé' });
    console.log('Token invalidé:', token);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors du logout');
  }
});

// Serveur HTTP partagé entre Express et Socket.io (module 5)
const httpServer = http.createServer(app);
const io = initialiserSocket(httpServer);
app.set('io', io);

httpServer.listen(port, () => {
  console.log(`Serveur démarré sur http://localhost:${port}`);
});
