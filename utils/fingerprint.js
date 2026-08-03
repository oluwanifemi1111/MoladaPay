// backend/utils/fingerprint.js
const crypto = require("crypto");

function generateFingerprint(req) {
  // safely read headers
  const ip = req.ip || req.connection?.remoteAddress || "0.0.0.0";
  const userAgent = (req.headers && req.headers["user-agent"]) ? req.headers["user-agent"] : "unknown";

  const data = `${ip}-${userAgent}`;
  return crypto.createHash("sha256").update(data).digest("hex");
}

module.exports = generateFingerprint;