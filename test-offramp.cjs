/**
 * Simple test for offramp functionality via HTTP request
 */

const http = require('http');

function makeRequest(path, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
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

    req.on('error', (e) => {
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

async function testOfframpFlow() {
  console.log('Testing Offramp Functionality via API...');
  
  try {
    console.log('\n1. Testing offramp intent...');
    const offrampResult = await makeRequest('/api/webhook', {
      message: {
        text: 'I want to withdraw 100 USDT to my bank account',
        chat: { id: 123456 },
        from: { id: 'test-user-123' }
      }
    });
    console.log('Offramp result:', offrampResult);
    
    console.log('\n2. Testing KYC verification intent...');
    const kycResult = await makeRequest('/api/webhook', {
      message: {
        text: 'check my KYC status',
        chat: { id: 123456 },
        from: { id: 'test-user-123' }
      }
    });
    console.log('KYC result:', kycResult);
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testOfframpFlow()
  .then(() => {
    console.log('\nTest completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test error:', error);
    process.exit(1);
  });