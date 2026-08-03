
const Notification = require('../models/Notification');

/**
 * Create an in-app notification
 * @param {Object} options - Notification options
 * @param {String} options.userId - User ID
 * @param {String} options.type - Notification type (transaction, money_request, security, system, crypto)
 * @param {String} options.title - Notification title
 * @param {String} options.message - Notification message
 * @param {Object} options.data - Additional data (optional)
 */
async function createNotification({ userId, type, title, message, data = {} }) {
  try {
    const notification = new Notification({
      userId,
      type,
      title,
      message,
      data
    });

    await notification.save();
    console.log(` In-app notification created for user ${userId}: ${title}`);
    return notification;
  } catch (err) {
    console.error('Error creating notification:', err);
    throw err;
  }
}

module.exports = { createNotification };
