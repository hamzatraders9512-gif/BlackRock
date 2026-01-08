require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

// Load DB utilities
const db = require(path.join(__dirname, '..', 'api', 'lib', 'db'));

const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/black-rock-login';

async function main() {
  try {
    console.log('Connecting to MongoDB...', MONGO);
    await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    console.log('Running ensureDailyRewardsForToday()');
    await db.ensureDailyRewardsForToday();
    console.log('Running processDailyEarnings()');
    await db.processDailyEarnings();

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await db.TransactionHistory.find({ type: 'earnings', submittedAt: { $gte: since } }).sort({ submittedAt: -1 }).limit(50).lean();

    console.log(`Recent earnings (last 24h): ${recent.length}`);
    recent.forEach(r => {
      console.log(`- ${r._id} | user=${r.userId} amount=${r.amount} at=${r.submittedAt} details=${JSON.stringify(r.details)}`);
    });

    const users = [...new Set(recent.map(r => r.userId))];
    for (const u of users) {
      const bal = await db.getBalanceSummary(u);
      console.log('Balance summary for', u, ':', bal);
    }

    await mongoose.disconnect();
    console.log('Done');
    process.exit(0);
  } catch (err) {
    console.error('Error running trigger:', err);
    try { await mongoose.disconnect(); } catch (e) {}
    process.exit(1);
  }
}

main();
