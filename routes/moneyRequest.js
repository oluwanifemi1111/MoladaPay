const express = require('express');
const router = express.Router();
const MoneyRequest = require('../models/MoneyRequest');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const authMiddleware = require('../middleware/authMiddleware');
const nodemailer = require('nodemailer');
const { convertCurrency } = require('../utils/exchangeRates');

// Email transporter
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Send email helper
async function sendRequestEmail({ to, subject, html }) {
  await transporter.sendMail({
    from: `"Molada Pay" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html
  });
}

router.post('/create', authMiddleware, async (req, res) => {
  try {
    const { recipientEmail, amount, description } = req.body;

    // Validation
    if (!recipientEmail || !description) {
      return res.status(400).json({
        success: false,
        message: 'Recipient email and description are required'
      });
    }

    if (description.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Description must be 500 characters or less'
      });
    }

    if (amount && (isNaN(amount) || Number(amount) <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be a positive number'
      });
    }

    // Get requester
    const requester = await User.findById(req.user.id);
    if (!requester) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Find recipient
    const recipient = await User.findOne({ email: recipientEmail.toLowerCase() });
    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: 'Recipient not found. Make sure they have a Molada Pay account.'
      });
    }

    // Prevent self-request
    if (requester._id.toString() === recipient._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot request money from yourself'
      });
    }

    // Create money request
    const moneyRequest = new MoneyRequest({
      requesterId: requester._id,
      recipientId: recipient._id,
      amount: amount ? Number(amount) : null,
      currency: requester.currency || 'USD',
      description
    });

    await moneyRequest.save();

    // Check if recipient has email notifications enabled
    const recipientEmailEnabled = recipient.emailNotifications !== false;

    // Send email notification to recipient only if enabled
    if (recipientEmailEnabled) {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER || 'nifemidavid11@gmail.com',
          pass: process.env.EMAIL_PASS || 'vjznwnatumxtdccc'
        }
      });

    // Send email notification to recipient
    const amountText = amount 
      ? `<p style="font-size:18px; color:#4B0082; margin:15px 0;"><b>Amount Requested: ${requester.currency || 'USD'} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></p>`
      : '<p style="font-size:14px; color:#666; margin:15px 0;"><i>Amount not specified - you can send any amount</i></p>';

    const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border-radius: 12px; background:#f7f9fc; color:#111;">
      <h2 style="color:#4B0082; text-align:center; margin:0 0 20px;">Molada Pay</h2>
      <div style="background:#fff; padding:25px; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,.06);">
        <h3 style="color:#4B0082; margin:0 0 20px; font-size:20px;"> Money Request Received</h3>

        <p style="margin:0 0 15px; font-size:16px; line-height:1.6;">
          Hi <b>${recipient.fullName}</b>,
        </p>

        <p style="margin:0 0 15px; font-size:16px; line-height:1.6;">
          <b>${requester.fullName}</b> (${requester.email}) has sent you a payment request:
        </p>

        <div style="background:#f8f9fa; padding:15px; border-radius:8px; margin:20px 0; border-left:4px solid #4B0082;">
          <p style="margin:0 0 10px; font-size:14px; color:#666;"><b>Description:</b></p>
          <p style="margin:0; font-size:15px; color:#333;">${description}</p>
        </div>

        ${amountText}

        <div style="margin:30px 0; text-align:center;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/money-requests" 
             style="display:inline-block; padding:12px 30px; background:#4B0082; color:#fff; text-decoration:none; border-radius:8px; font-weight:600;">
            View Request
          </a>
        </div>

        <p style="margin:20px 0 0; font-size:14px; color:#666; line-height:1.6;">
          You can accept or decline this request from your Molada Pay dashboard.
        </p>
      </div>
      <div style="text-align:center; font-size:12px; margin-top:15px; color:#777;">
        &copy; ${new Date().getFullYear()} Molada Pay. All rights reserved.
      </div>
    </div>
    `;

    await transporter.sendMail({
        from: '"Molada Pay" <nifemidavid11@gmail.com>',
        to: recipient.email,
        subject: ` Money Request from ${requester.fullName} - Molada Pay`,
        html: emailHtml
      });
    } else {
      console.log(` Email notifications disabled for ${recipient.email}`);
    }

    // Create in-app notification for recipient
    const { createNotification } = require('../utils/notificationHelper');
    await createNotification({
      userId: recipient._id,
      type: 'money_request',
      title: `Money Request from ${requester.fullName}`,
      message: amount 
        ? `${requester.fullName} is requesting ${requester.currency || 'USD'} ${Number(amount).toFixed(2)}`
        : `${requester.fullName} sent you a payment request`,
      data: {
        requestId: moneyRequest._id,
        requester: requester.fullName,
        requesterEmail: requester.email,
        amount,
        currency: requester.currency || 'USD',
        description,
        status: 'received'
      }
    });

    res.json({
      success: true,
      message: 'Money request sent successfully',
      request: {
        id: moneyRequest._id,
        recipient: {
          name: recipient.fullName,
          email: recipient.email
        },
        amount: moneyRequest.amount,
        currency: moneyRequest.currency,
        description: moneyRequest.description,
        status: moneyRequest.status,
        createdAt: moneyRequest.createdAt
      }
    });

  } catch (err) {
    console.error('Create money request error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/sent', authMiddleware, async (req, res) => {
  try {
    const requests = await MoneyRequest.find({ requesterId: req.user.id })
      .populate('recipientId', 'fullName email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      requests: requests.map(r => ({
        id: r._id,
        recipient: {
          name: r.recipientId.fullName,
          email: r.recipientId.email
        },
        amount: r.amount,
        currency: r.currency,
        description: r.description,
        status: r.status,
        createdAt: r.createdAt,
        respondedAt: r.respondedAt,
        rejectionReason: r.rejectionReason
      }))
    });
  } catch (err) {
    console.error('Get sent requests error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/received', authMiddleware, async (req, res) => {
  try {
    const requests = await MoneyRequest.find({ recipientId: req.user.id })
      .populate('requesterId', 'fullName email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      requests: requests.map(r => ({
        id: r._id,
        requester: {
          name: r.requesterId.fullName,
          email: r.requesterId.email
        },
        amount: r.amount,
        currency: r.currency,
        description: r.description,
        status: r.status,
        createdAt: r.createdAt,
        respondedAt: r.respondedAt
      }))
    });
  } catch (err) {
    console.error('Get received requests error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/accept/:requestId', authMiddleware, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { amount: providedAmount, pin } = req.body;

    const moneyRequest = await MoneyRequest.findById(requestId)
      .populate('requesterId', 'fullName email currency walletBalance')
      .populate('recipientId', 'fullName email currency transactionPin');

    if (!moneyRequest) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    // Verify recipient is the one accepting
    if (moneyRequest.recipientId._id.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // Check if already responded
    if (moneyRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Request already ${moneyRequest.status}`
      });
    }

    // Determine amount to pay
    let amountToPay = moneyRequest.amount;
    if (!amountToPay) {
      if (!providedAmount || isNaN(providedAmount) || Number(providedAmount) <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount is required for this request'
        });
      }
      amountToPay = Number(providedAmount);
    }

    // Verify PIN
    if (!pin) {
      return res.status(400).json({ success: false, message: 'Transaction PIN required' });
    }

    const isValidPin = await moneyRequest.recipientId.comparePin(pin);
    if (!isValidPin) {
      return res.status(401).json({ success: false, message: 'Invalid transaction PIN' });
    }

    // Convert currency if needed
    const senderCurrency = moneyRequest.recipientId.currency || 'USD';
    const receiverCurrency = moneyRequest.requesterId.currency || 'USD';

    let convertedAmount = amountToPay;
    let fee = 0;
    if (senderCurrency !== receiverCurrency) {
      convertedAmount = await convertCurrency(senderCurrency, receiverCurrency, amountToPay);
      fee = Number((amountToPay * 0.02).toFixed(2));
    }

    // Check balance
    const totalDebit = amountToPay + fee;
    if (Number(moneyRequest.recipientId.walletBalance) < totalDebit) {
      return res.status(400).json({
        success: false,
        message: `Insufficient funds. Balance: ${senderCurrency} ${Number(moneyRequest.recipientId.walletBalance).toFixed(2)} | Required: ${senderCurrency} ${totalDebit.toFixed(2)}`
      });
    }

    // Update balances
    const sender = await User.findById(moneyRequest.recipientId._id);
    const receiver = await User.findById(moneyRequest.requesterId._id);

    sender.walletBalance -= totalDebit;
    receiver.walletBalance += Number(convertedAmount);

    await sender.save();
    await receiver.save();

    // Create transaction record
    const feeService = require('../services/feeService');
    const adminFee = feeService.calculateFee('transfer', amountToPay);

    const transaction = new Transaction({
      senderId: sender._id,
      receiverId: receiver._id,
      amount: amountToPay,
      senderCurrency,
      receiverCurrency,
      convertedAmount,
      fee,
      adminFee,
      type: 'transfer',
      method: 'money_request',
      status: 'success'
    });

    await transaction.save();
    await feeService.collectFee(transaction._id);

    // Update request status
    moneyRequest.status = 'accepted';
    moneyRequest.respondedAt = new Date();
    moneyRequest.transactionId = transaction._id;
    await moneyRequest.save();

    // Send emails
    const fmt = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Email to sender (who paid)
    const senderEmailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border-radius: 12px; background:#f7f9fc;">
      <h2 style="color:#4B0082; text-align:center;">Molada Pay</h2>
      <div style="background:#fff; padding:25px; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,.06);">
        <h3 style="color:#d9534f;">Payment Request Fulfilled</h3>
        <p>Hi <b>${sender.fullName}</b>,</p>
        <p>You have successfully paid a money request from <b>${receiver.fullName}</b>.</p>
        <div style="background:#f8f9fa; padding:15px; border-radius:8px; margin:20px 0;">
          <p><b>Amount Paid:</b> ${senderCurrency} ${fmt(totalDebit)}</p>
          <p><b>Description:</b> ${moneyRequest.description}</p>
          <p><b>New Balance:</b> ${senderCurrency} ${fmt(sender.walletBalance)}</p>
        </div>
      </div>
      <p style="text-align:center; font-size:12px; color:#777;">&copy; ${new Date().getFullYear()} Molada Pay</p>
    </div>
    `;

    await sendRequestEmail({
      to: sender.email,
      subject: 'Payment Request Fulfilled - Molada Pay',
      html: senderEmailHtml
    });

    // Email to receiver (who requested)
    const receiverEmailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border-radius: 12px; background:#f7f9fc;">
      <h2 style="color:#4B0082; text-align:center;">Molada Pay</h2>
      <div style="background:#fff; padding:25px; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,.06);">
        <h3 style="color:#5cb85c;"> Money Request Accepted</h3>
        <p>Hi <b>${receiver.fullName}</b>,</p>
        <p><b>${sender.fullName}</b> has accepted your money request and sent the payment.</p>
        <div style="background:#f8f9fa; padding:15px; border-radius:8px; margin:20px 0;">
          <p><b>Amount Received:</b> ${receiverCurrency} ${fmt(convertedAmount)}</p>
          <p><b>Description:</b> ${moneyRequest.description}</p>
          <p><b>New Balance:</b> ${receiverCurrency} ${fmt(receiver.walletBalance)}</p>
        </div>
      </div>
      <p style="text-align:center; font-size:12px; color:#777;">&copy; ${new Date().getFullYear()} Molada Pay</p>
    </div>
    `;

    await sendRequestEmail({
      to: receiver.email,
      subject: ' Money Request Accepted - Molada Pay',
      html: receiverEmailHtml
    });

    // Create in-app notifications
    const { createNotification } = require('../utils/notificationHelper');
    
    // Notification for sender (who paid)
    await createNotification({
      userId: sender._id,
      type: 'money_request',
      title: `Payment Request Fulfilled`,
      message: `You paid ${senderCurrency} ${fmt(totalDebit)} to ${receiver.fullName}`,
      data: {
        requestId: moneyRequest._id,
        amount: totalDebit,
        currency: senderCurrency,
        recipient: receiver.fullName,
        description: moneyRequest.description,
        transactionId: transaction._id,
        status: 'paid'
      }
    });

    // Notification for receiver (who requested)
    await createNotification({
      userId: receiver._id,
      type: 'money_request',
      title: `Money Request Accepted`,
      message: `${sender.fullName} accepted your request and sent ${receiverCurrency} ${fmt(convertedAmount)}`,
      data: {
        requestId: moneyRequest._id,
        amount: convertedAmount,
        currency: receiverCurrency,
        sender: sender.fullName,
        description: moneyRequest.description,
        transactionId: transaction._id,
        status: 'accepted'
      }
    });

    res.json({
      success: true,
      message: 'Payment sent successfully',
      transaction: {
        id: transaction._id,
        amount: amountToPay,
        fee,
        newBalance: sender.walletBalance
      }
    });

  } catch (err) {
    console.error('Accept request error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/reject/:requestId', authMiddleware, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { reason } = req.body;

    const moneyRequest = await MoneyRequest.findById(requestId)
      .populate('requesterId', 'fullName email')
      .populate('recipientId', 'fullName email');

    if (!moneyRequest) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    // Verify recipient is the one rejecting
    if (moneyRequest.recipientId._id.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // Check if already responded
    if (moneyRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Request already ${moneyRequest.status}`
      });
    }

    // Update request status
    moneyRequest.status = 'rejected';
    moneyRequest.respondedAt = new Date();
    moneyRequest.rejectionReason = reason || 'No reason provided';
    await moneyRequest.save();

    // Notify requester via email
    const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border-radius: 12px; background:#f7f9fc;">
      <h2 style="color:#4B0082; text-align:center;">Molada Pay</h2>
      <div style="background:#fff; padding:25px; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,.06);">
        <h3 style="color:#d9534f;">Money Request Declined</h3>
        <p>Hi <b>${moneyRequest.requesterId.fullName}</b>,</p>
        <p><b>${moneyRequest.recipientId.fullName}</b> has declined your money request.</p>
        <div style="background:#f8f9fa; padding:15px; border-radius:8px; margin:20px 0;">
          <p><b>Description:</b> ${moneyRequest.description}</p>
          ${reason ? `<p><b>Reason:</b> ${reason}</p>` : ''}
        </div>
      </div>
      <p style="text-align:center; font-size:12px; color:#777;">&copy; ${new Date().getFullYear()} Molada Pay</p>
    </div>
    `;

    await sendRequestEmail({
      to: moneyRequest.requesterId.email,
      subject: 'Money Request Declined - Molada Pay',
      html: emailHtml
    });

    // Create in-app notification for requester
    const { createNotification } = require('../utils/notificationHelper');
    await createNotification({
      userId: moneyRequest.requesterId._id,
      type: 'money_request',
      title: `Money Request Declined`,
      message: `${moneyRequest.recipientId.fullName} declined your payment request`,
      data: {
        requestId: moneyRequest._id,
        description: moneyRequest.description,
        reason: reason || 'No reason provided',
        status: 'rejected'
      }
    });

    res.json({
      success: true,
      message: 'Request rejected successfully'
    });

  } catch (err) {
    console.error('Reject request error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/cancel/:requestId', authMiddleware, async (req, res) => {
  try {
    const { requestId } = req.params;

    const moneyRequest = await MoneyRequest.findById(requestId);

    if (!moneyRequest) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    // Verify requester is the one cancelling
    if (moneyRequest.requesterId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // Can only cancel pending requests
    if (moneyRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel ${moneyRequest.status} request`
      });
    }

    moneyRequest.status = 'cancelled';
    moneyRequest.respondedAt = new Date();
    await moneyRequest.save();

    res.json({
      success: true,
      message: 'Request cancelled successfully'
    });

  } catch (err) {
    console.error('Cancel request error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/pending-count', authMiddleware, async (req, res) => {
  try {
    const count = await MoneyRequest.countDocuments({
      recipientId: req.user.id,
      status: 'pending'
    });

    res.json({
      success: true,
      count
    });
  } catch (err) {
    console.error('Get pending count error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;