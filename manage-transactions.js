/**
 * Database Management Utility Script
 * Use this to approve/reject transactions directly
 * 
 * Usage:
 *   node manage-transactions.js approve <transactionId>
 *   node manage-transactions.js reject <transactionId> "reason"
 *   node manage-transactions.js pending
 *   node manage-transactions.js balance <userId>
 *   node manage-transactions.js history <userId>
 */

require('dotenv').config();
const mongoose = require('mongoose');
const db = require('./api/lib/db');

const command = process.argv[2];
const arg1 = process.argv[3];
const arg2 = process.argv[4];

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => {
    console.log('✓ Connected to MongoDB');
    handleCommand();
  })
  .catch(err => {
    console.error('✗ MongoDB connection error:', err);
    process.exit(1);
  });

async function handleCommand() {
  try {
    switch (command) {
      case 'approve':
        await approveTransaction(arg1);
        break;

      case 'reject':
        await rejectTransaction(arg1, arg2);
        break;

      case 'pending':
        await showPendingTransactions();
        break;

      case 'balance':
        await showUserBalance(arg1);
        break;

      case 'history':
        await showUserHistory(arg1);
        break;

      case 'stats':
        await showUserStats(arg1);
        break;

      default:
        showHelp();
    }

    process.exit(0);
  } catch (error) {
    console.error('✗ Error:', error.message);
    process.exit(1);
  }
}

async function approveTransaction(transactionId) {
  console.log(`\n📋 Approving transaction: ${transactionId}\n`);

  if (!transactionId) {
    console.error('✗ Transaction ID required');
    showHelp();
    return;
  }

  const transaction = await db.approveTransaction(transactionId, 'database-cli');
  
  console.log('✅ Transaction Approved!\n');
  console.log('Transaction Details:');
  console.log(`  ID: ${transaction._id}`);
  console.log(`  User: ${transaction.userId}`);
  console.log(`  Type: ${transaction.type}`);
  console.log(`  Amount: $${transaction.amount}`);
  console.log(`  Status: ${transaction.approvalStatus}`);
  console.log(`  Approved At: ${transaction.approvedAt}`);
  
  console.log('\n💰 User Balance Updated');
  const balance = await db.getBalanceSummary(transaction.userId);
  console.log(`  Current Balance: $${balance.currentBalance}`);
  console.log(`  Total Deposits: $${balance.totalDeposits}`);
  console.log(`  Total Earnings: $${balance.totalEarnings}`);
  console.log(`  Total Withdrawals: $${balance.totalWithdrawals}\n`);
}

async function rejectTransaction(transactionId, reason) {
  console.log(`\n❌ Rejecting transaction: ${transactionId}\n`);

  if (!transactionId) {
    console.error('✗ Transaction ID required');
    showHelp();
    return;
  }

  const rejectionReason = reason || 'Rejected by admin';
  const transaction = await db.rejectTransaction(transactionId, rejectionReason, 'database-cli');
  
  console.log('✅ Transaction Rejected!\n');
  console.log('Transaction Details:');
  console.log(`  ID: ${transaction._id}`);
  console.log(`  User: ${transaction.userId}`);
  console.log(`  Type: ${transaction.type}`);
  console.log(`  Amount: $${transaction.amount}`);
  console.log(`  Status: ${transaction.approvalStatus}`);
  console.log(`  Reason: ${transaction.rejectionReason}\n`);
}

async function showPendingTransactions() {
  console.log('\n⏳ Pending Transactions\n');

  const transactions = await db.getPendingTransactions();

  if (transactions.length === 0) {
    console.log('No pending transactions ✓\n');
    return;
  }

  console.log(`Found ${transactions.length} pending transaction(s):\n`);

  transactions.forEach((tx, idx) => {
    console.log(`${idx + 1}. ID: ${tx._id}`);
    console.log(`   User: ${tx.userId}`);
    console.log(`   Type: ${tx.type}`);
    console.log(`   Amount: $${tx.amount}`);
    console.log(`   Submitted: ${tx.submittedAt}`);
    console.log(`   Description: ${tx.description}`);
    console.log('');
  });

  console.log(`\n💡 To approve: node manage-transactions.js approve <id>`);
  console.log(`💡 To reject: node manage-transactions.js reject <id> "reason"\n`);
}

