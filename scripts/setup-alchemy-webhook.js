const axios = require('axios');
require('dotenv').config();

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const WEBHOOK_URL = process.env.NEXT_PUBLIC_BASE_URL + '/api/webhooks/alchemy';
const BASE_USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

if (!ALCHEMY_API_KEY) {
  console.error('ALCHEMY_API_KEY environment variable is required');
  process.exit(1);
}

if (!process.env.NEXT_PUBLIC_BASE_URL) {
  console.error('NEXT_PUBLIC_BASE_URL environment variable is required');
  process.exit(1);
}

async function createAlchemyWebhook() {
  try {
    console.log('Creating Alchemy webhook...');
    console.log('Webhook URL:', WEBHOOK_URL);
    console.log('Tracking USDC transfers on Base Mainnet');

    const response = await axios.post(
      'https://dashboard.alchemy.com/api/create-webhook',
      {
        webhook_type: 'ADDRESS_ACTIVITY',
        webhook_url: WEBHOOK_URL,
        is_active: true,
        network: 'BASE_MAINNET',
        addresses: [], // Will be populated with user wallet addresses
        app_id: process.env.ALCHEMY_APP_ID || 'default'
      },
      {
        headers: {
          'X-Alchemy-Token': ALCHEMY_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Webhook created successfully!');
    console.log('Webhook ID:', response.data.data.id);
    console.log('Signing Key:', response.data.data.signing_key);
    console.log('');
    console.log('IMPORTANT: Add this to your .env file:');
    console.log(`ALCHEMY_WEBHOOK_SECRET=${response.data.data.signing_key}`);
    console.log('');
    console.log('Note: You will need to add wallet addresses to this webhook');
    console.log('using the Alchemy dashboard or API as users register.');

  } catch (error) {
    console.error('Error creating webhook:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.error('Authentication failed. Please check your ALCHEMY_API_KEY.');
    } else if (error.response?.status === 400) {
      console.error('Bad request. Please check the webhook configuration.');
    }
  }
}

async function listWebhooks() {
  try {
    console.log('Listing existing webhooks...');
    
    const response = await axios.get(
      'https://dashboard.alchemy.com/api/team-webhooks',
      {
        headers: {
          'X-Alchemy-Token': ALCHEMY_API_KEY
        }
      }
    );

    const webhooks = response.data.data;
    console.log(`Found ${webhooks.length} webhook(s):`);
    
    webhooks.forEach((webhook, index) => {
      console.log(`\n${index + 1}. Webhook ID: ${webhook.id}`);
      console.log(`   Type: ${webhook.webhook_type}`);
      console.log(`   URL: ${webhook.webhook_url}`);
      console.log(`   Network: ${webhook.network}`);
      console.log(`   Active: ${webhook.is_active}`);
      console.log(`   Addresses: ${webhook.addresses?.length || 0}`);
    });

  } catch (error) {
    console.error('Error listing webhooks:', error.response?.data || error.message);
  }
}

async function deleteWebhook(webhookId) {
  try {
    console.log(`Deleting webhook ${webhookId}...`);
    
    await axios.delete(
      `https://dashboard.alchemy.com/api/delete-webhook`,
      {
        headers: {
          'X-Alchemy-Token': ALCHEMY_API_KEY,
          'Content-Type': 'application/json'
        },
        data: {
          webhook_id: webhookId
        }
      }
    );

    console.log('Webhook deleted successfully!');

  } catch (error) {
    console.error('Error deleting webhook:', error.response?.data || error.message);
  }
}

async function addAddressToWebhook(webhookId, address) {
  try {
    console.log(`Adding address ${address} to webhook ${webhookId}...`);
    
    await axios.patch(
      'https://dashboard.alchemy.com/api/update-webhook-addresses',
      {
        webhook_id: webhookId,
        addresses_to_add: [address.toLowerCase()],
        addresses_to_remove: []
      },
      {
        headers: {
          'X-Alchemy-Token': ALCHEMY_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Address added successfully!');

  } catch (error) {
    console.error('Error adding address:', error.response?.data || error.message);
  }
}

// Command line interface
const command = process.argv[2];
const arg1 = process.argv[3];
const arg2 = process.argv[4];

switch (command) {
  case 'create':
    createAlchemyWebhook();
    break;
  case 'list':
    listWebhooks();
    break;
  case 'delete':
    if (!arg1) {
      console.error('Please provide webhook ID: node setup-alchemy-webhook.js delete <webhook_id>');
      process.exit(1);
    }
    deleteWebhook(arg1);
    break;
  case 'add-address':
    if (!arg1 || !arg2) {
      console.error('Please provide webhook ID and address: node setup-alchemy-webhook.js add-address <webhook_id> <address>');
      process.exit(1);
    }
    addAddressToWebhook(arg1, arg2);
    break;
  default:
    console.log('Alchemy Webhook Management Script');
    console.log('');
    console.log('Usage:');
    console.log('  node setup-alchemy-webhook.js create           - Create new webhook');
    console.log('  node setup-alchemy-webhook.js list             - List all webhooks');
    console.log('  node setup-alchemy-webhook.js delete <id>      - Delete webhook');
    console.log('  node setup-alchemy-webhook.js add-address <id> <address> - Add address to webhook');
    console.log('');
    console.log('Environment variables required:');
    console.log('  ALCHEMY_API_KEY - Your Alchemy API key');
    console.log('  NEXT_PUBLIC_BASE_URL - Your application base URL');
    console.log('  ALCHEMY_APP_ID - Your Alchemy app ID (optional)');
    break;
}