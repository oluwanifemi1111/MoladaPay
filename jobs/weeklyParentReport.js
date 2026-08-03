
const cron = require('node-cron');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
});

// Run every Sunday at 9 AM
cron.schedule('0 9 * * 0', async () => {
  try {
    console.log(' Sending weekly parent reports...');

    const minors = await User.find({ 
      age: { $lt: 18 },
      parentEmail: { $exists: true, $ne: null }
    });

    for (const minor of minors) {
      // Skip if email notifications disabled
      if (minor.emailNotifications === false) continue;

      // Get last 7 days transactions
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const transactions = await Transaction.find({
        $or: [{ senderId: minor._id }, { userId: minor._id }],
        createdAt: { $gte: sevenDaysAgo },
        status: 'success'
      }).populate('receiverId', 'fullName').sort({ createdAt: -1 });

      if (transactions.length === 0) continue;

      // Calculate totals
      const totalSpent = transactions
        .filter(tx => tx.senderId?.toString() === minor._id.toString())
        .reduce((sum, tx) => sum + (tx.amount || 0) + (tx.fee || 0), 0);

      const totalReceived = transactions
        .filter(tx => tx.receiverId?.toString() === minor._id.toString())
        .reduce((sum, tx) => sum + (tx.convertedAmount || tx.amount || 0), 0);

      const fmt = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      // Build transaction table
      let txRows = transactions.slice(0, 10).map(tx => {
        const isDebit = tx.senderId?.toString() === minor._id.toString();
        const amount = isDebit ? (tx.amount + (tx.fee || 0)) : (tx.convertedAmount || tx.amount);
        const type = isDebit ? 'Sent' : 'Received';
        const party = isDebit ? tx.receiverId?.fullName || 'N/A' : 'Deposit';
        
        return `
          <tr>
            <td style="padding:8px; border:1px solid #ddd;">${new Date(tx.createdAt).toLocaleDateString()}</td>
            <td style="padding:8px; border:1px solid #ddd;">${type}</td>
            <td style="padding:8px; border:1px solid #ddd;">${party}</td>
            <td style="padding:8px; border:1px solid #ddd; color:${isDebit ? '#d9534f' : '#5cb85c'};">
              ${minor.currency} ${fmt(amount)}
            </td>
          </tr>
        `;
      }).join('');

      const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border-radius: 12px; background:#f7f9fc; color:#111;">
        <div style="text-align:center; margin:0 0 15px;">
          <img src="https://i.ibb.co/jvYtrMv3/IMG-20250711-WA0068.jpg" alt="Molada Pay Logo" style="height: 50px;">
        </div>
        <h2 style="color:#4B0082; text-align:center; margin:0 0 20px;">Weekly Activity Report</h2>
        
        <div style="background:#fff; padding:25px; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,.06);">
          <h3 style="color:#4B0082; margin:0 0 15px;">Account: ${minor.fullName}</h3>
          
          <div style="background:#f8f9fa; padding:15px; border-radius:8px; margin:20px 0;">
            <table style="width:100%; border-collapse:collapse;">
              <tr>
                <td style="padding:8px 0; color:#666;">Current Balance:</td>
                <td style="padding:8px 0; text-align:right; font-weight:700; font-size:16px; color:#4B0082;">
                  ${minor.currency} ${fmt(minor.walletBalance)}
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0; color:#666;">Total Spent (7 days):</td>
                <td style="padding:8px 0; text-align:right; font-weight:600; color:#d9534f;">
                  ${minor.currency} ${fmt(totalSpent)}
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0; color:#666;">Total Received (7 days):</td>
                <td style="padding:8px 0; text-align:right; font-weight:600; color:#5cb85c;">
                  ${minor.currency} ${fmt(totalReceived)}
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0; color:#666;">Transaction Count:</td>
                <td style="padding:8px 0; text-align:right; font-weight:600;">
                  ${transactions.length}
                </td>
              </tr>
            </table>
          </div>

          <h4 style="margin:20px 0 10px;">Recent Transactions</h4>
          <table style="width:100%; border-collapse:collapse; font-size:14px;">
            <thead>
              <tr style="background:#f0f0f0;">
                <th style="padding:8px; border:1px solid #ddd; text-align:left;">Date</th>
                <th style="padding:8px; border:1px solid #ddd; text-align:left;">Type</th>
                <th style="padding:8px; border:1px solid #ddd; text-align:left;">Party</th>
                <th style="padding:8px; border:1px solid #ddd; text-align:left;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${txRows}
            </tbody>
          </table>

          ${transactions.length > 10 ? `<p style="font-size:12px; color:#666; margin-top:10px;">Showing 10 of ${transactions.length} transactions</p>` : ''}

          <p style="margin:20px 0 0; font-size:14px; color:#666;">
            This is an automated weekly report for minor account monitoring.
          </p>
        </div>
        
        <div style="text-align:center; font-size:12px; margin-top:15px; color:#777;">
          &copy; ${new Date().getFullYear()} Molada Pay. All rights reserved.
        </div>
      </div>
      `;

      await transporter.sendMail({
        from: '"Molada Pay" <nifemidavid11@gmail.com>',
        to: minor.parentEmail,
        subject: `Weekly Report: ${minor.fullName}'s Account Activity`,
        html
      });

      console.log(` Weekly report sent to parent: ${minor.parentEmail}`);
    }

    console.log(' Weekly parent reports completed');
  } catch (err) {
    console.error(' Weekly parent report error:', err);
  }
});

console.log(' Weekly parent report cron job scheduled (Sundays 9 AM)');
