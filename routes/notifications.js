
const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Notification = require("../models/Notification");
const authMiddleware = require("../middleware/authMiddleware");

// Get all notifications for logged-in user
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly = false } = req.query;
    
    const query = { userId: req.user.id };
    if (unreadOnly === 'true') {
      query.read = false;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ 
      userId: req.user.id, 
      read: false 
    });

    res.json({
      success: true,
      notifications,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      },
      unreadCount
    });
  } catch (err) {
    console.error("Get notifications error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get unread notification count
router.get("/unread-count", authMiddleware, async (req, res) => {
  try {
    const count = await Notification.countDocuments({ 
      userId: req.user.id, 
      read: false 
    });

    res.json({
      success: true,
      unreadCount: count
    });
  } catch (err) {
    console.error("Get unread count error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Mark notification as read
router.put("/:notificationId/read", authMiddleware, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.notificationId, userId: req.user.id },
      { read: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    res.json({
      success: true,
      notification
    });
  } catch (err) {
    console.error("Mark as read error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Mark all notifications as read
router.put("/mark-all-read", authMiddleware, async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user.id, read: false },
      { read: true, readAt: new Date() }
    );

    res.json({
      success: true,
      message: "All notifications marked as read"
    });
  } catch (err) {
    console.error("Mark all as read error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Delete a notification
router.delete("/:notificationId", authMiddleware, async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.notificationId,
      userId: req.user.id
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    res.json({
      success: true,
      message: "Notification deleted"
    });
  } catch (err) {
    console.error("Delete notification error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get current notification preferences
router.get("/preferences", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('emailNotifications');
    
    res.json({
      success: true,
      emailNotifications: user.emailNotifications !== undefined ? user.emailNotifications : true
    });
  } catch (err) {
    console.error("Get notification preferences error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Toggle email notifications on/off
router.post("/email-toggle", authMiddleware, async (req, res) => {
  try {
    let { enabled } = req.body;

    // Convert string to boolean if needed
    if (typeof enabled === 'string') {
      enabled = enabled.toLowerCase() === 'true';
    }

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ 
        success: false, 
        message: "enabled must be true or false" 
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { emailNotifications: enabled },
      { new: true }
    ).select('emailNotifications email fullName');

    res.json({
      success: true,
      message: `Email notifications ${enabled ? 'enabled' : 'disabled'} successfully`,
      emailNotifications: user.emailNotifications
    });
  } catch (err) {
    console.error("Toggle email notifications error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
