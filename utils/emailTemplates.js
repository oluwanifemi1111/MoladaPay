// utils/emailTemplates.js
function deletionWarningTemplate(fullName) {
  return `
  <div style="font-family: Arial, sans-serif; background: #f8f6fc; padding: 30px;">
    <table width="100%" style="max-width: 600px; margin: auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
      <tr>
        <td style="background: #5e2ced; padding: 20px; text-align: center; color: #fff;">
          <img src="https://i.ibb.co/jvYtrMv3/IMG-20250711-WA0068.jpg" alt="Molada Pay Logo" style="height: 60px; margin-bottom: 10px; background-color: white; border-radius: 8px; padding: 5px;">
          <h1 style="margin: 0;">Molada Pay</h1>
        </td>
      </tr>
      <tr>
        <td style="padding: 30px; color: #333;">
          <h2>Hello ${fullName},</h2>
          <p>
            You started creating a Molada Pay account but have not verified your email yet.
            For security reasons, <b>your account will be automatically deleted in 1 hour</b>
            if you don’t verify it.
          </p>
          <p>Please use the OTP sent earlier to activate your account.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="#" style="background: #5e2ced; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 16px;">
              Verify Now
            </a>
          </div>
          <p style="font-size: 12px; color: #777;">
            If you’ve already verified, you can ignore this email.
          </p>
        </td>
      </tr>
      <tr>
        <td style="background: #f1f1f1; padding: 15px; text-align: center; font-size: 12px; color: #777;">
          © ${new Date().getFullYear()} Molada Pay. All rights reserved.
        </td>
      </tr>
    </table>
  </div>
  `;
}
module.exports = { deletionWarningTemplate };