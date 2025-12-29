#!/usr/bin/env node

/**
 * Test the /api/transactions/my endpoint
 * Run with: node test-api-endpoint.js
 * 
 * This will:
 * 1. Start a test session
 * 2. Call /api/transactions/my
 * 3. Display the response
 */

const http = require('http');
const https = require('https');

const API_URL = 'http://localhost:3000/api/transactions/my';

console.log('\n🧪 Testing API Endpoint\n');
console.log('URL:', API_URL);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function testEndpoint() {
  return new Promise((resolve, reject) => {
    const url = new URL(API_URL);
    const client = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'TransactionDiagnostic/1.0'
      },
      credentials: 'include'
    };

    console.log('📤 Sending request with options:');
    console.log('   hostname:', options.hostname);
    console.log('   port:', options.port);
    console.log('   path:', options.path);
    console.log('   method:', options.method);
    console.log();

    const req = client.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log('📥 Response received');
        console.log('   Status:', res.statusCode);
        console.log('   Headers:', JSON.stringify(res.headers, null, 2));
        console.log();

        try {
          const parsed = JSON.parse(data);
          console.log('✅ Response body (parsed):');
          console.log(JSON.stringify(parsed, null, 2));
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          console.log('⚠️  Response body (raw):');
          console.log(data);
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request failed:', error.message);
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      console.error('❌ Request timed out');
      reject(new Error('Request timeout'));
    });

    req.setTimeout(10000); // 10 second timeout
    req.end();
  });
}

testEndpoint()
  .then(() => {
    console.log('\n✅ Test complete\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nNote: Make sure the server is running on localhost:3000');
    process.exit(1);
  });
