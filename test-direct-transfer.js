import fetch from 'node-fetch';

// Test direct transfer notification
async function testDirectTransferNotification() {
  const testPayload = {
    type: 'direct_transfer',
    id: 'direct_0x1234567890abcdef',
    amount: 100,
    currency: 'USDC',
    transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    senderAddress: '0xSenderAddress123',
    recipientWallet: '0xRecipientWallet456',
    recipientUserId: '6642b3dc-aa3d-4ab6-ac5e-9e6845939162', // Using Vittorio's user ID for testing
    chain: 'base-mainnet',
    status: 'completed'
  };

  console.log('Sending test direct transfer notification...');
  console.log('Payload:', JSON.stringify(testPayload, null, 2));

  try {
    const response = await fetch('http://localhost:3000/api/webhooks/payment-notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload)
    });

    const responseText = await response.text();
    console.log('Response status:', response.status);
    console.log('Response:', responseText);

    if (response.ok) {
      console.log('✅ Test notification sent successfully!');
    } else {
      console.log('❌ Test notification failed');
    }
  } catch (error) {
    console.error('Error sending test notification:', error);
  }
}

testDirectTransferNotification();