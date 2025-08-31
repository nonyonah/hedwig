// Simple test to check offramp callback handling
const axios = require('axios');

async function testOfframpCallback() {
  try {
    console.log('Testing offramp callback...');
    
    // Test the webhook endpoint with a callback query
    const response = await axios.post('http://localhost:3000/api/webhook', {
      update_id: 999999,
      callback_query: {
        id: 'test_callback',
        from: {
          id: 123456789,
          first_name: 'Test',
          username: 'testuser'
        },
        message: {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: {
            id: 123456789,
            type: 'private'
          },
          text: 'Test message'
        },
        data: 'payout_bank_ngn'
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
  } catch (error) {
    console.error('Error testing callback:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testOfframpCallback();