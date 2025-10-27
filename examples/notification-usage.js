// Example usage of the Project Notification System

// 1. Manual testing via API calls
const testNotifications = async () => {
  const baseUrl = 'http://localhost:3000'; // or your production URL
  
  // Test deadline notification
  const deadlineTest = await fetch(`${baseUrl}/api/test-monitoring`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'test_deadline_notification',
      testData: {
        contractId: 'test-contract-123',
        projectTitle: 'Website Development Project',
        freelancerId: 'freelancer-456',
        freelancerName: 'John Developer',
        freelancerEmail: 'john@example.com',
        clientName: 'Jane Client',
        clientEmail: 'jane@company.com',
        amount: 2500,
        currency: 'USDC',
        deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() // 3 days from now
      }
    })
  });
  
  console.log('Deadline test result:', await deadlineTest.json());
  
  // Test milestone completion notification
  const milestoneTest = await fetch(`${baseUrl}/api/test-monitoring`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'test_milestone_notification',
      testData: {
        contractId: 'test-contract-123',
        projectTitle: 'Website Development Project',
        freelancerId: 'freelancer-456',
        freelancerName: 'John Developer',
        freelancerEmail: 'john@example.com',
        clientName: 'Jane Client',
        clientEmail: 'jane@company.com',
        amount: 1000,
        currency: 'USDC',
        milestoneTitle: 'Frontend Development Complete'
      }
    })
  });
  
  console.log('Milestone test result:', await milestoneTest.json());
  
  // Test payment notification
  const paymentTest = await fetch(`${baseUrl}/api/test-monitoring`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'test_payment_notification',
      testData: {
        contractId: 'test-contract-123',
        projectTitle: 'Website Development Project',
        freelancerId: 'freelancer-456',
        freelancerName: 'John Developer',
        freelancerEmail: 'john@example.com',
        clientName: 'Jane Client',
        clientEmail: 'jane@company.com',
        amount: 1000,
        currency: 'USDC',
        invoiceId: 'invoice-789'
      }
    })
  });
  
  console.log('Payment test result:', await paymentTest.json());
};

// 2. Complete a milestone programmatically
const completeMilestone = async (milestoneId) => {
  const response = await fetch(`/api/milestones/${milestoneId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  
  const result = await response.json();
  if (result.success) {
    console.log('Milestone completed and notifications sent!');
  } else {
    console.error('Failed to complete milestone:', result.error);
  }
};

// 3. Mark an invoice as paid
const markInvoicePaid = async (invoiceId, transactionHash, paymentAmount) => {
  const response = await fetch(`/api/invoices/${invoiceId}/mark-paid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transactionHash,
      paymentAmount
    })
  });
  
  const result = await response.json();
  if (result.success) {
    console.log('Invoice marked as paid and notifications sent!');
  } else {
    console.error('Failed to mark invoice as paid:', result.error);
  }
};

// 4. Run monitoring checks manually
const runMonitoring = async () => {
  const response = await fetch('/api/monitoring/project-notifications', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer your-monitoring-api-key',
      'Content-Type': 'application/json'
    }
  });
  
  const result = await response.json();
  console.log('Monitoring result:', result);
};

// 5. Integration with existing contract approval flow
const approveContractWithNotifications = async (contractId) => {
  try {
    // Your existing contract approval logic here
    // ...
    
    // After successful approval, the notification system will automatically:
    // 1. Send approval notifications (already implemented in approve.ts)
    // 2. Monitor for deadlines (via cron job)
    // 3. Track milestone completions
    // 4. Monitor invoice payments
    
    console.log('Contract approved with notification monitoring enabled');
  } catch (error) {
    console.error('Contract approval failed:', error);
  }
};

// Export functions for use in other modules
module.exports = {
  testNotifications,
  completeMilestone,
  markInvoicePaid,
  runMonitoring,
  approveContractWithNotifications
};

// Example cron job setup (for reference)
/*
# Add this to your crontab (crontab -e) to run monitoring every hour:
0 * * * * curl -X POST "https://your-app.vercel.app/api/monitoring/project-notifications" \
  -H "Authorization: Bearer your-monitoring-key" \
  -H "Content-Type: application/json" >> /var/log/hedwig-monitoring.log 2>&1

# Or use the setup script:
chmod +x scripts/setup-monitoring-cron.sh
export NEXT_PUBLIC_APP_URL="https://your-app.vercel.app"
export MONITORING_API_KEY="your-secure-monitoring-key"
./scripts/setup-monitoring-cron.sh
*/