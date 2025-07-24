const { proposalTemplate } = require('./src/lib/whatsappTemplates.ts');
const { sendWhatsAppTemplate } = require('./src/lib/whatsappUtils.ts');

// Test the proposal template
async function testProposalTemplate() {
  console.log('Testing proposal template...');
  
  const testTemplate = proposalTemplate({
    client_name: 'Test Client',
    document_link: 'https://hedwigbot.xyz/api/proposal-pdf/test-123'
  });
  
  console.log('Generated template:', JSON.stringify(testTemplate, null, 2));
  
  // Test sending to a test number (replace with actual test number)
  const testPhoneNumber = '+1234567890'; // Replace with your test number
  
  try {
    console.log('Attempting to send template...');
    const result = await sendWhatsAppTemplate(testPhoneNumber, testTemplate);
    console.log('Template sent successfully:', result);
  } catch (error) {
    console.error('Template sending failed:', error);
    console.error('Error details:', error.message);
  }
}

testProposalTemplate();