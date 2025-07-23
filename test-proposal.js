// Test script for proposal functionality
const { processProposalInput } = require('./src/lib/proposalService');

async function testProposal() {
  console.log('Testing proposal creation...');
  
  const testParams = {
    service_type: 'web development',
    client_name: 'Test Corp',
    budget: '5000',
    currency: 'USD',
    timeline: '6 weeks',
    description: 'Build a modern e-commerce website',
    features: ['responsive design', 'payment integration', 'admin dashboard']
  };
  
  const testUserId = 'test-user-123';
  
  try {
    const result = await processProposalInput(testParams, testUserId);
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

testProposal();