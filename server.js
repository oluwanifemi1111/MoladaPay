require('dotenv').config({ debug: false });

// Prevent unhandled promise rejections (e.g. MongoDB timeouts) from crashing the process
process.on('unhandledRejection', (err) => {
  console.error('Unhandled promise rejection:', err.message || err);
});

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/db');
const cron = require("node-cron");
const { spawn } = require('child_process');
const { startDepositWatchers } = require("./services/depositWatchers");
const { startPriceUpdater } = require('./services/priceService');
const updateUserAges = require("./jobs/updateUserAges");
const translationMiddleware = require("./middleware/translateMiddleware");

require("./jobs/weeklyParentReport");

startDepositWatchers();
startPriceUpdater();
connectDB();

cron.schedule("30 1 * * *", async () => {
  console.log("Running scheduled age update job...");
  await updateUserAges();
});
console.log("Daily age update job scheduled (runs at 01:30 UTC / 2:30 AM Nigeria time)");

const supportPoller = spawn('node', ['supportPoller.js'], {
  cwd: __dirname,
  stdio: 'inherit'
});
supportPoller.on('error', (err) => {
  console.error('Support poller error:', err);
});
console.log('Support poller started');

const app = express();

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(morgan('dev'));
app.use(express.static('public'));
app.use(translationMiddleware);

app.get('/', (req, res) => {
  res.send('Molada Pay API running...');
});

// Auth routes (split across 3 files)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/auth', require('./routes/password'));
app.use('/api/auth', require('./routes/profile'));

// Language middleware (after auth, before protected routes)
app.use(require('./middleware/languageMiddleware'));

// All protected routes
app.use('/api/wallet',           require('./routes/wallet'));
app.use('/api/security',         require('./routes/security'));
app.use('/api/transfer',         require('./routes/transfer'));
app.use('/api/deposit',          require('./routes/deposit'));
app.use('/api/withdraw',         require('./routes/withdraw'));
app.use('/api/webhook',          require('./routes/webhook'));
app.use('/api/payment',          require('./routes/card'));
app.use('/api/crypto',           require('./routes/cryptoRoutes'));
app.use('/api/bills',            require('./routes/bills'));
app.use('/api/kyc',              require('./routes/kyc'));
app.use('/api/support',          require('./routes/supportRoutes'));
app.use('/api/customer-support', require('./routes/customerSupport'));
app.use('/api/users',            require('./routes/userRoutes'));
app.use('/api/admin',            require('./routes/admin'));
app.use('/api/account-review',   require('./routes/accountReview'));
app.use('/api/account',          require('./routes/accountDeletion'));
app.use('/api/money-request',    require('./routes/moneyRequest'));
app.use('/api/notifications',    require('./routes/notifications'));
app.use('/api/download',         require('./routes/downloadPdf'));
app.use('/api/card',             require('./routes/savedCard'));
app.use('/api/pin',              require('./routes/pin'));

// Global error handler
app.use(require('./middleware/errorHandler'));

const PORT = process.env.BACKEND_PORT || 3001;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Molada Pay API running on port ${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} already in use, trying ${PORT + 1}...`);
    app.listen(PORT + 1, '0.0.0.0', () => {
      console.log(`Backend server running on port ${PORT + 1}`);
    });
  } else {
    console.error('Server error:', err);
  }
});
