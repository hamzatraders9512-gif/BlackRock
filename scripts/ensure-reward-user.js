#!/usr/bin/env node
require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/black-rock-login';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node scripts/ensure-reward-user.js <user-email>');
    process.exit(2);
  }

  try {
    console.log('Connecting to MongoDB...', MONGO);
    await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    // require db utilities after connecting
    const db = require(path.join(__dirname, '..', 'api', 'lib', 'db'));

    const userId = email;
    const todayStart = new Date();
    todayStart.setHours(0,0,0,0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(todayStart.getDate() + 1);

    console.log(`Checking approved daily-reward transactions for ${userId}...`);
    const txs = await db.TransactionHistory.find({
      userId,
      approvalStatus: 'approved',
      'planDetails.planType': 'daily-reward',
      'planDetails.roiPercentage': { $exists: true }
    });

    console.log(`Found ${txs.length} daily-reward tx(s)`);
    const credited = [];

    for (const tx of txs) {
      try {
        const existing = await db.TransactionHistory.findOne({
          userId: tx.userId,
          type: 'earnings',
          'details.sourceTxId': tx._id.toString(),
          submittedAt: { $gte: todayStart, $lt: tomorrowStart }
        });

        if (existing) {
          console.log(`- tx ${tx._id}: already credited today`);
          continue;
        }

        const pd = tx.planDetails || {};
        const roi = Number(pd.roiPercentage) || 0;
        if (roi <= 0) {
          console.log(`- tx ${tx._id}: roi not configured`);
          continue;
        }

        const dailyEarning = (tx.amount || 0) * (roi / 100);
        if (dailyEarning <= 0) {
          console.log(`- tx ${tx._id}: computed daily earning is 0`);
          continue;
        }

        console.log(`- tx ${tx._id}: crediting ${dailyEarning.toFixed(2)}`);
        await db.addEarnings(tx.userId, dailyEarning, pd.planName || 'daily-reward', tx._id);

        tx.planDetails = tx.planDetails || {};
        tx.planDetails.lastEarningAt = new Date(todayStart);
        await tx.save();

        credited.push({ txId: tx._id.toString(), amount: Math.round(dailyEarning * 100) / 100 });
      } catch (innerErr) {
        console.error('Error processing tx', tx._id, innerErr);
      }
    }

    const balanceSummary = await db.getBalanceSummary(userId);
    console.log('Credited:', credited);
    console.log('Balance summary after operation:', balanceSummary);

    await mongoose.disconnect();
    console.log('Disconnected. Done.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    try { await mongoose.disconnect(); } catch (e) {}
    process.exit(1);
  }
}

main();
