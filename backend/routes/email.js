const express = require('express');
const nodemailer = require('nodemailer');
const Config = require('../models/Config');

const router = express.Router();

// Ethereal Transport for Development (Free SMTP)
let transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: {
        user: 'kassandra.glover@ethereal.email',
        pass: '6yC19B4C3g6SZNXStH' // ephemeral test account
    }
});

// Create manual share endpoint
router.post('/share', async (req, res) => {
  const { recipientEmail, subject, message, nodeData } = req.body;
  
  try {
    // If user provided a custom target, use it. Otherwise, pull strictly from DB config
    let targetEmail = recipientEmail;
    
    if (!targetEmail) {
       const settings = await Config.findOne({ key: 'system_settings' });
       targetEmail = settings?.alertEmail;
    }

    if (!targetEmail) {
       return res.status(400).json({ error: 'No recipient email configured in settings.' });
    }

    const htmlContent = `
      <div style="font-family: sans-serif; background: #1a1a1a; color: #eee; padding: 20px; border-radius: 8px;">
        <h2 style="color: #60a5fa;">AQMS Data Share</h2>
        <p>${message || 'A supervisor has shared a node telemetry card with you.'}</p>
        <hr style="border-color: #333;" />
        <p><strong>Node:</strong> ${nodeData?.id || nodeData?.nodeId || 'Unknown'}</p>
        <p><strong>AQI:</strong> ${nodeData?.aqi || 'N/A'}</p>
        <p><strong>Status:</strong> ${nodeData?.status || 'Offline'}</p>
        <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
      </div>
    `;

    let info = await transporter.sendMail({
      from: '"AQMS Alert System" <no-reply@aqms-industrial.com>',
      to: targetEmail,
      subject: subject || 'Shared Telemetry Data',
      html: htmlContent,
    });

    console.log('[Email] Share email sent. Preview URL:', nodemailer.getTestMessageUrl(info));
    res.json({ message: 'Email dispatched successfully', previewUrl: nodemailer.getTestMessageUrl(info) });

  } catch (err) {
    console.error('[Email] Error sending manual share:', err);
    res.status(500).json({ error: 'Failed to dispatch email.' });
  }
});

module.exports = {
  router,
  transporter
};
