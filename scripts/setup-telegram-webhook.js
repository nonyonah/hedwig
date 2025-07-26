#!/usr/bin/env node

/**
 * Telegram Webhook Setup Script
 * 
 * This script helps set up the Telegram webhook for your bot.
 * Make sure to set the following environment variables:
 * - TELEGRAM_BOT_TOKEN: Your bot token from @BotFather
 * - NEXT_PUBLIC_APP_URL: Your app's public URL (e.g., https://yourapp.com)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load environment variables
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  const envProdPath = path.join(__dirname, '..', '.env.production');
  
  // Try to load .env file
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value && !process.env[key]) {
        process.env[key] = value.trim();
      }
    });
  }
  
  // Try to load .env.production file
  if (fs.existsSync(envProdPath)) {
    const envContent = fs.readFileSync(envProdPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value && !process.env[key]) {
        process.env[key] = value.trim();
      }
    });
  }
}

// Make HTTPS request
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
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
    req.end();
  });
}

async function setupWebhook() {
  loadEnv();
  
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL;
  
  if (!botToken) {
    console.error('❌ TELEGRAM_BOT_TOKEN is not set');
    console.log('Please set your bot token in .env file:');
    console.log('TELEGRAM_BOT_TOKEN=your_bot_token_here');
    process.exit(1);
  }
  
  if (!appUrl) {
    console.error('❌ App URL is not set');
    console.log('Please set your app URL in .env file:');
    console.log('NEXT_PUBLIC_APP_URL=https://yourapp.com');
    process.exit(1);
  }
  
  const webhookUrl = `${appUrl}/api/webhook`;
  
  console.log('🚀 Setting up Telegram webhook...');
  console.log(`📍 Webhook URL: ${webhookUrl}`);
  
  try {
    // First, get bot info
    console.log('📋 Getting bot information...');
    const botInfoUrl = `https://api.telegram.org/bot${botToken}/getMe`;
    const botInfoResponse = await makeRequest(botInfoUrl);
    
    if (botInfoResponse.status !== 200 || !botInfoResponse.data.ok) {
      console.error('❌ Failed to get bot info:', botInfoResponse.data);
      process.exit(1);
    }
    
    const botInfo = botInfoResponse.data.result;
    console.log(`✅ Bot info: @${botInfo.username} (${botInfo.first_name})`);
    
    // Set webhook
    console.log('🔗 Setting webhook...');
    const setWebhookUrl = `https://api.telegram.org/bot${botToken}/setWebhook`;
    const webhookData = JSON.stringify({
      url: webhookUrl,
      drop_pending_updates: true,
      allowed_updates: ['message', 'callback_query', 'inline_query']
    });
    
    const webhookResponse = await makeRequest(setWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(webhookData)
      }
    });
    
    // Send the data
    const req = https.request(setWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(webhookData)
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode === 200 && parsed.ok) {
            console.log('✅ Webhook set successfully!');
            console.log('📝 Description:', parsed.description);
            
            // Verify webhook
            verifyWebhook(botToken);
          } else {
            console.error('❌ Failed to set webhook:', parsed);
            process.exit(1);
          }
        } catch (e) {
          console.error('❌ Error parsing response:', e);
          process.exit(1);
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ Request error:', error);
      process.exit(1);
    });
    
    req.write(webhookData);
    req.end();
    
  } catch (error) {
    console.error('❌ Error setting up webhook:', error);
    process.exit(1);
  }
}

async function verifyWebhook(botToken) {
  console.log('🔍 Verifying webhook...');
  
  try {
    const webhookInfoUrl = `https://api.telegram.org/bot${botToken}/getWebhookInfo`;
    const response = await makeRequest(webhookInfoUrl);
    
    if (response.status === 200 && response.data.ok) {
      const info = response.data.result;
      console.log('✅ Webhook verification:');
      console.log(`   URL: ${info.url}`);
      console.log(`   Has custom certificate: ${info.has_custom_certificate}`);
      console.log(`   Pending update count: ${info.pending_update_count}`);
      console.log(`   Last error date: ${info.last_error_date || 'None'}`);
      console.log(`   Last error message: ${info.last_error_message || 'None'}`);
      console.log(`   Max connections: ${info.max_connections}`);
      console.log(`   Allowed updates: ${info.allowed_updates?.join(', ') || 'All'}`);
      
      if (info.last_error_date) {
        console.log('⚠️  There was a previous error with the webhook');
      } else {
        console.log('🎉 Webhook is working correctly!');
      }
    } else {
      console.error('❌ Failed to get webhook info:', response.data);
    }
  } catch (error) {
    console.error('❌ Error verifying webhook:', error);
  }
}

// Run the setup
if (require.main === module) {
  setupWebhook();
}

module.exports = { setupWebhook, verifyWebhook };