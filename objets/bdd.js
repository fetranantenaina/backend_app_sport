const bcrypt = require('bcrypt');
const pool = require('../config/db');

// Récupérer tous les utilisateurs
async function getAllUtilisateurs() {
  const result = await pool.query('SELECT * FROM utilisateurs');
  return result.rows;
}

// Récupérer un utilisateur par ID
async function getUtilisateurById(id) {
  const result = await pool.query('SELECT * FROM utilisateurs WHERE id = $1', [id]);
  return result.rows[0];
}

// Inscription avec hashage
async function registerUtilisateur(role, name, mdp, email) {
  const hashedPassword = await bcrypt.hash(mdp, 10);
  const result = await pool.query(
    'INSERT INTO utilisateurs (role, name, mdp, email) VALUES ($1, $2, $3, $4) RETURNING *',
    [role, name, hashedPassword, email]
  );
  return result.rows[0];
}

// Connexion avec comparaison du hash
async function loginUtilisateur(name, mdp) {
  const result = await pool.query(
    'SELECT * FROM utilisateurs WHERE name = $1 AND mdp = $2',
    [name, mdp]
  );
  return result.rows[0];
}


module.exports = {
  getAllUtilisateurs,
  getUtilisateurById,
  registerUtilisateur,
  loginUtilisateur,
};
