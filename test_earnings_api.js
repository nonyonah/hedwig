// Test script for earnings API
const testWalletAddress = '0x1234567890123456789012345678901234567890'; // Example wallet address

async function testEarningsAPI() {
  console.log('Testing Earnings API...');
  
  try {
    // Test basic earnings endpoint
    const response = await fetch('http://localhost:3000/api/earnings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        walletAddress: testWalletAddress,
        timeframe: 'allTime',
        type: 'earnings'
      })
    });
    
    const data = await response.json();
    console.log('\n=== Earnings API Response ===');
    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(data, null, 2));
    
    if (data.success) {
      console.log('\n✅ Earnings API is working!');
      console.log(`Total Earnings: ${data.data.totalEarnings}`);
      console.log(`Total Payments: ${data.data.totalPayments}`);
      console.log(`Earnings Items: ${data.data.earnings.length}`);
    } else {
      console.log('\n❌ Earnings API returned error:', data.error);
    }
    
  } catch (error) {
    console.error('\n❌ Error testing earnings API:', error.message);
  }
  
  try {
    // Test natural language query endpoint
    const queryResponse = await fetch('http://localhost:3000/api/earnings/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'How much have I earned this month?',
        walletAddress: testWalletAddress
      })
    });
    
    const queryData = await queryResponse.json();
    console.log('\n=== Natural Language Query Response ===');
    console.log('Status:', queryResponse.status);
    console.log('Data:', JSON.stringify(queryData, null, 2));
    
    if (queryData.success) {
      console.log('\n✅ Natural Language Query API is working!');
      console.log('Response:', queryData.response);
    } else {
      console.log('\n❌ Query API returned error:', queryData.error);
    }
    
  } catch (error) {
    console.error('\n❌ Error testing query API:', error.message);
  }
}

// Run the test
testEarningsAPI();