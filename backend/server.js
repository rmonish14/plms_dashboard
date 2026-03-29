require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const mqtt = require('mqtt');
const { Server } = require('socket.io');

// Database Models
const Node = require('./models/Node');
const Alert = require('./models/Alert');
const Config = require('./models/Config');
const { Pool } = require('pg');

// ── PostgreSQL (Render) ──────────────────────────────────────────────────────
const PG_URI = process.env.PG_URI || 'postgresql://aqms_user:EwazH8Iks5Hb2EjRDC4rlFeOWkNUBpXQ@dpg-d74l6ne3jp1c7395i7o0-a.singapore-postgres.render.com/aqms';
const pgPool = new Pool({
  connectionString: PG_URI,
  ssl: { rejectUnauthorized: false }
});

pgPool.query(`
CREATE TABLE IF NOT EXISTS critical_sensor_events (
  id SERIAL PRIMARY KEY,
  node_id VARCHAR(50) NOT NULL,
  event_category VARCHAR(30) NOT NULL,
  aqi INTEGER,
  pm2_5 REAL,
  co_ppm REAL,
  co2_ppm INTEGER,
  temperature REAL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
`).then(() => console.log('[DB] PostgreSQL Anomalies Table Ready'))
  .catch(err => console.error('[DB] PostgreSQL Init Error:', err));

// ── Express + Socket.io ──────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/aqms';

// ── MongoDB ──────────────────────────────────────────────────────────────────
mongoose.connect(MONGO_URI)
  .then(() => console.log('[DB] Connected to MongoDB'))
  .catch(err => console.error('[DB] MongoDB Connection Error:', err));

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/nodes', require('./routes/nodes'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/config', require('./routes/config'));
const emailModule = require('./routes/email');
app.use('/api/email', emailModule.router);

// ── WebSocket ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('[WS] Dashboard connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('[WS] Dashboard disconnected:', socket.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MQTT CLOUD CLIENT — connects to public HiveMQ broker
// ESP32 publishes to:  aqms/<nodeId>/data
// Simulator publishes: aqms/<nodeId>/data
// Backend subscribes:  aqms/+/data  (wildcard catches all nodes)
// ─────────────────────────────────────────────────────────────────────────────
const HIVEMQ_BROKER = process.env.HIVEMQ_URL || 'mqtt://broker.hivemq.com:1883';

const mqttClient = mqtt.connect(HIVEMQ_BROKER, {
  clientId: `aqms-backend-${Math.random().toString(16).slice(2, 8)}`,
  clean: true,
  reconnectPeriod: 5000,
  connectTimeout: 30000,
});

mqttClient.on('connect', () => {
  console.log(`[MQTT] ✅ Connected to HiveMQ at ${HIVEMQ_BROKER}`);

  // Subscribe to all node data — ESP32 AND simulator nodes
  mqttClient.subscribe('aqms/+/data', { qos: 1 }, (err) => {
    if (err) console.error('[MQTT] Subscribe error:', err);
    else console.log('[MQTT] Subscribed to aqms/+/data (wildcard)');
  });

  // Subscribe to status pings
  mqttClient.subscribe('aqms/+/status', { qos: 0 }, (err) => {
    if (err) console.error('[MQTT] Subscribe error:', err);
    else console.log('[MQTT] Subscribed to aqms/+/status');
  });
});

mqttClient.on('reconnect', () => {
  console.log('[MQTT] Reconnecting to HiveMQ...');
});

mqttClient.on('error', (err) => {
  console.error('[MQTT] Connection error:', err.message);
});

