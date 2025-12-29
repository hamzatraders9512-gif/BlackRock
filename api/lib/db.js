/**
 * Database Utility Functions
 * Handles all transaction recording, balance tracking, and approval logic
 */

const mongoose = require('mongoose');
const notify = require('./notify');

// ============ MONGOOSE SCHEMAS ============

// TransactionHistory Schema - Records all deposits, withdrawals, and plan enrollments
const transactionHistorySchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true }, // User email
  type: { type: String, enum: ['deposit', 'withdrawal', 'plan', 'earnings'], required: true },
  amount: { type: Number, required: true },
  description: String,
  details: mongoose.Schema.Types.Mixed, // Store plan name, deposit address, proof URL, etc.
  
  // Approval tracking
  approvalStatus: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending',
    index: true
  },
  submittedAt: { type: Date, default: Date.now, index: true },
  approvedAt: Date,
  approvedBy: String, // Email or 'database-cli'
  rejectedAt: Date,
  rejectionReason: String,
  rejectedBy: String,
  
  // For earnings on plan approvals
  earningsCalculated: { type: Boolean, default: false },
  planDetails: {
    planName: String,
    planType: String,
    roiPercentage: Number,
    enrollmentDate: Date
  }
}, { timestamps: true });

// UserBalance Schema - Tracks user's current balance
const userBalanceSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true }, // User email
  currentBalance: { type: Number, default: 0 },
  totalDeposits: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  totalWithdrawals: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now },
  balanceHistory: [{
    date: { type: Date, default: Date.now },
    action: String, // 'deposit', 'withdrawal', 'approval', 'earnings'
    amount: Number,
    balance: Number,
    transactionId: mongoose.Schema.Types.ObjectId
  }]
}, { timestamps: true });

// ============ CREATE MODELS ============

let TransactionHistory;
let UserBalance;

try {
  TransactionHistory = mongoose.model('TransactionHistory');
} catch (e) {
  TransactionHistory = mongoose.model('TransactionHistory', transactionHistorySchema);
}

try {
  UserBalance = mongoose.model('UserBalance');
} catch (e) {
  UserBalance = mongoose.model('UserBalance', userBalanceSchema);
}

// ============ DATABASE FUNCTIONS ============

/**
 * Record a new transaction (deposit, withdrawal, or plan enrollment)
 * Transaction starts as 'pending' - balance NOT updated until approved
 */
async function recordTransaction(userId, transactionData) {
  try {
    const transaction = new TransactionHistory({
      userId,
      type: transactionData.type, // 'deposit', 'withdrawal', 'plan'
      amount: transactionData.amount,
      description: transactionData.description,
      details: transactionData.details,
      planDetails: transactionData.planDetails || null,
      approvalStatus: 'pending'
    });

    await transaction.save();
    console.log(`✓ Transaction recorded: ${transaction._id}`);
    return transaction;
  } catch (error) {
    console.error('Error recording transaction:', error);
    throw error;
  }
}

/**
 * Approve a transaction and update user balance
 * Automatically adds to appropriate balance category and updates currentBalance
 */
