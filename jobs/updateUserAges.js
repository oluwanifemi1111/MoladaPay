
const User = require("../models/User");
const nodemailer = require("nodemailer");

// Email transporter
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Calculate age from date of birth
function calculateAge(dateOfBirth) {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

// Birthday upgrade email template (for turning 18)
function birthdayUpgradeTemplate(name, newAge) {
  return `
    <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 30px;">
        <div style="max-width: 500px; margin: auto; background-color: white; padding: 20px; border-radius: 10px; border: 1px solid #ddd;">
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="https://i.ibb.co/jvYtrMv3/IMG-20250711-WA0068.jpg" alt="Molada Pay Logo" style="height: 60px; margin-bottom: 15px; background-color: white; border-radius: 8px; padding: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h1 style="color: #3b1a5b;"> Happy Birthday!</h1>
            </div>
            <h2 style="color: #3b1a5b; text-align: center;">Account Upgraded</h2>
            <p>Hello <strong>${name}</strong>,</p>
            <p>Happy ${newAge}th Birthday! </p>
            <p>Great news! Your Molada Pay account has been automatically upgraded to a <strong>full adult account</strong>.</p>
            
            <div style="background: #f0f8ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #3b1a5b; margin-top: 0;"> New Features Unlocked:</h3>
                <ul style="line-height: 1.8;">
                    <li> Unlimited transaction limits</li>
                    <li> Cryptocurrency trading enabled</li>
                    <li> International transfers</li>
                    <li> Virtual card issuance</li>
                    <li> All bill payment types</li>
                </ul>
            </div>
            
            <p>You now have full access to all Molada Pay features without restrictions.</p>
            <p>Enjoy your enhanced account!</p>
            
            <p style="font-size: 12px; color: #999; text-align: center; margin-top: 30px;">
                © ${new Date().getFullYear()} Molada. All rights reserved.
            </p>
        </div>
    </div>
  `;
}

// General birthday wishes email template (for all users)
function birthdayWishesTemplate(name, age) {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px;">
        <div style="max-width: 600px; margin: auto; background-color: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.2);">
            
            <!-- Header with confetti design -->
            <div style="background: linear-gradient(135deg, #3b1a5b 0%, #5e2ced 100%); padding: 40px 30px; text-align: center; position: relative;">
                <img src="https://i.ibb.co/jvYtrMv3/IMG-20250711-WA0068.jpg" alt="Molada Pay Logo" style="height: 70px; margin-bottom: 20px; background-color: white; border-radius: 10px; padding: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.2);">
                <h1 style="color: #ffffff; margin: 0; font-size: 36px; font-weight: 700; text-shadow: 2px 2px 4px rgba(0,0,0,0.2);"> Happy Birthday! </h1>
                <p style="color: #e0d0ff; margin: 10px 0 0 0; font-size: 18px;">Celebrating You Today!</p>
            </div>
            
            <!-- Main content -->
            <div style="padding: 40px 30px;">
                <h2 style="color: #3b1a5b; font-size: 24px; margin: 0 0 20px 0;">Dear ${name},</h2>
                
                <p style="font-size: 16px; line-height: 1.8; color: #333; margin: 0 0 20px 0;">
                    On this special day, the entire <strong style="color: #5e2ced;">Molada Pay</strong> team wants to wish you a very <strong>Happy ${age}${getOrdinalSuffix(age)} Birthday</strong>! 
                </p>
                
                <div style="background: linear-gradient(135deg, #f0f8ff 0%, #e8f0ff 100%); padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #5e2ced;">
                    <p style="margin: 0 0 15px 0; font-size: 16px; line-height: 1.7; color: #333;">
                         May this year bring you <strong>prosperity</strong>, <strong>success</strong>, and countless moments of joy!
                    </p>
                    <p style="margin: 0 0 15px 0; font-size: 16px; line-height: 1.7; color: #333;">
                         We're honored to be part of your financial journey and committed to making every transaction seamless for you.
                    </p>
                    <p style="margin: 0; font-size: 16px; line-height: 1.7; color: #333;">
                         Here's to another amazing year of achieving your dreams and goals!
                    </p>
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                    <div style="display: inline-block; background: linear-gradient(135deg, #5e2ced 0%, #7c4dff 100%); color: white; padding: 15px 35px; border-radius: 50px; font-size: 18px; font-weight: 600; box-shadow: 0 4px 15px rgba(94, 44, 237, 0.4);">
                         Special Birthday Gift: Check Your Wallet! 
                    </div>
                </div>
                
                <p style="font-size: 15px; line-height: 1.7; color: #555; margin: 25px 0;">
                    Thank you for choosing <strong style="color: #5e2ced;">Molada Pay</strong> as your trusted financial partner. We appreciate your loyalty and look forward to serving you better every day.
                </p>
                
                <p style="font-size: 16px; color: #333; margin: 20px 0 0 0;">
                    With warm wishes and celebration,<br>
                    <strong style="color: #5e2ced; font-size: 18px;">The Molada Pay Team</strong> 
                </p>
            </div>
            
            <!-- Footer -->
            <div style="background: #f8f9fa; padding: 25px 30px; text-align: center; border-top: 1px solid #e0e0e0;">
                <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">
                    <strong>Molada Pay</strong> - Your Gateway to Seamless Payments & Crypto Trading
                </p>
                <p style="margin: 0 0 15px 0; font-size: 13px; color: #888;">
                     support@moladapay.com |  www.moladapay.com
                </p>
                <div style="margin: 15px 0;">
                    <a href="#" style="display: inline-block; margin: 0 8px; color: #5e2ced; text-decoration: none; font-size: 12px;">Privacy Policy</a> |
                    <a href="#" style="display: inline-block; margin: 0 8px; color: #5e2ced; text-decoration: none; font-size: 12px;">Terms of Service</a> |
                    <a href="#" style="display: inline-block; margin: 0 8px; color: #5e2ced; text-decoration: none; font-size: 12px;">Help Center</a>
                </div>
                <p style="font-size: 12px; color: #999; margin: 15px 0 0 0;">
                    © ${new Date().getFullYear()} Molada Pay. All rights reserved.
                </p>
            </div>
        </div>
    </div>
  `;
}

// Helper function for ordinal suffixes (1st, 2nd, 3rd, etc.)
function getOrdinalSuffix(num) {
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) return "st";
  if (j === 2 && k !== 12) return "nd";
  if (j === 3 && k !== 13) return "rd";
  return "th";
}

async function updateUserAges() {
  console.log(" Running daily age update job...");
  
  try {
    // Get all users with dateOfBirth
    const users = await User.find({ 
      dateOfBirth: { $exists: true, $ne: null } 
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let upgradedCount = 0;
    let updatedCount = 0;
    let birthdayEmailsSent = 0;

    for (const user of users) {
      const currentAge = calculateAge(user.dateOfBirth);
      const birthDate = new Date(user.dateOfBirth);
      
      // Check if today is user's birthday (month and day match)
      const isBirthday = (
        today.getMonth() === birthDate.getMonth() &&
        today.getDate() === birthDate.getDate()
      );
      
      // Check if age has changed
      if (currentAge !== user.age) {
        const wasMinor = user.age < 18;
        const isNowAdult = currentAge >= 18;
        
        user.age = currentAge;
        await user.save();
        updatedCount++;

        // Send upgrade notification if user just turned 18
        if (wasMinor && isNowAdult) {
          upgradedCount++;
          
          // Send birthday + upgrade email
          try {
            await transporter.sendMail({
              from: '"Molada Pay" <nifemidavid11@gmail.com>',
              to: user.email,
              subject: " Happy Birthday! Your Account Has Been Upgraded",
              html: birthdayUpgradeTemplate(user.fullName, currentAge),
            });
            
            console.log(` Upgraded ${user.email} from minor to adult (age ${currentAge})`);
          } catch (emailErr) {
            console.error(` Failed to send upgrade email to ${user.email}:`, emailErr.message);
          }

          // Create in-app notification for upgrade
          const { createNotification } = require("../utils/notificationHelper");
          await createNotification({
            userId: user._id,
            type: "account",
            title: " Happy Birthday! Account Upgraded",
            message: `You're now ${currentAge}! Your account has been upgraded with full access to all features.`,
            data: {
              previousAge: currentAge - 1,
              newAge: currentAge,
              upgradeType: "minor_to_adult"
            },
          });
        } else if (isBirthday) {
          // Send general birthday wishes for non-18 birthdays
          try {
            // Only send if email notifications are enabled
            if (user.emailNotifications !== false) {
              await transporter.sendMail({
                from: '"Molada Pay" <nifemidavid11@gmail.com>',
                to: user.email,
                subject: ` Happy ${currentAge}${getOrdinalSuffix(currentAge)} Birthday, ${user.fullName.split(' ')[0]}!`,
                html: birthdayWishesTemplate(user.fullName, currentAge),
              });
              
              birthdayEmailsSent++;
              console.log(` Sent birthday wishes to ${user.email} (age ${currentAge})`);
            }
          } catch (emailErr) {
            console.error(` Failed to send birthday email to ${user.email}:`, emailErr.message);
          }

          // Create in-app birthday notification
          const { createNotification } = require("../utils/notificationHelper");
          await createNotification({
            userId: user._id,
            type: "celebration",
            title: ` Happy ${currentAge}${getOrdinalSuffix(currentAge)} Birthday!`,
            message: `The entire Molada Pay team wishes you an amazing birthday filled with joy and success!`,
            data: {
              age: currentAge,
              eventType: "birthday"
            },
          });
        }
      } else if (isBirthday && currentAge === user.age) {
        // User's birthday but age didn't change (already updated earlier)
        try {
          // Only send if email notifications are enabled
          if (user.emailNotifications !== false) {
            await transporter.sendMail({
              from: '"Molada Pay" <nifemidavid11@gmail.com>',
              to: user.email,
              subject: ` Happy ${currentAge}${getOrdinalSuffix(currentAge)} Birthday, ${user.fullName.split(' ')[0]}!`,
              html: birthdayWishesTemplate(user.fullName, currentAge),
            });
            
            birthdayEmailsSent++;
            console.log(` Sent birthday wishes to ${user.email} (age ${currentAge})`);
          }
        } catch (emailErr) {
          console.error(` Failed to send birthday email to ${user.email}:`, emailErr.message);
        }

        // Create in-app birthday notification
        const { createNotification } = require("../utils/notificationHelper");
        await createNotification({
          userId: user._id,
          type: "celebration",
          title: ` Happy ${currentAge}${getOrdinalSuffix(currentAge)} Birthday!`,
          message: `The entire Molada Pay team wishes you an amazing birthday filled with joy and success!`,
          data: {
            age: currentAge,
            eventType: "birthday"
          },
        });
      }
    }

    console.log(` Age update complete: ${updatedCount} users updated, ${upgradedCount} upgraded to adult, ${birthdayEmailsSent} birthday emails sent`);
    
  } catch (err) {
    console.error(" Age update job failed:", err);
  }
}

module.exports = updateUserAges;
