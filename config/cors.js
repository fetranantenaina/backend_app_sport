// Origines autorisées à appeler l'API depuis un navigateur (le site front quand il est hébergé ailleurs).
// CORS_ORIGIN = une ou plusieurs adresses séparées par des virgules, ex. https://coach-john-front.onrender.com
// Vide : même origine uniquement (cas du proxy de développement).
const origines = (process.env.CORS_ORIGIN || '').split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
module.exports = { origines };
