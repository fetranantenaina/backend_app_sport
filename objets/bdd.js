const bcrypt = require('bcrypt');
const pool = require('../config/db');

// Récupérer tous les utilisateurs
async function getAllUtilisateurs() {
  const result = await pool.query('SELECT id, role, name, email, created_at, updated_at FROM utilisateurs ORDER BY name');
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

// Modification d'un compte par l'administrateur (nom, email, nouveau mot de passe). Champs absents = inchangés.
async function modifierUtilisateur(id, { name, email, mdp }) {
  const champs = [];
  const valeurs = [];
  if (name) { valeurs.push(name); champs.push(`name = $${valeurs.length}`); }
  if (email) { valeurs.push(email); champs.push(`email = $${valeurs.length}`); }
  if (mdp) { valeurs.push(await bcrypt.hash(mdp, 10)); champs.push(`mdp = $${valeurs.length}`); }
  if (!champs.length) return getUtilisateurById(id);
  valeurs.push(id);
  const result = await pool.query(
    `UPDATE utilisateurs SET ${champs.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${valeurs.length}
     RETURNING id, role, name, email, created_at`,
    valeurs
  );
  return result.rows[0];
}

// Suppression définitive d'un compte par l'administrateur.
// Profil, relevés, séances, nutrition, e-book, conversations et notifications partent en cascade (ON DELETE CASCADE).
// Les messages envoyés n'ont pas de cascade sur expediteur_id : on les supprime dans la même requête
// (une seule instruction SQL = atomique, y compris en mode Neon HTTP qui n'a pas de transaction multi-requêtes).
async function supprimerUtilisateur(id) {
  const result = await pool.query(
    `WITH msg AS (DELETE FROM messages WHERE expediteur_id = $1)
     DELETE FROM utilisateurs WHERE id = $1 RETURNING id, role, name, email`,
    [id]
  );
  return result.rows[0];
}

module.exports = {
  modifierUtilisateur,
  supprimerUtilisateur,
  getAllUtilisateurs,
  getUtilisateurById,
  registerUtilisateur,
  loginUtilisateur,
};
