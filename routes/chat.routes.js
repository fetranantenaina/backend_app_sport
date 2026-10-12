// =========================================================
// MODULE 5 — Routes REST : Chat (Utilisateur ↔ Coach/Support) + notifications
// Le temps réel passe par Socket.io (voir socket/chat.socket.js) ;
// ces routes servent à l'historique, à l'ouverture des conversations
// et de solution de repli si le WebSocket est indisponible.
// =========================================================

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const chatService = require('../objets/chat');
const { diffuserMessage } = require('../socket/chat.socket');

const estCoach = (role) => role === 'coach' || role === 'admin';

// ---------------------------------------------------------
// CONVERSATIONS
// ---------------------------------------------------------

// GET /coachs -> annuaire des coachs/support joignables
router.get('/coachs', authenticateToken, async (req, res) => {
  try {
    res.json(await chatService.getCoachs());
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// GET /conversations -> liste des conversations (dernier message + non lus)
router.get('/conversations', authenticateToken, async (req, res) => {
  try {
    res.json(await chatService.getConversations(req.user.id));
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// POST /conversations -> ouvre (ou récupère) une conversation
//  - un utilisateur envoie { coach_id }
//  - un coach/admin envoie { utilisateur_id }
router.post('/conversations', authenticateToken, async (req, res) => {
  try {
    let utilisateurId;
    let coachId;

    if (estCoach(req.user.role)) {
      utilisateurId = Number(req.body.utilisateur_id);
      coachId = req.user.id;
      if (!utilisateurId) return res.status(400).send('utilisateur_id est requis');
    } else {
      coachId = Number(req.body.coach_id);
      utilisateurId = req.user.id;
      if (!coachId) return res.status(400).send('coach_id est requis');
    }

    if (utilisateurId === coachId) return res.status(400).send('Conversation avec soi-même impossible');

    const interlocuteur = await chatService.getUtilisateurById(estCoach(req.user.role) ? utilisateurId : coachId);
    if (!interlocuteur) return res.status(404).send('Utilisateur non trouvé');
    if (!estCoach(req.user.role) && !estCoach(interlocuteur.role)) {
      return res.status(403).send('Vous ne pouvez écrire qu\'à un coach ou au support');
    }

    const conversation = await chatService.getOuCreerConversation(utilisateurId, coachId);
    res.status(201).json(conversation);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de l\'ouverture de la conversation');
  }
});

// ---------------------------------------------------------
// MESSAGES
// ---------------------------------------------------------

// GET /conversations/:id/messages?limit=50&avant=<id_message> -> historique paginé
router.get('/conversations/:id/messages', authenticateToken, async (req, res) => {
  try {
    const conversation = await chatService.getConversationPourParticipant(req.params.id, req.user.id);
    if (!conversation) return res.status(404).send('Conversation non trouvée');

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const avant = req.query.avant ? Number(req.query.avant) : undefined;
    res.json(await chatService.getMessages(conversation.id, { limit, avant }));
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// POST /conversations/:id/messages -> envoi par REST (repli) ; diffusé en temps réel aux participants
// Body : { contenu }
router.post('/conversations/:id/messages', authenticateToken, async (req, res) => {
  const contenu = typeof req.body.contenu === 'string' ? req.body.contenu.trim() : '';
  if (!contenu) return res.status(400).send('contenu est requis');
  if (contenu.length > 2000) return res.status(400).send('Message trop long (max 2000 caractères)');

  try {
    const conversation = await chatService.getConversationPourParticipant(req.params.id, req.user.id);
    if (!conversation) return res.status(404).send('Conversation non trouvée');

    const resultat = await chatService.envoyerMessage(conversation, req.user.id, contenu);
    const io = req.app.get('io');
    if (io) diffuserMessage(io, conversation, resultat);
    res.status(201).json(resultat.message);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur lors de l\'envoi du message');
  }
});

// PUT /conversations/:id/lu -> marque comme lus les messages reçus de la conversation
router.put('/conversations/:id/lu', authenticateToken, async (req, res) => {
  try {
    const conversation = await chatService.getConversationPourParticipant(req.params.id, req.user.id);
    if (!conversation) return res.status(404).send('Conversation non trouvée');

    const ids = await chatService.marquerMessagesLus(conversation.id, req.user.id);
    const io = req.app.get('io');
    if (io && ids.length) {
      const autreId = conversation.utilisateur_id === req.user.id ? conversation.coach_id : conversation.utilisateur_id;
      io.to(`user:${autreId}`).emit('messages:read', {
        conversation_id: conversation.id,
        lecteur_id: req.user.id,
        ids,
      });
    }
    res.json({ messages_lus: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// ---------------------------------------------------------
// NOTIFICATIONS (routes fixes déclarées avant /:id)
// ---------------------------------------------------------

// GET /notifications?non_lues=true&limit=50 -> liste des notifications
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    res.json(await chatService.getNotifications(req.user.id, {
      nonLuesSeulement: req.query.non_lues === 'true',
      limit: Math.min(Number(req.query.limit) || 50, 200),
    }));
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// GET /notifications/non-lues/count -> pastille du nombre de notifications non lues
router.get('/notifications/non-lues/count', authenticateToken, async (req, res) => {
  try {
    res.json({ non_lues: await chatService.compterNotificationsNonLues(req.user.id) });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// PUT /notifications/lu-tout -> marque toutes les notifications comme lues
router.put('/notifications/lu-tout', authenticateToken, async (req, res) => {
  try {
    res.json({ notifications_lues: await chatService.marquerToutesNotificationsLues(req.user.id) });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

// PUT /notifications/:id/lu -> marque une notification comme lue
router.put('/notifications/:id/lu', authenticateToken, async (req, res) => {
  try {
    const notification = await chatService.marquerNotificationLue(req.params.id, req.user.id);
    if (!notification) return res.status(404).send('Notification non trouvée');
    res.json(notification);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur serveur');
  }
});

module.exports = router;
