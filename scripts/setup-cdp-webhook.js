const { Coinbase, Webhook } = require('@coinbase/coinbase-sdk');
require('dotenv').config();

/**
 * Script to set up CDP webhook for USDC transfers on Base network
 * This webhook will notify our system when users receive USDC transfers
 */

async function setupCDPWebhook() {
  try {
    // Initialize Coinbase SDK
    const coinbase = new Coinbase({
      apiKeyName: process.env.CDP_API_KEY_NAME,
      privateKey: process.env.CDP_PRIVATE_KEY,
    });

    // Webhook configuration
    const webhookUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhooks/alchemy`; // Migrated to Alchemy
    const networkId = 'base-mainnet'; // Base network
    const eventType = 'erc20_transfer';
    
    // USDC contract address on Base
    const usdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

    console.log('Setting up CDP webhook...');
    console.log('Webhook URL:', webhookUrl);
    console.log('Network:', networkId);
    console.log('Event Type:', eventType);
    console.log('Asset Address:', usdcAddress);

    // Create the webhook
    const webhook = await Webhook.create({
      networkId: networkId,
      eventType: eventType,
      eventTypeFilter: {
        addresses: [usdcAddress], // Only monitor USDC transfers
      },
      notificationUri: webhookUrl,
      eventFilters: [
        {
          contract_address: usdcAddress,
          from_address: '*', // Monitor transfers from any address
          to_address: '*',   // Monitor transfers to any address
        }
      ]
    });

    console.log('✅ CDP Webhook created successfully!');
    console.log('Webhook ID:', webhook.getId());
    console.log('Webhook URL:', webhook.getNotificationUri());
    console.log('Network ID:', webhook.getNetworkId());
    console.log('Event Type:', webhook.getEventType());
    
    // Save webhook ID to environment or database for future reference
    console.log('\n📝 Save this webhook ID for future reference:');
    console.log(`CDP_WEBHOOK_ID=${webhook.getId()}`);
    
    return webhook;

  } catch (error) {
    console.error('❌ Error setting up CDP webhook:', error);
    
    if (error.message?.includes('authentication')) {
      console.log('\n🔑 Authentication Error:');
      console.log('Please ensure you have set the following environment variables:');
      console.log('- CDP_API_KEY_NAME');
      console.log('- CDP_PRIVATE_KEY');
      console.log('- CDP_WEBHOOK_SECRET');
    }
    
    if (error.message?.includes('network')) {
      console.log('\n🌐 Network Error:');
      console.log('Please check your internet connection and try again.');
    }
    
    throw error;
  }
}

// Function to list existing webhooks
async function listWebhooks() {
  try {
    const coinbase = new Coinbase({
      apiKeyName: process.env.CDP_API_KEY_NAME,
      privateKey: process.env.CDP_PRIVATE_KEY,
    });

    const webhooks = await Webhook.list();
    
    console.log('\n📋 Existing webhooks:');
    webhooks.forEach((webhook, index) => {
      console.log(`${index + 1}. ID: ${webhook.getId()}`);
      console.log(`   URL: ${webhook.getNotificationUri()}`);
      console.log(`   Network: ${webhook.getNetworkId()}`);
      console.log(`   Event: ${webhook.getEventType()}`);
      console.log('---');
    });
    
    return webhooks;
  } catch (error) {
    console.error('❌ Error listing webhooks:', error);
    throw error;
  }
}

// Function to delete a webhook
async function deleteWebhook(webhookId) {
  try {
    const coinbase = new Coinbase({
      apiKeyName: process.env.CDP_API_KEY_NAME,
      privateKey: process.env.CDP_PRIVATE_KEY,
    });

    const webhook = await Webhook.fetch(webhookId);
    await webhook.delete();
    
    console.log(`✅ Webhook ${webhookId} deleted successfully!`);
  } catch (error) {
    console.error(`❌ Error deleting webhook ${webhookId}:`, error);
    throw error;
  }
}

// Main execution
if (require.main === module) {
  const command = process.argv[2];
  const webhookId = process.argv[3];

  switch (command) {
    case 'create':
      setupCDPWebhook()
        .then(() => {
          console.log('\n🎉 Webhook setup completed!');
          process.exit(0);
        })
        .catch((error) => {
          console.error('Setup failed:', error);
          process.exit(1);
        });
      break;
      
    case 'list':
      listWebhooks()
        .then(() => {
          process.exit(0);
        })
        .catch((error) => {
          console.error('List failed:', error);
          process.exit(1);
        });
      break;
      
    case 'delete':
      if (!webhookId) {
        console.error('❌ Please provide a webhook ID to delete');
        console.log('Usage: node setup-cdp-webhook.js delete <webhook-id>');
        process.exit(1);
      }
      deleteWebhook(webhookId)
        .then(() => {
          process.exit(0);
        })
        .catch((error) => {
          console.error('Delete failed:', error);
          process.exit(1);
        });
      break;
      
    default:
      console.log('CDP Webhook Management Script');
      console.log('\nUsage:');
      console.log('  node setup-cdp-webhook.js create    - Create a new webhook');
      console.log('  node setup-cdp-webhook.js list      - List existing webhooks');
      console.log('  node setup-cdp-webhook.js delete <id> - Delete a webhook');
      console.log('\nEnvironment variables required:');
      console.log('  CDP_API_KEY_NAME - Your CDP API key name');
      console.log('  CDP_PRIVATE_KEY - Your CDP private key');
      console.log('  CDP_WEBHOOK_SECRET - Secret for webhook signature verification');
      console.log('  NEXT_PUBLIC_BASE_URL - Your application base URL');
      break;
  }
}

module.exports = {
  setupCDPWebhook,
  listWebhooks,
  deleteWebhook
};