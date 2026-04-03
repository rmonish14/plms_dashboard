const express = require('express');
const { pool } = require('../config/db');

const router    = express.Router();
const CONFIG_KEY = 'plms_system_settings';

let handlerModule = null;
function getHandler() {
  if (!handlerModule) {
    try { handlerModule = require('../mqtt/handler'); } catch (_) {}
  }
  return handlerModule;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/config
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT value FROM plms_system_config WHERE key = $1', [CONFIG_KEY]
    );

    if (rows.length === 0) {
      const defaults = buildDefaults();
      await pool.query(
        `INSERT INTO plms_system_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
        [CONFIG_KEY, JSON.stringify(defaults)]
      );
      return res.json(defaults);
    }

    res.json(rows[0].value);
  } catch (err) {
    console.error('[Config] Failed to fetch config:', err.message);
    res.status(500).json({ error: 'Failed to fetch config', details: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/config
// Deep-merges the request body into the existing config
// ─────────────────────────────────────────────────────────────────────────────
router.put('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE plms_system_config
       SET value = value || $1::jsonb, updated_at = NOW()
       WHERE key = $2
       RETURNING value`,
      [JSON.stringify(req.body), CONFIG_KEY]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Config not found. Run the server once to initialise.' });
    }

    // Invalidate the MQTT handler cache so next message picks up new values immediately
    const handler = getHandler();
    if (handler && handler.invalidateConfigCache) handler.invalidateConfigCache();

    res.json(rows[0].value);
  } catch (err) {
    console.error('[Config] Failed to update config:', err.message);
    res.status(500).json({ error: 'Failed to update config', details: err.message });
  }
});

function buildDefaults() {
  return {
    thresholds: {
      vib:     5,   vibMin:  0,
      current: 20,  currentMin: 0,
      temp:    60,  tempMin: 0,
      hum:     50,  humMin:  0,
    },
    alertMessages: {
      vibHigh:     'Vibration has exceeded the safe limit — mechanical inspection required.',
      vibLow:      'Vibration reading is abnormally low — sensor may be faulty.',
      currentHigh: 'Current is above the safe threshold — risk of motor overload.',
      currentLow:  'Current reading is abnormally low — motor might be decoupled.',
      tempHigh:    'Temperature exceeds safe operating limit — overheating risk.',
      tempLow:     'Temperature is abnormally low — sensor fault suspected.',
      humHigh:     'Humidity level is too high — moisture risk for electricals.',
      humLow:      'Humidity reading is abnormally low.',
    },
    alertEmail: '',
    notifications: {
      emailEnabled: false,
      telegramEnabled: false,
      notifyOnWarn: true,
      notifyOnCrit: true,
    },
    mqtt: { host: 'broker.hivemq.com', port: '1883', tls: false },
  };
}

module.exports = router;
