const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Clé secrète pour signer les tokens (⚠️ mets une vraie clé forte en prod, via variable d'env)
const SECRET_KEY = process.env.JWT_SECRET || 'ma_cle_secrete';

// Seul l'admin peut modifier des données. Les autres rôles (user, coach) sont en lecture seule,
// sauf pour le chat/notifications et le marquage "chapitre lu" de l'e-book.
const METHODES_LECTURE = ['GET', 'HEAD', 'OPTIONS'];
const ECRITURES_AUTORISEES = [/^\/(conversations|notifications)(\/|$)/, /^\/ebook\/chapitres\/\d+\/lu$/];

// Middleware : vérifie la présence, la validité et la non-révocation (blacklist) du token JWT
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // format "Bearer <token>"
  if (!token) return res.sendStatus(401);

  try {
    // Vérifier si le token a été invalidé (logout)
    const blackliste = await pool.query(
      'SELECT 1 FROM tokens_blacklist WHERE token = $1',
      [token]
    );
    if (blackliste.rows.length > 0) {
      return res.status(403).send('Token invalide (logout effectué)');
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
      if (err) return res.sendStatus(403); // token invalide / expiré

      if (user.role !== 'admin') {
        const ecriture = !METHODES_LECTURE.includes(req.method);
        if (ecriture && !ECRITURES_AUTORISEES.some((re) => re.test(req.path))) {
          return res.status(403).send('Lecture seule : seul l\'administrateur peut modifier les données');
        }
      } else if (req.headers['x-utilisateur-id']) {
        // L'admin agit au nom d'un client : les données ciblées sont celles de ce client
        const cible = Number(req.headers['x-utilisateur-id']);
        if (Number.isInteger(cible) && cible > 0) user = { ...user, id: cible, adminId: user.id };
      }

      req.user = user; // { id, role, uniq }
      next();
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur (authentification)');
  }
}

// Middleware : restreint l'accès à certains rôles (ex: autoriserRoles('admin', 'coach'))
function autoriserRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).send('Accès non autorisé pour votre rôle');
    }
    next();
  };
}

module.exports = { authenticateToken, autoriserRoles, SECRET_KEY };