async function approveTransaction(transactionId, approvedBy = 'admin') {
  try {
    const transaction = await TransactionHistory.findById(transactionId);
    
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.approvalStatus === 'approved') {
      throw new Error('Transaction already approved');
    }

      const tx = await TransactionHistory.findById(transactionId);
      if (!tx) throw new Error('Transaction not found');
      tx.approvalStatus = 'approved';
      tx.approvedBy = approvedBy;
      tx.approvedAt = new Date();

      if (!tx.planDetails) tx.planDetails = {};

      // Determine ROI according to plan rules:
      // - Basic / small deposits => 4% daily
      // - Standard / mid deposits => 6% daily
      // - Premium / large deposits => 8% daily
      let roi = 5; // fallback
      const details = tx.details || {};
      const planType = (details.planType || '').toString().toLowerCase();
      const planName = details.planName || 'deposit';
      const amount = Number(tx.amount || 0);

      if (planType === 'basic') roi = 4;
      else if (planType === 'standard') roi = 6;
      else if (planType === 'premium') roi = 8;
      else {
        // custom deposit thresholds
        if (amount < 99) roi = 4;
        else if (amount < 499) roi = 6;
        else roi = 8;
      }

      tx.planDetails.planType = 'daily-reward';
      tx.planDetails.planName = planName;
      tx.planDetails.roiPercentage = roi;

      // set lastEarningAt to the start of the approval day (00:00) so daily run calculates full days
      const approvedAt = tx.approvedAt || new Date();
      const lastEarningAt = new Date(approvedAt);
      lastEarningAt.setHours(0,0,0,0);
      tx.planDetails.lastEarningAt = lastEarningAt;

      await tx.save();

      // credit the deposit amount to the user's balance
      // updateUserBalance signature: (userId, transactionType, amount, action)
      await updateUserBalance(tx.userId, 'deposit', Number(tx.amount || 0), `deposit-${tx._id}`);

      // Immediately credit one day's profit upon approval, but avoid duplicates
      try {
        const instant = Number(tx.amount || 0) * (roi / 100);
        if (instant > 0) {
          // Check if an earnings transaction for this source tx already exists today
          const todayStart = new Date();
          todayStart.setHours(0,0,0,0);
          const tomorrow = new Date(todayStart);
          tomorrow.setDate(todayStart.getDate() + 1);

          const existing = await TransactionHistory.findOne({
            userId: tx.userId,
            type: 'earnings',
            'details.sourceTxId': tx._id.toString(),
            submittedAt: { $gte: todayStart, $lt: tomorrow }
          });

          if (!existing) {
            await addEarnings(tx.userId, instant, `${planName}-instant`, tx._id);
            // mark lastEarningAt to today to prevent multiple credits
            tx.planDetails.lastEarningAt = todayStart;
            await tx.save();
          } else {
            // ensure lastEarningAt is set so daily jobs skip
            tx.planDetails.lastEarningAt = tx.planDetails.lastEarningAt || todayStart;
            await tx.save();
          }
        }
      } catch (err) {
        console.error('Failed to credit instant earnings on approval', err);
      }

      return tx;
  } catch (error) {
    console.error('Error approving transaction:', error);
    throw error;
  }
}

/**
 * Reject a transaction
 */
async function rejectTransaction(transactionId, rejectionReason, rejectedBy = 'admin') {
  try {
    const transaction = await TransactionHistory.findById(transactionId);
    
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    transaction.approvalStatus = 'rejected';
    transaction.rejectedAt = new Date();
    transaction.rejectionReason = rejectionReason;
    transaction.rejectedBy = rejectedBy;
    await transaction.save();

    console.log(`✓ Transaction rejected: ${transactionId}`);
    return transaction;
  } catch (error) {
    console.error('Error rejecting transaction:', error);
    throw error;
  }
}

/**
 * Get or create user balance record
 */
async function getUserBalance(userId) {
  try {
    let balance = await UserBalance.findOne({ userId });
    
    if (!balance) {
      balance = new UserBalance({ userId });
      await balance.save();
    }

    return balance;
  } catch (error) {
    console.error('Error getting user balance:', error);
    throw error;
  }
}

/**
 * Get all transactions for a user (optionally filtered by status)
 */
async function getUserTransactions(userId, status = null) {
  try {
    const query = { userId };
    if (status) {
      query.approvalStatus = status;
    }

    console.log('🔍 TransactionHistory.find() query:', JSON.stringify(query));
    const transactions = await TransactionHistory.find(query)
      .sort({ submittedAt: -1 })
      .lean();

    console.log('✅ TransactionHistory.find() results:', transactions.length, 'transactions');
    if (transactions.length > 0) {
      console.log('   First transaction:', JSON.stringify(transactions[0], null, 2));
    }

    return transactions;
  } catch (error) {
    console.error('Error getting user transactions:', error);
    throw error;
  }
}

