const express = require('express');
const router = express.Router();
const Config = require('../models/Config');

// Get configuration
router.get('/', async (req, res) => {
  try {
    let config = await Config.findOne({ key: 'system_settings' });
    if (!config) {
      config = await Config.create({ key: 'system_settings' }); // Creates with defaults
    }
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch config', details: err.message });
  }
});

// Update configuration
router.put('/', async (req, res) => {
  try {
    const updated = await Config.findOneAndUpdate(
      { key: 'system_settings' },
      { $set: req.body },
      { new: true, upsert: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update config', details: err.message });
  }
});

module.exports = router;
