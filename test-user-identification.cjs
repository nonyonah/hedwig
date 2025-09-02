#!/usr/bin/env node
/**
 * PostHog User Identification Test Script
 * Tests user profile creation and event tracking with proper identification
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Configuration
const config = {
  apiKey: process.env.POSTHOG_API_KEY,
  host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
  debug: process.env.NODE_ENV === 'development' || process.env.POSTHOG_DEBUG === 'true'
};

// Test user data (simulating Telegram users)
const testUsers = [
  {
    id: '12345678',
    username: 'test_user_1',
    first_name: 'John',
    last_name: 'Doe',
    language_code: 'en',
    is_premium: false
  },
  {
    id: '87654321',
    username: 'test_user_2',
    first_name: 'Jane',
    last_name: 'Smith',
    language_code: 'es',
    is_premium: true
  },
  {
    id: '11111111',
    first_name: 'Anonymous',
    language_code: 'fr',
    is_premium: false
    // No username - testing user without username
  }
];

/**
 * Determine PostHog endpoints based on host
 */
function getEndpoints(host) {
  if (host.includes('eu.i.posthog.com')) {
    return {
      single: 'https://eu.i.posthog.com/i/v0/e/',
      batch: 'https://eu.i.posthog.com/batch/'
    };
  } else if (host.includes('us.i.posthog.com')) {
    return {
      single: 'https://us.i.posthog.com/i/v0/e/',
      batch: 'https://us.i.posthog.com/batch/'
    };
  } else if (host.includes('app.posthog.com')) {
    return {
      single: 'https://us.i.posthog.com/i/v0/e/',
      batch: 'https://us.i.posthog.com/batch/'
    };
  } else {
    return {
      single: `${host}/i/v0/e/`,
      batch: `${host}/batch/`
    };
  }
}

/**
 * Send HTTP request to PostHog
 */
async function sendToPostHog(endpoint, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const postData = JSON.stringify(payload);
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Hedwig-Test-Script/1.0'
      }
    };

    const req = client.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          body: data,
          headers: res.headers
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

/**
 * Create user identification event
 */
function createIdentifyEvent(user, isNewUser = true) {
  const timestamp = new Date().toISOString();
  
  return {
    api_key: config.apiKey,
    event: '$identify',
    distinct_id: user.id,
    properties: {
      $lib: 'hedwig-telegram-bot',
      $lib_version: '1.0.0',
      context: 'telegram',
      platform: 'telegram',
      bot_name: 'hedwig',
      timestamp: timestamp,
      $process_person_profile: true // Ensure user profile is created
    },
    $set: {
      // Core user properties
      platform: 'telegram',
      bot_name: 'hedwig',
      last_seen: timestamp,
      is_telegram_user: true,
      telegram_id: parseInt(user.id),
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      language_code: user.language_code,
      is_premium: user.is_premium,
      is_bot: false,
      display_name: getDisplayName(user),
      // Set creation time for new users
      ...(isNewUser && { 
        created_at: timestamp, 
        first_seen: timestamp,
        registration_source: 'test_script'
      })
    },
    timestamp: timestamp
  };
}

/**
 * Create test event
 */
function createTestEvent(user, eventName, properties = {}) {
  const timestamp = new Date().toISOString();
  
  return {
    api_key: config.apiKey,
    event: eventName,
    distinct_id: user.id,
    properties: {
      ...properties,
      // Standard context properties
      $lib: 'hedwig-telegram-bot',
      $lib_version: '1.0.0',
      context: 'telegram',
      source: 'telegram_bot',
      bot_name: 'hedwig',
      timestamp: timestamp,
      $user_agent: 'Hedwig-Test-Script/1.0',
      $process_person_profile: true,
      // User context
      user_username: user.username,
      user_first_name: user.first_name,
      user_language: user.language_code
    },
    timestamp: timestamp
  };
}

/**
 * Get display name for user
 */
function getDisplayName(user) {
  if (user.username) {
    return `@${user.username}`;
  }
  
  const parts = [];
  if (user.first_name) parts.push(user.first_name);
  if (user.last_name) parts.push(user.last_name);
  
  if (parts.length > 0) {
    return parts.join(' ');
  }
  
  return `User ${user.id}`;
}

/**
 * Test user identification
 */
