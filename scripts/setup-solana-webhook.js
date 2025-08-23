const axios = require('axios');
require('dotenv').config();

// Helius API configuration
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_BASE_URL = 'https://api.helius.xyz/v0';

if (!HELIUS_API_KEY) {
  console.error('HELIUS_API_KEY environment variable is required');
  process.exit(1);
}

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://your-app.vercel.app';
const webhookUrl = `${BASE_URL}/api/webhooks/solana`;

// Helius webhook management functions
async function createWebhook(addresses) {
  try {
    const response = await axios.post(
      `${HELIUS_BASE_URL}/webhooks?api-key=${HELIUS_API_KEY}`,
      {
        webhookURL: webhookUrl,
        transactionTypes: ['Any'],
        accountAddresses: addresses,
        webhookType: 'enhanced'
      }
    );
    
    console.log('Webhook created successfully:');
    console.log('Webhook ID:', response.data.webhookID);
    console.log('Webhook URL:', response.data.webhookURL);
    console.log('Account Addresses:', response.data.accountAddresses);
    return response.data;
  } catch (error) {
    console.error('Error creating webhook:', error.response?.data || error.message);
    throw error;
  }
}

async function listWebhooks() {
  try {
    const response = await axios.get(
      `${HELIUS_BASE_URL}/webhooks?api-key=${HELIUS_API_KEY}`
    );
    
    console.log('Existing webhooks:');
    response.data.forEach((webhook, index) => {
      console.log(`\n${index + 1}. Webhook ID: ${webhook.webhookID}`);
      console.log(`   URL: ${webhook.webhookURL}`);
      console.log(`   Type: ${webhook.webhookType}`);
      console.log(`   Transaction Types: ${webhook.transactionTypes.join(', ')}`);
      console.log(`   Account Addresses: ${webhook.accountAddresses.length} addresses`);
      if (webhook.accountAddresses.length > 0) {
        console.log(`   First few addresses: ${webhook.accountAddresses.slice(0, 3).join(', ')}`);
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error listing webhooks:', error.response?.data || error.message);
    throw error;
  }
}

async function deleteWebhook(webhookId) {
  try {
    await axios.delete(
      `${HELIUS_BASE_URL}/webhooks/${webhookId}?api-key=${HELIUS_API_KEY}`
    );
    
    console.log(`Webhook ${webhookId} deleted successfully`);
  } catch (error) {
    console.error('Error deleting webhook:', error.response?.data || error.message);
    throw error;
  }
}

async function addAddressesToWebhook(webhookId, addresses) {
  try {
    const response = await axios.put(
      `${HELIUS_BASE_URL}/webhooks/${webhookId}?api-key=${HELIUS_API_KEY}`,
      {
        accountAddresses: addresses
      }
    );
    
    console.log(`Added ${addresses.length} addresses to webhook ${webhookId}`);
    console.log('Updated webhook:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error adding addresses to webhook:', error.response?.data || error.message);
    throw error;
  }
}

// CLI interface
const command = process.argv[2];
const args = process.argv.slice(3);

async function main() {
  try {
    switch (command) {
      case 'create':
        if (args.length === 0) {
          console.error('Usage: node setup-solana-webhook.js create <address1> [address2] ...');
          process.exit(1);
        }
        await createWebhook(args);
        break;
        
      case 'list':
        await listWebhooks();
        break;
        
      case 'delete':
        if (args.length !== 1) {
          console.error('Usage: node setup-solana-webhook.js delete <webhook-id>');
          process.exit(1);
        }
        await deleteWebhook(args[0]);
        break;
        
      case 'add-addresses':
        if (args.length < 2) {
          console.error('Usage: node setup-solana-webhook.js add-addresses <webhook-id> <address1> [address2] ...');
          process.exit(1);
        }
        const webhookId = args[0];
        const addresses = args.slice(1);
        await addAddressesToWebhook(webhookId, addresses);
        break;
        
      default:
        console.log('Solana Webhook Management Script');
        console.log('\nUsage:');
        console.log('  node setup-solana-webhook.js create <address1> [address2] ...    - Create a new webhook');
        console.log('  node setup-solana-webhook.js list                               - List all webhooks');
        console.log('  node setup-solana-webhook.js delete <webhook-id>                - Delete a webhook');
        console.log('  node setup-solana-webhook.js add-addresses <webhook-id> <addr>  - Add addresses to webhook');
        console.log('\nEnvironment variables required:');
        console.log('  HELIUS_API_KEY - Your Helius API key');
        console.log('  NEXT_PUBLIC_BASE_URL - Your application base URL');
        break;
    }
  } catch (error) {
    console.error('Script failed:', error.message);
    process.exit(1);
  }
}

main();

module.exports = {
  createWebhook,
  listWebhooks,
  deleteWebhook,
  addAddressesToWebhook
};