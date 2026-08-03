/**
 * PARTNER BANK INTEGRATION
 * ========================
 * This file is the single place where the partner bank SDK/API will be wired in.
 *
 * WHAT TO DO WHEN THE BANK PARTNERSHIP IS CONFIRMED:
 *  1. Install the bank's SDK (e.g. `npm install <bank-sdk>`)
 *  2. Replace the placeholder functions below with real API calls
 *  3. Add the required credentials to the .env file
 *
 * ENV VARIABLES NEEDED (add to .env):
 *  PARTNER_BANK_API_KEY=
 *  PARTNER_BANK_SECRET=
 *  PARTNER_BANK_BASE_URL=
 *  PARTNER_BANK_WEBHOOK_SECRET=
 */

const PARTNER_BANK_API_KEY    = process.env.PARTNER_BANK_API_KEY    || "";
const PARTNER_BANK_SECRET     = process.env.PARTNER_BANK_SECRET     || "";
const PARTNER_BANK_BASE_URL   = process.env.PARTNER_BANK_BASE_URL   || "";
const PARTNER_BANK_WEBHOOK_SECRET = process.env.PARTNER_BANK_WEBHOOK_SECRET || "";

/**
 * Charge a card and return a checkout/redirect URL.
 * @param {object} payload - { amount, currency, email, fullName, tx_ref, redirectUrl }
 * @returns {Promise<{ checkoutUrl: string, reference: string }>}
 */
async function initiateCardCharge(payload) {
  // TODO: Replace with partner bank card charge call
  throw new Error("Partner bank not yet integrated. Replace this stub in services/partnerBank.js");
}

/**
 * Verify a transaction by its ID/reference.
 * @param {string} transactionId
 * @returns {Promise<{ status: "successful"|"failed", amount: number, currency: string, customerEmail: string }>}
 */
async function verifyTransaction(transactionId) {
  // TODO: Replace with partner bank transaction verification call
  throw new Error("Partner bank not yet integrated. Replace this stub in services/partnerBank.js");
}

/**
 * Send a bank transfer (withdrawal) to an account.
 * @param {object} payload - { accountNumber, bankCode, amount, currency, narration, reference }
 * @returns {Promise<{ status: "success"|"failed", reference: string }>}
 */
async function initiateTransfer(payload) {
  // TODO: Replace with partner bank transfer/payout call
  throw new Error("Partner bank not yet integrated. Replace this stub in services/partnerBank.js");
}

/**
 * Tokenize (save) a card for future charges.
 * @param {object} payload - { cardNumber, cvv, expiryMonth, expiryYear, currency, amount, email, fullName, tx_ref }
 * @returns {Promise<{ token: string, cardLast4: string, issuer: string }>}
 */
async function tokenizeCard(payload) {
  // TODO: Replace with partner bank card tokenization call
  throw new Error("Partner bank not yet integrated. Replace this stub in services/partnerBank.js");
}

/**
 * Charge a previously tokenized card.
 * @param {object} payload - { token, cvv, amount, currency, email, tx_ref }
 * @returns {Promise<{ status: "success"|"failed", reference: string }>}
 */
async function chargeTokenizedCard(payload) {
  // TODO: Replace with partner bank tokenized card charge call
  throw new Error("Partner bank not yet integrated. Replace this stub in services/partnerBank.js");
}

/**
 * Generate a virtual bank account number for a user.
 * @param {object} payload - { email, phone, firstName, lastName, bvn, amount, narration }
 * @returns {Promise<{ accountNumber: string, bankName: string }>}
 */
async function createVirtualAccount(payload) {
  // TODO: Replace with partner bank virtual account creation call
  throw new Error("Partner bank not yet integrated. Replace this stub in services/partnerBank.js");
}

/**
 * Verify BVN via the partner bank's KYC endpoint.
 * @param {string} bvn
 * @returns {Promise<{ status: "success"|"failed" }>}
 */
async function verifyBVN(bvn) {
  // TODO: Replace with partner bank BVN verification call
  throw new Error("Partner bank not yet integrated. Replace this stub in services/partnerBank.js");
}

/**
 * Verify NIN via the partner bank's KYC endpoint.
 * @param {string} nin
 * @returns {Promise<{ status: "success"|"failed" }>}
 */
async function verifyNIN(nin) {
  // TODO: Replace with partner bank NIN verification call
  throw new Error("Partner bank not yet integrated. Replace this stub in services/partnerBank.js");
}

/**
 * Verify the webhook signature sent by the partner bank.
 * @param {string} rawBody - raw request body as a string
 * @param {string} signature - value from the webhook signature header
 * @returns {boolean}
 */
function verifyWebhookSignature(rawBody, signature) {
  // TODO: Replace with partner bank webhook signature verification logic
  // Most banks use HMAC-SHA256. Example:
  // const crypto = require("crypto");
  // const expected = crypto.createHmac("sha256", PARTNER_BANK_WEBHOOK_SECRET).update(rawBody).digest("hex");
  // return expected === signature;
  throw new Error("Partner bank webhook verification not yet implemented. Replace this stub in services/partnerBank.js");
}

module.exports = {
  PARTNER_BANK_WEBHOOK_SECRET,
  initiateCardCharge,
  verifyTransaction,
  initiateTransfer,
  tokenizeCard,
  chargeTokenizedCard,
  createVirtualAccount,
  verifyBVN,
  verifyNIN,
  verifyWebhookSignature,
};
