// jobs/cleanup.js
const User = require("../models/User");

async function cleanupUnverified() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  try {
    const result = await User.deleteMany({
      verified: false,
      createdAt: { $lt: oneHourAgo }
    });
    if (result.deletedCount > 0) {
      console.log(` Cleaned up ${result.deletedCount} unverified accounts`);
    }
  } catch (err) {
    console.error("Cleanup job failed:", err);
  }
}

module.exports = cleanupUnverified;