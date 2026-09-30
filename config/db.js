const { Pool } = require('pg');

// Pool de connexion PostgreSQL partagé par toute l'application
// (évite d'ouvrir une connexion différente dans chaque fichier)
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'sport',
  password: process.env.DB_PASSWORD || '1234',
  port: process.env.DB_PORT || 5433,
});

module.exports = pool;
