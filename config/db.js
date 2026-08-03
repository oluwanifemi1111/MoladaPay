const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoURI) {
      console.warn('  MongoDB URI not set. Database features will be unavailable.');
      return;
    }
    await mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 5000 });
    console.log(' MongoDB Connected...');
  } catch (err) {
    console.error(' MongoDB connection failed:', err.message);
    console.warn('  Server will continue running without database.');
  }
};

module.exports = connectDB;