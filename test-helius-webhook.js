import fetch from 'node-fetch';

// Test webhook payload that simulates a Helius webhook
const testPayload = {
  signature: 'test_signature_123456789',
  nativeTransfers: [{
    fromUserAccount: 'sender_wallet_address_123',
    toUserAccount: 'CQCPLL2jcQAVeHeqXYqDApTic7EzA1d8qPDEwHaW7BGw', // Wallet address for user with telegram_chat_id
    amount: 1000000 // 0.001 SOL in lamports
  }],
  tokenTransfers: [],
  timestamp: Date.now(),
  type: 'TRANSFER',
  source: 'HELIUS'
};

async function testHeliusWebhook() {
  try {
    console.log('🧪 Testing Helius webhook flow...');
    
    const webhookUrl = 'http://localhost:3000/api/webhooks/solana-helius';
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Helius/1.0'
      },
      body: JSON.stringify(testPayload)
    });
    
    const responseText = await response.text();
    
    console.log('📊 Response Status:', response.status);
    console.log('📄 Response Body:', responseText);
    
    if (response.ok) {
      console.log('✅ Webhook test successful!');
    } else {
      console.log('❌ Webhook test failed');
    }
    
  } catch (error) {
    console.error('🚨 Error testing webhook:', error.message);
  }
}

// Run the test
testHeliusWebhook();