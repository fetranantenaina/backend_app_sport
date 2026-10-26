// =========================================================
// MODULE 5 — Messagerie en temps réel (Socket.io)
//
// Connexion côté client (Angular) :
//   io('http://localhost:3000', { auth: { token: '<JWT>' } })
//
// Événements client -> serveur :
//   'message:send'   { conversation_id, contenu }   (ack: { ok, message | erreur })
//   'messages:read'  { conversation_id }            (ack: { ok, ids | erreur })
//   'typing'         { conversation_id, en_cours }
//
// Événements serveur -> client :
//   'message:new'       message reçu ou envoyé (aux deux participants)
//   'notification:new'  notification de nouveau message (au destinataire)
//   'messages:read'     { conversation_id, lecteur_id, ids } (à l'expéditeur)
//   'typing'            { conversation_id, utilisateur_id, en_cours }
// =========================================================

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { SECRET_KEY } = require('../middleware/auth');
const chatService = require('../objets/chat');

const MAX_LONGUEUR_MESSAGE = 2000;

// Chaque utilisateur rejoint sa propre "room" : on peut ainsi lui écrire
// sur tous ses appareils/onglets connectés
const room = (userId) => `user:${userId}`;

// Diffuse un message déjà enregistré + la notification associée
// (utilisé par la voie WebSocket et par la voie REST)
function diffuserMessage(io, conversation, { message, destinataireId, notification }) {
  io.to(room(conversation.utilisateur_id))
    .to(room(conversation.coach_id))
    .emit('message:new', message);
  io.to(room(destinataireId)).emit('notification:new', notification);
}

function initialiserSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: process.env.CORS_ORIGIN ? { origin: process.env.CORS_ORIGIN } : undefined, // même origine par défaut (front servi par ce serveur)
  });

  // Authentification de la connexion : JWT valide et non blacklisté
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next(new Error('Token manquant'));

      const blackliste = await pool.query('SELECT 1 FROM tokens_blacklist WHERE token = $1', [token]);
      if (blackliste.rows.length > 0) return next(new Error('Token invalide (logout effectué)'));

      socket.user = jwt.verify(token, SECRET_KEY); // { id, role, ... }
      socket.token = token;
      next();
    } catch (err) {
      next(new Error('Token invalide'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    socket.join(room(userId));

    // --- Envoi d'un message ---
    socket.on('message:send', async (payload, ack) => {
      const repondre = typeof ack === 'function' ? ack : () => {};
      try {
        const { conversation_id } = payload || {};
        const contenu = payload && typeof payload.contenu === 'string' ? payload.contenu.trim() : '';

        if (!conversation_id || !contenu) return repondre({ ok: false, erreur: 'conversation_id et contenu requis' });
        if (contenu.length > MAX_LONGUEUR_MESSAGE) {
          return repondre({ ok: false, erreur: `Message trop long (max ${MAX_LONGUEUR_MESSAGE} caractères)` });
        }

        const conversation = await chatService.getConversationPourParticipant(conversation_id, userId);
        if (!conversation) return repondre({ ok: false, erreur: 'Conversation introuvable' });

        const resultat = await chatService.envoyerMessage(conversation, userId, contenu);
        diffuserMessage(io, conversation, resultat);
        repondre({ ok: true, message: resultat.message });
      } catch (err) {
        console.error(err);
        repondre({ ok: false, erreur: 'Erreur serveur' });
      }
    });

    // --- Accusé de lecture ---
    socket.on('messages:read', async (payload, ack) => {
      const repondre = typeof ack === 'function' ? ack : () => {};
      try {
        const conversationId = payload && payload.conversation_id;
        const conversation = await chatService.getConversationPourParticipant(conversationId, userId);
        if (!conversation) return repondre({ ok: false, erreur: 'Conversation introuvable' });

        const ids = await chatService.marquerMessagesLus(conversation.id, userId);
        const autreId = conversation.utilisateur_id === userId ? conversation.coach_id : conversation.utilisateur_id;
        if (ids.length) {
          io.to(room(autreId)).emit('messages:read', {
            conversation_id: conversation.id,
            lecteur_id: userId,
            ids,
          });
        }
        repondre({ ok: true, ids });
      } catch (err) {
        console.error(err);
        repondre({ ok: false, erreur: 'Erreur serveur' });
      }
    });

    // --- Indicateur "est en train d'écrire" (non stocké) ---
    socket.on('typing', async (payload) => {
      try {
        const conversation = await chatService.getConversationPourParticipant(payload && payload.conversation_id, userId);
        if (!conversation) return;
        const autreId = conversation.utilisateur_id === userId ? conversation.coach_id : conversation.utilisateur_id;
        io.to(room(autreId)).emit('typing', {
          conversation_id: conversation.id,
          utilisateur_id: userId,
          en_cours: Boolean(payload.en_cours),
        });
      } catch (err) {
        console.error(err);
      }
    });
  });

  return io;
}

module.exports = { initialiserSocket, diffuserMessage };
