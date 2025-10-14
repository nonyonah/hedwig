import fetch from 'node-fetch';

const testMessages = [
  'connect my calendar',
  'sync my google calendar',
  'I want to link my calendar',
  'check my calendar status'
];

const userId = '12345';

async function testNaturalLanguageCalendar() {
  console.log('Testing natural language calendar commands...\n');
  
  for (const message of testMessages) {
    console.log(`Testing: "${message}"`);
    
    try {
      const response = await fetch('http://localhost:3000/api/test-final-integration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          message,
          type: 'botIntegration'
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        console.log('✅ Success');
        console.log('Messages sent:', result.botIntegrationMessages?.length || 0);
        if (result.botIntegrationMessages?.length > 0) {
          result.botIntegrationMessages.forEach((msg, i) => {
            console.log(`  Message ${i + 1}: ${msg.text}`);
          });
        }
      } else {
        console.log('❌ Failed:', result.error);
      }
    } catch (error) {
      console.log('❌ Error:', error.message);
    }
    
    console.log('---\n');
  }
}

testNaturalLanguageCalendar();