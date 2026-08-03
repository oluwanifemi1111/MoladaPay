
const nodemailer = require("nodemailer");

// Hash address for privacy (show first 6 and last 4 characters)
function hashAddress(address) {
  if (!address || address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Format blockchain explorer link
function getExplorerLink(chain, txHash) {
  const explorers = {
    ETHEREUM: `https://etherscan.io/tx/${txHash}`,
    ETH: `https://etherscan.io/tx/${txHash}`,
    BITCOIN: `https://mempool.space/tx/${txHash}`,
    BTC: `https://mempool.space/tx/${txHash}`,
    TRON: `https://tronscan.org/#/transaction/${txHash}`,
    TRX: `https://tronscan.org/#/transaction/${txHash}`
  };
  return explorers[chain.toUpperCase()] || '#';
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER || "nifemidavid11@gmail.com",
    pass: process.env.EMAIL_PASS || "vjznwnatumxtdccc",
  },
});

async function sendCryptoEmail({ to, type, fullName, amount, currency, fromAddress, toAddress, txHash, chain, balance }) {
  // Check if user has email notifications enabled
  const User = require('../models/User');
  const user = await User.findOne({ email: to }).select('emailNotifications');
  
  if (user && user.emailNotifications === false) {
    console.log(` Email notifications disabled for ${to}, skipping email`);
    return; // Don't send email, only in-app notification will be created
  }

  const isDebit = type === 'debit';
  const transactionType = isDebit ? 'Sent' : 'Received';
  const alertType = isDebit ? 'Debit Alert' : 'Credit Alert';
  const color = isDebit ? '#dc3545' : '#28a745';
  const icon = isDebit ? '' : '';

  const htmlTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #4B0082 0%, #6B46C1 100%); padding: 30px; text-align: center;">
                  <img src="https://i.ibb.co/jvYtrMv3/IMG-20250711-WA0068.jpg" alt="Molada Pay Logo" style="height: 60px; margin-bottom: 15px;">
                  <h1 style="color: white; margin: 0; font-size: 28px;">Molada Pay</h1>
                  <p style="color: #E9D5FF; margin: 10px 0 0 0; font-size: 14px;">Crypto Transaction ${alertType}</p>
                </td>
              </tr>

              <!-- Alert Badge -->
              <tr>
                <td style="padding: 20px; text-align: center;">
                  <div style="display: inline-block; background-color: ${color}15; color: ${color}; padding: 8px 20px; border-radius: 20px; font-weight: bold; font-size: 16px;">
                    ${icon} ${alertType}
                  </div>
                </td>
              </tr>

              <!-- Main Content -->
              <tr>
                <td style="padding: 0 30px 20px 30px;">
                  <p style="font-size: 16px; color: #333; margin: 0 0 20px 0;">
                    Hello <strong>${fullName}</strong>,
                  </p>
                  <p style="font-size: 15px; color: #555; margin: 0 0 25px 0;">
                    Your crypto transaction has been ${isDebit ? 'sent' : 'received'} successfully. Here are the details:
                  </p>

                  <!-- Transaction Details Box -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9FAFB; border-radius: 8px; overflow: hidden; margin-bottom: 25px;">
                    <tr>
                      <td style="padding: 20px;">
                        
                        <!-- Amount -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 15px;">
                          <tr>
                            <td style="color: #6B7280; font-size: 13px; padding-bottom: 5px;">Amount ${transactionType}</td>
                          </tr>
                          <tr>
                            <td>
                              <span style="font-size: 32px; font-weight: bold; color: ${color};">${amount}</span>
                              <span style="font-size: 20px; color: #6B7280; margin-left: 8px;">${currency}</span>
                            </td>
                          </tr>
                        </table>

                        <!-- Divider -->
                        <div style="height: 1px; background-color: #E5E7EB; margin: 20px 0;"></div>

                        <!-- Transaction Info -->
                        <table width="100%" cellpadding="8" cellspacing="0">
                          <tr>
                            <td style="color: #6B7280; font-size: 14px; width: 40%;">Network:</td>
                            <td style="color: #111827; font-size: 14px; font-weight: 500;">${chain}</td>
                          </tr>
                          <tr>
                            <td style="color: #6B7280; font-size: 14px;">From Address:</td>
                            <td style="color: #111827; font-size: 14px; font-family: monospace;">${hashAddress(fromAddress)}</td>
                          </tr>
                          <tr>
                            <td style="color: #6B7280; font-size: 14px;">To Address:</td>
                            <td style="color: #111827; font-size: 14px; font-family: monospace;">${hashAddress(toAddress)}</td>
                          </tr>
                          <tr>
                            <td style="color: #6B7280; font-size: 14px;">Transaction Hash:</td>
                            <td style="color: #4B0082; font-size: 14px; font-family: monospace; word-break: break-all;">${hashAddress(txHash)}</td>
                          </tr>
                          <tr>
                            <td style="color: #6B7280; font-size: 14px;">Status:</td>
                            <td><span style="background-color: #10B981; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600;">Confirmed</span></td>
                          </tr>
                        </table>

                      </td>
                    </tr>
                  </table>

                  <!-- New Balance -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #4B0082 0%, #6B46C1 100%); border-radius: 8px; margin-bottom: 25px;">
                    <tr>
                      <td style="padding: 20px;">
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="color: #E9D5FF; font-size: 13px;">Current ${currency} Balance</td>
                          </tr>
                          <tr>
                            <td style="color: white; font-size: 28px; font-weight: bold; padding-top: 8px;">${balance.toFixed(8)} ${currency}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>

                  <!-- View on Explorer Button -->
                  ${txHash ? `
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                    <tr>
                      <td align="center">
                        <a href="${getExplorerLink(chain, txHash)}" style="display: inline-block; background-color: #4B0082; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; transition: background-color 0.3s;">
                          View on Blockchain Explorer →
                        </a>
                      </td>
                    </tr>
                  </table>
                  ` : ''}

                  <!-- Security Notice -->
                  <div style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
                    <p style="margin: 0; color: #92400E; font-size: 13px;">
                      <strong> Security Notice:</strong> Blockchain transactions are irreversible. Always verify the recipient address before sending crypto. Molada Pay will never ask for your private keys or seed phrase.
                    </p>
                  </div>

                  <!-- Additional Info -->
                  <p style="font-size: 14px; color: #6B7280; margin: 20px 0 0 0;">
                    This is an automated notification for your crypto ${isDebit ? 'withdrawal' : 'deposit'}. The transaction has been confirmed on the ${chain} blockchain.
                  </p>
                  
                  <p style="font-size: 14px; color: #6B7280; margin: 15px 0 0 0;">
                    If you did not initiate this transaction, please contact our support team immediately at 
                    <a href="mailto:support@moladapay.com" style="color: #4B0082; text-decoration: none;">support@moladapay.com</a>
                  </p>

                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #F9FAFB; padding: 25px 30px; border-top: 1px solid #E5E7EB;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="color: #6B7280; font-size: 12px; text-align: center; padding-bottom: 10px;">
                        <strong>Molada Pay</strong> - Secure Digital Wallet & Crypto Platform
                      </td>
                    </tr>
                    <tr>
                      <td style="color: #9CA3AF; font-size: 11px; text-align: center;">
                        © ${new Date().getFullYear()} Molada Pay. All rights reserved.
                        <br>
                        This email was sent to ${to}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"Molada Pay" <${process.env.EMAIL_USER || "nifemidavid11@gmail.com"}>`,
    to,
    subject: `${alertType}: ${amount} ${currency} ${transactionType} - Molada Pay`,
    html: htmlTemplate,
  });

  console.log(` Crypto ${type} email sent to ${to}`);
}

module.exports = { sendCryptoEmail };
