
const express = require("express");
const { 
  aiBotAnswer, 
  createSupportTicket, 
  replyToTicket,
  listAllTickets,
  getTicketById,
  closeTicket,
  addPending 
} = require("../services/supportService");
const { adminAuth, checkPermission } = require('../middleware/adminAuth');
const router = express.Router();

// User creates support ticket
router.post("/chat", async (req, res) => {
  try {
    const { userEmail, message, subject } = req.body;

    // AI first
    const aiResponse = aiBotAnswer(message);
    if (aiResponse) {
      return res.json({ from: "bot", reply: aiResponse });
    }

    // Create support ticket
    const ticket = await createSupportTicket({
      userEmail,
      subject: subject || "Support Request",
      message
    });

    // Create in-app notification
    const { createNotification } = require('../utils/notificationHelper');
    const User = require('../models/User');
    const user = await User.findOne({ email: userEmail });
    
    if (user) {
      await createNotification({
        userId: user._id,
        type: 'system',
        title: 'Support Ticket Created',
        message: `Your support ticket #${ticket.ticketId} has been created. Queue position: ${ticket.queueNumber}`,
        data: {
          ticketId: ticket.ticketId,
          queueNumber: ticket.queueNumber
        }
      });
    }

    res.json({
      from: "system",
      reply: `Your query has been escalated to human support. Ticket #${ticket.ticketId}. Queue position: ${ticket.queueNumber}`,
      ticketId: ticket.ticketId,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user's tickets
router.get("/tickets/:email", async (req, res) => {
  try {
    const tickets = await listAllTickets({ userEmail: req.params.email });
    res.json({ success: true, tickets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get ticket details
router.get("/ticket/:ticketId", async (req, res) => {
  try {
    const ticket = await getTicketById(req.params.ticketId);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    res.json({ success: true, ticket });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get all tickets
router.get("/admin/tickets", adminAuth, checkPermission('view_support'), async (req, res) => {
  try {
    const { status } = req.query;
    const tickets = await listAllTickets({ status });
    res.json({ success: true, tickets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Reply to ticket
router.post("/admin/reply", adminAuth, checkPermission('manage_support'), async (req, res) => {
  try {
    const { ticketId, reply } = req.body;
    const ticket = await replyToTicket(ticketId, reply, req.admin.email);
    res.json({ success: true, ticket });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Close ticket
router.post("/admin/close/:ticketId", adminAuth, checkPermission('manage_support'), async (req, res) => {
  try {
    const ticket = await closeTicket(req.params.ticketId);
    res.json({ success: true, ticket });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
