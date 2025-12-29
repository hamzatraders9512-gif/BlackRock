#!/usr/bin/env node

/**
 * Direct MongoDB diagnostic script
 * Run with: node diagnostic-transactions.js
 * 
 * This script queries MongoDB directly to verify:
 * 1. Connection is working
 * 2. TransactionHistory collection exists
 * 3. Transactions are being stored
 * 4. Specific transaction ID exists
 */

require('dotenv').config();

const mongoose = require('mongoose');
const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/black-rock-login';

console.log('\n🔍 DIAGNOSTIC: Checking MongoDB Transactions\n');
console.log('MongoDB URL:', mongoUrl);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function runDiagnostics() {
  try {
    // Connect to MongoDB
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(mongoUrl);
    console.log('✅ Connected successfully!\n');

    // Get the collections
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log('📊 Available Collections:');
    collections.forEach(col => console.log('   -', col.name));
    console.log();

    // Check TransactionHistory collection
    const transactionHistoryCol = db.collection('transactionhistories');
    const txCount = await transactionHistoryCol.countDocuments();
    console.log(`📈 TransactionHistory Collection:`);
    console.log(`   Total documents: ${txCount}`);
    console.log();

    // Show all transactions
    if (txCount > 0) {
      console.log('📋 All Transactions:');
      const allTx = await transactionHistoryCol.find({}).toArray();
      allTx.forEach((tx, i) => {
        console.log(`   [${i + 1}] ID: ${tx._id}`);
        console.log(`       userId: ${tx.userId}`);
        console.log(`       type: ${tx.type}`);
        console.log(`       amount: ${tx.amount}`);
        console.log(`       approvalStatus: ${tx.approvalStatus}`);
        console.log(`       submittedAt: ${tx.submittedAt}`);
        console.log();
      });
    }

    // Check specific transaction ID
    const specificId = '693559fbb394e12aa6596778';
    console.log(`🔍 Looking for specific transaction: ${specificId}`);
    const found = await transactionHistoryCol.findOne({ _id: new mongoose.Types.ObjectId(specificId) });
    if (found) {
      console.log('   ✅ FOUND!');
      console.log('   Details:', JSON.stringify(found, null, 2));
    } else {
      console.log('   ❌ NOT FOUND');
      
      // Try searching as string
      const foundAsString = await transactionHistoryCol.findOne({ _id: specificId });
      if (foundAsString) {
        console.log('   ✅ Found as string ID');
        console.log('   Details:', JSON.stringify(foundAsString, null, 2));
      }
    }
    console.log();

    // Check deposits collection
    const depositsCol = db.collection('deposits');
    const depositCount = await depositsCol.countDocuments();
    console.log(`💳 Deposits Collection:`);
    console.log(`   Total documents: ${depositCount}`);
    if (depositCount > 0) {
      const deposits = await depositsCol.find({}).toArray();
      deposits.forEach((dep, i) => {
        console.log(`   [${i + 1}] ID: ${dep._id}`);
        console.log(`       userId: ${dep.userId}`);
        console.log(`       planType: ${dep.planType}`);
        console.log(`       amount: ${dep.amount}`);
        console.log(`       status: ${dep.status}`);
        console.log();
      });
    }
    console.log();

    await mongoose.connection.close();
    console.log('✅ Diagnostic complete. Connection closed.\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

runDiagnostics();
