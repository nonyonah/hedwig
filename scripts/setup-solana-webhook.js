// Helius Solana webhook management functions
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config({ path: '.env.local' });

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_BASE_URL = 'https://api.helius.xyz';

if (!HELIUS_API_KEY) {
  console.error('❌ HELIUS_API_KEY environment variable is required');
  process.exit(1);
}

const NEXT_PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;
const webhookUrl = `${NEXT_PUBLIC_BASE_URL}/api/webhooks/solana-helius`;

// Helius Solana webhook management functions
async function createWebhook(addresses) {
  try {
    const response = await fetch(`${HELIUS_BASE_URL}/v0/webhooks?api-key=${HELIUS_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        webhookURL: webhookUrl,
        transactionTypes: ['Any'],
        accountAddresses: addresses,
        webhookType: 'enhanced'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('✅ Webhook created successfully:', data);
    return data;
  } catch (error) {
    console.error('❌ Error creating webhook:', error.message);
    throw error;
  }
}

async function listWebhooks() {
  try {
    const response = await fetch(`${HELIUS_BASE_URL}/v0/webhooks?api-key=${HELIUS_API_KEY}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('📋 Existing webhooks:', JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    console.error('❌ Error listing webhooks:', error.message);
    throw error;
  }
}

async function deleteWebhook(webhookId) {
  try {
    const response = await fetch(`${HELIUS_BASE_URL}/v0/webhooks/${webhookId}?api-key=${HELIUS_API_KEY}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    console.log(`✅ Webhook ${webhookId} deleted successfully`);
  } catch (error) {
    console.error('❌ Error deleting webhook:', error.message);
    throw error;
  }
}

async function addAddressesToWebhook(webhookId, addresses) {
  try {
    const response = await fetch(`${HELIUS_BASE_URL}/v0/webhooks/${webhookId}?api-key=${HELIUS_API_KEY}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accountAddresses: addresses
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log(`✅ Added ${addresses.length} addresses to webhook ${webhookId}`);
    console.log('Updated webhook:', data);
    return data;
  } catch (error) {
    console.error('❌ Error adding addresses to webhook:', error.message);
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
        console.log('  HELIUS_API_KEY - Your Helius API key (get one at https://www.helius.xyz)');
        console.log('  NEXT_PUBLIC_BASE_URL - Your application base URL');
        break;
    }
  } catch (error) {
    console.error('Script failed:', error.message);
    process.exit(1);
  }
}

main();

export {
  createWebhook,
  listWebhooks,
  deleteWebhook,
  addAddressesToWebhook
};