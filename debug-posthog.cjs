#!/usr/bin/env node
/**
 * PostHog Debug Utility
 * Helps diagnose user identification and event tracking issues
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const readline = require('readline');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Configuration
const config = {
  apiKey: process.env.POSTHOG_API_KEY,
  host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
  debug: true
};

// Create readline interface for interactive debugging
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Determine PostHog endpoints based on host
 */
function getEndpoints(host) {
  if (host.includes('eu.i.posthog.com')) {
    return {
      single: 'https://eu.i.posthog.com/i/v0/e/',
      batch: 'https://eu.i.posthog.com/batch/',
      decide: 'https://eu.i.posthog.com/decide/'
    };
  } else if (host.includes('us.i.posthog.com')) {
    return {
      single: 'https://us.i.posthog.com/i/v0/e/',
      batch: 'https://us.i.posthog.com/batch/',
      decide: 'https://us.i.posthog.com/decide/'
    };
  } else if (host.includes('app.posthog.com')) {
    return {
      single: 'https://us.i.posthog.com/i/v0/e/',
      batch: 'https://us.i.posthog.com/batch/',
      decide: 'https://us.i.posthog.com/decide/'
    };
  } else {
    return {
      single: `${host}/i/v0/e/`,
      batch: `${host}/batch/`,
      decide: `${host}/decide/`
    };
  }
}

/**
 * Send HTTP request to PostHog
 */
