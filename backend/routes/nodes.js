const express = require('express');
const Node = require('../models/Node');
const { Pool } = require('pg');

const PG_URI = 'postgresql://aqms_user:EwazH8Iks5Hb2EjRDC4rlFeOWkNUBpXQ@dpg-d74l6ne3jp1c7395i7o0-a.singapore-postgres.render.com/aqms';
const pgPool = new Pool({ connectionString: PG_URI, ssl: { rejectUnauthorized: false } });


const router = express.Router();

// Get all nodes
router.get('/', async (req, res) => {
  try {
    const nodes = await Node.find({});
    res.json(nodes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch nodes' });
  }
});

// Get node by ID
router.get('/:id', async (req, res) => {
  try {
    const node = await Node.findOne({ nodeId: req.params.id });
    if (!node) return res.status(404).json({ error: 'Node not found' });
    res.json(node);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching node' });
  }
});

// Get critical anomalous events for a node (From PostgreSQL)
router.get('/:id/events', async (req, res) => {
  const { id } = req.params;
  try {
    const query = `
      SELECT * FROM critical_sensor_events 
      WHERE node_id = $1 
      ORDER BY timestamp DESC 
      LIMIT 100
    `;
    const { rows } = await pgPool.query(query, [id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching anomaly data' });
  }
});

// Get ALL fleet anomalies (for the Analytics Dashboard)
router.get('/fleet/anomalies', async (req, res) => {
  try {
    // Return last 24h of critical anomalies across the entire fleet
    const query = `
      SELECT * FROM critical_sensor_events 
      WHERE timestamp >= NOW() - INTERVAL '24 hours'
      ORDER BY timestamp DESC
    `;
    const { rows } = await pgPool.query(query);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching fleet anomalies' });
  }
});

module.exports = router;
