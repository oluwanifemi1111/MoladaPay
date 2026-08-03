// utils/sendEmail.js
const nodemailer = require("nodemailer");

const sendEmail = async (to, subject, otp) => {
  const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const htmlTemplate = `
    <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
      <div style="max-width: 500px; margin: auto; background-color: #fff; border-radius: 8px; overflow: hidden;">
        
        <div style="background-color: #4B0082; padding: 20px; text-align: center;">
          <img src="https://i.ibb.co/jvYtrMv3/IMG-20250711-WA0068.jpg" alt="Molada Pay Logo" style="height: 60px; margin-bottom: 10px; background-color: white; border-radius: 8px; padding: 5px;">
          <h1 style="color: white; margin: 0;">Molada Pay</h1>
        </div>
        
        <div style="padding: 20px;">
          <h2 style="color: #4B0082;">Your One-Time Password</h2>
          <p style="font-size: 16px; color: #333;">
            Hello,  
            Please use the OTP below to verify your account. This OTP is valid for <b>10 minutes</b>.
          </p>
          <div style="background-color: #f0f0f0; padding: 10px; text-align: center; border-radius: 6px; margin: 20px 0;">
            <h1 style="color: #4B0082; letter-spacing: 4px;">${otp}</h1>
          </div>
          <p style="font-size: 14px; color: #555;">
            If you did not request this OTP, please ignore this email or contact our support team.
          </p>
        </div>
        
        <div style="background-color: #4B0082; padding: 10px; text-align: center;">
          <p style="color: white; font-size: 12px; margin: 0;">
            © ${new Date().getFullYear()} Molada Pay. All rights reserved.  
            <br>
            support@moladapay.com
          </p>
        </div>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: `"Molada Pay" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html: htmlTemplate,
  });
};

module.exports = sendEmail;
