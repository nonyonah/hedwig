// Test offramp cancel functionality
const fetch = require('node-fetch');

async function testOfframpCancel() {
  try {
    console.log('Testing offramp cancel functionality...');
    
    // Test cancel callback
    const cancelPayload = {
      update_id: 999999,
      callback_query: {
        id: 'test_cancel_callback',
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
        data: 'offramp_cancel'
      }
    };
    
    const response = await fetch('http://localhost:3000/api/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cancelPayload)
    });
    
    const responseData = await response.json();
    
    console.log('Cancel test response status:', response.status);
    console.log('Cancel test response data:', responseData);
    
    if (response.status === 200) {
      console.log('✅ Cancel callback processed successfully!');
    } else {
      console.log('❌ Cancel callback failed');
    }
    
  } catch (error) {
    console.error('Error testing cancel functionality:', error.message);
  }
}

testOfframpCancel();