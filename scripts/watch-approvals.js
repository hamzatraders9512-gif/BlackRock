require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

// Load DB utilities (uses same models)
const db = require(path.join(__dirname, '..', 'api', 'lib', 'db'));

const MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/black-rock-login';

async function main() {
  try {
    console.log('Connecting to MongoDB...', MONGO);
    await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    const TransactionHistory = db.TransactionHistory;
    if (!TransactionHistory || !TransactionHistory.watch) {
      console.error('TransactionHistory model or change stream not available. Exiting.');
      process.exit(1);
    }

    // Try to open a change stream to watch for updates where approvalStatus becomes 'approved'
    const pipeline = [
      { $match: { 'operationType': 'update', 'updateDescription.updatedFields.approvalStatus': 'approved' } }
    ];

    console.log('Opening change stream to watch for approved transactions...');
    const changeStream = TransactionHistory.watch(pipeline, { fullDocument: 'updateLookup' });

    changeStream.on('change', async (change) => {
      try {
        console.log('Change detected:', change.operationType, change.documentKey && change.documentKey._id);
        const doc = change.fullDocument;
        if (!doc) return;

        const txId = doc._id;
        const userId = doc.userId;

        console.log(`Transaction ${txId} for user ${userId} was approved. Running balance update and earnings processing.`);

        // Ensure balances are recalculated for this user
        try {
          await db.recalculateUserBalance(userId);
          console.log('Recalculated balance for', userId);
        } catch (err) {
          console.error('Error recalculating balance:', err);
        }

        // Run today's earnings ensure and daily processor (idempotent)
        try {
          await db.ensureDailyRewardsForToday();
          await db.processDailyEarnings();
          console.log('Triggered earnings processing');
        } catch (err) {
          console.error('Error processing earnings:', err);
        }

        // Mark this transaction as earningsCalculated to indicate we've acted on approval (best-effort)
        try {
          await TransactionHistory.updateOne({ _id: txId }, { $set: { earningsCalculated: true } });
        } catch (err) {
          console.warn('Could not set earningsCalculated flag for', txId, err);
        }

      } catch (innerErr) {
        console.error('Error handling change event:', innerErr);
      }
    });

    changeStream.on('error', (err) => {
      console.error('Change stream error:', err);
      process.exit(1);
    });

    console.log('Watcher running. Waiting for approvals...');

    // Keep process alive
    process.stdin.resume();

  } catch (err) {
    console.error('Watcher failed:', err);
    try { await mongoose.disconnect(); } catch (e) {}
    process.exit(1);
  }
}

main();
