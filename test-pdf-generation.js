const { generateEarningsPDF } = require('./src/modules/pdf-generator-earnings');
const fs = require('fs');

// Test data for PDF generation
const testEarningsData = {
  walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
  timeframe: 'allTime',
  totalEarnings: 1250.75,
  totalFiatValue: 1875.50,
  totalPayments: 15,
  earnings: [
    {
      token: 'USDC',
      network: 'Base',
      total: 850.25,
      count: 8,
      averageAmount: 106.28,
      lastPayment: '2024-01-15',
      fiatValue: 850.25,
      fiatCurrency: 'USD',
      exchangeRate: 1.0,
      percentage: 68.0,
      category: 'freelance',
      source: 'client_payments'
    },
    {
      token: 'ETH',
      network: 'Base',
      total: 0.15,
      count: 3,
      averageAmount: 0.05,
      lastPayment: '2024-01-10',
      fiatValue: 375.00,
      fiatCurrency: 'USD',
      exchangeRate: 2500.0,
      percentage: 20.0,
      category: 'consulting',
      source: 'direct_transfer'
    },
    {
      token: 'USDT',
      network: 'Base',
      total: 400.50,
      count: 4,
      averageAmount: 100.125,
      lastPayment: '2024-01-12',
      fiatValue: 400.50,
      fiatCurrency: 'USD',
      exchangeRate: 1.0,
      percentage: 12.0,
      category: 'services',
      source: 'payment_link'
    }
  ],
  period: {
    startDate: '2024-01-01',
    endDate: '2024-01-31'
  },
  insights: {
    largestPayment: {
      amount: 250.0,
      token: 'USDC',
      network: 'Base',
      date: '2024-01-15',
      fiatValue: 250.0
    },
    topToken: {
      token: 'USDC',
      totalAmount: 850.25,
      percentage: 68.0
    },
    motivationalMessage: '🚀 Amazing progress! You\'re building a solid crypto income stream. Keep up the great work!'
  }
};

async function testPDFGeneration() {
  try {
    console.log('🧪 Testing PDF generation...');
    
    const pdfBuffer = await generateEarningsPDF(testEarningsData);
    
    console.log('✅ PDF generated successfully!');
    console.log(`📄 PDF size: ${pdfBuffer.length} bytes`);
    
    // Save test PDF to file
    const filename = `test-earnings-report-${new Date().toISOString().split('T')[0]}.pdf`;
    fs.writeFileSync(filename, pdfBuffer);
    
    console.log(`💾 Test PDF saved as: ${filename}`);
    console.log('🎉 PDF generation test completed successfully!');
    
  } catch (error) {
    console.error('❌ PDF generation test failed:', error);
    process.exit(1);
  }
}

testPDFGeneration();