/**
 * Get all pending transactions (across all users)
 */
async function getPendingTransactions() {
  try {
    const transactions = await TransactionHistory.find({ approvalStatus: 'pending' })
      .sort({ submittedAt: 1 })
      .lean();

    return transactions;
  } catch (error) {
    console.error('Error getting pending transactions:', error);
    throw error;
  }
}

/**
 * Update user balance when transaction is approved
 * Adds to appropriate category and recalculates currentBalance
 */
async function updateUserBalance(userId, transactionType, amount, action) {
  try {
    let balance = await UserBalance.findOne({ userId });
    
    if (!balance) {
      balance = new UserBalance({ userId });
    }

    // Update balance categories
    if (transactionType === 'deposit') {
      balance.totalDeposits += amount;
    } else if (transactionType === 'withdrawal') {
      balance.totalWithdrawals += amount;
    } else if (transactionType === 'plan') {
      balance.totalDeposits += amount; // Plans count as deposits
    }

    // Recalculate current balance (deposits minus withdrawals).
    // Earnings are tracked separately and should NOT be added to the displayed current balance.
    balance.currentBalance = balance.totalDeposits - balance.totalWithdrawals;
    balance.lastUpdated = new Date();

    // Add to history
    balance.balanceHistory.push({
      date: new Date(),
      action: action,
      amount: amount,
      balance: balance.currentBalance
    });

    await balance.save();
    console.log(`✓ Balance updated for ${userId}: $${balance.currentBalance}`);
    try {
      notify.emit('balance:update', {
        userId,
        currentBalance: balance.currentBalance,
        lastUpdated: balance.lastUpdated,
        recentEntry: { date: new Date(), action, amount, balance: balance.currentBalance }
      });
    } catch (e) {
      console.warn('Failed to emit balance:update', e);
    }
    return balance;
  } catch (error) {
    console.error('Error updating user balance:', error);
    throw error;
  }
}

/**
 * Process pending approvals and calculate current balance
 * This recalculates balance from all approved transactions to ensure accuracy
 */
async function recalculateUserBalance(userId) {
  try {
    const balance = await UserBalance.findOne({ userId }) || new UserBalance({ userId });
    
    // Get all approved transactions
    const approved = await TransactionHistory.find({ 
      userId,
      approvalStatus: 'approved' 
    });

    // Recalculate from scratch
    let totalDeps = 0;
    let totalWiths = 0;
    let totalEarn = 0;

    for (const tx of approved) {
      if (tx.type === 'deposit' || tx.type === 'plan') {
        totalDeps += tx.amount || 0;
      } else if (tx.type === 'withdrawal') {
        totalWiths += tx.amount || 0;
      }
    }

      // Sum all earnings transactions (approved) for accurate total earnings
      const earnTxs = await TransactionHistory.find({
        userId,
        type: 'earnings',
        approvalStatus: 'approved'
      });
      if (earnTxs && earnTxs.length > 0) {
        totalEarn += earnTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      }

    // Update balance
    balance.userId = userId;
    balance.totalDeposits = totalDeps;
    balance.totalWithdrawals = totalWiths;
    balance.totalEarnings = totalEarn;
    // currentBalance now includes earnings so the credited profit is part of available balance
    balance.currentBalance = totalDeps - totalWiths + totalEarn;
    balance.lastUpdated = new Date();

    await balance.save();
    console.log(`✓ Balance recalculated for ${userId}: $${balance.currentBalance}`);
    try {
      notify.emit('balance:update', {
        userId,
        currentBalance: balance.currentBalance,
        lastUpdated: balance.lastUpdated,
        recentEntry: { date: new Date(), action: 'recalculate', amount: 0, balance: balance.currentBalance }
      });
    } catch (e) {
      console.warn('Failed to emit balance:update on recalc', e);
    }
    return balance;
  } catch (error) {
    console.error('Error recalculating balance:', error);
    throw error;
  }
}

