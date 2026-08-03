const { v4: uuidv4 } = require("uuid");
const Ticket = require("../models/SupportTicket");

// Store pending replies in memory (or use Redis in production)
const pendingReplies = new Map();

function aiBotAnswer(question) {
  const q = question.toLowerCase();
  if (q.includes("reset password")) return "You can reset your password in Profile > Security.";
  if (q.includes("deposit")) return "You can deposit using blockchain wallets or bank transfer.";
  if (q.includes("withdraw")) return "Withdrawals are processed in 5–30 minutes.";
  if (q.includes("kyc")) return "KYC verification usually takes 24-48 hours. Check your email for updates.";
  if (q.includes("fee")) return "Transaction fees vary by payment method. Check our fee schedule in the app.";
  return null;
}

async function createSupportTicket({ userEmail, subject, message }) {
  const ticketId = uuidv4().slice(0, 8);

  const ticket = new Ticket({
    ticketId,
    userEmail,
    subject,
    messages: [{
      from: 'user',
      message,
      timestamp: new Date()
    }],
    status: 'open',
    queueNumber: await getQueuePosition()
  });

  await ticket.save();
  return ticket;
}

async function getQueuePosition() {
  const openTickets = await Ticket.countDocuments({ status: 'open' });
  return openTickets + 1;
}

async function replyToTicket(ticketId, reply, adminEmail) {
  const ticket = await Ticket.findOne({ ticketId });
  if (!ticket) throw new Error('Ticket not found');

  ticket.messages.push({
    from: 'admin',
    message: reply,
    timestamp: new Date(),
    adminEmail
  });

  ticket.lastReplyAt = new Date();
  await ticket.save();

  // Notify user via WebSocket if connected
  resolvePending(ticketId, reply);

  return ticket;
}

async function listAllTickets(filters = {}) {
  const query = {};
  if (filters.status) query.status = filters.status;
  if (filters.userEmail) query.userEmail = filters.userEmail;

  return await Ticket.find(query)
    .sort({ createdAt: -1 })
    .limit(50);
}

async function getTicketById(ticketId) {
  return await Ticket.findOne({ ticketId });
}

async function closeTicket(ticketId) {
  const ticket = await Ticket.findOne({ ticketId });
  if (!ticket) throw new Error('Ticket not found');

  ticket.status = 'closed';
  ticket.closedAt = new Date();
  await ticket.save();

  return ticket;
}

function addPending(ticketId, userEmail, ws) {
  pendingReplies.set(ticketId, { userEmail, ws, createdAt: Date.now() });
}

function resolvePending(ticketId, reply) {
  const entry = pendingReplies.get(ticketId);
  if (entry && entry.ws.readyState === 1) {
    entry.ws.send(JSON.stringify({ from: "support", reply }));
    pendingReplies.delete(ticketId);
  }
}

// Auto-clear pending after 24h
setInterval(() => {
  const now = Date.now();
  for (const [ticketId, entry] of pendingReplies.entries()) {
    if (now - entry.createdAt > 24 * 60 * 60 * 1000) {
      pendingReplies.delete(ticketId);
    }
  }
}, 60 * 60 * 1000);

module.exports = {
  aiBotAnswer,
  createSupportTicket,
  replyToTicket,
  listAllTickets,
  getTicketById,
  closeTicket,
  addPending,
  resolvePending,
};