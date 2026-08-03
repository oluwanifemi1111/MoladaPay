# Molada Pay — Backend Technical PRD
**For: Incoming Developer**
**Last Updated: June 2026**
**Status: Active Development — Pre-Launch**

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture Overview](#3-architecture-overview)
4. [Folder Structure](#4-folder-structure)
5. [Environment Variables](#5-environment-variables)
6. [Database Models](#6-database-models)
7. [API Reference](#7-api-reference)
8. [Middleware](#8-middleware)
9. [Services](#9-services)
10. [Background Jobs](#10-background-jobs)
11. [Email System](#11-email-system)
12. [Security Features](#12-security-features)
13. [Third-Party Integrations](#13-third-party-integrations)
14. [Pending Integrations — Action Required](#14-pending-integrations--action-required)
15. [Supported Currencies](#15-supported-currencies)
16. [What Is Already Built](#16-what-is-already-built)
17. [Known Issues & Bugs](#17-known-issues--bugs)
18. [Remaining Work](#18-remaining-work)

---

## 1. Project Overview

**Molada Pay** is a West Africa-focused digital financial platform. This repository is the **backend only** — a standalone Node.js/Express REST API that the mobile app connects to.

**Core capabilities:**
- Fiat wallet (NGN, GHS, XOF and other West African currencies)
- Crypto wallet (BTC, ETH, TRX, USDT-ERC20, USDT-TRC20) — *third-party provider integration pending, see Section 14*
- Bill payments (airtime, data, electricity, cable TV)
- P2P fiat transfers and money requests
- Virtual Visa/Mastercard cards
- KYC identity verification (BVN/NIN)
- Minor account controls with parental oversight
- Admin dashboard with role-based access
- Multi-language API responses
- Real-time customer support via WebSocket + Gmail integration

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 |
| Framework | Express 5 |
| Database | MongoDB via Mongoose 8 |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Email | Nodemailer (Gmail SMTP or Gmail API via OAuth2) |
| Crypto — BTC | bitcoinjs-lib, bip39, bip32, tiny-secp256k1 *(to be replaced — see Section 14)* |
| Crypto — ETH | ethers.js v6 *(to be replaced — see Section 14)* |
| Crypto — TRX | tronweb *(to be replaced — see Section 14)* |
| Fiat Payments | **Partner Bank (TBD)** — see `services/partnerBank.js` |
| Bill Payments | UfitPay (HTTP via axios) |
| Crypto Prices | CoinGecko API (via coingecko-api) |
| Currency Exchange | ExchangeRate-API (v6) |
| VPN Detection | ip-api.com (HTTP) |
| Geolocation | ip-api.com, ipapi.co, geoip-lite (3-tier fallback) |
| Translation | MyMemory Translation API (HTTP) |
| PDF Generation | PDFKit |
| Scheduling | node-cron |
| WebSocket | ws |
| Process Manager | nodemon (dev), node (prod) |

---

## 3. Architecture Overview

```
Mobile App (not in this repo)
        |
        | HTTPS REST
        v
  Express API (port 3001)
        |
   +---------+------------------+------------------+
   |         |                  |                  |
MongoDB  Partner Bank      Blockchain Nodes     External APIs
(Atlas)  (TBD — wired      (ETH Infura,        (CoinGecko,
          through            BTC Mempool,        ExchangeRate,
          services/          TRX TronGrid)       ip-api, MyMemory)
          partnerBank.js)

  Support WebSocket (port 4001)
        |
   Gmail API (OAuth2) — polls support inbox
```

**Key architectural decisions:**
- Single Express app, no microservices
- MongoDB is the only database (no Redis, no SQL)
- Crypto private keys are currently **stored in the database** — this will be handled by the third-party crypto provider (see Section 14)
- All cron jobs run in-process (not separate workers)
- No message queue — all operations are synchronous within request/response cycle

---

## 4. Folder Structure

```
/
├── server.js                   # App entry point — middleware setup, route mounting, job scheduling
├── supportPoller.js            # Gmail poller + WebSocket server (port 4001)
├── package.json
│
├── config/
│   ├── db.js                   # Mongoose connection
│   ├── crypto.js               # In-house HD wallet setup (BTC, ETH, TRX) — PENDING THIRD-PARTY REPLACEMENT
│   └── languages.js            # Supported language codes for translation
│
├── models/
│   ├── User.js                 # Core user schema (balances, crypto addresses, KYC, devices, PIN)
│   ├── Wallet.js               # Fiat wallet (balance)
│   ├── Transaction.js          # All transaction records (transfers, deposits, withdrawals, bills, crypto)
│   ├── Admin.js                # Admin users with role/permissions
│   ├── AccountReview.js        # Frozen account appeals
│   ├── MoneyRequest.js         # P2P payment requests
│   ├── Notification.js         # In-app notifications
│   ├── SavedCard.js            # Tokenized card references (token managed by partner bank)
│   ├── SupportTicket.js        # Customer support ticket threads
│   └── cryptoBalance.js        # Crypto balance snapshots
│
├── routes/
│   ├── auth.js                 # Register, login, OTP, password management
│   ├── wallet.js               # Balance, virtual account generation, bank webhook
│   ├── transfer.js             # Fiat P2P transfers
│   ├── deposit.js              # Card deposit initiation and verification
│   ├── withdraw.js             # Fiat withdrawal to bank account
│   ├── cryptoRoutes.js         # Crypto prices, wallet generation, send, balance — PENDING THIRD-PARTY
│   ├── kyc.js                  # KYC submission (BVN/NIN) and admin review
│   ├── admin.js                # Admin dashboard — users, transactions, revenue, KYC
│   ├── bills.js                # Airtime, data, electricity, cable TV (UfitPay)
│   ├── card.js                 # Direct card charge
│   ├── savedCard.js            # Saved payment cards — tokenize, list, quick-deposit
│   ├── moneyRequest.js         # P2P money requests
│   ├── notifications.js        # In-app notification CRUD
│   ├── pin.js                  # Transaction PIN set/change/reset
│   ├── pinRoutes.js            # (Duplicate of pin.js — see Known Issues)
│   ├── security.js             # Device management and security questions
│   ├── supportRoutes.js        # User-facing support tickets
│   ├── customerSupport.js      # Admin support management
│   ├── accountReview.js        # Frozen account appeal submission
│   ├── accountDeletion.js      # Account deletion
│   ├── downloadPdf.js          # PDF transaction receipt generation
│   ├── userRoutes.js           # User profile management
│   ├── language.js             # Language preference setting
│   ├── webhook.js              # Bank payment event webhook
│   └── kyc.js                  # KYC submission and review
│
├── middleware/
│   ├── authMiddleware.js       # JWT validation for user routes
│   ├── adminAuth.js            # JWT validation + role check for admin routes
│   ├── ageRestrictions.js      # Minor account transaction limits and gates
│   ├── checkKyc.js             # KYC approval gate for high-value actions
│   ├── largeAmountCheck.js     # Auto-freeze on transactions above $10,000
│   ├── antiHack.js             # Failed login tracking and account lockout
│   ├── errorHandler.js         # Global error handler (mounted last in server.js)
│   └── translateMiddleware.js  # Auto-translate JSON responses by user language
│
├── services/
│   ├── partnerBank.js          # PARTNER BANK STUB — all bank operations go here (see Section 14)
│   ├── walletServices.js       # Crypto address generation, on-chain sends, balance queries
│   ├── depositWatchers.js      # Blockchain deposit monitors — PENDING THIRD-PARTY REPLACEMENT
│   ├── priceService.js         # CoinGecko live price updater (60s interval)
│   ├── billService.js          # UfitPay bill payment logic
│   ├── feeService.js           # Platform fee calculation and collection
│   ├── translationService.js   # MyMemory translation API wrapper
│   ├── supportService.js       # Support ticket helper logic
│   └── vpnDetectionService.js  # ip-api.com VPN/proxy detection
│
├── jobs/
│   ├── cleanup.js              # Delete unverified accounts (30 min warning, 60 min delete)
│   ├── updateUserAges.js       # Daily birthday check, adult account upgrade
│   └── weeklyParentReport.js   # Sunday 9 AM parent transaction report for minors
│
├── controllers/
│   ├── deviceController.js     # Device fingerprint management
│   └── pinController.js        # PIN set/update/verify logic
│
├── utils/
│   ├── countryToCurrency.js    # West Africa country code → currency map (16 countries)
│   ├── exchangeRates.js        # ExchangeRate-API currency conversion (⚠ ES module — see Known Issues)
│   ├── fingerprint.js          # Device fingerprint generation
│   ├── notificationHelper.js   # Create + push in-app notifications
│   ├── phoneUtils.js           # Phone number → country/currency detection
│   ├── sendEmail.js            # Generic Nodemailer email sender
│   ├── cryptoEmailTemplates.js # HTML email templates for crypto deposit/send events
│   └── pin.js                  # PIN hash and compare helpers
│
├── scripts/
│   ├── createAdmin.js          # CLI: create first admin user
│   ├── createCustomerSupport.js# CLI: create customer support admin
│   └── getGmailToken.js        # CLI: generate Gmail OAuth2 refresh token
│
├── legal/
│   ├── privacy-policy.md       # Privacy Policy
│   └── terms-of-service.md    # Terms of Service
│
└── public/                     # Static files served by Express
```

---

## 5. Environment Variables

All variables are loaded from `.env` at the root. **Never commit this file.**

### Core

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB Atlas connection string |
| `JWT_SECRET` | Yes | JWT signing secret (use a long random string) |
| `BACKEND_PORT` | No | Server port (default: 3001) |
| `BASE_URL` | Yes | Backend base URL (used in redirect URLs) |
| `FRONTEND_URL` | Yes | Frontend base URL (used in email links) |

### Partner Bank *(add when bank partnership is confirmed)*

| Variable | Required | Purpose |
|---|---|---|
| `PARTNER_BANK_API_KEY` | Yes | Partner bank API key |
| `PARTNER_BANK_SECRET` | Yes | Partner bank secret |
| `PARTNER_BANK_BASE_URL` | Yes | Partner bank API base URL |
| `PARTNER_BANK_WEBHOOK_SECRET` | Yes | Shared secret to verify webhook signatures |

### Crypto *(will be replaced by third-party provider)*

| Variable | Required | Purpose |
|---|---|---|
| `BTC_MASTER_MNEMONIC` | Yes | BIP39 mnemonic for HD Bitcoin wallet |
| `ETH_MASTER_MNEMONIC` | Yes | BIP39 mnemonic for HD Ethereum wallet |
| `TRON_MNEMONIC` | Yes | BIP39 mnemonic for HD TRON wallet |
| `ETH_RPC` | Yes | Ethereum JSON-RPC URL (e.g. Infura endpoint) |
| `USDT_CONTRACT` | Yes | ERC-20 USDT contract address |
| `TRON_FULL_NODE` | No | TRON full node URL (default: trongrid.io) |
| `TRON_API_KEY` | Yes | TronGrid API key |
| `TRON_PRIVATE_KEY` | Yes | Platform TRON hot wallet private key |
| `USDT_TRC20_CONTRACT` | Yes | TRC-20 USDT contract address |
| `BTC_NETWORK` | No | `mainnet` or `testnet` (default: mainnet) |
| `ETH_NETWORK` | No | `mainnet` or `testnet` |

### Email

| Variable | Required | Purpose |
|---|---|---|
| `EMAIL_USER` | Yes | Gmail address for transactional emails |
| `EMAIL_PASS` | Yes | Gmail app password |
| `EMAIL_SERVICE` | No | Email service (default: `gmail`) |
| `GMAIL_CLIENT_ID` | Yes* | Gmail OAuth2 client ID (support poller) |
| `GMAIL_CLIENT_SECRET` | Yes* | Gmail OAuth2 client secret |
| `GMAIL_REFRESH_TOKEN` | Yes* | Gmail OAuth2 refresh token |

> *Required for the support poller. Run `node scripts/getGmailToken.js` once to generate the refresh token.

### External APIs

| Variable | Required | Purpose |
|---|---|---|
| `UFITPAY_API_KEY` | Yes | UfitPay bill payment API key |
| `UFITPAY_BASE_URL` | Yes | UfitPay API base URL |
| `EXCHANGERATE_API_KEY` | Yes | ExchangeRate-API key *(currently hardcoded — must be moved to env)* |
| `ZEROX_API_KEY` | No | 0x Protocol API key (crypto swap — incomplete feature) |

---

## 6. Database Models

### User
The central model. Every user interaction links back here.

| Field | Type | Notes |
|---|---|---|
| `fullName` | String | Required |
| `email` | String | Unique, required |
| `phone` | String | Used to detect country/currency at registration |
| `password` | String | bcrypt hash |
| `age` | Number | Stored at registration; updated daily by cron job |
| `dateOfBirth` | Date | Used for precise birthday tracking |
| `country` | String | ISO country code (e.g. "NG") |
| `currency` | String | ISO currency code (e.g. "NGN") |
| `walletId` | String | Unique ID (`WAL-xxxxxxxx`) |
| `walletBalance` | Number | Primary fiat balance field on User |
| `wallet` | ObjectId | Ref to Wallet document (secondary, see Known Issues) |
| `verified` | Boolean | OTP verification status |
| `otp` | String | Current OTP (cleared after use) |
| `otpExpiresAt` | Date | OTP expiry (10 min window) |
| `accountStatus` | String | `active`, `suspended`, `frozen`, `under_review` |
| `kycStatus` | String | `not_submitted`, `pending`, `approved`, `rejected` |
| `parentEmail` | String | Required for users under 18 |
| `language` | String | Preferred language code for translation |
| `transactionPin` | String | bcrypt-hashed 4–6 digit PIN |
| `securityQuestions` | Array | Question/answer pairs for PIN reset |
| `devices` | Array | Fingerprinted known devices |
| `crypto` | Object | Per-coin wallet addresses and private keys *(see Section 14)* |
| `failedLoginAttempts` | Number | Counter for lockout logic |
| `accountLockedUntil` | Date | Lockout expiry timestamp |
| `virtualAccount` | Object | Bank virtual account number and bank name |

### Transaction
Ledger record for every money movement.

| Field | Type | Notes |
|---|---|---|
| `userId` | ObjectId | Owner of the transaction |
| `senderId` | ObjectId | Source user (for P2P transfers) |
| `receiverId` | ObjectId | Destination user (for P2P transfers) |
| `amount` | Number | Transaction amount |
| `currency` | String | Currency code |
| `type` | String | `transfer`, `deposit`, `withdraw`, `bill`, `crypto_send`, `crypto_receive`, `fee`, `fund` |
| `method` | String | `card`, `bank_transfer`, `blockchain`, `qrcode`, `direct` |
| `status` | String | `pending`, `success`, `failed` |
| `reference` | String | Unique transaction reference |
| `onchainTxHash` | String | Blockchain tx hash (crypto only) |
| `adminFee` | Number | Platform fee charged |
| `feeCollected` | Boolean | Whether fee was collected |
| `metadata` | Object | Extra data (card last4, provider reference, etc.) |

### Admin

| Field | Type | Notes |
|---|---|---|
| `email` | String | Unique |
| `password` | String | bcrypt hash |
| `role` | String | `super_admin`, `finance_admin`, `support_admin`, `customer_support` |
| `permissions` | Array | Granular permission strings |
| `revenueWallet` | Object | Platform earnings tracker (`{ balance, currency }`) |

### SavedCard

| Field | Type | Notes |
|---|---|---|
| `userId` | ObjectId | Owner |
| `cardToken` | String | Partner bank card token (stored instead of full card number) |
| `cardLast4` | String | Last 4 digits for display only |
| `cardType` | String | `visa`, `mastercard`, `verve`, `other` |
| `cardBrand` | String | Issuer name from bank |
| `expiryMonth` | String | |
| `expiryYear` | String | |
| `cardholderName` | String | |
| `isDefault` | Boolean | Whether this is the user's primary card |
| `isVerified` | Boolean | Whether verification charge succeeded |
| `lastUsed` | Date | Last time the card was used |

### MoneyRequest

| Field | Type | Notes |
|---|---|---|
| `requesterId` | ObjectId | User requesting money |
| `recipientId` | ObjectId | User being asked to pay |
| `amount` | Number | Requested amount |
| `currency` | String | Currency |
| `status` | String | `pending`, `accepted`, `rejected`, `cancelled` |
| `description` | String | Reason for request |

### AccountReview
Created automatically when an account is frozen for a large transaction.

| Field | Type | Notes |
|---|---|---|
| `userId` | ObjectId | Frozen user |
| `reason` | String | Why the account was frozen |
| `amount` | Number | Transaction amount that triggered the freeze |
| `status` | String | `pending`, `approved`, `rejected` |

---

## 7. API Reference

### Authentication — `/api/auth`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/register` | Public | Register new user. Detects country from phone. Sends OTP. Blocks VPN users. If under 18, also emails parent. |
| POST | `/verify` | Public | Verify 6-digit OTP. Creates wallet on success. |
| POST | `/resend-otp` | Public | Resend OTP (max 3 per hour). |
| POST | `/login` | Public | Login with email/password. Returns JWT. Detects new devices, sends security alert email. |
| POST | `/forgot-password` | Public | Sends password reset link (15-min expiry). |
| POST | `/reset-password/:token` | Public | Resets password using token from email. |
| POST | `/change-password` | JWT | Changes password for logged-in user. |

### Wallet — `/api/wallet`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/balance/:userId` | JWT | Fiat balance + crypto balances (with USD values) |
| POST | `/deposit/account` | Public | Generate a virtual bank account number for deposits |
| POST | `/webhook/bank` | Signature | Receive payment event notifications from the partner bank |

### Transfers — `/api/transfer`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/send` | JWT + KYC | P2P fiat transfer to another Molada user (by email/phone/walletId). Applies fee, creates records for both parties, sends email notifications. |

### Deposits — `/api/deposit`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/deposit` | JWT | Initiate card deposit via partner bank. Returns a checkout URL to redirect the user to. |
| POST | `/fund` | JWT | Direct wallet credit (admin/testing only) |
| GET | `/verify` | Public | Called by bank after payment. Verifies transaction and credits wallet. |

### Withdrawals — `/api/withdraw`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/withdraw` | JWT | Withdraw fiat to a Nigerian bank account via the partner bank transfer API. Debits wallet immediately; refunds on failure. |

### Crypto — `/api/crypto`
*Note: This section uses in-house key management. Will be replaced by third-party provider — see Section 14.*

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/prices` | Public | Live BTC, ETH, TRX, USDT prices (CoinGecko, 60s cache) |
| GET | `/generate-qr/:userId/:chain` | JWT | QR code for receiving crypto on a specific chain |
| POST | `/send-qr` | JWT + Age | Send crypto by scanning a QR code |
| POST | `/sync-balance` | JWT | Sync on-chain balances into the database |
| POST | `/generate` | JWT | Generate a new wallet address for a chain |
| GET | `/wallets` | JWT | Get user's wallet addresses |
| GET | `/balance/:userId` | Public | Full crypto portfolio with USD values |
| POST | `/send` | JWT + Age | Send crypto to an external address |

### KYC — `/api/kyc`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/submit` | Public | Submit BVN or NIN for verification via partner bank. Sets `kycStatus` to `pending` on failure or `approved` on success. |
| POST | `/review/:kycId` | Admin JWT | Admin manually approves or rejects a KYC record. |

### Bills — `/api/bills`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/airtime` | JWT | Buy airtime via UfitPay |
| POST | `/data` | JWT | Buy mobile data bundle via UfitPay |
| POST | `/electricity` | JWT | Pay electricity (prepaid meter) via UfitPay |
| POST | `/cable` | JWT | Pay DSTV/GoTV/Startimes subscription via UfitPay |

### Card Payments — `/api/payment`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/charge` | Public | Charge a card directly (delegates to partner bank) |

### Saved Cards — `/api/card`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/save` | JWT | Tokenize and save a new card via partner bank |
| GET | `/list` | JWT | List all saved cards |
| DELETE | `/remove/:cardId` | JWT | Remove a saved card |
| POST | `/set-default/:cardId` | JWT | Set a card as default |
| POST | `/quick-deposit` | JWT | Deposit using a saved card (CVV only) |

### Money Requests — `/api/money-request`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/create` | JWT | Request money from another user |
| GET | `/received` | JWT | List all incoming requests |
| GET | `/sent` | JWT | List all outgoing requests |
| POST | `/accept/:id` | JWT | Accept — auto-executes the transfer |
| POST | `/reject/:id` | JWT | Reject a request |
| DELETE | `/cancel/:id` | JWT | Cancel an outgoing request |

### Notifications — `/api/notifications`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/` | JWT | Fetch all notifications |
| PATCH | `/:id/read` | JWT | Mark as read |
| DELETE | `/:id` | JWT | Delete a notification |

### Security — `/api/security`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/devices` | JWT | List known devices |
| DELETE | `/devices/:id` | JWT | Remove a trusted device |
| POST | `/security-questions` | JWT | Set security questions |
| POST | `/verify-security-questions` | JWT | Verify answers for recovery |

### PIN — `/api/pin`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/set` | JWT | Set transaction PIN |
| POST | `/verify` | JWT | Verify transaction PIN |
| POST | `/change` | JWT | Change PIN |
| POST | `/reset` | JWT | Reset PIN via security questions |

### Admin — `/api/admin`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/users` | Admin JWT | List all users with filters |
| GET | `/users/:id` | Admin JWT | Get full user profile |
| POST | `/users/:id/suspend` | Admin JWT | Suspend a user |
| POST | `/users/:id/freeze` | Admin JWT | Freeze a user |
| POST | `/users/:id/unfreeze` | Admin JWT | Unfreeze a user |
| DELETE | `/users/:id` | Admin JWT | Delete a user |
| GET | `/transactions` | Admin JWT | All platform transactions |
| GET | `/revenue` | Admin JWT | Platform revenue and fee summary |
| GET | `/kyc` | Admin JWT | Pending KYC submissions |
| POST | `/revenue/withdraw` | Admin JWT | Withdraw admin revenue to a bank account |
| GET | `/analytics/dashboard` | Admin JWT | Platform-wide activity statistics |

### Support — `/api/support` and `/api/customer-support`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/support/create` | JWT | User opens a support ticket |
| GET | `/api/support/my-tickets` | JWT | User views their tickets |
| POST | `/api/support/reply/:id` | JWT | User replies to a ticket |
| GET | `/api/customer-support/tickets` | Admin JWT | Admin views all tickets |
| POST | `/api/customer-support/reply/:id` | Admin JWT | Admin replies |
| PATCH | `/api/customer-support/close/:id` | Admin JWT | Admin closes a ticket |

### Account Review — `/api/account-review`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/appeal` | JWT | Submit an appeal for a frozen account |
| GET | `/status` | JWT | Check appeal status |

### Account Deletion — `/api/account`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| DELETE | `/delete` | JWT | Request account deletion |

### PDF Downloads — `/api/download`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/receipt/:transactionId` | JWT | Download a PDF receipt for a transaction |

### Webhooks — `/api/webhook`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/webhook` | Signature | Receive payment events from partner bank. Verifies the `x-bank-signature` header. Credits wallet on successful charge events. |

---

## 8. Middleware

### `authMiddleware.js`
Validates the `Authorization: Bearer <token>` header on every protected route. Decodes JWT using `JWT_SECRET`. Attaches `req.user` for downstream handlers. Returns 401 if missing or invalid.

### `adminAuth.js`
Same as `authMiddleware` but checks that the decoded token belongs to an Admin document. Returns 403 if not an admin. Also checks role/permissions for finer-grained access control.

### `ageRestrictions.js`
Applied to financial routes. If the user is under 18:
- Blocks all crypto transactions entirely
- Blocks international transfers (outside their country)
- Enforces a maximum transaction amount
- Enforces maximum 10 transactions per day
- Enforces a 2-minute cooldown between transactions
- Blocks virtual card creation

### `checkKyc.js`
Applied to high-value routes. Returns 403 if `user.kycStatus !== 'approved'` with a message directing the user to complete KYC.

### `largeAmountCheck.js`
Runs on all financial transactions. If the amount exceeds $10,000 equivalent:
1. Freezes the user's account (`accountStatus: 'under_review'`)
2. Creates an `AccountReview` record
3. Blocks the transaction from completing
4. Notifies the user to contact support

### `antiHack.js`
Tracks failed login attempts per email in MongoDB. After 5 consecutive failures, sets `accountLockedUntil` to 30 minutes from now. Resets on successful login.

### `translateMiddleware.js`
Post-response middleware. Intercepts the JSON response, looks up `user.language`, and if not English, sends the response through MyMemory Translation API. Caches translations in memory to reduce API calls.

### `errorHandler.js`
Global error handler mounted last in `server.js`. Catches unhandled errors from all routes and returns a structured JSON error response.

---

## 9. Services

### `partnerBank.js` ⚠ STUB — NOT YET IMPLEMENTED
**This is the most important file for the incoming developer.**

All fiat payment operations (card charges, bank transfers, card tokenization, virtual accounts, KYC verification, webhook verification) route through this single file. It currently contains placeholder functions that throw an error when called.

**To integrate the partner bank:**
1. Install their SDK or use axios for their REST API
2. Replace each stub function with the real API call
3. Add `PARTNER_BANK_API_KEY`, `PARTNER_BANK_SECRET`, `PARTNER_BANK_BASE_URL`, `PARTNER_BANK_WEBHOOK_SECRET` to `.env`

The following functions need implementation:

| Function | Purpose |
|---|---|
| `initiateCardCharge(payload)` | Start a card deposit; return a checkout URL |
| `verifyTransaction(transactionId)` | Confirm a payment; return status + amount |
| `initiateTransfer(payload)` | Send a bank transfer (withdrawal) |
| `tokenizeCard(payload)` | Save a card for future use |
| `chargeTokenizedCard(payload)` | Charge a previously saved card |
| `createVirtualAccount(payload)` | Generate a virtual bank account for deposits |
| `verifyBVN(bvn)` | KYC: check a BVN number |
| `verifyNIN(nin)` | KYC: check a NIN number |
| `verifyWebhookSignature(rawBody, signature)` | Verify incoming webhook is from the bank |

### `walletServices.js`
The crypto engine. Handles address generation, on-chain balance queries, and transaction signing/broadcasting for BTC, ETH, TRX, and their USDT variants. **This will be replaced or wrapped by the third-party crypto provider.**

### `depositWatchers.js`
Runs in the background from server startup. Polls/listens to blockchain networks for incoming deposits and credits user balances automatically. **This entire file will be replaced by webhook events from the third-party crypto provider.**

### `priceService.js`
Fetches live prices for BTC, ETH, TRX, USDT from CoinGecko every 60 seconds. Caches results in memory. The `/api/crypto/prices` endpoint reads from this cache.

### `billService.js`
Handles UfitPay integration for utility bill payments. For each bill type: validates balance, calls UfitPay, deducts balance on success, creates a transaction record.

### `feeService.js`
Calculates platform fees for each transaction type (0.5%–1.5% depending on type). Fee is deducted and accumulated in the admin revenue wallet.

### `translationService.js`
Wrapper for MyMemory Translation API. Takes a string and target language code, returns translated string. Results cached in a `Map` in memory (resets on server restart).

### `vpnDetectionService.js`
Calls ip-api.com to check if the connecting IP is a VPN, proxy, or Tor exit node. Used during registration to block VPN signups.

---

## 10. Background Jobs

All jobs use `node-cron` and run in-process within the main server.

### `cleanup.js` — Every 5 minutes
- Finds all users where `verified: false`
- If account is 30+ minutes old and warning not sent → sends "verify or be deleted" email, sets `warningSent: true`
- If account is 60+ minutes old → deletes the user document permanently

### `updateUserAges.js` — Daily at 01:30 UTC (2:30 AM Nigeria time)
- Queries all users with a `dateOfBirth`
- Recalculates age from birth date
- If just turned 18 → upgrades account, removes minor restrictions, sends birthday email

### `weeklyParentReport.js` — Sundays at 09:00 WAT
- Finds all minor users (age < 18) with a parent email
- Fetches the last 7 days of transactions per minor
- Sends an HTML email summary to the registered `parentEmail`

---

## 11. Email System

All emails are sent via **Nodemailer** using Gmail SMTP (`EMAIL_USER` / `EMAIL_PASS`).
The support poller uses **Gmail API OAuth2** (separate credentials).

All templates use Molada Pay branding (purple `#3b1a5b` colour scheme).

| Trigger | Recipient | Content |
|---|---|---|
| Registration | User | 6-digit OTP, expires 10 minutes |
| Registration (minor) | Parent | Child registration notification |
| OTP not verified (30 min) | User | Warning — account deletes in 30 minutes |
| Login from new device | User | Device info (type, OS, browser, IP, city) + "Secure My Account" button |
| Forgot password | User | Reset link, expires 15 minutes |
| Password changed | User | Confirmation + contact support if unrecognised |
| Crypto deposit received | User | Coin, amount, blockchain tx hash |
| Fiat transfer sent | Sender | Amount, recipient name, new balance |
| Fiat transfer received | Receiver | Amount, sender name, new balance |
| Weekly report | Parent | HTML table of minor's last 7 days of activity |
| 18th birthday | User | Birthday message + account upgrade confirmation |
| Bill payment | User | Bill type, amount, reference |

---

## 12. Security Features

| Feature | Implementation |
|---|---|
| Password hashing | bcryptjs, 10 salt rounds |
| JWT authentication | 7-day expiry, signed with `JWT_SECRET` |
| OTP verification | 6-digit, 10-minute expiry, single-use, rate-limited (3–5/hour) |
| Login lockout | 5 failed attempts → 30-minute lockout |
| VPN blocking | ip-api.com check on registration |
| New device alerts | Email with full device/location breakdown on unrecognised login |
| Device fingerprinting | User-agent + IP stored per device |
| Large transaction freeze | Transactions above $10,000 trigger auto-freeze + admin review queue |
| Minor account restrictions | No crypto, no international transfers, daily caps, 2-min cooldown |
| KYC gate | High-value operations blocked without approved KYC |
| Account statuses | `active`, `suspended`, `frozen`, `under_review` — each blocks different actions |
| Transaction PIN | Separate 4–6 digit PIN (bcrypt hashed) required for payments |
| Security questions | 3 Q&A pairs used for PIN reset |
| Webhook signature | Incoming bank webhooks verified via shared secret |

---

## 13. Third-Party Integrations (Active)

| Provider | Purpose | How to configure |
|---|---|---|
| **MongoDB Atlas** | Primary database | `MONGODB_URI` |
| **UfitPay** | Airtime, data, electricity, cable TV | `UFITPAY_API_KEY`, `UFITPAY_BASE_URL` |
| **CoinGecko** | Live crypto prices | Free tier — no key needed |
| **ExchangeRate-API** | Fiat currency conversion | `EXCHANGERATE_API_KEY` |
| **Infura** | Ethereum node access | `ETH_RPC` |
| **TronGrid** | TRON node access | `TRON_FULL_NODE`, `TRON_API_KEY` |
| **Mempool.space** | Bitcoin node access | Free tier — no key needed |
| **Gmail / Nodemailer** | Transactional emails | `EMAIL_USER`, `EMAIL_PASS` |
| **Gmail API (OAuth2)** | Support inbox poller | `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` |
| **MyMemory** | API response translation | Free tier — no key needed |
| **ip-api.com** | VPN detection + geolocation | Free tier — no key needed |
| **PDFKit** | Transaction receipts | No external dependency |

---

## 14. Pending Integrations — Action Required

These are the two areas that need a developer to complete before launch.

---

### 14A. Partner Bank (Fiat Payments)

**What it covers:** card deposits, withdrawals, card tokenization (saved cards), virtual account generation, KYC (BVN/NIN).

**What the developer needs to do:**
1. Open `services/partnerBank.js` — all 9 stub functions are clearly labelled with `// TODO` and JSDoc explaining inputs/outputs
2. Install the bank's SDK or use their REST API via axios
3. Implement each function
4. Add the 4 env variables (`PARTNER_BANK_API_KEY`, `PARTNER_BANK_SECRET`, `PARTNER_BANK_BASE_URL`, `PARTNER_BANK_WEBHOOK_SECRET`) to `.env`
5. Register the webhook URL in the bank's dashboard: `https://<your-domain>/api/webhook/webhook`

**Files that call `partnerBank.js` (no changes needed here, just fill in the service):**

| File | What it does |
|---|---|
| `routes/deposit.js` | `initiateCardCharge`, `verifyTransaction` |
| `routes/withdraw.js` | `initiateTransfer` |
| `routes/card.js` | `initiateCardCharge` |
| `routes/savedCard.js` | `tokenizeCard`, `chargeTokenizedCard` |
| `routes/wallet.js` | `createVirtualAccount`, `verifyWebhookSignature` |
| `routes/kyc.js` | `verifyBVN`, `verifyNIN` |
| `routes/admin.js` | `initiateTransfer` |
| `routes/webhook.js` | `verifyWebhookSignature` |

---

### 14B. Crypto Third-Party Provider (Bitcoin, ETH, TRX, USDT)

**What it covers:** wallet generation, crypto sends, deposit detection.

**Current state:** The system uses in-house HD wallets (master mnemonics stored in `.env`) and direct blockchain connections. This works but has security risks (private keys stored in MongoDB) and operational overhead (running our own blockchain watchers).

**What the developer needs to do:**
1. Choose a provider (e.g. Fireblocks, BitGo, Coinbase Prime)
2. Replace `config/crypto.js` with the provider's client setup
3. Replace `services/walletServices.js` functions with provider SDK calls
4. Replace `services/depositWatchers.js` background watchers with a webhook endpoint from the provider
5. Remove unused npm packages after the swap (`bitcoinjs-lib`, `bip39`, `bip32`, `tronweb`, `ethers` — if provider wraps them)

**Files marked for replacement (look for "THIRD-PARTY HANDOFF PENDING" comment at the top):**

| File | Status |
|---|---|
| `config/crypto.js` | Replace entire file with provider client setup |
| `services/walletServices.js` | Replace functions with provider SDK calls |
| `services/depositWatchers.js` | Replace with provider webhook handler |
| `routes/cryptoRoutes.js` | Route contracts stay the same — only service layer changes |

---

## 15. Supported Currencies

### Fiat (West Africa — 16 countries)

| Country | Code | Currency |
|---|---|---|
| Benin | BJ | XOF |
| Burkina Faso | BF | XOF |
| Cape Verde | CV | CVE |
| Côte d'Ivoire | CI | XOF |
| Gambia | GM | GMD |
| Ghana | GH | GHS |
| Guinea | GN | GNF |
| Guinea-Bissau | GW | XOF |
| Liberia | LR | LRD |
| Mali | ML | XOF |
| Mauritania | MR | MRU |
| Niger | NE | XOF |
| Nigeria | NG | NGN |
| Senegal | SN | XOF |
| Sierra Leone | SL | SLE |
| Togo | TG | XOF |

### Crypto (5 assets)

| Asset | Network | Notes |
|---|---|---|
| BTC | Bitcoin | HD BIP84 (Native SegWit) |
| ETH | Ethereum | HD BIP44 |
| TRX | TRON | HD derived |
| USDT | Ethereum (ERC-20) | Shares the ETH wallet address |
| USDT | TRON (TRC-20) | Shares the TRX wallet address |

---

## 16. What Is Already Built

Everything listed here is implemented in the codebase. Some items have known bugs (see Section 17).

**Auth & Users**
- [x] User registration with OTP email verification
- [x] Auto-cleanup of unverified accounts (30 min warning, 60 min delete)
- [x] JWT login with device fingerprinting and new-device email alerts
- [x] VPN detection and blocking on registration
- [x] Forgot password / reset password via email link
- [x] Change password (authenticated)

**Fiat Wallet & Payments**
- [x] Fiat wallet creation on OTP verification
- [x] Fiat P2P transfers between users (with fees)
- [x] Card deposit initiation → returns checkout URL
- [x] Deposit verification on redirect → credits wallet
- [x] Bank withdrawal → debits wallet, sends via bank
- [x] Saved card tokenization and quick-deposit (CVV only)
- [x] Virtual bank account generation for deposits
- [x] Bank webhook receiver and wallet crediting
- [x] Transaction PIN for payment authorisation
- [x] Platform fee calculation and collection
- [x] Money request system (create, accept, reject, cancel)

**Crypto**
- [x] Crypto wallet address generation (BTC, ETH, TRX, USDT)
- [x] Real-time crypto deposit watchers (ETH, ERC-20 USDT, TRX, TRC-20 USDT, BTC)
- [x] Crypto send to external address (BTC, ETH, TRX, USDT)
- [x] Crypto send via QR code scan
- [x] On-chain balance sync
- [x] Live crypto price feed (CoinGecko, 60s cache)
- [x] QR code generation for receiving crypto

**Bill Payments**
- [x] Airtime, mobile data, electricity, cable TV (UfitPay)

**KYC & Compliance**
- [x] KYC submission (BVN/NIN)
- [x] Admin KYC review (approve/reject)
- [x] Large transaction auto-freeze ($10,000 threshold)
- [x] Frozen account appeal system
- [x] Account deletion

**Minor Accounts**
- [x] Minor account restrictions (age gates, daily limits, 2-min cooldown, crypto blocked)
- [x] Parent email notification on minor registration
- [x] Weekly parent transaction report (Sundays 9 AM)
- [x] Daily birthday check and automatic adult account upgrade

**Admin**
- [x] Admin user system with 4 roles (`super_admin`, `finance_admin`, `support_admin`, `customer_support`)
- [x] Admin dashboard: users, transactions, revenue, KYC queue
- [x] Account suspension, freeze, unfreeze
- [x] Admin revenue withdrawal to bank account

**Platform**
- [x] Multi-language API responses (MyMemory translation)
- [x] Customer support ticket system (user + admin sides)
- [x] Gmail-based support inbox poller (WebSocket, port 4001)
- [x] In-app notification system
- [x] PDF transaction receipts
- [x] Security questions (set + verify for PIN reset)
- [x] Device management (list + remove trusted devices)
- [x] West Africa fiat currency map (16 countries)
- [x] Geolocation on login (3-tier fallback)

---

## 17. Known Issues & Bugs

### Critical — Fix Before Any End-to-End Testing

**1. MongoDB not connected**
`MONGODB_URI` in `.env` points to a dead Atlas cluster. The server starts but all database operations fail silently. Provide a valid connection string before testing anything.

**2. Partner bank not integrated**
`services/partnerBank.js` is a stub. Every function throws an error. All deposit, withdrawal, card, KYC, and virtual account routes will fail until it is implemented (see Section 14A).

**3. Hardcoded sender email**
Several `transporter.sendMail()` calls across route files use `nifemidavid11@gmail.com` as the `from` address instead of `process.env.EMAIL_USER`. Search for this string and replace all occurrences.

**4. Hardcoded password reset URL**
`routes/auth.js` builds the reset link using a hardcoded `http://localhost:5000/reset-password/...`. Replace with `process.env.FRONTEND_URL`.

### Moderate — Fix Before Launch

**5. `routes/withdraw.js` wrong middleware import path**
Imports `authMiddleware` from `../middleware/auth` — this file does not exist. The correct path is `../middleware/authMiddleware`. Withdrawal route is currently broken.

**6. `utils/exchangeRates.js` API key hardcoded**
The ExchangeRate-API key (`9ee9bb86...`) is hardcoded in the file body. Move it to `process.env.EXCHANGERATE_API_KEY`.

**7. `utils/exchangeRates.js` uses ES module syntax**
This file uses `import`/`export` while the rest of the project is CommonJS. It currently works because it is called via dynamic `import()`, but a developer adding a direct `require()` will break it. Convert to CommonJS or migrate the whole project to ESM.

**8. `services/billService.js` balance model mismatch**
Bill payments read/write the `Wallet` document directly, but most of the codebase uses `user.walletBalance` on the User document. Balance deductions for bills may not reflect consistently across the app. Standardise on one source (recommend `user.walletBalance`).

**9. Duplicate resend-otp route**
`routes/auth.js` registers `POST /resend-otp` twice. Express uses only the first; the second is dead code. Remove the duplicate.

**10. Duplicate wallet route in `server.js`**
`server.js` mounts `/api/wallet` twice (lines 76 and 81). Remove the duplicate `app.use` call.

### Minor

**11. Mongoose duplicate index warning**
On startup, Mongoose warns about a duplicate index on `User.email` (defined both inline and via `schema.index()`). Remove one definition.

**12. Support WebSocket EADDRINUSE warning**
Port 4001 is started twice on server boot. The second `listen()` call in `supportPoller.js` should be removed.

**13. Crypto swap incomplete**
The 0x Protocol swap route exists but the end-to-end integration is not wired up. `ZEROX_API_KEY` is unused. Complete or remove this feature before launch.

**14. Translation cache resets on restart**
The MyMemory translation cache is an in-memory `Map`. Every server restart loses all cached translations. At scale, this causes repeated API calls. Move to Redis or a MongoDB TTL collection.

---

## 18. Remaining Work

### Must-Do Before Launch

- [ ] Fix MongoDB connection — provide valid `MONGODB_URI`
- [ ] Implement `services/partnerBank.js` (bank partnership confirmed — fill in 9 functions)
- [ ] Fix withdrawal route — correct `authMiddleware` import path
- [ ] Remove hardcoded sender email — use `EMAIL_USER` env var everywhere
- [ ] Remove hardcoded reset URL — use `FRONTEND_URL` env var
- [ ] Move ExchangeRate-API key to env
- [ ] Fix `billService.js` balance model — standardise on `user.walletBalance`
- [ ] Remove duplicate `/resend-otp` route
- [ ] Remove duplicate `/api/wallet` mount in `server.js`

### Should-Do Before Launch

- [ ] Integrate third-party crypto provider — replace `config/crypto.js`, `walletServices.js`, `depositWatchers.js` (see Section 14B)
- [ ] Convert `exchangeRates.js` to CommonJS
- [ ] Add request body validation (`joi` or `express-validator`) on all POST endpoints
- [ ] Add rate limiting (`express-rate-limit`) on public routes (register, login, forgot-password)
- [ ] Add transaction idempotency — check for duplicate `reference` before processing any payment
- [ ] Review crypto private key storage — once third-party provider is in, this resolves itself

### Nice-to-Have / Future

- [ ] Two-factor authentication (TOTP or SMS)
- [ ] Referral reward system — `referralCode` is stored but no reward logic exists
- [ ] Push notifications via Firebase Cloud Messaging
- [ ] Redis for session caching, translation cache, price data
- [ ] Structured logging — replace `console.log` with Winston or Pino
- [ ] Health check endpoint — `GET /health` returning DB status and uptime
- [ ] Swagger/OpenAPI documentation generated from route definitions
- [ ] Unit and integration test suite (especially for payment and transfer flows)
- [ ] Containerisation — Dockerfile for consistent deployment

---

*This document reflects the codebase as of June 2026. When in doubt, the source files are the authoritative reference. Look for inline comments marked `// TODO` or `PENDING` for specific integration points.*
