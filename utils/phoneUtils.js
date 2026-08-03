// utils/phoneUtils.js
const { parsePhoneNumber } = require("libphonenumber-js");

// Mapping ISO country codes to currencies
const countryToCurrency = {
  NG: "NGN", // Nigeria
  US: "USD", // United States
  GB: "GBP", // United Kingdom
  KE: "KES", // Kenya
  GH: "GHS", // Ghana
  ZA: "ZAR", // South Africa
  IN: "INR", // India
  CA: "CAD", // Canada
  CN: "CNY", // China
  JP: "JPY", // Japan
  AE: "AED", // UAE
  //  Add more as needed
};

function detectCountryAndCurrency(phone, fallbackCountry = null) {
  try {
    let detectedCountry = fallbackCountry;
    if (phone) {
      const phoneNumber = parsePhoneNumber(phone);
      if (phoneNumber && phoneNumber.country) {
        detectedCountry = phoneNumber.country; // ISO2 e.g. "NG"
      }
    }

    if (!detectedCountry) {
      return { country: "UNKNOWN", currency: "USD" }; // safe default
    }

    const currency = countryToCurrency[detectedCountry] || "USD";
    return { country: detectedCountry, currency };
  } catch (err) {
    console.error("Phone parsing failed:", err.message);
    return { country: "UNKNOWN", currency: "USD" };
  }
}

module.exports = { detectCountryAndCurrency };