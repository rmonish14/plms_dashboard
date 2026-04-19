const { pool } = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// LIVE THRESHOLD CACHE
// Loaded from PostgreSQL every 30 seconds — no server restart needed.
// ─────────────────────────────────────────────────────────────────────────────
let cachedConfig = null;
let lastConfigLoad = 0;
const CONFIG_TTL_MS = 30_000; // refresh every 30s
const CONFIG_KEY    = 'plms_system_settings';

async function getConfig() {
  const now = Date.now();
  if (cachedConfig && (now - lastConfigLoad) < CONFIG_TTL_MS) return cachedConfig;

  try {
    const { rows } = await pool.query(
      'SELECT value FROM plms_system_config WHERE key = $1', [CONFIG_KEY]
    );
    if (rows.length > 0) {
      cachedConfig    = rows[0].value;
      lastConfigLoad  = now;
      console.log('[MQTT] ✅ Thresholds refreshed from DB');
    }
  } catch (err) {
    console.error('[MQTT] ⚠ Could not load config from DB — using cached/defaults:', err.message);
  }

  // Absolute fallback if DB is unreachable and cache is empty
  if (!cachedConfig) {
    cachedConfig = {
      thresholds: {
        vib: 5, vibMin: 0,
        current: 20, currentMin: 0,
        temp: 60, tempMin: 0,
        hum: 50, humMin: 0,
      },
      alertMessages: {
        vibHigh: 'Vibration has exceeded the safe limit — mechanical inspection required.',
        vibLow:  'Vibration reading is abnormally low — sensor may be faulty.',
        currentHigh: 'Current is above the safe threshold — risk of motor overload.',
        currentLow:  'Current reading is abnormally low — motor might be decoupled.',
        tempHigh: 'Temperature exceeds safe operating limit — overheating risk.',
        tempLow:  'Temperature is abnormally low — sensor fault suspected.',
        humHigh:  'Humidity level is too high — moisture risk for electricals.',
        humLow:   'Humidity reading is abnormally low.',
      }
    };
  }

  return cachedConfig;
}

