const express = require("express");
const nodemailer = require("nodemailer");
const { google } = require("googleapis");
require("dotenv").config();

const router = express.Router();

// OAuth2 configuration
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

// Create reusable transporter
const createTransporter = async () => {
  try {
    const accessToken = await oauth2Client.getAccessToken();

    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: process.env.MAIL_USER,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
        accessToken: accessToken.token,
      },
    });
  } catch (err) {
    console.error("Error creating mail transporter:", err);
    throw err;
  }
};

router.get("/test-mail", async (req, res) => {
  try {
    const transporter = await createTransporter();

    await transporter.sendMail({
      from: process.env.MAIL_USER,
      to: "pixelartswebsite@gmail.com",
      subject: "Test Email",
      text: "This is a test email using OAuth2.",
    });

    res.send("Mail sent successfully!");
  } catch (err) {
    console.error("Test mail error:", err);
    res.status(500).send("Mail failed: " + err.message);
  }
});

router.post("/send-mail", async (req, res) => {
  const { name, email, phone, comments } = req.body;

  try {
    const transporter = await createTransporter();

    await transporter.sendMail({
      from: `"${name}" <${process.env.MAIL_USER}>`,
      to: `${process.env.MAIL_USER}`,
      replyTo: email,
      subject: `New Contact Form Submission from ${name}`,
      html: `
        <h3>Contact Details</h3>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Message:</strong> ${comments}</p>
      `,
    });

    res.header("Access-Control-Allow-Origin", `${process.env.FRONTEND_URL}`);
    res.header("Access-Control-Allow-Credentials", true);
    res.status(200).json({ message: "Mail sent successfully!" });
  } catch (err) {
    console.error("Error sending mail:", err);
    res.header("Access-Control-Allow-Origin", `${process.env.FRONTEND_URL}`);
    res.header("Access-Control-Allow-Credentials", true);
    res.status(500).json({ message: "Failed to send mail" });
  }
});

module.exports = router;
