// Offramp Payload Debug Tool
// This script demonstrates the exact payload structure used in the offramp feature

function debugOfframpPayload() {
  console.log('🔍 Hedwig Offramp Payload Debug Tool\n');
  console.log('=' .repeat(60));
  
  // Sample user input from Telegram bot
  const userInput = {
    userId: 'telegram_user_123456',
    amount: 100, // User wants to withdraw 100 USDC
    currency: 'NGN', // Convert to Nigerian Naira
    token: 'USDC',
    bankDetails: {
      accountNumber: '1234567890',
      bankCode: '044', // Access Bank Nigeria
      accountName: 'John Doe',
      bankName: 'Access Bank'
    }
  };
  
  console.log('\n📱 1. TELEGRAM BOT INPUT:');
  console.log('User initiates withdrawal through Telegram bot');
  console.log(JSON.stringify(userInput, null, 2));
  
  console.log('\n' + '-'.repeat(60));
  
  // Internal server request structure
  const serverOfframpRequest = {
    userId: userInput.userId,
    amount: userInput.amount,
    currency: userInput.currency,
    bankDetails: userInput.bankDetails,
    network: 'base', // Added by server
    token: userInput.token
  };
  
  console.log('\n🖥️  2. SERVER OFFRAMP REQUEST:');
  console.log('Internal request structure in serverPaycrestService.ts');
  console.log(JSON.stringify(serverOfframpRequest, null, 2));
  
  console.log('\n' + '-'.repeat(60));
  
  // Exchange rate API call
  const rateApiCall = {
    method: 'GET',
    url: `https://api.paycrest.io/v1/rates/${userInput.token}/${userInput.amount}/${userInput.currency}`,
    headers: {
      'API-Key': '[PAYCREST_API_KEY]'
    },
    queryParams: {
      network: 'base',
      provider: userInput.bankDetails.bankCode
    }
  };
  
  console.log('\n💱 3. EXCHANGE RATE API CALL:');
  console.log('GET request to fetch current exchange rate');
  console.log(JSON.stringify(rateApiCall, null, 2));
  
  // Mock rate response
  const mockRateResponse = {
    data: {
      rate: 1650.50,
      fiatAmount: 165050, // 100 USDC * 1650.50 NGN
      provider: '044',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    }
  };
  
  console.log('\n📊 Rate API Response:');
  console.log(JSON.stringify(mockRateResponse, null, 2));
  
  console.log('\n' + '-'.repeat(60));
  
  // Final Paycrest order payload
  const paycrestOrderPayload = {
    amount: userInput.amount,
    token: userInput.token,
    rate: mockRateResponse.data.rate,
    network: 'base',
    recipient: {
      institution: userInput.bankDetails.bankCode, // Bank code, not name
      accountIdentifier: userInput.bankDetails.accountNumber,
      accountName: userInput.bankDetails.accountName,
      memo: `Hedwig offramp payment - ${userInput.amount} ${userInput.token}`,
      providerId: userInput.bankDetails.bankCode,
      metadata: {},
      currency: userInput.currency
    },
    reference: `hedwig-${Date.now()}`,
    returnAddress: '0x1234567890123456789012345678901234567890' // User's wallet address
  };
  
  console.log('\n🎯 4. FINAL PAYCREST ORDER PAYLOAD:');
  console.log('POST request to create order');
  console.log('URL: https://api.paycrest.io/v1/sender/orders');
  console.log('Headers: { "API-Key": "[PAYCREST_API_KEY]", "Content-Type": "application/json" }');
  console.log('Body:');
  console.log(JSON.stringify(paycrestOrderPayload, null, 2));
  
  console.log('\n' + '-'.repeat(60));
  
  // Expected response
  const expectedResponse = {
    data: {
      id: 'order_abc123def456',
      receiveAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
      amount: userInput.amount,
      expectedAmount: userInput.amount,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      reference: paycrestOrderPayload.reference
    }
  };
  
  console.log('\n📥 5. EXPECTED PAYCREST RESPONSE:');
  console.log(JSON.stringify(expectedResponse, null, 2));
  
  console.log('\n' + '='.repeat(60));
  console.log('\n🔄 COMPLETE FLOW SUMMARY:');
  console.log('1. User inputs withdrawal details via Telegram');
  console.log('2. Server validates input and constructs internal request');
  console.log('3. Server fetches current exchange rate from Paycrest');
  console.log('4. Server creates order with Paycrest Sender API');
  console.log('5. Paycrest returns order details with receive address');
  console.log('6. User transfers USDC to the receive address');
  console.log('7. Paycrest processes payment and sends NGN to bank account');
  
  console.log('\n🔧 DEBUG TIPS:');
  console.log('- Check PAYCREST_API_KEY environment variable');
  console.log('- Verify bank codes are valid Nigerian bank codes');
  console.log('- Ensure user has sufficient USDC balance');
  console.log('- Monitor order status via webhooks or polling');
  console.log('- Check network parameter matches user\'s wallet network');
  
  console.log('\n✅ Debug payload generation completed!');
}

// Run the debug function
debugOfframpPayload();

export { debugOfframpPayload };