/**
 * Get user's current balance summary
 * Only includes APPROVED transactions
 */
async function getBalanceSummary(userId) {
  try {
    let balance = await UserBalance.findOne({ userId });
    
    if (!balance) {
      balance = new UserBalance({ userId });
      await balance.save();
    }

    return {
      currentBalance: balance.currentBalance,
      totalDeposits: balance.totalDeposits,
      totalEarnings: balance.totalEarnings,
      totalWithdrawals: balance.totalWithdrawals,
      lastUpdated: balance.lastUpdated
    };
  } catch (error) {
    console.error('Error getting balance summary:', error);
    throw error;
  }
}

/**
 * Get user's balance history for charts
 * Returns balance changes over specified number of days
 */
async function getBalanceHistory(userId, days = 30) {
  try {
    const balance = await UserBalance.findOne({ userId });
    
    if (!balance) {
      return [];
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const history = balance.balanceHistory
      .filter(h => h.date >= cutoffDate)
      .map(h => ({
        date: h.date.toISOString().split('T')[0],
        action: h.action,
        amount: h.amount,
        balance: h.balance
      }));

    return history;
  } catch (error) {
    console.error('Error getting balance history:', error);
    throw error;
  }
}

/**
 * Get user's balance history aggregated by hour for the last N hours.
 * Returns objects with `date` keys in `YYYY-MM-DDTHH` format and `balance` values.
 */
async function getBalanceHistoryHours(userId, hours = 24) {
  try {
    const balance = await UserBalance.findOne({ userId });
    if (!balance) return [];

    const cutoffDate = new Date();
    cutoffDate.setTime(cutoffDate.getTime() - (hours * 60 * 60 * 1000));

    const history = balance.balanceHistory
      .filter(h => h.date >= cutoffDate)
      .map(h => ({
        date: h.date.toISOString().slice(0, 13), // YYYY-MM-DDTHH
        action: h.action,
        amount: h.amount,
        balance: h.balance
      }));

    // Build hourly buckets: ensure one entry per hour ending now
    const end = new Date();
    const start = new Date(end.getTime() - (hours - 1) * 60 * 60 * 1000);
    const buckets = [];
    for (let i = 0; i < hours; i++) {
      const d = new Date(start.getTime() + i * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 13);
      buckets.push({ key, date: key, balance: 0 });
    }

    // Fill buckets with the latest balance up to that hour
    const byKey = {};
    history.forEach(h => { byKey[h.date] = h; });
    let lastBal = 0;
    for (let i = 0; i < buckets.length; i++) {
      const k = buckets[i].key;
      if (byKey[k] && typeof byKey[k].balance === 'number') lastBal = byKey[k].balance;
      buckets[i].balance = lastBal;
    }

    // return as series array like daily endpoint
    return buckets.map(b => ({ date: b.date, amount: 0, balance: b.balance, action: 'hourly' }));
  } catch (error) {
    console.error('Error getting hourly balance history:', error);
    throw error;
  }
}

/**
 * Add earnings to user's balance (for plan ROI)
 */
async function addEarnings(userId, earningAmount, planName = '', sourceTxId = null) {
  try {
    let balance = await UserBalance.findOne({ userId });
    
    if (!balance) {
      balance = new UserBalance({ userId });
    }

    // Track earnings and also credit them into the available balance
    balance.totalEarnings += earningAmount;
    // Add earnings to currentBalance so profit is available for further calculations/withdrawals
    balance.currentBalance += earningAmount;
    balance.lastUpdated = new Date();

    balance.balanceHistory.push({
      date: new Date(),
      action: `earnings-${planName}`,
      amount: earningAmount,
      balance: balance.currentBalance
    });

    await balance.save();

    // Record a transaction history entry for the earnings (approved)
    try {
      await recordEarningsTransaction(userId, earningAmount, planName, sourceTxId);
    } catch (err) {
      console.error('Failed to record earnings transaction:', err);
    }

    try {
      notify.emit('balance:update', {
        userId,
        currentBalance: balance.currentBalance,
        lastUpdated: balance.lastUpdated,
        recentEntry: { date: new Date(), action: `earnings-${planName}`, amount: earningAmount, balance: balance.currentBalance }
      });
    } catch (e) {
      console.warn('Failed to emit balance:update on earnings', e);
    }

    console.log(`✓ Earnings added for ${userId}: $${earningAmount}`);
    return balance;
  } catch (error) {
    console.error('Error adding earnings:', error);
    throw error;
  }
}

// Create a TransactionHistory record for earnings so that recalculateUserBalance
// can include earnings consistently when rebuilding balances from transactions.
async function recordEarningsTransaction(userId, earningAmount, planName = '', sourceTxId = null) {
  try {
    const tx = new TransactionHistory({
      userId,
      type: 'earnings',
      amount: earningAmount,
      description: `Earnings for ${planName}`,
      details: { planName, auto: true, sourceTxId: sourceTxId ? sourceTxId.toString() : undefined },
      approvalStatus: 'approved',
      submittedAt: new Date(),
      approvedAt: new Date()
    });
    await tx.save();
    return tx;
  } catch (err) {
    console.error('Error recording earnings transaction:', err);
    throw err;
  }
}

/**
 * Ensure today's per-transaction daily rewards have been credited.
 * For each approved transaction with planType 'daily-reward', check if an
 * earnings TransactionHistory exists for today linked to that transaction.
 * If missing, credit one day's earnings and record it.
 */
async function ensureDailyRewardsForToday() {
  try {
    console.log('⏱️ Running ensureDailyRewardsForToday (6% of current balance per user)');
    const todayStart = new Date();
    todayStart.setHours(0,0,0,0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(todayStart.getDate() + 1);

    // Find users that have daily-reward plans approved
    const txs = await TransactionHistory.find({
      approvalStatus: 'approved',
      $or: [
        { 'planDetails.planType': 'daily-reward' },
        { type: 'deposit' }
      ]
    }).lean();

    const userIds = [...new Set(txs.map(t => t.userId))];

    for (const userId of userIds) {
      try {
        // Avoid duplicating a per-user daily credit
        const existing = await TransactionHistory.findOne({
          userId,
          type: 'earnings',
          'details.planName': 'daily-balance-percent',
          submittedAt: { $gte: todayStart, $lt: tomorrowStart }
        });
        if (existing) continue;

        // Get authoritative current balance
        let balance = await UserBalance.findOne({ userId });
        if (!balance) balance = new UserBalance({ userId });
        const currentBal = Number(balance.currentBalance || 0);
        const dailyEarning = currentBal * 0.06; // 6% of current balance
        if (dailyEarning <= 0) continue;

        await addEarnings(userId, dailyEarning, 'daily-balance-percent', null);

        // Update lastEarningAt on any plan txs for this user so legacy per-tx jobs skip
        const userTxs = txs.filter(t => t.userId === userId);
        for (const ut of userTxs) {
          try {
            await TransactionHistory.updateOne({_id: ut._id}, { $set: { 'planDetails.lastEarningAt': todayStart } });
          } catch (e) {
            // non-fatal
          }
        }

        console.log(`✅ ensureDailyRewardsForToday credited ${dailyEarning.toFixed(2)} to ${userId} (6% of ${currentBal.toFixed(2)})`);
      } catch (innerErr) {
        console.error('Error ensuring daily-balance reward for user', userId, innerErr);
      }
    }
  } catch (error) {
    console.error('Error running ensureDailyRewardsForToday:', error);
    throw error;
  }
}


/**
 * Get transaction statistics for a user
 */
async function getTransactionStats(userId) {
  try {
    const transactions = await TransactionHistory.find({ userId });
    
    const stats = {
      total: transactions.length,
      pending: transactions.filter(t => t.approvalStatus === 'pending').length,
      approved: transactions.filter(t => t.approvalStatus === 'approved').length,
      rejected: transactions.filter(t => t.approvalStatus === 'rejected').length,
      byType: {
        deposits: transactions.filter(t => t.type === 'deposit').length,
        withdrawals: transactions.filter(t => t.type === 'withdrawal').length,
        plans: transactions.filter(t => t.type === 'plan').length
      }
    };

    return stats;
  } catch (error) {
    console.error('Error getting transaction stats:', error);
    throw error;
  }
}

/**
 * Process daily earnings for approved transactions that have a daily ROI configured.
 * This finds transactions with planDetails.planType === 'daily-reward' and calculates
 * earnings for each full day since planDetails.lastEarningAt (or approvedAt), then
 * calls addEarnings() and updates lastEarningAt.
 */
async function processDailyEarnings() {
  try {
    console.log('⏱️ Running processDailyEarnings (6% of current balance per day per user)');
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;

    const txs = await TransactionHistory.find({
      approvalStatus: 'approved',
      $or: [
        { 'planDetails.planType': 'daily-reward' },
        { type: 'deposit' }
      ]
    }).lean();

    const userIds = [...new Set(txs.map(t => t.userId))];

    for (const userId of userIds) {
      try {
        // Determine last processed earning for this user from planDetails or earnings tx
        const userTxs = txs.filter(t => t.userId === userId);
        let last = null;
        for (const ut of userTxs) {
          if (ut.planDetails && ut.planDetails.lastEarningAt) {
            const d = new Date(ut.planDetails.lastEarningAt);
            if (!last || d < last) last = d;
          }
        }
        // Fallback to most recent earnings transaction or earliest approvedAt
        if (!last) {
          const latestEarn = await TransactionHistory.findOne({ userId, type: 'earnings' }).sort({ submittedAt: -1 }).lean();
          if (latestEarn && latestEarn.submittedAt) last = new Date(latestEarn.submittedAt);
        }
        if (!last) {
          // fallback to earliest approved plan submittedAt
          const earliest = userTxs.length ? userTxs[0] : null;
          last = earliest ? new Date(earliest.approvedAt || earliest.submittedAt || now) : now;
        }

        const daysElapsed = Math.floor((now - last) / msPerDay);
        if (daysElapsed <= 0) continue;

        let balance = await UserBalance.findOne({ userId });
        if (!balance) balance = new UserBalance({ userId });
        const dailyEarning = Number(balance.currentBalance || 0) * 0.06;
        const totalEarning = dailyEarning * daysElapsed;

        if (totalEarning > 0) {
          await addEarnings(userId, totalEarning, 'daily-balance-percent');

          // Update lastEarningAt on user's plan txs to the processed boundary
          const newLast = new Date(last.getTime() + daysElapsed * msPerDay);
          for (const ut of userTxs) {
            try {
              await TransactionHistory.updateOne({_id: ut._id}, { $set: { 'planDetails.lastEarningAt': newLast } });
            } catch (e) {}
          }

          console.log(`✅ Applied ${totalEarning.toFixed(2)} earnings for ${userId} over ${daysElapsed} day(s)`);
        }
      } catch (innerErr) {
        console.error('Error processing daily earnings for user', userId, innerErr);
      }
    }
  } catch (error) {
    console.error('Error running processDailyEarnings:', error);
  }
}

// ============ EXPORTS ============

module.exports = {
  recordTransaction,
  approveTransaction,
  rejectTransaction,
  getUserBalance,
  getUserTransactions,
  getPendingTransactions,
  updateUserBalance,
  recalculateUserBalance,
  getBalanceSummary,
  getBalanceHistory,
  getBalanceHistoryHours,
  addEarnings,
  getTransactionStats,
  processDailyEarnings,
  ensureDailyRewardsForToday,
  recordEarningsTransaction,
  
  // Export models for direct queries if needed
  TransactionHistory,
  UserBalance
};
