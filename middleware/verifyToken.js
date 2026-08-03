const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // attach user id and optionally user doc
    req.user = { id: decoded.id, email: decoded.email };

    // optionally fetch full user doc (comment/uncomment as you prefer)
    // req.userDoc = await User.findById(decoded.id).select('-password');

    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};