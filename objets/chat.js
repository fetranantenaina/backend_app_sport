// =========================================================
// MODULE 5 — Système de chat (Utilisateur ↔ Coach/Support)
// Couche d'accès aux données :
//   - Conversations 1-à-1
//   - Historique et stockage des messages
//   - Notifications de nouveaux messages
// =========================================================

const pool = require('../config/db');

// ---------------------------------------------------------
// Conversations
// ---------------------------------------------------------

// Annuaire des coachs/support auxquels un utilisateur peut écrire
async function getCoachs() {
  const result = await pool.query(
    "SELECT id, name, role FROM utilisateurs WHERE role IN ('coach', 'admin') ORDER BY name"
  );
  return result.rows;
}

async function getUtilisateurById(id) {
  const result = await pool.query('SELECT id, name, role FROM utilisateurs WHERE id = $1', [id]);
  return result.rows[0] || null;
}

// Récupère la conversation entre un utilisateur et un coach, ou la crée si elle n'existe pas
async function getOuCreerConversation(utilisateurId, coachId) {
  const result = await pool.query(
    `INSERT INTO conversations (utilisateur_id, coach_id)
     VALUES ($1, $2)
     ON CONFLICT (utilisateur_id, coach_id) DO UPDATE SET utilisateur_id = EXCLUDED.utilisateur_id
     RETURNING *`,
    [utilisateurId, coachId]
  );
  return result.rows[0];
}

// Retourne la conversation si l'utilisateur en est un des deux participants, sinon null
async function getConversationPourParticipant(conversationId, userId) {
  const result = await pool.query(
    `SELECT * FROM conversations
     WHERE id = $1 AND (utilisateur_id = $2 OR coach_id = $2)`,
    [conversationId, userId]
  );
  return result.rows[0] || null;
}

// Liste des conversations d'un participant : interlocuteur, dernier message, messages non lus
async function getConversations(userId) {
  const result = await pool.query(
    `SELECT c.id, c.utilisateur_id, c.coach_id, c.created_at,
            u.id AS interlocuteur_id, u.name AS interlocuteur_nom, u.role AS interlocuteur_role,
            lm.contenu AS dernier_message, lm.envoye_at AS dernier_message_at,
            lm.expediteur_id AS dernier_expediteur_id,
            (SELECT COUNT(*) FROM messages m
              WHERE m.conversation_id = c.id AND m.lu = FALSE AND m.expediteur_id <> $1) AS non_lus
     FROM conversations c
     JOIN utilisateurs u ON u.id = CASE WHEN c.utilisateur_id = $1 THEN c.coach_id ELSE c.utilisateur_id END
     LEFT JOIN LATERAL (
       SELECT contenu, envoye_at, expediteur_id FROM messages
       WHERE conversation_id = c.id ORDER BY envoye_at DESC, id DESC LIMIT 1
     ) lm ON TRUE
     WHERE c.utilisateur_id = $1 OR c.coach_id = $1
     ORDER BY COALESCE(lm.envoye_at, c.created_at) DESC`,
    [userId]
  );
  return result.rows.map((r) => ({ ...r, non_lus: Number(r.non_lus) }));
}

// ---------------------------------------------------------
// Messages (historique + stockage)
// ---------------------------------------------------------

// Enregistre un message envoyé dans une conversation
async function enregistrerMessage(conversationId, expediteurId, contenu) {
  const result = await pool.query(
    `INSERT INTO messages (conversation_id, expediteur_id, contenu)
     VALUES ($1, $2, $3) RETURNING *`,
    [conversationId, expediteurId, contenu]
  );
  return result.rows[0];
}

// Historique paginé : du plus ancien au plus récent parmi les `limit` derniers messages.
// `avant` (id de message) permet de charger la page précédente.
async function getMessages(conversationId, { limit = 50, avant } = {}) {
  const params = [conversationId, limit];
  let condition = '';
  if (avant) {
    params.push(avant);
    condition = `AND id < $${params.length}`;
  }
  const result = await pool.query(
    `SELECT * FROM (
       SELECT * FROM messages
       WHERE conversation_id = $1 ${condition}
       ORDER BY envoye_at DESC, id DESC
       LIMIT $2
     ) t ORDER BY envoye_at ASC, id ASC`,
    params
  );
  return result.rows;
}

// Marque comme lus tous les messages reçus (envoyés par l'autre participant)
async function marquerMessagesLus(conversationId, lecteurId) {
  const result = await pool.query(
    `UPDATE messages SET lu = TRUE
     WHERE conversation_id = $1 AND expediteur_id <> $2 AND lu = FALSE
     RETURNING id`,
    [conversationId, lecteurId]
  );
  return result.rows.map((r) => r.id);
}

// ---------------------------------------------------------
// Notifications
// ---------------------------------------------------------

async function creerNotification(utilisateurId, { type = 'message', contenu, reference_id = null }) {
  const result = await pool.query(
    `INSERT INTO notifications (utilisateur_id, type, contenu, reference_id)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [utilisateurId, type, contenu, reference_id]
  );
  return result.rows[0];
}

async function getNotifications(utilisateurId, { nonLuesSeulement = false, limit = 50 } = {}) {
  const result = await pool.query(
    `SELECT * FROM notifications
     WHERE utilisateur_id = $1 ${nonLuesSeulement ? 'AND lu = FALSE' : ''}
     ORDER BY created_at DESC, id DESC
     LIMIT $2`,
    [utilisateurId, limit]
  );
  return result.rows;
}

async function compterNotificationsNonLues(utilisateurId) {
  const result = await pool.query(
    'SELECT COUNT(*) AS n FROM notifications WHERE utilisateur_id = $1 AND lu = FALSE',
    [utilisateurId]
  );
  return Number(result.rows[0].n);
}

async function marquerNotificationLue(id, utilisateurId) {
  const result = await pool.query(
    'UPDATE notifications SET lu = TRUE WHERE id = $1 AND utilisateur_id = $2 RETURNING *',
    [id, utilisateurId]
  );
  return result.rows[0] || null;
}

async function marquerToutesNotificationsLues(utilisateurId) {
  const result = await pool.query(
    'UPDATE notifications SET lu = TRUE WHERE utilisateur_id = $1 AND lu = FALSE',
    [utilisateurId]
  );
  return result.rowCount;
}

// ---------------------------------------------------------
// Envoi complet d'un message : stockage + notification du destinataire
// (partagé entre la voie WebSocket et la voie REST)
// ---------------------------------------------------------
async function envoyerMessage(conversation, expediteurId, contenu) {
  const message = await enregistrerMessage(conversation.id, expediteurId, contenu);
  const destinataireId =
    conversation.utilisateur_id === expediteurId ? conversation.coach_id : conversation.utilisateur_id;

  const expediteur = await getUtilisateurById(expediteurId);
  const apercu = contenu.length > 80 ? `${contenu.slice(0, 80)}…` : contenu;
  const notification = await creerNotification(destinataireId, {
    type: 'message',
    contenu: `Nouveau message de ${expediteur ? expediteur.name : 'un utilisateur'} : ${apercu}`,
    reference_id: message.id,
  });

  return { message, destinataireId, notification };
}

module.exports = {
  getCoachs,
  getUtilisateurById,
  getOuCreerConversation,
  getConversationPourParticipant,
  getConversations,
  enregistrerMessage,
  getMessages,
  marquerMessagesLus,
  creerNotification,
  getNotifications,
  compterNotificationsNonLues,
  marquerNotificationLue,
  marquerToutesNotificationsLues,
  envoyerMessage,
};
