
const User = require('../models/User');

// Anti-hack middleware: Detect and prevent suspicious activities
const antiHackMiddleware = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return next();

    const user = await User.findById(userId);
    if (!user) return next();

    // Check if account is locked
    if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.accountLockedUntil - new Date()) / 60000);
      return res.status(423).json({ 
        message: `Account temporarily locked. Try again in ${minutesLeft} minutes.`,
        lockedUntil: user.accountLockedUntil
      });
    }

    // Check if account is frozen or suspended
    if (user.accountStatus === 'frozen') {
      return res.status(403).json({ 
        message: 'Account frozen due to suspicious activity. Contact support.',
        reason: user.freezeReason
      });
    }

    if (user.accountStatus === 'suspended') {
      return res.status(403).json({ 
        message: 'Account suspended.',
        reason: user.suspensionReason
      });
    }

    next();
  } catch (err) {
    console.error('Anti-hack middleware error:', err);
    next();
  }
};

// Track failed login attempts
const trackFailedLogin = async (email) => {
  try {
    const user = await User.findOne({ email });
    if (!user) return;

    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    user.lastFailedLogin = new Date();

    // Lock account after 5 failed attempts
    if (user.failedLoginAttempts >= 5) {
      user.accountLockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      user.suspiciousActivity.push({
        type: 'multiple_failed_logins',
        details: `${user.failedLoginAttempts} failed login attempts`,
        timestamp: new Date()
      });
    }

    await user.save();
  } catch (err) {
    console.error('Track failed login error:', err);
  }
};

// Reset failed attempts on successful login
const resetFailedAttempts = async (userId) => {
  try {
    await User.findByIdAndUpdate(userId, {
      failedLoginAttempts: 0,
      lastFailedLogin: null,
      accountLockedUntil: null
    });
  } catch (err) {
    console.error('Reset failed attempts error:', err);
  }
};

// Detect unusual location (different from last known location)
const detectUnusualLocation = async (user, newLocation) => {
  try {
    if (!user.devices || user.devices.length === 0) return false;

    const lastDevice = user.devices[user.devices.length - 1];
    if (lastDevice.country && newLocation.country && lastDevice.country !== newLocation.country) {
      user.suspiciousActivity.push({
        type: 'unusual_location',
        details: `Login from ${newLocation.country} (previously ${lastDevice.country})`,
        timestamp: new Date()
      });
      await user.save();
      return true;
    }
    return false;
  } catch (err) {
    console.error('Detect unusual location error:', err);
    return false;
  }
};

module.exports = {
  antiHackMiddleware,
  trackFailedLogin,
  resetFailedAttempts,
  detectUnusualLocation
};
