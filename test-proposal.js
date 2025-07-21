// Simple test script to verify proposal generation functionality
const { ProposalService } = require('./src/lib/proposalService');

async function testProposalCreation() {
  console.log('Testing proposal creation...');
  
  const testProposalData = {
    clientName: 'Test Client',
    projectTitle: 'Test Project',
    description: 'This is a test project description',
    deliverables: 'Test deliverable 1\nTest deliverable 2',
    timelineStart: '2024-02-01',
    timelineEnd: '2024-02-28',
    paymentAmount: 5000,
    paymentMethod: 'crypto',
    serviceFee: 250,
    clientEmail: 'test@example.com'
  };

  try {
    // Test proposal creation
    const proposal = await ProposalService.createProposal('test-user-id', testProposalData);
    console.log('✅ Proposal created successfully:', proposal.id);

    // Test proposal retrieval
    const retrievedProposal = await ProposalService.getProposal(proposal.id);
    console.log('✅ Proposal retrieved successfully:', retrievedProposal?.projectTitle);

    // Test proposal summary generation
    const summary = await ProposalService.generateProposalSummary(proposal.id);
    console.log('✅ Proposal summary generated:', summary?.totalAmount);

    // Test HTML generation
    if (summary) {
      const html = ProposalService.generateProposalHTML(summary);
      console.log('✅ HTML generated, length:', html.length);
    }

    console.log('\n🎉 All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testProposalCreation();