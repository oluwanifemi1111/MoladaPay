const User = require("../models/User");

// Register device on login
exports.registerDevice = async (req, res) => {
  try {
    const { userId } = req.user;
    const { deviceId, ip, userAgent } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // check if device already exists
    const existingDevice = user.devices.find(d => d.deviceId === deviceId);
    if (!existingDevice) {
      user.devices.push({ deviceId, ip, userAgent });
      await user.save();

      // TODO: send email notification 
      console.log(` New device registered for user: ${user.email}`);
    }

    res.json({ success: true, message: "Device registered successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};