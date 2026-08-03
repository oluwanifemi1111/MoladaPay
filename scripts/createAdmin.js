
require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../models/Admin');

async function createAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(' Connected to MongoDB');

    // Check if admin exists
    const existingAdmin = await Admin.findOne({ email: 'moladapayad@gmail.com' });
    
    if (existingAdmin) {
      console.log('  Admin already exists');
      process.exit(0);
    }

    // Create super admin
    const admin = new Admin({
      email: 'moladapayad@gmail.com',
      password: 'Admin@2024', // CHANGE THIS PASSWORD IMMEDIATELY
      fullName: 'Molada Pay Admin',
      role: 'super_admin',
      permissions: [
        'view_users', 'manage_users', 
        'view_transactions', 'manage_transactions',
        'view_kyc', 'manage_kyc', 
        'view_support', 'manage_support',
        'view_analytics', 'manage_settings'
      ]
    });

    await admin.save();
    console.log(' Super admin created successfully');
    console.log(' Email: moladapayad@gmail.com');
    console.log(' Password: Admin@2024');
    console.log('  PLEASE CHANGE PASSWORD IMMEDIATELY AFTER FIRST LOGIN');
    
    process.exit(0);
  } catch (err) {
    console.error(' Error:', err.message);
    process.exit(1);
  }
}

createAdmin();
