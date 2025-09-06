import PDFDocument from 'pdfkit';

export interface EarningsData {
  walletAddress?: string;
  walletAddresses?: string[];
  timeframe: string;
  totalEarnings: number;
  totalFiatValue?: number;
  totalPayments: number;
  earnings: Array<{
    token: string;
    network: string;
    total: number;
    count: number;
    averageAmount: number;
    lastPayment?: string;
    fiatValue?: number;
    fiatCurrency?: string;
    exchangeRate?: number;
    percentage?: number;
    category?: string;
    source?: string;
  }>;
  period: {
    startDate: string;
    endDate: string;
  };
  insights?: {
    largestPayment?: {
      amount: number;
      token: string;
      network: string;
      date: string;
      fiatValue?: number;
    };
    topToken?: {
      token: string;
      totalAmount: number;
      percentage: number;
    };
    motivationalMessage?: string;
  };
}

export async function generateEarningsPDF(data: EarningsData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, bufferPages: true });
      const buffers: Buffer[] = [];
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });

      // Header with professional styling
      doc.rect(0, 0, doc.page.width, 80)
         .fillColor('#2563EB')
         .fill();
      
      doc.fillColor('white')
         .fontSize(22)
         .font('Helvetica-Bold')
         .text('EARNINGS SUMMARY REPORT', 50, 25, { align: 'left' });
      
      // Format wallet addresses display
      const walletDisplay = data.walletAddresses && data.walletAddresses.length > 0 
        ? data.walletAddresses.length > 1 
          ? `${data.walletAddresses.length} Wallets (Multi-chain)`
          : `${data.walletAddresses[0].slice(0, 10)}...${data.walletAddresses[0].slice(-4)}`
        : data.walletAddress 
          ? `${data.walletAddress.slice(0, 10)}...${data.walletAddress.slice(-4)}`
          : 'N/A';
      
      doc.fontSize(10)
         .text(`Period: ${data.period.startDate} to ${data.period.endDate}`, 50, 50, { align: 'left' })
         .text(`Wallet: ${walletDisplay}`, 50, 62, { align: 'left' });

      // Main content
      let yPosition = 110;
      
      // Total earnings section
      doc.fillColor('#1F2937')
         .fontSize(16)
         .font('Helvetica-Bold')
         .text('FINANCIAL OVERVIEW', 50, yPosition);
      
      yPosition += 25;
      
      // Create a table-like structure for better alignment
      doc.fontSize(12)
         .font('Helvetica')
         .text('Total Earnings:', 70, yPosition)
         .text(`${data.totalEarnings.toFixed(6)} tokens`, 200, yPosition, { align: 'left' });
      
      yPosition += 18;
      doc.text('Total Payments:', 70, yPosition)
         .text(`${data.totalPayments}`, 200, yPosition, { align: 'left' });
      
      if (data.totalFiatValue) {
        yPosition += 18;
        doc.text('Total USD Value:', 70, yPosition)
           .text(`$${data.totalFiatValue.toFixed(2)}`, 200, yPosition, { align: 'left' });
      }
      
      yPosition += 35;
      
      // Earnings breakdown with proper table formatting
      doc.fontSize(14)
         .fillColor('#1F2937')
         .font('Helvetica-Bold')
         .text('EARNINGS BREAKDOWN', 50, yPosition);
      
      yPosition += 25;
      
      // Table headers
      doc.fontSize(10)
         .fillColor('#6B7280')
         .font('Helvetica-Bold')
         .text('TOKEN', 70, yPosition)
         .text('NETWORK', 150, yPosition)
         .text('AMOUNT', 230, yPosition)
         .text('COUNT', 320, yPosition)
         .text('USD VALUE', 380, yPosition);
      
      yPosition += 15;
      
      // Draw line under headers
      doc.moveTo(70, yPosition)
         .lineTo(480, yPosition)
         .strokeColor('#E5E7EB')
         .stroke();
      
      yPosition += 10;

      data.earnings.slice(0, 8).forEach((earning, index) => {
        doc.fontSize(9)
           .fillColor('#374151')
           .font('Helvetica')
           .text(earning.token, 70, yPosition)
           .text(earning.network, 150, yPosition)
           .text(earning.total.toFixed(6), 230, yPosition)
           .text(earning.count.toString(), 320, yPosition);
        
        if (earning.fiatValue) {
          doc.text(`$${earning.fiatValue.toFixed(2)}`, 380, yPosition);
        }
        
        yPosition += 15;
        
        // Add alternating row colors for better readability
        if (index % 2 === 0) {
          doc.rect(65, yPosition - 5, 420, 12)
             .fillColor('#F9FAFB')
             .fill();
          doc.fillColor('#374151');
        }
      });
      
      yPosition += 25;
      
      // Insights section with professional formatting
      if (data.insights) {
        doc.fontSize(14)
           .fillColor('#1F2937')
           .font('Helvetica-Bold')
           .text('KEY INSIGHTS', 50, yPosition);
        
        yPosition += 25;
        
        if (data.insights.largestPayment) {
          doc.fontSize(11)
             .fillColor('#374151')
             .font('Helvetica')
             .text('Largest Payment:', 70, yPosition)
             .text(`${data.insights.largestPayment.amount.toFixed(6)} ${data.insights.largestPayment.token}`, 200, yPosition);
          
          if (data.insights.largestPayment.fiatValue) {
            doc.text(`($${data.insights.largestPayment.fiatValue.toFixed(2)})`, 350, yPosition);
          }
          
          yPosition += 15;
          doc.text('Network:', 70, yPosition)
             .text(data.insights.largestPayment.network, 200, yPosition);
          
          yPosition += 15;
          doc.text('Date:', 70, yPosition)
             .text(new Date(data.insights.largestPayment.date).toLocaleDateString(), 200, yPosition);
          
          yPosition += 25;
        }
        
        if (data.insights.topToken) {
          doc.fontSize(11)
             .fillColor('#2563EB')
             .font('Helvetica-Bold')
             .text('Top Performing Token:', 70, yPosition)
             .text(`${data.insights.topToken.token} (${data.insights.topToken.percentage.toFixed(1)}%)`, 200, yPosition);
          yPosition += 20;
        }
        
        if (data.insights.motivationalMessage) {
          yPosition += 10;
          doc.fontSize(12)
             .fillColor('#059669')
             .font('Helvetica-Bold')
             .text('MOTIVATION:', 70, yPosition);
          
          yPosition += 18;
          doc.fontSize(10)
             .fillColor('#374151')
             .font('Helvetica')
             .text(data.insights.motivationalMessage, 70, yPosition, {
               width: 450,
               align: 'left'
             });
          yPosition += 40;
        }
      }
      
      // Professional footer
      const footerY = doc.page.height - 60;
      doc.moveTo(50, footerY)
         .lineTo(doc.page.width - 50, footerY)
         .strokeColor('#E5E7EB')
         .stroke();
      
      doc.fontSize(9)
         .fillColor('#6B7280')
         .font('Helvetica')
         .text('Generated by Hedwig AI - Your Financial Assistant', 50, footerY + 15)
         .text(`Report generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, 50, footerY + 30);
      
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}