async function testUserIdentification() {
  console.log('\n🔍 Testing PostHog User Identification\n');
  
  // Check configuration
  console.log('📋 Configuration:');
  console.log(`   API Key: ${config.apiKey ? config.apiKey.substring(0, 8) + '...' : 'NOT SET'}`);
  console.log(`   Host: ${config.host}`);
  console.log(`   Debug: ${config.debug}`);
  
  if (!config.apiKey) {
    console.error('❌ POSTHOG_API_KEY is required');
    process.exit(1);
  }
  
  const endpoints = getEndpoints(config.host);
  console.log(`   Single Event Endpoint: ${endpoints.single}`);
  console.log(`   Batch Endpoint: ${endpoints.batch}`);
  
  console.log('\n🧪 Running User Identification Tests\n');
  
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < testUsers.length; i++) {
    const user = testUsers[i];
    console.log(`\n👤 Testing User ${i + 1}: ${getDisplayName(user)} (ID: ${user.id})`);
    
    try {
      // Step 1: Identify user
      console.log('   📝 Step 1: Identifying user...');
      const identifyEvent = createIdentifyEvent(user, true);
      
      if (config.debug) {
        console.log('   🔍 Identify payload:', JSON.stringify(identifyEvent, null, 2));
      }
      
      const identifyResponse = await sendToPostHog(endpoints.single, identifyEvent);
      
      if (identifyResponse.statusCode === 200) {
        console.log('   ✅ User identification successful');
      } else {
        console.log(`   ⚠️  User identification returned ${identifyResponse.statusCode}: ${identifyResponse.statusMessage}`);
        if (config.debug) {
          console.log('   📄 Response:', identifyResponse.body);
        }
      }
      
      // Step 2: Send test events
      console.log('   📊 Step 2: Sending test events...');
      
      const testEvents = [
        createTestEvent(user, 'bot_started', {
          category: 'bot_lifecycle',
          is_new_user: true
        }),
        createTestEvent(user, 'message_received', {
          category: 'messages',
          message_type: 'text',
          chat_type: 'private'
        }),
        createTestEvent(user, 'command_used', {
          category: 'commands',
          command: '/start',
          success: true
        })
      ];
      
      for (const event of testEvents) {
        const eventResponse = await sendToPostHog(endpoints.single, event);
        
        if (eventResponse.statusCode === 200) {
          console.log(`   ✅ Event '${event.event}' sent successfully`);
        } else {
          console.log(`   ⚠️  Event '${event.event}' returned ${eventResponse.statusCode}`);
          if (config.debug) {
            console.log('   📄 Response:', eventResponse.body);
          }
        }
        
        // Small delay between events
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      successCount++;
      
    } catch (error) {
      console.error(`   ❌ Error testing user ${user.id}:`, error.message);
      errorCount++;
    }
    
    // Delay between users
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n📊 Test Results Summary:');
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log(`   📈 Total Users Tested: ${testUsers.length}`);
  
  console.log('\n🔍 Verification Steps:');
  console.log('   1. Open your PostHog dashboard');
  console.log('   2. Go to the "Persons" tab');
  console.log('   3. Look for the test users:');
  
  testUsers.forEach((user, index) => {
    console.log(`      - ${getDisplayName(user)} (ID: ${user.id})`);
  });
  
  console.log('   4. Check that user profiles contain:');
  console.log('      - username, first_name, last_name');
  console.log('      - platform: "telegram"');
  console.log('      - is_telegram_user: true');
  console.log('      - display_name');
  
  console.log('   5. Go to "Events" or "Explore" tab');
  console.log('   6. Filter events by the test user IDs');
  console.log('   7. Verify events are linked to user profiles');
  
  console.log('\n💡 Expected Events per User:');
  console.log('   - $identify (user identification)');
  console.log('   - bot_started');
  console.log('   - message_received');
  console.log('   - command_used');
  
  if (successCount === testUsers.length) {
    console.log('\n🎉 All tests passed! User identification should be working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Check the error messages above.');
  }
  
  console.log('\n🧹 Cleanup:');
  console.log('   These are test users and events. You can delete them from PostHog if needed.');
}

/**
 * Test batch user identification
 */
async function testBatchIdentification() {
  console.log('\n🔄 Testing Batch User Identification\n');
  
  const endpoints = getEndpoints(config.host);
  
  try {
    // Create batch payload with all users
    const batchEvents = [];
    
    testUsers.forEach(user => {
      // Add identify event
      batchEvents.push(createIdentifyEvent(user, true));
      
      // Add some test events
      batchEvents.push(createTestEvent(user, 'batch_test_event', {
        category: 'testing',
        batch_number: 1
      }));
    });
    
    const batchPayload = {
      api_key: config.apiKey,
      batch: batchEvents
    };
    
    console.log(`📦 Sending batch with ${batchEvents.length} events...`);
    
    if (config.debug) {
      console.log('🔍 Batch payload:', JSON.stringify(batchPayload, null, 2));
    }
    
    const response = await sendToPostHog(endpoints.batch, batchPayload);
    
    console.log(`📊 Batch Response: ${response.statusCode} ${response.statusMessage}`);
    
    if (response.statusCode === 200) {
      console.log('✅ Batch identification successful');
    } else {
      console.log('❌ Batch identification failed');
      if (config.debug) {
        console.log('📄 Response:', response.body);
      }
    }
    
  } catch (error) {
    console.error('❌ Batch test error:', error.message);
  }
}

/**
 * Main test function
 */
async function main() {
  console.log('🚀 PostHog User Identification Test Suite');
  console.log('==========================================');
  
  try {
    await testUserIdentification();
    await testBatchIdentification();
    
    console.log('\n✨ Test suite completed!');
    console.log('\n📚 Next Steps:');
    console.log('   1. Verify users appear in PostHog "Persons" tab');
    console.log('   2. Check that events are linked to user profiles');
    console.log('   3. Integrate the user identification service into your bot');
    console.log('   4. Test with real Telegram users');
    
  } catch (error) {
    console.error('💥 Test suite failed:', error.message);
    process.exit(1);
  }
}

// Run the tests
if (require.main === module) {
  main();
}