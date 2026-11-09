require('dotenv').config({ quiet: true });
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
const alimentsRoutes = require('./routes/aliments.routes');
const chatRoutes = require('./routes/chat.routes');
const { initialiserSocket } = require('./socket/chat.socket');


const app = express();
const port = process.env.PORT || 3000; // l'hébergeur impose le port via PORT

// En production, une clé de signature des connexions est obligatoire
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('JWT_SECRET manquant : définis cette variable d\'environnement.');
  process.exit(1);
}

app.use(express.json());

// Toute l'API vit sous /api (le front Angular appelle /api/...)
const api = express.Router();

// Module 1 — Informations personnelles (profil, mensurations, IMC, PAL...)
api.use(profilRoutes);

// Module 2 — Journal d'entraînement (séances, exercices, indicateurs athlétiques, vue anatomique)
api.use(entrainementRoutes);

// Module 3 — Nutrition + E-book (journal, recommandations, chapitres, progression)
api.use(nutritionRoutes);
api.use(alimentsRoutes); // guide alimentaire

// Module 4 — Glossaire (termes, recherche, fiches, liens croisés)
api.use(glossaireRoutes);

// Module 5 — Chat Utilisateur <-> Coach/Support (REST ; le temps réel passe par Socket.io plus bas)
api.use(chatRoutes);

// Route pour récupérer tous les utilisateurs (protégée)
api.get('/utilisateurs', authenticateToken, autoriserRoles('admin'), async (req, res) => {
  try {
    const utilisateurs = await bdd.getAllUtilisateurs();
    res.json(utilisateurs);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// Route pour récupérer un utilisateur par ID (protégée)
api.get('/utilisateur/:id', authenticateToken, async (req, res) => {
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
api.post('/register', authenticateToken, autoriserRoles('admin'), async (req, res) => {
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
api.post('/login', async (req, res) => {
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
api.post('/logout', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    await pool.query('INSERT INTO tokens_blacklist (token) VALUES ($1)', [token]);
    // Coupe les connexions WebSocket ouvertes avec ce token
    io.sockets.sockets.forEach((sock) => { if (sock.token === token) sock.disconnect(true); });
    res.json({ message: 'Déconnecté avec succès, token invalidé' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors du logout');
  }
});

app.use('/api', api);

// Frontend Angular compilé (npm run build dans /frontend) servi par le même serveur : un seul service, un seul HTTPS
const path = require('path');
const fs = require('fs');
const dossierFront = path.join(__dirname, '..', 'frontend', 'dist', 'coach-john', 'browser');
if (fs.existsSync(dossierFront)) {
  app.use(express.static(dossierFront, {
    setHeaders: (res, fichier) => {
      // fichiers à empreinte (main-XXXX.js...) : cache long ; index.html et sw.js : toujours à jour
      if (/\.(js|css)$/.test(fichier) && !fichier.endsWith('sw.js')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  }));
  // Les pages de l'app (/profil, /chat...) renvoient index.html ; l'API et le WebSocket ne sont pas concernés
  app.use((req, res, next) => {
    if (req.method !== 'GET' || /^\/(api|socket\.io)(\/|$)/.test(req.path)) return next();
    res.sendFile(path.join(dossierFront, 'index.html'));
  });
}

// Serveur HTTP partagé entre Express et Socket.io (module 5)
const httpServer = http.createServer(app);
const io = initialiserSocket(httpServer);
app.set('io', io);

httpServer.listen(port, () => {
  console.log(`Serveur démarré sur le port ${port} : http://localhost:${port}`);
});

// Vérifie la connexion à la base au démarrage (ne bloque pas le serveur)
pool.query('SELECT current_database() AS base, (SELECT COUNT(*) FROM utilisateurs) AS comptes')
  .then((r) => console.log(`Base de données connectée : ${r.rows[0].base} (${r.rows[0].comptes} comptes)`))
  .catch((err) => console.error(`⚠️  Base de données injoignable ou vide : ${err.message}`));
