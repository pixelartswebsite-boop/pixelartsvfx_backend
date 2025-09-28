const express = require("express");
const { google } = require("googleapis");
require("dotenv").config();

const router = express.Router();

// OAuth2 setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const gmail = google.gmail({ version: "v1", auth: oauth2Client });

// Helper to build raw email
function makeEmail(to, from, subject, body) {
  const message = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
    body,
  ].join("\n");

  return Buffer.from(message).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
}

// Test route
router.get("/test-mail", async (req, res) => {
  try {
    const raw = makeEmail(
      "pixelartswebsite@gmail.com",
      process.env.MAIL_USER,
      "Test Email",
      "<p>This is a test email using Gmail API + OAuth2.</p>"
    );

    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });

    res.send("Mail sent successfully via Gmail API!");
  } catch (err) {
    console.error("Test mail error:", err);
    res.status(500).send("Mail failed: " + err.message);
  }
});

// Contact form
router.post("/send-mail", async (req, res) => {
  const { name, email, phone, comments } = req.body;

  try {
    const raw = makeEmail(
      process.env.MAIL_USER,
      process.env.MAIL_USER,
      `New Contact Form Submission from ${name}`,
      `
        <h3>Contact Details</h3>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Message:</strong> ${comments}</p>
      `
    );

    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });

    res.header("Access-Control-Allow-Origin", process.env.FRONTEND_URL);
    res.header("Access-Control-Allow-Credentials", true);
    res.status(200).json({ message: "Mail sent successfully via Gmail API!" });
  } catch (err) {
    console.error("Error sending mail:", err);
    res.header("Access-Control-Allow-Origin", process.env.FRONTEND_URL);
    res.header("Access-Control-Allow-Credentials", true);
    res.status(500).json({ message: "Failed to send mail" });
  }
});

module.exports = router;