// Force-expire the cache so the next message picks up new config immediately
// Called by the config PUT route after a save (optional enhancement)
function invalidateConfigCache() {
  lastConfigLoad = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: upsert device registration
// ─────────────────────────────────────────────────────────────────────────────
async function upsertDevice(deviceId) {
  try {
    await pool.query(
      `INSERT INTO plms_devices (device_id) VALUES ($1) ON CONFLICT (device_id) DO NOTHING`,
      [deviceId]
    );
  } catch (err) {
    console.error(`[MQTT] Failed to upsert device ${deviceId}:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: check a single metric against high + low limits
// Returns an alert object or null
// ─────────────────────────────────────────────────────────────────────────────
function checkMetric({ nodeId, metric, value, high, low, msgHigh, msgLow }) {
  if (value > high) {
    return {
      id:        `${nodeId}-${metric}-high-${Date.now()}`,
      nodeId,
      metric,
      value,
      limit:     high,
      direction: 'high',
      message:   msgHigh || `${metric.toUpperCase()} exceeded limit (${value} > ${high})`,
      severity:  'critical',
      timestamp: new Date().toISOString(),
    };
  }
  if (low !== undefined && low !== null && value <= low && value >= 0) {
    return {
      id:        `${nodeId}-${metric}-low-${Date.now()}`,
      nodeId,
      metric,
      value,
      limit:     low,
      direction: 'low',
      message:   msgLow || `${metric.toUpperCase()} is below minimum threshold (${value} ≤ ${low})`,
      severity:  'warning',
      timestamp: new Date().toISOString(),
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// State variable for custom ESP32 integration
// ─────────────────────────────────────────────────────────────────────────────
const customMachineState = {
  deviceId: 'machine-alpha-custom',
  vib: 0, temp: 0, hum: 0, current: 0, dist: 0, obj_det: 0,
  relay: 'ON', mode: 'MANUAL', ml_status: null
};

// ─────────────────────────────────────────────────────────────────────────────
// Main message handler
// ─────────────────────────────────────────────────────────────────────────────
async function handleMessage(topic, message, io, mqttClient) {
  // ── CUSTOM ESP32 INTEGRATION ───────────────────────────────────────────────
  if (topic.startsWith('machine/sensor/')) {
    const parts = topic.split('/');
    const sensor = parts[parts.length - 1];
    const val = parseFloat(message.toString()) || 0;

    if (sensor === 'temp') customMachineState.temp = val;
    else if (sensor === 'hum') customMachineState.hum = val;
    else if (sensor === 'vibration') customMachineState.vib = val;
    else if (sensor === 'object_detect') customMachineState.obj_det = val;
    else if (sensor === 'distance') customMachineState.dist = val;
    else if (sensor === 'relay') customMachineState.relay = message.toString() === 'ON' ? 'ON' : 'OFF';
    else if (sensor === 'mode') customMachineState.mode = message.toString() === 'AUTO' ? 'AUTO' : 'MANUAL';

    const deviceId = customMachineState.deviceId;
    await upsertDevice(deviceId);

    // Broadcast live telemetry to dashboard
    io.emit('node_data', {
      nodeId: deviceId,
      vib: customMachineState.vib,
      temp: customMachineState.temp,
      hum: customMachineState.hum,
      current: customMachineState.current,
      dist: customMachineState.dist,
      obj_det: customMachineState.obj_det,
      relay: customMachineState.relay,
      mode: customMachineState.mode,
      ml_status: customMachineState.ml_status,
      timestamp: new Date().toISOString()
    });

    // Mark online
    io.emit('node_status', { nodeId: deviceId, status: 'online' });

    // Load current thresholds
    const cfg = await getConfig();
    const T   = cfg.thresholds   || {};
    const M   = cfg.alertMessages || {};

    const checks = [
      checkMetric({ nodeId: deviceId, metric: 'vib',  value: customMachineState.vib,  high: T.vib  ?? 5,  low: T.vibMin  ?? 0, msgHigh: M.vibHigh,  msgLow: M.vibLow  }),
      checkMetric({ nodeId: deviceId, metric: 'temp', value: customMachineState.temp, high: T.temp ?? 60, low: T.tempMin ?? 0, msgHigh: M.tempHigh, msgLow: M.tempLow }),
      checkMetric({ nodeId: deviceId, metric: 'hum',  value: customMachineState.hum,  high: T.hum  ?? 50, low: T.humMin  ?? 0, msgHigh: M.humHigh,  msgLow: M.humLow  }),
    ].filter(Boolean);

    for (const alert of checks) {
      io.emit('new_alert', alert);
    }
    return;
  }

  const parts = topic.split('/');
  if (parts.length < 3) return;

  const nodeId  = parts[1];
  const msgType = parts[2];

  // ── DATA packets ────────────────────────────────────────────────────────────
  if (msgType === 'data') {
    let payload;
    try {
      payload = JSON.parse(message.toString());
    } catch {
      console.error(`[MQTT] ❌ Invalid JSON from ${nodeId}`);
      return;
    }

    const deviceId    = payload.device_id   || nodeId;
    const vib         = parseFloat(payload.vib ?? 0);
    const temp        = parseFloat(payload.temp ?? payload.temperature ?? 0);
    const hum         = parseFloat(payload.hum ?? payload.humidity ?? 0);
    const current     = parseFloat(payload.current ?? 0);
    const lat         = payload.lat  != null ? parseFloat(payload.lat)  : null;
    const long        = payload.lon  != null ? parseFloat(payload.lon)  :  // ESP sends 'lon'
                        payload.long != null ? parseFloat(payload.long) : null;
    const relay      = payload.relay      ?? null;   // 'ON' | 'OFF' | null
    const mode       = payload.mode       ?? null;   // 'AUTO' | 'MANUAL' | null
    const ml_status  = payload.ml_status  ?? payload.air_status ?? null;   // ML label from ESP edge model

    console.log(`[MQTT] 📡 ${deviceId}: VIB=${vib} TEMP=${temp} HUM=${hum} CURRENT=${current} Relay=${relay} Mode=${mode} ML=${ml_status}`);

    await upsertDevice(deviceId);

    // Broadcast live telemetry to dashboard (relay, mode, ml_status passthrough)
    io.emit('node_data', { nodeId: deviceId, vib, temp, hum, current, lat, long, relay, mode, ml_status, timestamp: new Date().toISOString() });

    // ── Load current thresholds + messages from DB ─────────────────────────
    const cfg = await getConfig();
    const T   = cfg.thresholds   || {};
    const M   = cfg.alertMessages || {};

    // ── Evaluate all metrics against high + low limits ──────────────────────
    const checks = [
      checkMetric({ nodeId: deviceId, metric: 'vib',      value: vib,      high: T.vib     ?? 5,   low: T.vibMin     ?? 0, msgHigh: M.vibHigh,     msgLow: M.vibLow     }),
      checkMetric({ nodeId: deviceId, metric: 'current',  value: current,  high: T.current ?? 20,  low: T.currentMin ?? 0, msgHigh: M.currentHigh, msgLow: M.currentLow }),
      checkMetric({ nodeId: deviceId, metric: 'temp',     value: temp,     high: T.temp    ?? 60,  low: T.tempMin    ?? 0, msgHigh: M.tempHigh,    msgLow: M.tempLow    }),
      checkMetric({ nodeId: deviceId, metric: 'hum',      value: hum,      high: T.hum     ?? 50,  low: T.humMin     ?? 0, msgHigh: M.humHigh,     msgLow: M.humLow     }),
    ].filter(Boolean);

    let hasCriticalHigh = false;

    // ── Emit each breach as a new_alert event ──────────────────────────────
    for (const alert of checks) {
      console.log(`[ALERT] ${alert.severity.toUpperCase()} — ${alert.nodeId} ${alert.metric}: ${alert.value} (${alert.direction} limit: ${alert.limit})`);
      io.emit('new_alert', alert);

      if (alert.direction === 'high') {
         hasCriticalHigh = true;
      }

      // Persist to critical_events table
      try {
        await pool.query(
          `INSERT INTO plms_critical_events (device_id, vib, current, temperature, humidity, status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [deviceId, vib, current, temp, hum, `${alert.metric.toUpperCase()}_${alert.direction.toUpperCase()}_BREACH`]
        );
      } catch (err) {
        console.error(`[DB] Failed to log critical event:`, err.message);
      }
    }

    // ── Autonomous Auto-Shutdown / Turn-On Logic ──────────────────────────────
    if (mode === 'AUTO' && mqttClient) {
       const controlTopic = `plms/${deviceId}/control`;
       if (hasCriticalHigh && relay === 'ON') {
          console.log(`[AUTONOMOUS] 🛑 Threshold breach detected! Sending emergency shutdown to ${deviceId}`);
          mqttClient.publish(controlTopic, JSON.stringify({ relay: 'OFF', mode: 'AUTO', ts: new Date().toISOString() }), { qos: 1 });
       } else if (!hasCriticalHigh && relay === 'OFF') {
          console.log(`[AUTONOMOUS] 🟢 Sensors normalized. Sending automatic turn-on to ${deviceId}`);
          mqttClient.publish(controlTopic, JSON.stringify({ relay: 'ON', mode: 'AUTO', ts: new Date().toISOString() }), { qos: 1 });
       }
    }
  }

  // ── STATUS packets ───────────────────────────────────────────────────────────
  if (msgType === 'status') {
    const statusText = message.toString().toLowerCase() === 'online' ? 'online' : 'offline';
    try {
      await upsertDevice(nodeId);
      io.emit('node_status', { nodeId, status: statusText });
      console.log(`[MQTT] ${statusText === 'online' ? '🟢' : '🔴'} Status for ${nodeId}: ${statusText}`);

      if (statusText === 'offline') {
        await pool.query(
          `INSERT INTO plms_critical_events (device_id, status) VALUES ($1, $2)`,
          [nodeId, 'NODE_OFFLINE_DROP']
        );
        io.emit('new_alert', {
          id:        `${nodeId}-offline-${Date.now()}`,
          nodeId,
          metric:    'connectivity',
          direction: 'offline',
          message:   `Node ${nodeId} has gone offline — no heartbeat received.`,
          severity:  'critical',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error(`[MQTT] Status update failed for ${nodeId}:`, err.message);
    }
  }
}

module.exports = { handleMessage, invalidateConfigCache };
