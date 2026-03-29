const express = require('express');
const Alert = require('../models/Alert');

const router = express.Router();

// Get all alerts
router.get('/', async (req, res) => {
  try {
    const alerts = await Alert.find({}).sort({ timestamp: -1 });
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

module.exports = router;
