const bcrypt = require("bcrypt");

async function hashPin(pin) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(pin, salt);
}

async function verifyPin(pin, hashedPin) {
  return bcrypt.compare(pin, hashedPin);
}

module.exports = { hashPin, verifyPin };