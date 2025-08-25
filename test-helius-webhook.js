import fetch from 'node-fetch';

// Test webhook payload that simulates a Helius webhook
const testPayload = {
  type: 'TRANSFER',
  source: 'HELIUS',
  data: [{
    signature: 'test_signature_123456789',
    nativeTransfers: [{
      fromUserAccount: 'sender_wallet_address_123',
      toUserAccount: 'nonyonah@gmail.com', // This should match a user in your database
      amount: 1000000 // 0.001 SOL in lamports
    }],
    tokenTransfers: [],
    timestamp: Date.now()
  }]
};

async function testHeliusWebhook() {
  try {
    console.log('🧪 Testing Helius webhook flow...');
    
    const webhookUrl = 'https://afbe0011bf06.ngrok-free.app/api/webhooks/solana-helius';
    
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