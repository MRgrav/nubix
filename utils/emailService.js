import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail", // or use SMTP / SendGrid / Resend
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

export const sendOTPEmail = async (email, otp) => {
  try {
    const mailOptions = {
      from: `"Nitya Desk" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Password Reset OTP - Nitya Desk",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Password Reset Request</h2>
          <p>Your OTP for resetting your password is:</p>
          <h1 style="color: #3b82f6; letter-spacing: 8px; font-size: 32px;">${otp}</h1>
          <p><strong>This OTP is valid for 10 minutes only.</strong></p>
          <p>If you did not request this password reset, please ignore this email.</p>
          <hr>
          <p style="font-size: 12px; color: #666;">This is an automated email from Nitya Desk.</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("✅ OTP Email sent successfully:", info.messageId);
    return true;
  } catch (error) {
    console.error("❌ Failed to send OTP email:", error.message);
    throw error;
  }
};
