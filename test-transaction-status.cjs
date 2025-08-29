/**
 * Test script for enhanced offramp transaction status handling
 */

const http = require('http');

function makeRequest(data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/webhook',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

async function testTransactionFeatures() {
  console.log('Testing Enhanced Transaction Status Features...');
  
  const testUserId = 'test_user_123';
  
  try {
    // Test 1: Transaction History
    console.log('\n1. Testing transaction history...');
    const historyResult = await makeRequest({
      message: {
        from: { id: testUserId },
        chat: { id: testUserId },
        text: 'show my offramp history'
      }
    });
    console.log('History result:', historyResult);
    
    // Test 2: Transaction Status Check
    console.log('\n2. Testing transaction status check...');
    const statusResult = await makeRequest({
      message: {
        from: { id: testUserId },
        chat: { id: testUserId },
        text: 'check transaction status'
      }
    });
    console.log('Status result:', statusResult);
    
    // Test 3: Retry Transaction
    console.log('\n3. Testing transaction retry...');
    const retryResult = await makeRequest({
      callback_query: {
        from: { id: testUserId },
        message: { chat: { id: testUserId } },
        data: 'retry_tx_test123'
      }
    });
    console.log('Retry result:', retryResult);
    
    // Test 4: Cancel Transaction
    console.log('\n4. Testing transaction cancellation...');
    const cancelResult = await makeRequest({
      callback_query: {
        from: { id: testUserId },
        message: { chat: { id: testUserId } },
        data: 'cancel_tx_test123'
      }
    });
    console.log('Cancel result:', cancelResult);
    
    console.log('\nTest completed');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testTransactionFeatures();