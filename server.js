const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'tradevault_secret_change_in_production';

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Multer for chart screenshots
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/charts';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// DB Connection Pool
const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASS     || '',
  database: process.env.DB_NAME     || 'tradevault',
  port:     process.env.DB_PORT     || 3306,  
  waitForConnections: true,
  connectionLimit: 10
});

// ─── AUTH MIDDLEWARE ─────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'TradeVault API running' }));

// ── AUTH ──────────────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'All fields required' });

  try {
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ? OR username = ?', [email, username]
    );
    if (existing.length) return res.status(409).json({ error: 'Email or username already taken' });

    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      [username, email, hash]
    );

    const token = jwt.sign({ id: result.insertId, username, email }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: result.insertId, username, email } });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed', detail: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      JWT_SECRET, { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: 'Login failed', detail: err.message });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, username, email, created_at FROM users WHERE id = ?', [req.user.id]
  );
  res.json(rows[0]);
});

// ── TRADES ────────────────────────────────────────────────────────────────────
app.get('/api/trades', authMiddleware, async (req, res) => {
  try {
    const { pair, outcome, session, from, to, limit = 50, offset = 0 } = req.query;
    let query = 'SELECT * FROM trades WHERE user_id = ?';
    const params = [req.user.id];

    if (pair)    { query += ' AND pair = ?';         params.push(pair); }
    if (outcome) { query += ' AND outcome = ?';      params.push(outcome); }
    if (session) { query += ' AND session = ?';      params.push(session); }
    if (from)    { query += ' AND trade_date >= ?';  params.push(from); }
    if (to)      { query += ' AND trade_date <= ?';  params.push(to); }

    query += ' ORDER BY trade_date DESC, created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [trades] = await pool.query(query, params);
    // Parse JSON tags
    trades.forEach(t => {
      try { t.smc_tags = JSON.parse(t.smc_tags || '[]'); } catch { t.smc_tags = []; }
    });
    res.json(trades);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trades', detail: err.message });
  }
});

