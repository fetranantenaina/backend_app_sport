require('dotenv').config({ quiet: true }); // charge le fichier .env (DATABASE_URL, JWT_SECRET...)

let pool;

if (process.env.DATABASE_URL) {
  // Base déployée (Neon) : requêtes HTTPS sur le port 443.
  // Ça fonctionne même si le réseau bloque le port PostgreSQL 5432 (cas constaté ici).
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL, { fullResults: true });

  // Même interface que pg.Pool pour le reste du code : pool.query(texte, paramètres) -> { rows, rowCount }
  // (le mode HTTP n'a pas de session : pas de pool.connect(), les transactions se font en une seule requête SQL)
  pool = { query: (texte, parametres = []) => sql.query(texte, parametres) };
} else {
  // Sans DATABASE_URL : base PostgreSQL locale (variables DB_*)
  const { Pool } = require('pg');
  pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'sport',
    password: process.env.DB_PASSWORD || '1234',
    port: process.env.DB_PORT || 5433,
  });
  pool.on('error', (err) => console.error('Connexion PostgreSQL inactive fermée :', err.message));
}

module.exports = pool;
