
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const { 
  listAllTickets, 
  getTicketById, 
  replyToTicket, 
  closeTicket 
} = require('../services/supportService');

// Customer Support Authentication Middleware
const customerSupportAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json({ message: 'Authorization header missing' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Token missing' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.id);

    if (!admin || !admin.isActive) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Only allow customer_support, support_admin, or super_admin roles
    if (!['customer_support', 'support_admin', 'super_admin'].includes(admin.role)) {
      return res.status(403).json({ message: 'Insufficient permissions for support access' });
    }

    req.admin = admin;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};

// Customer Support Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Only allow customer_support role to login here
    if (admin.role !== 'customer_support') {
      return res.status(403).json({ message: 'This login is for customer support only. Please use admin login.' });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!admin.isActive) {
      return res.status(403).json({ message: 'Account suspended' });
    }

    admin.lastLogin = new Date();
    await admin.save();

    const token = jwt.sign(
      { id: admin._id, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      success: true,
      token,
      support: {
        id: admin._id,
        email: admin.email,
        fullName: admin.fullName,
        role: admin.role
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all support tickets
router.get('/tickets', customerSupportAuth, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (status) query.status = status;

    const tickets = await listAllTickets(query);

    res.json({
      success: true,
      total: tickets.length,
      tickets
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get ticket details
router.get('/ticket/:ticketId', customerSupportAuth, async (req, res) => {
  try {
    const ticket = await getTicketById(req.params.ticketId);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    res.json({
      success: true,
      ticket
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Reply to ticket
router.post('/reply', customerSupportAuth, async (req, res) => {
  try {
    const { ticketId, reply } = req.body;
    
    if (!ticketId || !reply) {
      return res.status(400).json({ message: 'Ticket ID and reply are required' });
    }

    const ticket = await replyToTicket(ticketId, reply, req.admin.email);
    
    res.json({
      success: true,
      message: 'Reply sent successfully',
      ticket
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Close ticket
router.post('/close/:ticketId', customerSupportAuth, async (req, res) => {
  try {
    const ticket = await closeTicket(req.params.ticketId);
    
    res.json({
      success: true,
      message: 'Ticket closed successfully',
      ticket
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get support agent stats
router.get('/stats', customerSupportAuth, async (req, res) => {
  try {
    const SupportTicket = require('../models/SupportTicket');
    
    const totalTickets = await SupportTicket.countDocuments({});
    const openTickets = await SupportTicket.countDocuments({ status: 'open' });
    const closedTickets = await SupportTicket.countDocuments({ status: 'closed' });
    
    // Get tickets handled by this agent
    const myTickets = await SupportTicket.countDocuments({
      'messages.adminEmail': req.admin.email
    });

    res.json({
      success: true,
      stats: {
        total: totalTickets,
        open: openTickets,
        closed: closedTickets,
        handledByMe: myTickets
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
