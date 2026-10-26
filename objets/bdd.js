const bcrypt = require('bcrypt');
const pool = require('../config/db');

// Récupérer tous les utilisateurs
async function getAllUtilisateurs() {
  const result = await pool.query('SELECT id, role, name, email, created_at FROM utilisateurs ORDER BY name');
  return result.rows;
}

// Récupérer un utilisateur par ID
async function getUtilisateurById(id) {
  const result = await pool.query('SELECT id, role, name, email, created_at FROM utilisateurs WHERE id = $1', [id]);
  return result.rows[0];
}

// Inscription avec hashage
async function registerUtilisateur(role, name, mdp, email) {
  const hashedPassword = await bcrypt.hash(mdp, 10);
  const result = await pool.query(
    'INSERT INTO utilisateurs (role, name, mdp, email) VALUES ($1, $2, $3, $4) RETURNING id, role, name, email, created_at',
    [role, name, hashedPassword, email]
  );
  return result.rows[0];
}

// Connexion avec comparaison du hash
async function loginUtilisateur(name, mdp) {
  const result = await pool.query('SELECT * FROM utilisateurs WHERE name = $1', [name]);
  const user = result.rows[0];
  if (!user || typeof mdp !== 'string') return undefined;

  const estHache = /^\$2[aby]\$/.test(user.mdp);
  // Comptes créés par /register : hash bcrypt. Comptes de démo de script.sql : mot de passe en clair (hérité).
  const valide = estHache ? await bcrypt.compare(mdp, user.mdp) : user.mdp === mdp;
  if (!valide) return undefined;

  // Migration transparente : un mot de passe en clair est re-haché à la première connexion réussie
  if (!estHache) {
    await pool.query('UPDATE utilisateurs SET mdp = $1 WHERE id = $2', [await bcrypt.hash(mdp, 10), user.id]);
  }
  return user;
}

module.exports = {
  getAllUtilisateurs,
  getUtilisateurById,
  registerUtilisateur,
  loginUtilisateur,
};
