// =========================================================
// MODULE 5 — Chat temps réel (Socket.io) : Utilisateur ↔ Coach/Support
// Authentification par JWT à la connexion, une "room" par utilisateur (user:<id>)
// =========================================================

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { SECRET_KEY } = require('../middleware/auth');
const chatService = require('../objets/chat');

// Diffuse un message déjà enregistré aux deux participants + la notification au destinataire
function diffuserMessage(io, conversation, resultat) {
  io.to(`user:${conversation.utilisateur_id}`)
    .to(`user:${conversation.coach_id}`)
    .emit('message:new', resultat.message);
  io.to(`user:${resultat.destinataireId}`).emit('notification:new', resultat.notification);
}

function initialiserSocket(httpServer) {
  const io = new Server(httpServer, { cors: { origin: '*' } });

  // Authentification : token dans handshake.auth.token ou en-tête Authorization: Bearer
  io.use(async (socket, next) => {
    try {
      const header = socket.handshake.headers.authorization;
      const token = socket.handshake.auth?.token || (header && header.split(' ')[1]);
      if (!token) return next(new Error('Token manquant'));

      const blackliste = await pool.query('SELECT 1 FROM tokens_blacklist WHERE token = $1', [token]);
      if (blackliste.rows.length > 0) return next(new Error('Token invalide (logout effectué)'));

      const { id, role } = jwt.verify(token, SECRET_KEY);
      socket.user = { id, role };
      socket.token = token; // utilisé par /logout pour couper la connexion
      next();
    } catch (err) {
      next(new Error('Token invalide ou expiré'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    socket.join(`user:${userId}`);

    // Envoi d'un message : { conversation_id, contenu } -> ack { ok, message } ou { ok: false, error }
    socket.on('message:send', async (payload, ack) => {
      const repondre = typeof ack === 'function' ? ack : () => {};
      try {
        const contenu = typeof payload?.contenu === 'string' ? payload.contenu.trim() : '';
        if (!contenu) return repondre({ ok: false, error: 'contenu est requis' });
        if (contenu.length > 2000) return repondre({ ok: false, error: 'Message trop long (max 2000 caractères)' });

        const conversation = await chatService.getConversationPourParticipant(payload.conversation_id, userId);
        if (!conversation) return repondre({ ok: false, error: 'Conversation non trouvée' });

        const resultat = await chatService.envoyerMessage(conversation, userId, contenu);
        diffuserMessage(io, conversation, resultat);
        repondre({ ok: true, message: resultat.message });
      } catch (err) {
        console.error(err);
        repondre({ ok: false, error: 'Erreur lors de l\'envoi du message' });
      }
    });

    // Marque les messages reçus comme lus : { conversation_id } -> ack { ok, messages_lus }
    socket.on('messages:read', async (payload, ack) => {
      const repondre = typeof ack === 'function' ? ack : () => {};
      try {
        const conversation = await chatService.getConversationPourParticipant(payload?.conversation_id, userId);
        if (!conversation) return repondre({ ok: false, error: 'Conversation non trouvée' });

        const ids = await chatService.marquerMessagesLus(conversation.id, userId);
        if (ids.length) {
          const autreId = conversation.utilisateur_id === userId ? conversation.coach_id : conversation.utilisateur_id;
          io.to(`user:${autreId}`).emit('messages:read', {
            conversation_id: conversation.id,
            lecteur_id: userId,
            ids,
          });
        }
        repondre({ ok: true, messages_lus: ids.length });
      } catch (err) {
        console.error(err);
        repondre({ ok: false, error: 'Erreur serveur' });
      }
    });

    socket.on('disconnect', () => {});
  });

  return io;
}

module.exports = { initialiserSocket, diffuserMessage };
