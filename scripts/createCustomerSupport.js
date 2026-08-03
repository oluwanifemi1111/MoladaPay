
require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../models/Admin');

async function createCustomerSupport() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(' Connected to MongoDB');

    const email = process.argv[2] || 'support@moladapay.com';
    const password = process.argv[3] || 'Support@123';
    const fullName = process.argv[4] || 'Customer Support Agent';

    const existing = await Admin.findOne({ email });
    if (existing) {
      console.log(' Customer support account already exists with this email');
      process.exit(1);
    }

    const support = new Admin({
      email,
      password,
      fullName,
      role: 'customer_support',
      permissions: ['view_support', 'manage_support'],
      isActive: true
    });

    await support.save();
    console.log(' Customer support account created successfully!');
    console.log(' Email:', email);
    console.log(' Password:', password);
    console.log(' Role: customer_support');
    console.log('\n  Please change the password after first login');

    process.exit(0);
  } catch (err) {
    console.error(' Error:', err.message);
    process.exit(1);
  }
}

createCustomerSupport();
