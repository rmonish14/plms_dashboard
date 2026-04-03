const mqtt = require('mqtt');

// ─────────────────────────────────────────────────────────────────────────────
// AQMS Simulator — publishes to HiveMQ (same broker as ESP32 hardware)
// Topic format: plms/<nodeId>/data   (matches backend wildcard)
// ─────────────────────────────────────────────────────────────────────────────
const BROKER_URL = process.env.HIVEMQ_URL || 'mqtt://broker.hivemq.com:1883';
const PUBLISH_INTERVAL_MS = 5000;

const STATIC_NODES  = ['machine-alpha-001', 'machine-beta-002', 'machine-gamma-003', 'machine-delta-004'];
const WORKER_NODES  = ['spares_01_bearing', 'spares_02_motor'];
const ALL_NODES     = [...STATIC_NODES, ...WORKER_NODES];

const client = mqtt.connect(BROKER_URL, {
  clientId: `aqms-simulator-${Math.random().toString(16).slice(2, 8)}`,
  clean: true,
  reconnectPeriod: 5000,
});

client.on('connect', () => {
  console.log(`[Simulator] ✅ Connected to HiveMQ at ${BROKER_URL}`);

  // Publish initial online status for all nodes
  for (const nodeId of ALL_NODES) {
    publishStatus(nodeId, 'online');
  }

  // Begin periodic telemetry simulation
  for (const nodeId of ALL_NODES) {
    simulateNode(nodeId);
  }
});

client.on('error', (err) => {
  console.error('[Simulator] ❌ Connection error:', err.message);
});

client.on('reconnect', () => {
  console.log('[Simulator] Reconnecting to HiveMQ...');
});

function simulateNode(nodeId) {
  // Add random startup jitter so nodes don't all fire simultaneously
  const jitter = Math.random() * 2000;
  setTimeout(() => {
    setInterval(() => {
      publishData(nodeId);
    }, PUBLISH_INTERVAL_MS + jitter);
  }, jitter);
}

function publishStatus(nodeId, status) {
  // New topic format: plms/<nodeId>/status
  const topic = `plms/${nodeId}/status`;
  client.publish(topic, status, { retain: true, qos: 1 });
  console.log(`[${nodeId}] 📡 Status → ${status}`);
}

function publishData(nodeId) {
  const isWorker = nodeId.startsWith('spares_');

  // Ensure values strictly stay below thresholds to avoid dummy DB alerts & auto-shutdowns
  const vib = Math.random() * (isWorker ? 1.5 : 3.5);
  const current = Math.random() * (isWorker ? 5 : 15);

  const payload = {
    timestamp:   new Date().toISOString(),
    vib:         parseFloat(vib.toFixed(2)),
    current:     parseFloat(current.toFixed(2)),
    temperature: parseFloat((Math.random() * 20 + 25).toFixed(1)), // 25-45C
    humidity:    Math.floor(Math.random() * 15) + 30, // 30-45%
  };

  // New topic format: plms/<nodeId>/data  ← matches ESP32 and backend wildcard
  const topic = `plms/${nodeId}/data`;
  client.publish(topic, JSON.stringify(payload), { qos: 1 });
  console.log(`[${nodeId}] 📊 VIB=${payload.vib} CURRENT=${payload.current} Temp=${payload.temperature}`);
}

// Graceful shutdown — mark all nodes offline before exiting
process.on('SIGINT', () => {
  console.log('\n[Simulator] Shutting down — marking all nodes offline...');
  for (const nodeId of ALL_NODES) {
    publishStatus(nodeId, 'offline');
  }
  setTimeout(() => {
    client.end();
    process.exit(0);
  }, 1500);
});
