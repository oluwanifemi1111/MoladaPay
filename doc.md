# Molada Pay — Backend API

## Overview

Molada Pay is a digital payment platform targeting Africa. This repository contains the **backend API only** — a Node.js/Express server that powers fiat and cryptocurrency payments, bill payments, KYC verification, admin management, and more.

## User Preferences

Preferred communication style: Simple, everyday language.

## Project Structure

```
/
├── config/           # DB connection, crypto providers, supported languages
├── controllers/      # Device and PIN logic
├── jobs/             # Cron jobs (age updates, parent reports, cleanup)
├── legal/            # Terms of service and privacy policy
├── middleware/        # Auth, anti-hack, age restrictions, translation, KYC checks
├── models/           # Mongoose schemas (User, Wallet, Transaction, etc.)
├── routes/           # All API route definitions
├── scripts/          # Admin/utility scripts (create admin, Gmail token)
├── services/         # Core business logic (partner bank stub, crypto wallets, emails)
├── utils/            # Shared helpers (email templates, phone utils, crypto emails)
├── public/           # Static files served by Express
├── server.js         # App entry point
├── supportPoller.js  # Gmail-based support ticket poller (WebSocket, port 4001)
└── .env              # Environment variables (not committed)
```

## Running the Server

```bash
npm start       # production
npm run dev     # development (nodemon)
```

Server runs on **port 3001** by default. Set `BACKEND_PORT` in `.env` to override.

## Key Environment Variables

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | JWT signing secret |
| `PARTNER_BANK_API_KEY` | Partner bank API key (not yet integrated) |
| `PARTNER_BANK_SECRET` | Partner bank secret (not yet integrated) |
| `PARTNER_BANK_BASE_URL` | Partner bank base URL (not yet integrated) |
| `PARTNER_BANK_WEBHOOK_SECRET` | Partner bank webhook secret (not yet integrated) |
| `EMAIL_USER` / `EMAIL_PASS` | Gmail credentials for transactional email |
| `BTC_MASTER_MNEMONIC` | HD wallet root for Bitcoin addresses |
| `ETH_MASTER_MNEMONIC` | HD wallet root for Ethereum addresses |
| `TRON_MNEMONIC` | HD wallet root for TRON addresses |
| `ETH_RPC` | Ethereum JSON-RPC endpoint (e.g. Infura) |
| `TRON_API_KEY` / `TRON_FULL_NODE` | TRON node access |
| `BTC_NETWORK` / `ETH_NETWORK` | `mainnet` or `testnet` |

## Two Pending Integrations

### 1. Partner Bank (Fiat Payments)
All fiat operations route through `services/partnerBank.js`. It is a stub — every function has a `// TODO` comment. Fill in the 9 functions with the bank's SDK/API calls and add the 4 `PARTNER_BANK_*` env vars.

### 2. Crypto Third-Party Provider
Files marked **THIRD-PARTY HANDOFF PENDING**:
- `config/crypto.js`
- `services/walletServices.js`
- `services/depositWatchers.js`

Replace these with the chosen provider's SDK once confirmed.

## API Routes

| Prefix | File | Purpose |
|---|---|---|
| `/api/auth` | `routes/auth.js` | Register, login, OTP, password reset |
| `/api/wallet` | `routes/wallet.js` | Balance, virtual account, bank webhook |
| `/api/transfer` | `routes/transfer.js` | Fiat P2P transfers |
| `/api/deposit` | `routes/deposit.js` | Card deposits via partner bank |
| `/api/withdraw` | `routes/withdraw.js` | Withdrawals via partner bank |
| `/api/payment` | `routes/card.js` | Direct card charge |
| `/api/card` | `routes/savedCard.js` | Saved payment cards |
| `/api/crypto` | `routes/cryptoRoutes.js` | Prices, send/swap crypto |
| `/api/bills` | `routes/bills.js` | Airtime, data, electricity, cable TV |
| `/api/money-request` | `routes/moneyRequest.js` | P2P payment requests |
| `/api/notifications` | `routes/notifications.js` | In-app alerts |
| `/api/kyc` | `routes/kyc.js` | Identity verification (BVN/NIN) |
| `/api/admin` | `routes/admin.js` | Admin dashboard |
| `/api/support` | `routes/supportRoutes.js` | User support tickets |
| `/api/customer-support` | `routes/customerSupport.js` | Admin support management |
| `/api/account-review` | `routes/accountReview.js` | Frozen account appeals |
| `/api/account` | `routes/accountDeletion.js` | Account deletion |
| `/api/download` | `routes/downloadPdf.js` | PDF transaction receipts |
| `/api/security` | `routes/security.js` | Devices, security questions |
| `/api/pin` | `routes/pin.js` | Transaction PIN management |
| `/api/webhook` | `routes/webhook.js` | Bank payment event webhook |
