const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const notify = require('../lib/notify');
const { ensureAuthenticated } = require('../middleware/auth');

// GET /api/user/balance
router.get('/balance', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.email;
    const summary = await db.getBalanceSummary(userId);
    res.json({
      currentBalance: summary.currentBalance || 0,
      totalDeposits: summary.totalDeposits || 0,
      totalEarnings: summary.totalEarnings || 0,
      totalWithdrawals: summary.totalWithdrawals || 0,
      lastUpdated: summary.lastUpdated || new Date()
    });
  } catch (err) {
    console.error('GET /api/user/balance error', err);
    res.status(500).json({ message: 'Error fetching balance' });
  }
});

// GET /api/user/balance-history?range=30d or ?days=30
router.get('/balance-history', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.email;
    let days = 30;
    if (req.query.range && typeof req.query.range === 'string' && req.query.range.endsWith('d')) {
      const n = parseInt(req.query.range.slice(0, -1), 10);
      if (!isNaN(n)) days = n;
    }
    if (req.query.days) {
      const d = parseInt(req.query.days, 10);
      if (!isNaN(d)) days = d;
    }

    // Get stored history entries
    const raw = await db.getBalanceHistory(userId, days);

    // Build complete day series and fill gaps with last known balance
    const series = [];
    const today = new Date();
    today.setHours(0,0,0,0);
    const start = new Date(today);
    start.setDate(start.getDate() - (days - 1));

    // Map raw by date string YYYY-MM-DD
    const byDate = {};
    for (const r of raw) byDate[r.date] = r.balance;

    let lastKnown = 0;
    // Try to set lastKnown from most recent raw entry before range
    if (raw.length > 0) {
      // Assume raw may not include a point for start; take last element's balance
      lastKnown = raw[raw.length - 1].balance || 0;
    } else {
      const summary = await db.getBalanceSummary(userId);
      lastKnown = summary.currentBalance || 0;
    }

    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = d.toISOString().split('T')[0];
      const bal = typeof byDate[key] === 'number' ? byDate[key] : lastKnown;
      if (typeof byDate[key] === 'number') lastKnown = byDate[key];
      series.push({ date: key, balance: Number(bal || 0) });
    }

    const summary = await db.getBalanceSummary(userId);
    res.json({
      currentBalance: summary.currentBalance || 0,
      chartData: series,
      lastUpdated: summary.lastUpdated || new Date()
    });
  } catch (err) {
    console.error('GET /api/user/balance-history error', err);
    res.status(500).json({ message: 'Error fetching balance history' });
  }
});

// SSE endpoint: GET /api/user/balance/stream
router.get('/balance/stream', ensureAuthenticated, (req, res) => {
  const userId = req.user.email;
  // Set SSE headers
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.flushHeaders && res.flushHeaders();

  const onUpdate = (payload) => {
    try {
      if (!payload || payload.userId !== userId) return;
      const data = JSON.stringify({
        currentBalance: payload.currentBalance,
        lastUpdated: payload.lastUpdated,
        recentEntry: payload.recentEntry || null
      });
      res.write(`event: balance_update\n`);
      res.write(`data: ${data}\n\n`);
    } catch (e) {
      console.error('SSE send error', e);
    }
  };

  notify.on('balance:update', onUpdate);

  // Send initial ping with current balance
  (async () => {
    try {
      const summary = await db.getBalanceSummary(userId);
      res.write(`event: balance_init\n`);
      res.write(`data: ${JSON.stringify({ currentBalance: summary.currentBalance || 0, lastUpdated: summary.lastUpdated })}\n\n`);
    } catch (e) { /* ignore */ }
  })();

  req.on('close', () => {
    notify.removeListener('balance:update', onUpdate);
    try { res.end(); } catch (e) {}
  });
});

module.exports = router;
