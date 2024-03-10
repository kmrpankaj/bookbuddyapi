const express = require('express');
const { Resend } = require('resend');

// Initialize your Resend client with your API key
const resend = new Resend('re_KUJpjvYH_9M4jU7u1N25CKkAG4H8qRzmK');

const router = express.Router();

// Define a route for sending emails
router.post('/send', async (req, res) => {
  const { to, subject, html } = req.body; // Assuming these details are passed in the request body

  const { data, error } = await resend.emails.send({
    from: '"BookBuddy" <info@bookbuddy.co.in>', // This can be customized or made dynamic
    to: to,
    subject: subject,
    html: html,
  });

  if (error) {
    return res.status(400).json({ error });
  }

  res.status(200).json({ message: 'Email sent successfully', data });
});

module.exports = router;