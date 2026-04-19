const express = require('express');
const { pool } = require('../config/db');
const router = express.Router();

// ── Allowlist: only these tables can be viewed or cleared ─────────────────────
const ESSENTIAL_TABLES = ['plms_critical_events', 'plms_system_config', 'users'];

// ── GET /api/database/overview ────────────────────────────────────────────────
router.get('/overview', async (req, res) => {
  try {
    const sizeRes = await pool.query(
      'SELECT pg_size_pretty(pg_database_size(current_database())) as size, current_database() as db_name'
    );

    const tables = [];
    for (const tableName of ESSENTIAL_TABLES) {
      try {
        const countRes = await pool.query(`SELECT COUNT(*) FROM "${tableName}"`);
        tables.push({ name: tableName, rowCount: parseInt(countRes.rows[0].count, 10) });
      } catch {
        tables.push({ name: tableName, rowCount: 0 });
      }
    }

    res.json({
      database: sizeRes.rows[0].db_name,
      size: sizeRes.rows[0].size,
      tables,
    });
  } catch (err) {
    console.error('[DB Route] Error fetching overview:', err.message);
    res.status(500).json({ error: 'Failed to fetch database overview' });
  }
});

// ── GET /api/database/table/:name ─────────────────────────────────────────────
router.get('/table/:name', async (req, res) => {
  const tableName = req.params.name;

  if (!ESSENTIAL_TABLES.includes(tableName)) {
    return res.status(403).json({ error: 'Access restricted to essential tables only' });
  }

  try {
    // Mask password for users table
    let query = `SELECT * FROM "${tableName}" ORDER BY id DESC LIMIT 100`;
    const dataRes = await pool.query(query);

    let rows = dataRes.rows;
    if (tableName === 'users') {
      rows = rows.map(r => ({ ...r, password: '••••••••••••••••' }));
    }

    const colsRes = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
      [tableName]
    );

    res.json({
      table: tableName,
      columns: colsRes.rows.map(c => ({ name: c.column_name, type: c.data_type })),
      rows,
    });
  } catch (err) {
    console.error(`[DB Route] Error fetching table ${tableName}:`, err.message);
    res.status(500).json({ error: `Failed to fetch table ${tableName}` });
  }
});

// ── DELETE /api/database/table/:name/clear ────────────────────────────────────
// Clears ALL rows from a table (TRUNCATE with reset of serial IDs).
// Only allowed for plms_critical_events (not users or system_config).
const CLEARABLE_TABLES = ['plms_critical_events'];

router.delete('/table/:name/clear', async (req, res) => {
  const tableName = req.params.name;

  if (!CLEARABLE_TABLES.includes(tableName)) {
    return res.status(403).json({ error: `Table "${tableName}" cannot be cleared via the dashboard` });
  }

  try {
    await pool.query(`TRUNCATE TABLE "${tableName}" RESTART IDENTITY`);
    console.log(`[DB Route] ✅ Table "${tableName}" cleared by dashboard`);
    res.json({ success: true, message: `Table "${tableName}" cleared successfully` });
  } catch (err) {
    console.error(`[DB Route] Error clearing table ${tableName}:`, err.message);
    res.status(500).json({ error: `Failed to clear table ${tableName}` });
  }
});

module.exports = router;
