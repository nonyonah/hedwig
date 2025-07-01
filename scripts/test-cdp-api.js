// Test script for CDP API connection
require('dotenv').config({ path: '.env.local' });

const CDP_API_URL = "https://api.cdp.coinbase.com/v2";
const CDP_API_KEY_ID = process.env.CDP_API_KEY_ID;
const CDP_API_KEY_SECRET = process.env.CDP_API_KEY_SECRET;

async function testCDPAPI() {
  console.log('Testing CDP API connection...');
  console.log('CDP API URL:', CDP_API_URL);
  console.log('CDP API Key ID:', CDP_API_KEY_ID ? `${CDP_API_KEY_ID.substring(0, 4)}...` : 'MISSING');
  console.log('CDP API Secret:', CDP_API_KEY_SECRET ? `Present (length: ${CDP_API_KEY_SECRET.length})` : 'MISSING');

  // Test 1: Try to get networks
  console.log('\n--- Test 1: Get Networks ---');
  try {
    const response = await fetch(`${CDP_API_URL}/networks`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'CDP-API-KEY': CDP_API_KEY_ID || '',
        'CDP-API-SECRET': CDP_API_KEY_SECRET || '',
      },
    });

    console.log('Response status:', response.status);
    console.log('Response status text:', response.statusText);
    
    const responseText = await response.text();
    console.log('Response body:', responseText);
    
    if (!response.ok) {
      console.error('Error getting networks');
    } else {
      console.log('Successfully retrieved networks');
    }
  } catch (error) {
    console.error('Error in networks test:', error);
  }

  // Test 2: Try to create a wallet
  console.log('\n--- Test 2: Create Wallet ---');
  try {
    const response = await fetch(`${CDP_API_URL}/accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CDP-API-KEY': CDP_API_KEY_ID || '',
        'CDP-API-SECRET': CDP_API_KEY_SECRET || '',
      },
      body: JSON.stringify({
        network: 'base-sepolia',
      }),
    });

    console.log('Response status:', response.status);
    console.log('Response status text:', response.statusText);
    
    const responseText = await response.text();
    console.log('Response body:', responseText);
    
    if (!response.ok) {
      console.error('Error creating wallet');
    } else {
      console.log('Successfully created wallet');
      try {
        const result = JSON.parse(responseText);
        console.log('Wallet address:', result.address);
      } catch (e) {
        console.log('Could not parse response as JSON');
      }
    }
  } catch (error) {
    console.error('Error in create wallet test:', error);
  }

  // Test 3: Try to get balances for a known address
  console.log('\n--- Test 3: Get Balances ---');
  const testAddress = '0x1234567890123456789012345678901234567890'; // Replace with a real address if available
  try {
    const response = await fetch(`${CDP_API_URL}/accounts/${testAddress}/balances?network=base-sepolia`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'CDP-API-KEY': CDP_API_KEY_ID || '',
        'CDP-API-SECRET': CDP_API_KEY_SECRET || '',
      },
    });

    console.log('Response status:', response.status);
    console.log('Response status text:', response.statusText);
    
    const responseText = await response.text();
    console.log('Response body:', responseText);
    
    if (response.status === 404) {
      console.log('Address not found (404) - this is expected for a test address');
    } else if (!response.ok) {
      console.error('Error getting balances');
    } else {
      console.log('Successfully retrieved balances');
    }
  } catch (error) {
    console.error('Error in balances test:', error);
  }
}

testCDPAPI().catch(console.error); 