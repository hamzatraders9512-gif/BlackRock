// Test script to verify custom deposit endpoint
const BASE_URL = 'http://localhost:3000';

async function testCloudinaryConfig() {
  console.log('\n=== Testing Cloudinary Config Endpoint ===');
  try {
    const response = await fetch(`${BASE_URL}/api/cloudinary/config`);
    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Response:', data);
    return data;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

async function testCustomDepositEndpoint() {
  console.log('\n=== Testing Custom Deposit Endpoint ===');
  try {
    const testData = {
      amount: 50,
      depositAddress: '0x1234567890abcdef',
      proofUrl: 'https://example.com/proof.png',
      fileName: 'proof.png',
      fileSize: 1024
    };
    
    const response = await fetch(`${BASE_URL}/api/deposits/custom-submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testData)
    });
    
    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Response:', data);
    return data;
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

async function runTests() {
  const config = await testCloudinaryConfig();
  if (config && config.configured) {
    console.log('\n✅ Cloudinary config endpoint is working');
  } else {
    console.log('\n❌ Cloudinary config endpoint failed');
  }
  
  const depositResult = await testCustomDepositEndpoint();
  if (depositResult) {
    console.log('\n✅ Custom deposit endpoint is responding');
  } else {
    console.log('\n❌ Custom deposit endpoint failed');
  }
}

// Run tests if this file is executed directly
if (typeof window === 'undefined') {
  runTests();
}
