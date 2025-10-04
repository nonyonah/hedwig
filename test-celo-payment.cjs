const fetch = require('node-fetch');

async function testCeloPaymentLink() {
  const testPayload = {
    amount: 10,
    token: 'USDC',
    network: 'celo',
    walletAddress: '0x742d35Cc6634C0532925a3b8D0C9C0E3C5d5c8eB', // Test wallet address
    userName: 'Test User',
    for: 'Testing Celo USDC payment integration',
    recipientEmail: 'test@example.com',
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days from now
  };

  try {
    console.log('🧪 Testing Celo payment link creation...');
    console.log('Payload:', JSON.stringify(testPayload, null, 2));

    const response = await fetch('http://localhost:3000/api/create-payment-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload)
    });

    const result = await response.json();
    
    console.log('\n📊 Response Status:', response.status);
    console.log('📋 Response Body:', JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('\n✅ SUCCESS: Celo payment link created successfully!');
      console.log('🔗 Payment Link:', result.paymentLink);
      console.log('🆔 Payment ID:', result.id);
    } else {
      console.log('\n❌ FAILED: Payment link creation failed');
      console.log('Error:', result.error);
    }

  } catch (error) {
    console.error('\n💥 ERROR: Failed to test payment link creation');
    console.error('Details:', error.message);
  }
}

// Test different network configurations
async function testNetworkSupport() {
  const networks = ['celo', 'base', 'polygon'];
  const tokens = ['USDC', 'cUSD'];
  
  console.log('\n🌐 Testing network and token combinations...\n');
  
  for (const network of networks) {
    for (const token of tokens) {
      // Skip invalid combinations
      if (network !== 'celo' && token === 'cUSD') continue;
      
      const testPayload = {
        amount: 5,
        token: token,
        network: network,
        walletAddress: '0x742d35Cc6634C0532925a3b8D0C9C0E3C5d5c8eB',
        userName: 'Test User',
        for: `Testing ${network} ${token} payment`
      };

      try {
        console.log(`Testing ${network} + ${token}...`);
        const response = await fetch('http://localhost:3000/api/create-payment-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testPayload)
        });

        const result = await response.json();
        
        if (result.success) {
          console.log(`✅ ${network} + ${token}: SUCCESS`);
        } else {
          console.log(`❌ ${network} + ${token}: FAILED - ${result.error}`);
        }
      } catch (error) {
        console.log(`💥 ${network} + ${token}: ERROR - ${error.message}`);
      }
    }
  }
}

// Run tests
async function runTests() {
  console.log('🚀 Starting Celo Payment Integration Tests\n');
  
  await testCeloPaymentLink();
  await testNetworkSupport();
  
  console.log('\n🏁 Tests completed!');
}

runTests();