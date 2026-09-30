const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Clé secrète pour signer les tokens (⚠️ mets une vraie clé forte en prod, via variable d'env)
const SECRET_KEY = process.env.JWT_SECRET || 'ma_cle_secrete';

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
      req.user = user; // { id, role, uniq }
      next();
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur (authentification)');
  }
}

module.exports = { authenticateToken, SECRET_KEY };
