
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

const adminAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json({ message: 'Authorization header missing' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Admin token missing' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.id);

    if (!admin || !admin.isActive) {
      return res.status(403).json({ message: 'Admin access denied' });
    }

    req.admin = admin;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid admin token' });
  }
};

// Check specific permissions
const checkPermission = (permission) => {
  return (req, res, next) => {
    if (!req.admin.permissions.includes(permission) && req.admin.role !== 'super_admin') {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    next();
  };
};

module.exports = { adminAuth, checkPermission };
