/**
 * Test script to verify webhook notification flow
 * Run with: npx tsx src/scripts/test-webhook-flow.ts
 */

async function testWebhookFlow() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  
  // Test payload for direct transfer
  const testPayload = {
    type: 'direct_transfer',
    id: 'test_transfer_123',
    amount: 10.5,
    currency: 'USDC',
    transactionHash: '0x1234567890abcdef',
    senderAddress: '0xabcdef1234567890',
    recipientWallet: '0x9876543210fedcba',
    recipientUserId: 'test-user-id', // Replace with actual user ID
    status: 'completed',
    chain: 'base'
  };

  console.log('🧪 Testing webhook notification flow...');
  console.log('📤 Sending test payload:', JSON.stringify(testPayload, null, 2));

  try {
    const response = await fetch(`${baseUrl}/api/webhooks/payment-notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload)
    });

    const responseData = await response.text();
    
    if (response.ok) {
      console.log('✅ Webhook test successful:', responseData);
    } else {
      console.error('❌ Webhook test failed:', response.status, responseData);
    }
  } catch (error) {
    console.error('❌ Webhook test error:', error);
  }
}

// Test Telegram bot directly
async function testTelegramBot() {
  const testChatId = 'YOUR_CHAT_ID'; // Replace with actual chat ID
  const testMessage = '🧪 <b>Test Message</b>\n\nThis is a test notification from Hedwig Bot.';

  console.log('🤖 Testing Telegram bot directly...');

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/test-telegram`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chatId: testChatId,
        message: testMessage
      })
    });

    const responseData = await response.json();
    
    if (response.ok) {
      console.log('✅ Telegram test successful:', responseData);
    } else {
      console.error('❌ Telegram test failed:', responseData);
    }
  } catch (error) {
    console.error('❌ Telegram test error:', error);
  }
}

// Run tests
async function runTests() {
  console.log('🚀 Starting webhook tests...\n');
  
  // Test 1: Telegram bot
  await testTelegramBot();
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 2: Webhook flow
  await testWebhookFlow();
  
  console.log('\n✅ Tests completed!');
}

if (require.main === module) {
  runTests().catch(console.error);
}

export { testWebhookFlow, testTelegramBot };