app.post('/api/trades', authMiddleware, async (req, res) => {
  const {
    pair, trade_type, session, entry_price, exit_price,
    stop_loss, take_profit, lot_size, outcome, pnl,
    risk_reward, smc_tags, notes, trade_date, chart_url
  } = req.body;

  if (!pair || !trade_type || !entry_price || !outcome || !trade_date)
    return res.status(400).json({ error: 'Required: pair, trade_type, entry_price, outcome, trade_date' });

  try {
    const [result] = await pool.query(
      `INSERT INTO trades 
       (user_id, pair, trade_type, session, entry_price, exit_price, stop_loss,
        take_profit, lot_size, outcome, pnl, risk_reward, smc_tags, notes, trade_date, chart_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id, pair, trade_type, session || null,
        entry_price, exit_price || null, stop_loss || null,
        take_profit || null, lot_size || null, outcome,
        pnl || null, risk_reward || null,
        JSON.stringify(smc_tags || []),
        notes || null, trade_date, chart_url || null
      ]
    );
    const [rows] = await pool.query('SELECT * FROM trades WHERE id = ?', [result.insertId]);
    const trade = rows[0];
    try { trade.smc_tags = JSON.parse(trade.smc_tags || '[]'); } catch { trade.smc_tags = []; }
    res.status(201).json(trade);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create trade', detail: err.message });
  }
});

app.put('/api/trades/:id', authMiddleware, async (req, res) => {
  const {
    pair, trade_type, session, entry_price, exit_price,
    stop_loss, take_profit, lot_size, outcome, pnl,
    risk_reward, smc_tags, notes, trade_date, chart_url
  } = req.body;

  try {
    const [existing] = await pool.query(
      'SELECT id FROM trades WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]
    );
    if (!existing.length) return res.status(404).json({ error: 'Trade not found' });

    await pool.query(
      `UPDATE trades SET pair=?, trade_type=?, session=?, entry_price=?, exit_price=?,
       stop_loss=?, take_profit=?, lot_size=?, outcome=?, pnl=?, risk_reward=?,
       smc_tags=?, notes=?, trade_date=?, chart_url=? WHERE id = ? AND user_id = ?`,
      [
        pair, trade_type, session || null, entry_price, exit_price || null,
        stop_loss || null, take_profit || null, lot_size || null,
        outcome, pnl || null, risk_reward || null,
        JSON.stringify(smc_tags || []),
        notes || null, trade_date, chart_url || null,
        req.params.id, req.user.id
      ]
    );
    const [rows] = await pool.query('SELECT * FROM trades WHERE id = ?', [req.params.id]);
    const trade = rows[0];
    try { trade.smc_tags = JSON.parse(trade.smc_tags || '[]'); } catch { trade.smc_tags = []; }
    res.json(trade);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update trade', detail: err.message });
  }
});

app.delete('/api/trades/:id', authMiddleware, async (req, res) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM trades WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Trade not found' });
    res.json({ message: 'Trade deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete trade' });
  }
});

// ── ANALYTICS ─────────────────────────────────────────────────────────────────
app.get('/api/analytics', authMiddleware, async (req, res) => {
  try {
    const uid = req.user.id;
    const { from, to } = req.query;
    let dateFilter = '';
    const params = [uid];
    if (from) { dateFilter += ' AND trade_date >= ?'; params.push(from); }
    if (to)   { dateFilter += ' AND trade_date <= ?'; params.push(to); }

    // Overview stats
    const [overview] = await pool.query(`
      SELECT
        COUNT(*) AS total_trades,
        SUM(CASE WHEN outcome='win' THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN outcome='loss' THEN 1 ELSE 0 END) AS losses,
        SUM(CASE WHEN outcome='breakeven' THEN 1 ELSE 0 END) AS breakevens,
        ROUND(SUM(CASE WHEN outcome='win' THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0) * 100, 2) AS win_rate,
        ROUND(AVG(risk_reward), 2) AS avg_rr,
        ROUND(SUM(pnl), 2) AS total_pnl,
        ROUND(AVG(pnl), 2) AS avg_pnl,
        ROUND(MAX(pnl), 2) AS best_trade,
        ROUND(MIN(pnl), 2) AS worst_trade
      FROM trades WHERE user_id = ? ${dateFilter}
    `, params);

    // By pair
    const [byPair] = await pool.query(`
      SELECT pair,
        COUNT(*) AS total,
        SUM(CASE WHEN outcome='win' THEN 1 ELSE 0 END) AS wins,
        ROUND(SUM(CASE WHEN outcome='win' THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0)*100,1) AS win_rate,
        ROUND(SUM(pnl),2) AS total_pnl
      FROM trades WHERE user_id = ? ${dateFilter}
      GROUP BY pair ORDER BY total DESC
    `, params);

    // By session
    const [bySession] = await pool.query(`
      SELECT session,
        COUNT(*) AS total,
        SUM(CASE WHEN outcome='win' THEN 1 ELSE 0 END) AS wins,
        ROUND(SUM(CASE WHEN outcome='win' THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0)*100,1) AS win_rate,
        ROUND(SUM(pnl),2) AS total_pnl
      FROM trades WHERE user_id = ? ${dateFilter} AND session IS NOT NULL
      GROUP BY session
    `, params);

    // SMC tag performance (flatten from JSON)
    const [allTrades] = await pool.query(
      `SELECT smc_tags, outcome, pnl FROM trades WHERE user_id = ? ${dateFilter}`, params
    );
    const tagStats = {};
    allTrades.forEach(t => {
      let tags = [];
      try { tags = JSON.parse(t.smc_tags || '[]'); } catch {}
      tags.forEach(tag => {
        if (!tagStats[tag]) tagStats[tag] = { total: 0, wins: 0, pnl: 0 };
        tagStats[tag].total++;
        if (t.outcome === 'win') tagStats[tag].wins++;
        tagStats[tag].pnl += (t.pnl || 0);
      });
    });
    const byTag = Object.entries(tagStats).map(([tag, s]) => ({
      tag, total: s.total, wins: s.wins,
      win_rate: s.total ? Math.round(s.wins / s.total * 100) : 0,
      total_pnl: Math.round(s.pnl * 100) / 100
    }));

    // Cumulative PnL by date
    const [dailyPnl] = await pool.query(`
      SELECT trade_date, ROUND(SUM(pnl),2) AS daily_pnl
      FROM trades WHERE user_id = ? ${dateFilter} AND pnl IS NOT NULL
      GROUP BY trade_date ORDER BY trade_date ASC
    `, params);

    // Running cumulative
    let cumulative = 0;
    const cumulativePnl = dailyPnl.map(d => {
      cumulative += (d.daily_pnl || 0);
      return { date: d.trade_date, daily: d.daily_pnl, cumulative: Math.round(cumulative * 100) / 100 };
    });

    res.json({
      overview: overview[0],
      byPair, bySession, byTag,
      cumulativePnl
    });
  } catch (err) {
    res.status(500).json({ error: 'Analytics failed', detail: err.message });
  }
});

// ── CHART UPLOAD ──────────────────────────────────────────────────────────────
app.post('/api/upload/chart', authMiddleware, upload.single('chart'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/charts/${req.file.filename}`;
  res.json({ url });
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`🚀 TradeVault API running on port ${PORT}`));
