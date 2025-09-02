/**
 * PostHog Connection Test Script
 * Run this script to test your PostHog integration
 * 
 * Usage: node test-posthog.js
 */

require('dotenv').config({ path: '.env.local' });

// Since we're dealing with TypeScript, we'll create a simple test without importing the module
// You can either:
// 1. Install ts-node: npm install -g ts-node, then run: ts-node test-posthog.ts
// 2. Or use this simplified test that makes direct HTTP calls

const https = require('https');
const http = require('http');

// Simple PostHog test function
async function testPostHogAPI() {
  const apiKey = process.env.POSTHOG_API_KEY;
  const host = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';
  
  if (!apiKey) {
    throw new Error('POSTHOG_API_KEY environment variable is required');
  }
  
  if (!apiKey.startsWith('phc_')) {
    throw new Error('POSTHOG_API_KEY should start with "phc_"');
  }
  
  // Determine the correct endpoint
  let endpoint;
  if (host.includes('eu.i.posthog.com')) {
    endpoint = 'https://eu.i.posthog.com/i/v0/e/';
  } else if (host.includes('app.posthog.com')) {
    endpoint = 'https://us.i.posthog.com/i/v0/e/';
  } else if (host.includes('us.i.posthog.com')) {
    endpoint = 'https://us.i.posthog.com/i/v0/e/';
  } else {
    // Self-hosted or custom domain
    endpoint = `${host}/i/v0/e/`;
  }
  
  const payload = {
    api_key: apiKey,
    event: 'posthog_test_event',
    distinct_id: 'test_user_123',
    properties: {
      test: true,
      timestamp: new Date().toISOString(),
      source: 'telegram_bot_test'
    }
  };
  
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const postData = JSON.stringify(payload);
    
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const client = url.protocol === 'https:' ? https : http;
    
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          endpoint: endpoint,
          payload: payload
        });
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.write(postData);
    req.end();
  });
}

async function runPostHogTest() {
  console.log('🚀 Starting PostHog Integration Test...');
  console.log('📋 Current Environment Variables:');
  console.log(`   POSTHOG_API_KEY: ${process.env.POSTHOG_API_KEY ? process.env.POSTHOG_API_KEY.substring(0, 8) + '...' : 'NOT SET'}`);
  console.log(`   POSTHOG_HOST: ${process.env.POSTHOG_HOST || 'NOT SET (will use default)'}`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'NOT SET'}`);
  
  try {
    // Run API test
    console.log('\n🧪 Testing PostHog API...');
    const testResult = await testPostHogAPI();
    
    console.log('\n📊 Test Results:');
    console.log(`   Status Code: ${testResult.statusCode}`);
    console.log(`   Endpoint: ${testResult.endpoint}`);
    console.log(`   Response Body: ${testResult.body}`);
    
    if (testResult.statusCode === 200) {
      console.log('\n🎉 SUCCESS: PostHog API is responding correctly!');
      console.log('\n📝 Next Steps:');
      console.log('   1. Check your PostHog dashboard in 2-5 minutes');
      console.log('   2. Look for test events in the "Live events" tab');
      console.log('   3. Look for event: "posthog_test_event" with user ID: "test_user_123"');
      console.log('   4. Verify the event has the correct properties');
      
      console.log('\n📋 Event Details Sent:');
      console.log(JSON.stringify(testResult.payload, null, 2));
      
    } else {
      console.log('\n❌ FAILED: PostHog API returned an error');
      console.log('\n🔧 Troubleshooting Steps:');
      
      if (testResult.statusCode === 401) {
        console.log('   • API Key is invalid or missing');
        console.log('   • Verify POSTHOG_API_KEY starts with "phc_"');
        console.log('   • Check that you\'re using the Project API Key, not Personal Token');
      } else if (testResult.statusCode === 404) {
        console.log('   • Endpoint URL is incorrect');
        console.log('   • Check POSTHOG_HOST is correct for your instance');
      } else {
        console.log(`   • HTTP ${testResult.statusCode} error occurred`);
        console.log(`   • Response: ${testResult.body}`);
      }
      
      console.log('\n💡 Common Solutions:');
      console.log('   • Verify POSTHOG_API_KEY starts with "phc_"');
      console.log('   • Check POSTHOG_HOST is correct for your instance:');
      console.log('     - US Cloud: https://us.i.posthog.com');
      console.log('     - EU Cloud: https://eu.i.posthog.com');
      console.log('     - Self-hosted: https://your-domain.com');
      console.log('   • Ensure your API key has the correct permissions');
      console.log('   • Check network connectivity and firewall settings');
    }
    
  } catch (error) {
    console.error('\n💥 Test script error:', error.message);
    console.log('\n🔧 This might indicate:');
    console.log('   • Missing environment variables');
    console.log('   • Invalid API key format');
    console.log('   • Network connectivity problems');
    console.log('   • Incorrect PostHog host configuration');
  }
}

// Run the test
runPostHogTest().catch(console.error);