async function showUserBalance(userId) {
  console.log(`\n💰 Balance for ${userId}\n`);

  if (!userId) {
    console.error('✗ User ID (email) required');
    showHelp();
    return;
  }

  const balance = await db.getBalanceSummary(userId);
  const stats = await db.getTransactionStats(userId);

  console.log('Balance Summary:');
  console.log(`  Current Balance: $${balance.currentBalance}`);
  console.log(`  Total Deposits: $${balance.totalDeposits}`);
  console.log(`  Total Earnings: $${balance.totalEarnings}`);
  console.log(`  Total Withdrawals: $${balance.totalWithdrawals}`);
  console.log(`  Last Updated: ${balance.lastUpdated}`);

  console.log('\nTransaction Statistics:');
  console.log(`  Total Transactions: ${stats.total}`);
  console.log(`  Pending: ${stats.pending}`);
  console.log(`  Approved: ${stats.approved}`);
  console.log(`  Rejected: ${stats.rejected}`);
  console.log(`  Deposits: ${stats.byType.deposits}`);
  console.log(`  Withdrawals: ${stats.byType.withdrawals}`);
  console.log(`  Plans: ${stats.byType.plans}\n`);
}

async function showUserHistory(userId) {
  console.log(`\n📜 Transaction History for ${userId}\n`);

  if (!userId) {
    console.error('✗ User ID (email) required');
    showHelp();
    return;
  }

  const transactions = await db.getUserTransactions(userId);

  if (transactions.length === 0) {
    console.log('No transactions found\n');
    return;
  }

  console.log(`Found ${transactions.length} transaction(s):\n`);

  transactions.forEach((tx, idx) => {
    console.log(`${idx + 1}. ${tx.type.toUpperCase()}`);
    console.log(`   ID: ${tx._id}`);
    console.log(`   Amount: $${tx.amount}`);
    console.log(`   Status: ${tx.approvalStatus}`);
    console.log(`   Submitted: ${tx.submittedAt}`);
    if (tx.approvedAt) console.log(`   Approved: ${tx.approvedAt}`);
    if (tx.rejectionReason) console.log(`   Rejection Reason: ${tx.rejectionReason}`);
    console.log('');
  });
}

async function showUserStats(userId) {
  console.log(`\n📊 Statistics for ${userId}\n`);

  if (!userId) {
    console.error('✗ User ID (email) required');
    showHelp();
    return;
  }

  const balance = await db.getBalanceSummary(userId);
  const history = await db.getBalanceHistory(userId, 30);

  console.log('Balance Changes (Last 30 days):');
  console.log('');

  history.forEach((h, idx) => {
    console.log(`${idx + 1}. ${h.action}`);
    console.log(`   Date: ${h.date}`);
    console.log(`   Amount: $${h.amount}`);
    console.log(`   Balance: $${h.balance}`);
    console.log('');
  });
}

function showHelp() {
  console.log(`
╔════════════════════════════════════════════════════════╗
║  Black Rock - Database Management CLI                  ║
╚════════════════════════════════════════════════════════╝

Usage: node manage-transactions.js <command> [args]

Commands:

  approve <transactionId>
    Approve a pending transaction
    Example: node manage-transactions.js approve 507f1f77bcf86cd799439011

  reject <transactionId> [reason]
    Reject a pending transaction with optional reason
    Example: node manage-transactions.js reject 507f1f77bcf86cd799439011 "Invalid proof"

  pending
    Show all pending transactions
    Example: node manage-transactions.js pending

  balance <userId>
    Show user's current balance and transaction stats
    Example: node manage-transactions.js balance user@email.com

  history <userId>
    Show user's transaction history
    Example: node manage-transactions.js history user@email.com

  stats <userId>
    Show user's balance change history (30 days)
    Example: node manage-transactions.js stats user@email.com

Examples:
  1. View pending transactions:
     $ node manage-transactions.js pending

  2. Approve a transaction:
     $ node manage-transactions.js approve 507f1f77bcf86cd799439011

  3. Check user balance:
     $ node manage-transactions.js balance user@email.com

  4. View transaction history:
     $ node manage-transactions.js history user@email.com

  `);
}

// Handle termination
process.on('SIGINT', () => {
  console.log('\n\nExiting...');
  process.exit(0);
});