async function sendToPostHog(endpoint, payload, method = 'POST') {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const postData = JSON.stringify(payload);
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Hedwig-Debug-Tool/1.0'
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
 * Test PostHog connection
 */
async function testConnection() {
  console.log('\n🔗 Testing PostHog Connection\n');
  
  const endpoints = getEndpoints(config.host);
  
  try {
    // Test decide endpoint (doesn't require API key)
    console.log('📡 Testing decide endpoint...');
    const decideResponse = await sendToPostHog(endpoints.decide, {
      token: 'test',
      distinct_id: 'test'
    });
    
    console.log(`   Status: ${decideResponse.statusCode} ${decideResponse.statusMessage}`);
    
    if (decideResponse.statusCode === 200) {
      console.log('   ✅ PostHog instance is reachable');
    } else {
      console.log('   ⚠️  PostHog instance returned non-200 status');
    }
    
  } catch (error) {
    console.error('   ❌ Connection failed:', error.message);
    return false;
  }
  
  return true;
}

/**
 * Test API key validity
 */
async function testApiKey() {
  console.log('\n🔑 Testing API Key\n');
  
  if (!config.apiKey) {
    console.error('   ❌ No API key found in environment variables');
    return false;
  }
  
  console.log(`   API Key: ${config.apiKey.substring(0, 8)}...`);
  
  const endpoints = getEndpoints(config.host);
  
  try {
    // Send a test event
    const testEvent = {
      api_key: config.apiKey,
      event: 'debug_test_event',
      distinct_id: 'debug_test_user',
      properties: {
        test: true,
        timestamp: new Date().toISOString(),
        $lib: 'hedwig-debug-tool'
      }
    };
    
    console.log('   📤 Sending test event...');
    const response = await sendToPostHog(endpoints.single, testEvent);
    
    console.log(`   Status: ${response.statusCode} ${response.statusMessage}`);
    
    if (response.statusCode === 200) {
      console.log('   ✅ API key is valid');
      return true;
    } else {
      console.log('   ❌ API key validation failed');
      console.log('   📄 Response:', response.body);
      return false;
    }
    
  } catch (error) {
    console.error('   ❌ API key test failed:', error.message);
    return false;
  }
}

/**
 * Debug user identification
 */
async function debugUserIdentification(userId, userProperties = {}) {
  console.log(`\n👤 Debugging User Identification for ID: ${userId}\n`);
  
  const endpoints = getEndpoints(config.host);
  
  // Create identify event
  const identifyEvent = {
    api_key: config.apiKey,
    event: '$identify',
    distinct_id: userId,
    properties: {
      $lib: 'hedwig-debug-tool',
      $lib_version: '1.0.0',
      context: 'debug',
      timestamp: new Date().toISOString(),
      $process_person_profile: true
    },
    $set: {
      platform: 'telegram',
      debug_user: true,
      created_at: new Date().toISOString(),
      ...userProperties
    },
    timestamp: new Date().toISOString()
  };
  
  console.log('📝 Identify Event Payload:');
  console.log(JSON.stringify(identifyEvent, null, 2));
  
  try {
    console.log('\n📤 Sending identify event...');
    const response = await sendToPostHog(endpoints.single, identifyEvent);
    
    console.log(`\n📊 Response: ${response.statusCode} ${response.statusMessage}`);
    
    if (response.statusCode === 200) {
      console.log('✅ User identification successful');
      
      // Send a test event for this user
      console.log('\n📤 Sending test event for identified user...');
      
      const testEvent = {
        api_key: config.apiKey,
        event: 'debug_user_event',
        distinct_id: userId,
        properties: {
          $lib: 'hedwig-debug-tool',
          context: 'debug',
          event_type: 'test',
          timestamp: new Date().toISOString(),
          $process_person_profile: true
        },
        timestamp: new Date().toISOString()
      };
      
      const eventResponse = await sendToPostHog(endpoints.single, testEvent);
      console.log(`📊 Event Response: ${eventResponse.statusCode} ${eventResponse.statusMessage}`);
      
      if (eventResponse.statusCode === 200) {
        console.log('✅ Test event sent successfully');
      } else {
        console.log('❌ Test event failed');
        console.log('📄 Response:', eventResponse.body);
      }
      
    } else {
      console.log('❌ User identification failed');
      console.log('📄 Response:', response.body);
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  }
}

/**
 * Validate event payload
 */
function validateEventPayload(payload) {
  console.log('\n🔍 Validating Event Payload\n');
  
  const issues = [];
  const warnings = [];
  
  // Required fields
  if (!payload.api_key) {
    issues.push('Missing api_key');
  }
  
  if (!payload.event) {
    issues.push('Missing event name');
  }
  
  if (!payload.distinct_id) {
    issues.push('Missing distinct_id');
  }
  
  // Check for user identification
  if (payload.event === '$identify') {
    if (!payload.$set) {
      issues.push('$identify event missing $set properties');
    }
    
    if (!payload.properties || !payload.properties.$process_person_profile) {
      warnings.push('$identify event should have $process_person_profile: true');
    }
  }
  
  // Check for proper event structure
  if (!payload.properties) {
    warnings.push('Event missing properties object');
  } else {
    if (!payload.properties.$lib) {
      warnings.push('Missing $lib property');
    }
    
    if (!payload.properties.timestamp) {
      warnings.push('Missing timestamp property');
    }
  }
  
  // Check timestamp format
  if (payload.timestamp) {
    try {
      new Date(payload.timestamp);
    } catch (error) {
      issues.push('Invalid timestamp format');
    }
  }
  
  // Report results
  if (issues.length === 0) {
    console.log('✅ Payload validation passed');
  } else {
    console.log('❌ Payload validation failed:');
    issues.forEach(issue => console.log(`   - ${issue}`));
  }
  
  if (warnings.length > 0) {
    console.log('⚠️  Warnings:');
    warnings.forEach(warning => console.log(`   - ${warning}`));
  }
  
  return issues.length === 0;
}

/**
 * Interactive debugging session
 */
async function interactiveDebug() {
  console.log('\n🎮 Interactive Debug Mode\n');
  console.log('Available commands:');
  console.log('  test-user <user_id> - Debug user identification');
  console.log('  validate-payload - Validate a JSON payload');
  console.log('  test-connection - Test PostHog connection');
  console.log('  test-api-key - Test API key validity');
  console.log('  help - Show this help');
  console.log('  exit - Exit debug mode');
  
  const askQuestion = () => {
    rl.question('\n🔧 Debug> ', async (input) => {
      const [command, ...args] = input.trim().split(' ');
      
      switch (command) {
        case 'test-user':
          if (args.length === 0) {
            console.log('Usage: test-user <user_id>');
          } else {
            await debugUserIdentification(args[0], {
              debug_session: true,
              test_user: true
            });
          }
          break;
          
        case 'validate-payload':
          rl.question('Enter JSON payload: ', (jsonInput) => {
            try {
              const payload = JSON.parse(jsonInput);
              validateEventPayload(payload);
            } catch (error) {
              console.log('❌ Invalid JSON:', error.message);
            }
            askQuestion();
          });
          return;
          
        case 'test-connection':
          await testConnection();
          break;
          
        case 'test-api-key':
          await testApiKey();
          break;
          
        case 'help':
          console.log('\nAvailable commands:');
          console.log('  test-user <user_id> - Debug user identification');
          console.log('  validate-payload - Validate a JSON payload');
          console.log('  test-connection - Test PostHog connection');
          console.log('  test-api-key - Test API key validity');
          console.log('  help - Show this help');
          console.log('  exit - Exit debug mode');
          break;
          
        case 'exit':
          console.log('👋 Goodbye!');
          rl.close();
          return;
          
        default:
          console.log('Unknown command. Type "help" for available commands.');
          break;
      }
      
      askQuestion();
    });
  };
  
  askQuestion();
}

/**
 * Main debug function
 */
async function main() {
  console.log('🐛 PostHog Debug Utility');
  console.log('========================');
  
  console.log('\n📋 Configuration:');
  console.log(`   API Key: ${config.apiKey ? config.apiKey.substring(0, 8) + '...' : 'NOT SET'}`);
  console.log(`   Host: ${config.host}`);
  
  const endpoints = getEndpoints(config.host);
  console.log(`   Single Event Endpoint: ${endpoints.single}`);
  console.log(`   Batch Endpoint: ${endpoints.batch}`);
  
  if (!config.apiKey) {
    console.error('\n❌ POSTHOG_API_KEY is required');
    console.log('Set it in your .env.local file or environment variables');
    process.exit(1);
  }
  
  // Run basic tests
  const connectionOk = await testConnection();
  if (!connectionOk) {
    console.log('\n❌ Connection test failed. Check your POSTHOG_HOST setting.');
    process.exit(1);
  }
  
  const apiKeyOk = await testApiKey();
  if (!apiKeyOk) {
    console.log('\n❌ API key test failed. Check your POSTHOG_API_KEY setting.');
    process.exit(1);
  }
  
  console.log('\n✅ Basic tests passed!');
  
  // Check if user wants interactive mode
  const args = process.argv.slice(2);
  
  if (args.includes('--interactive') || args.includes('-i')) {
    await interactiveDebug();
  } else if (args.includes('--test-user') && args.length >= 2) {
    const userIdIndex = args.indexOf('--test-user') + 1;
    const userId = args[userIdIndex];
    await debugUserIdentification(userId);
  } else {
    console.log('\n💡 Usage:');
    console.log('   node debug-posthog.cjs --interactive     # Interactive mode');
    console.log('   node debug-posthog.cjs --test-user 123  # Test specific user');
    console.log('\n🎮 Starting interactive mode...');
    await interactiveDebug();
  }
}

// Handle cleanup
process.on('SIGINT', () => {
  console.log('\n👋 Debug session ended');
  rl.close();
  process.exit(0);
});

// Run the debug utility
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Debug utility failed:', error.message);
    process.exit(1);
  });
}