// ─────────────────────────────────────────────────────────────────────────────
// MAIN MESSAGE HANDLER — processes every ESP32 + simulator packet
// ─────────────────────────────────────────────────────────────────────────────
mqttClient.on('message', async (topic, message) => {
  const parts = topic.split('/'); // ['aqms', '<nodeId>', 'data' | 'status']
  
  if (parts.length < 3) return;
  const nodeId = parts[1];
  const msgType = parts[2];

  // ─ DATA packets
  if (msgType === 'data') {
    try {
      const payload = JSON.parse(message.toString());
      console.log(`[MQTT] 📡 Data from ${nodeId}: AQI=${payload.aqi}`);

      // 1. Real-time broadcast to all connected dashboards
      io.emit('node_data', { nodeId, ...payload });

      // 2. Retrieve Global Thresholds from MongoDB
      let settings = await Config.findOne({ key: 'system_settings' });
      const aqiThreshold = settings?.thresholds?.aqi  ?? 150;
      const co2Threshold = settings?.thresholds?.co2  ?? 1000;

      // 3. EVENT-DRIVEN POSTGRESQL LOGGING — Only critical events
      if (payload.aqi > aqiThreshold || payload.co2 > co2Threshold) {
        const category = payload.aqi > aqiThreshold ? 'CRITICAL_AQI_SPIKE' : 'HAZARDOUS_GAS_DETECTED';
        await pgPool.query(
          `INSERT INTO critical_sensor_events (node_id, event_category, aqi, pm2_5, co_ppm, co2_ppm, temperature) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [nodeId, category, payload.aqi, payload.pm2_5, payload.co, payload.co2, payload.temp ?? payload.temperature]
        );
        console.log(`[PG] 🔴 Logged Anomaly: ${category} for ${nodeId}`);
      }

      // 4. Update MongoDB node heartbeat
      await Node.findOneAndUpdate(
        { nodeId },
        { lastSeen: new Date(), status: 'Online' },
        { upsert: true }
      );

      // 5. WebSocket Alert Broadcast + Automated Email on Critical
      if (payload.aqi > aqiThreshold) {
        const msg = `High AQI detected: ${payload.aqi} (Threshold: ${aqiThreshold})`;
        const alert = await Alert.create({ nodeId, type: 'Critical', message: msg, timestamp: new Date() });
        io.emit('alert_new', alert);

        // Auto-Email if a recipient is configured
        if (settings?.alertEmail) {
          emailModule.transporter.sendMail({
            from: '"AQMS Alert System" <no-reply@aqms-industrial.com>',
            to: settings.alertEmail,
            subject: `🚨 CRITICAL ALERT: ${nodeId} Exceeded Threshold`,
            html: `<div style="background:#450a0a;color:#fca5a5;padding:24px;font-family:sans-serif;border-radius:8px;">
                      <h2>🚨 HAZARD DETECTED</h2>
                      <p>${msg}</p>
                      <hr style="border-color:#7f1d1d;"/>
                      <p><strong>Node:</strong> ${nodeId}</p>
                      <p><strong>AQI:</strong> ${payload.aqi}</p>
                      <p><strong>CO2:</strong> ${payload.co2} ppm</p>
                      <p><strong>PM2.5:</strong> ${payload.pm2_5} µg/m³</p>
                      <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
                   </div>`
          }).catch(e => console.error('[Email] Automated dispatch failed:', e));
        }
      }
    } catch (err) {
      console.error(`[MQTT] ❌ Failed to parse data from ${nodeId}:`, err.message);
    }
  }

  // ─ STATUS packets
  if (msgType === 'status') {
    const statusText = message.toString().toLowerCase() === 'online' ? 'Online' : 'Offline';
    try {
      await Node.findOneAndUpdate({ nodeId }, { status: statusText, lastSeen: new Date() }, { upsert: true });
      io.emit('node_status', { nodeId, status: statusText });
      console.log(`[MQTT] ${statusText === 'Online' ? '🟢' : '🔴'} Status for ${nodeId}: ${statusText}`);

      // Log offline drops to PostgreSQL
      if (statusText === 'Offline') {
        pgPool.query(
          `INSERT INTO critical_sensor_events (node_id, event_category) VALUES ($1, $2)`,
          [nodeId, 'NODE_OFFLINE_DROP']
        ).catch(e => console.error('[PG] Error logging offline drop:', e));
      }
    } catch (err) {
      console.error(`[MQTT] Status update failed for ${nodeId}:`, err.message);
    }
  }
});

// ── Start API Server ─────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`[API] 🚀 Server running on port ${PORT}`);
});
