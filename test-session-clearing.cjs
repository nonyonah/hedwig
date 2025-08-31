const fetch = require('node-fetch');

// Test session clearing and payout method selection functionality
async function testOfframpFlow() {
  const webhookUrl = 'http://localhost:3000/api/webhook';
  
  console.log('Testing offramp flow with action_offramp callback...');
  
  // Simulate clicking the "Start Withdrawal" button (action_offramp callback)
  const actionOfframpCallback = {
    update_id: Date.now() + 1,
    callback_query: {
      id: 'test_callback_' + Date.now(),
      from: {
        id: 810179883,
        is_bot: false,
        first_name: 'Test',
        username: 'testuser'
      },
      message: {
        message_id: Date.now(),
        chat: {
          id: 810179883,
          first_name: 'Test',
          username: 'testuser',
          type: 'private'
        },
        date: Math.floor(Date.now() / 1000),
        text: 'Previous message'
      },
      data: 'action_offramp'
    }
  };
  
  try {
    console.log('Sending action_offramp callback...');
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(actionOfframpCallback)
    });
    
    const result = await response.text();
    console.log('Response status:', response.status);
    console.log('Response:', result);
    
    if (response.status === 200) {
      console.log('✅ action_offramp callback sent successfully');
    } else {
      console.log('❌ Failed to send action_offramp callback');
    }
    
  } catch (error) {
    console.error('Error testing offramp flow:', error);
  }
}

testOfframpFlow().catch(console.error);