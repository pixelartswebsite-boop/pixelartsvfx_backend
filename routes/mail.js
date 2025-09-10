const express = require("express");
const nodemailer = require("nodemailer");
require("dotenv").config();

const router = express.Router();

router.get("/test-mail", async (req, res) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.MAIL_USER,
      to: "pixelartswebsite@gmail.com",
      subject: "Test Email",
      text: "This is a test email from Nodemailer.",
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
    // Configure transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.MAIL_USER, // your Gmail
        pass: process.env.MAIL_PASS, // your App Password
      },
    });

    // Send mail
    await transporter.sendMail({
      from: `"${name}" <${process.env.MAIL_USER}>`, // always your account
      to: "pixelartswebsite@gmail.com", // receive in same account
      replyTo: email, // 👈 important: replies go to visitor
      subject: "New Contact Form Submission",
      html: `
        <h3>Contact Details</h3>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Message:</strong> ${comments}</p>
      `,
    });

    res.status(200).json({ message: "Mail sent successfully!" });
  } catch (err) {
    console.error("Error sending mail:", err);
    res.status(500).json({ message: "Failed to send mail" });
  }
});

module.exports = router;
