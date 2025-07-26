#!/usr/bin/env node

/**
 * Test script for Telegram webhook setup
 * Based on the Medium article: https://medium.com/@ukpai/telegram-webhook-981fc3b4294b
 */

const https = require('https');
const http = require('http');

// Configuration
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL;

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is not set');
  process.exit(1);
}

if (!BASE_URL) {
  console.error('❌ BASE_URL is not set (NEXT_PUBLIC_APP_URL or NEXT_PUBLIC_BASE_URL)');
  process.exit(1);
}

const WEBHOOK_URL = `${BASE_URL}/api/webhook`;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

console.log('🚀 Testing Telegram Webhook Setup');
console.log('================================');
console.log(`Bot Token: ${BOT_TOKEN.substring(0, 10)}...`);
console.log(`Webhook URL: ${WEBHOOK_URL}`);
console.log('');

async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', reject);
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

async function testBotConnection() {
  console.log('1️⃣ Testing bot connection...');
  try {
    const response = await makeRequest(`${TELEGRAM_API_URL}/getMe`);
    if (response.data.ok) {
      console.log('✅ Bot connection successful');
      console.log(`   Bot: @${response.data.result.username} (${response.data.result.first_name})`);
      return true;
    } else {
      console.log('❌ Bot connection failed:', response.data.description);
      return false;
    }
  } catch (error) {
    console.log('❌ Bot connection error:', error.message);
    return false;
  }
}

async function testWebhookEndpoint() {
  console.log('\n2️⃣ Testing webhook endpoint...');
  try {
    const url = new URL(WEBHOOK_URL);
    const options = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const response = await makeRequest(WEBHOOK_URL, options);
    console.log(`   Status: ${response.status}`);
    
    if (response.status === 200) {
      console.log('✅ Webhook endpoint is accessible');
      return true;
    } else {
      console.log('❌ Webhook endpoint returned error:', response.data);
      return false;
    }
  } catch (error) {
    console.log('❌ Webhook endpoint error:', error.message);
    return false;
  }
}

async function getCurrentWebhookInfo() {
  console.log('\n3️⃣ Getting current webhook info...');
  try {
    const response = await makeRequest(`${TELEGRAM_API_URL}/getWebhookInfo`);
    if (response.data.ok) {
      const info = response.data.result;
      console.log('✅ Webhook info retrieved');
      console.log(`   Current URL: ${info.url || 'Not set'}`);
      console.log(`   Pending updates: ${info.pending_update_count}`);
      console.log(`   Max connections: ${info.max_connections}`);
      console.log(`   Allowed updates: ${info.allowed_updates?.join(', ') || 'All'}`);
      
      if (info.last_error_date) {
        console.log(`   ⚠️  Last error: ${info.last_error_message} (${new Date(info.last_error_date * 1000)})`);
      }
      
      return info;
    } else {
      console.log('❌ Failed to get webhook info:', response.data.description);
      return null;
    }
  } catch (error) {
    console.log('❌ Webhook info error:', error.message);
    return null;
  }
}

async function setWebhook() {
  console.log('\n4️⃣ Setting webhook...');
  try {
    const body = JSON.stringify({
      url: WEBHOOK_URL,
      max_connections: 40,
      allowed_updates: ['message', 'callback_query', 'inline_query']
    });
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      body
    };
    
    const response = await makeRequest(`${TELEGRAM_API_URL}/setWebhook`, options);
    
    if (response.data.ok) {
      console.log('✅ Webhook set successfully');
      return true;
    } else {
      console.log('❌ Failed to set webhook:', response.data.description);
      return false;
    }
  } catch (error) {
    console.log('❌ Set webhook error:', error.message);
    return false;
  }
}

async function testWebhookWithMessage() {
  console.log('\n5️⃣ Testing webhook with sample message...');
  try {
    const sampleUpdate = {
      update_id: 123456789,
      message: {
        message_id: 1,
        from: {
          id: 123456789,
          is_bot: false,
          first_name: "Test",
          username: "testuser",
          language_code: "en"
        },
        chat: {
          id: 123456789,
          first_name: "Test",
          username: "testuser",
          type: "private"
        },
        date: Math.floor(Date.now() / 1000),
        text: "/start"
      }
    };
    
    const body = JSON.stringify(sampleUpdate);
    const url = new URL(WEBHOOK_URL);
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      body
    };
    
    const response = await makeRequest(WEBHOOK_URL, options);
    
    if (response.status === 200) {
      console.log('✅ Webhook processed test message successfully');
      return true;
    } else {
      console.log('❌ Webhook failed to process test message:', response.data);
      return false;
    }
  } catch (error) {
    console.log('❌ Test message error:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('Starting webhook tests...\n');
  
  const results = {
    botConnection: await testBotConnection(),
    webhookEndpoint: await testWebhookEndpoint(),
    webhookInfo: await getCurrentWebhookInfo(),
    setWebhook: false,
    testMessage: false
  };
  
  // Only proceed with webhook setup if basic tests pass
  if (results.botConnection && results.webhookEndpoint) {
    results.setWebhook = await setWebhook();
    
    if (results.setWebhook) {
      // Wait a moment for webhook to be fully set
      console.log('\n   Waiting 2 seconds for webhook to be fully configured...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get updated webhook info
      await getCurrentWebhookInfo();
      
      // Test with sample message
      results.testMessage = await testWebhookWithMessage();
    }
  }
  
  // Summary
  console.log('\n📊 Test Results Summary');
  console.log('======================');
  console.log(`Bot Connection: ${results.botConnection ? '✅' : '❌'}`);
  console.log(`Webhook Endpoint: ${results.webhookEndpoint ? '✅' : '❌'}`);
  console.log(`Webhook Info: ${results.webhookInfo ? '✅' : '❌'}`);
  console.log(`Set Webhook: ${results.setWebhook ? '✅' : '❌'}`);
  console.log(`Test Message: ${results.testMessage ? '✅' : '❌'}`);
  
  const allPassed = Object.values(results).every(result => result === true || result !== false);
  
  if (allPassed) {
    console.log('\n🎉 All tests passed! Your Telegram webhook is properly configured.');
    console.log('\nNext steps:');
    console.log('1. Send a message to your bot on Telegram');
    console.log('2. Check your application logs for webhook activity');
    console.log('3. Monitor the webhook endpoint for any errors');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the errors above and fix them.');
    console.log('\nCommon issues:');
    console.log('- Make sure your server is publicly accessible');
    console.log('- Verify HTTPS is working (Telegram requires HTTPS for webhooks)');
    console.log('- Check that your bot token is correct');
    console.log('- Ensure your webhook endpoint returns 200 OK');
  }
  
  process.exit(allPassed ? 0 : 1);
}

// Run the tests
runTests().catch(error => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});