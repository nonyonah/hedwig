// Test script for CDP API connection
require('dotenv').config({ path: '.env.local' });
const crypto = require('crypto');

const CDP_API_URL = "https://api.cdp.coinbase.com/v2";
const CDP_API_KEY_ID = process.env.CDP_API_KEY_ID;
const CDP_API_KEY_SECRET = process.env.CDP_API_KEY_SECRET;

/**
 * Generate JWT token for CDP API authentication
 * @param method The HTTP method
 * @param path The request path
 * @param body Optional request body
 * @returns The JWT token
 */
async function generateJWT(method, path, body) {
  try {
    console.log(`Generating JWT for ${method} ${path}`);
    
    if (!CDP_API_KEY_ID || !CDP_API_KEY_SECRET) {
      throw new Error("CDP API credentials not configured");
    }
    
    // Create timestamp (seconds since epoch)
    const timestamp = Math.floor(Date.now() / 1000).toString();
    
    // Create a random nonce (jti)
    const jti = crypto.randomBytes(16).toString('hex');
    
    // Create the URI claim
    const uri = `${method} api.cdp.coinbase.com${path}`;
    
    // Create the JWT header
    const header = {
      alg: "HS256",
      typ: "JWT"
    };
    
    // Create the JWT payload
    const payload = {
      iat: timestamp,
      nbf: timestamp,
      exp: parseInt(timestamp) + 120, // Token valid for 2 minutes
      sub: CDP_API_KEY_ID,
      iss: "cdp-api",
      jti: jti,
      uris: [uri]
    };
    
    // Add request body to payload if provided
    if (body) {
      payload.req = body;
    }
    
    // Encode header and payload
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    // Create the signature
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto.createHmac('sha256', CDP_API_KEY_SECRET)
      .update(signatureInput)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    // Combine to create the JWT
    const jwt = `${encodedHeader}.${encodedPayload}.${signature}`;
    
    return jwt;
  } catch (error) {
    console.error("Error generating JWT:", error);
    throw error;
  }
}

async function testCDPAPI() {
  console.log('Testing CDP API connection...');
  console.log('CDP API URL:', CDP_API_URL);
  console.log('CDP API Key ID:', CDP_API_KEY_ID ? `${CDP_API_KEY_ID.substring(0, 4)}...` : 'MISSING');
  console.log('CDP API Secret:', CDP_API_KEY_SECRET ? `Present (length: ${CDP_API_KEY_SECRET.length})` : 'MISSING');

  // Test 1: Try to get networks
  console.log('\n--- Test 1: Get Networks ---');
  try {
    // Generate JWT for networks endpoint
    const path = "/networks";
    const jwt = await generateJWT("GET", path);
    
    const response = await fetch(`${CDP_API_URL}${path}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
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
    // Generate JWT for account creation
    const path = "/accounts";
    const body = { network: 'base-sepolia' };
    const jwt = await generateJWT("POST", path, body);
    
    const response = await fetch(`${CDP_API_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify(body),
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
    // Generate JWT for balances endpoint
    const path = `/accounts/${testAddress}/balances`;
    const jwt = await generateJWT("GET", `${path}?network=base-sepolia`);
    
    const response = await fetch(`${CDP_API_URL}${path}?network=base-sepolia`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
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