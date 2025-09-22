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
  userData?: {
    name?: string;
    telegramFirstName?: string;
    telegramLastName?: string;
    telegramUsername?: string;
  };
  offrampSummary?: {
    totalOfframped: number;
    remainingCrypto: number;
    offrampPercentage: number;
  };
}

export async function generateEarningsPDF(data: EarningsData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, bufferPages: true });
      const buffers: Buffer[] = [];
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });

      // Page dimensions
      const pageWidth = doc.page.width;
      const margin = 40;
      const contentWidth = pageWidth - (margin * 2);

      // Generate dynamic content
      const userName = getUserDisplayName(data.userData);
      const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const dynamicTitle = generateDynamicTitle(data.totalEarnings, data.totalPayments);
      const dynamicSubtitle = generateDynamicSubtitle(data.earnings, data.totalEarnings);
      const offrampAmount = calculateOfframpAmount(data);

      // Header Section
      let yPos = 40;
      
      // Greeting and date
      doc.fillColor('#6B7280')
         .fontSize(12)
         .font('Helvetica')
         .text(`Hi, ${userName}`, margin, yPos);
      
      doc.text(currentDate, pageWidth - margin - 150, yPos, { width: 150, align: 'right' });
      
      yPos += 30;
      
      // Dynamic main title
      const titleLines = dynamicTitle.split('\n');
      doc.fillColor('#1F2937')
         .fontSize(32)
         .font('Helvetica-Bold')
         .text(titleLines[0], margin, yPos);
      
      yPos += 40;
      if (titleLines[1]) {
        doc.text(titleLines[1], margin, yPos);
        yPos += 60;
      } else {
        yPos += 20;
      }
      
      // Dynamic subtitle with better spacing
      const subtitleLines = dynamicSubtitle.split('\n');
      doc.fillColor('#6B7280')
         .fontSize(14)
         .font('Helvetica')
         .text(subtitleLines[0], margin, yPos, { width: 400 });
      
      yPos += 25;
      if (subtitleLines[1]) {
        doc.text(subtitleLines[1], margin, yPos, { width: 400 });
        yPos += 25;
      }
      
      yPos += 80;
      
      // Statistics Cards Section
      const cardWidth = (contentWidth - 30) / 4; // 4 cards with 10px gaps
      const cardHeight = 80;
      const cardY = yPos;
      
      // Card 1: Total Earnings (Primary Blue) - Prioritize USD value
      const totalEarningsFormatted = data.totalFiatValue && data.totalFiatValue > 0 
        ? `$${data.totalFiatValue.toFixed(2)}` 
        : data.earnings.length > 0 
          ? `${data.earnings[0].total.toFixed(2)} ${data.earnings[0].token}` 
          : `${data.totalEarnings.toFixed(4)} tokens`;
      drawRoundedStatCard(doc, margin, cardY, cardWidth, cardHeight, totalEarningsFormatted, 'Total Earnings', '#2563EB');
      
      // Card 2: Offramp Amount (Success Blue-Green)
      const offrampFormatted = offrampAmount > 0 ? `$${offrampAmount.toFixed(2)}` : '$0.00';
      drawRoundedStatCard(doc, margin + cardWidth + 10, cardY, cardWidth, cardHeight, offrampFormatted, 'Offramped', '#0891B2');
      
      // Card 3: Total Payments (Accent Blue)
      drawRoundedStatCard(doc, margin + (cardWidth + 10) * 2, cardY, cardWidth, cardHeight, data.totalPayments.toString(), 'Total Payments', '#3B82F6');
      
      // Card 4: Most Used Chain (Dark Blue)
      const mostUsedChain = getMostUsedChain(data.earnings);
      drawRoundedStatCard(doc, margin + (cardWidth + 10) * 3, cardY, cardWidth, cardHeight, mostUsedChain, 'Most Used Chain', '#1E40AF');
      
      yPos += cardHeight + 60;
      
      // Earnings Breakdown Table
      if (data.earnings && data.earnings.length > 0) {
        doc.fillColor('#1F2937')
           .fontSize(18)
           .font('Helvetica-Bold')
           .text('Earnings Breakdown', margin, yPos);
        
        yPos += 40;
        
        // Table headers
        const tableHeaders = ['Token', 'Network', 'Amount', 'Count', 'USD Value'];
        const colWidths = [80, 100, 120, 80, 100];
        let xPos = margin;
        
        doc.fillColor('#6B7280')
           .fontSize(12)
           .font('Helvetica-Bold');
        
        tableHeaders.forEach((header, index) => {
          doc.text(header, xPos, yPos, { width: colWidths[index] });
          xPos += colWidths[index];
        });
        
        yPos += 25;
        
        // Table separator line
        doc.moveTo(margin, yPos)
           .lineTo(margin + contentWidth, yPos)
           .strokeColor('#E5E7EB')
           .lineWidth(1)
           .stroke();
        
        yPos += 15;
        
        // Table rows
        data.earnings.slice(0, 10).forEach((earning, index) => {
          xPos = margin;
          
          doc.fillColor('#374151')
             .fontSize(11)
             .font('Helvetica');
          
          // Token
          doc.text(earning.token, xPos, yPos, { width: colWidths[0] });
          xPos += colWidths[0];
          
          // Network
          doc.text(earning.network, xPos, yPos, { width: colWidths[1] });
          xPos += colWidths[1];
          
          // Amount - Display with proper precision for stablecoins
          const amountDisplay = earning.token === 'USDC' || earning.token === 'USDT' || earning.token === 'cUSD' 
            ? earning.total.toFixed(2) 
            : earning.total.toFixed(4);
          doc.text(amountDisplay, xPos, yPos, { width: colWidths[2] });
          xPos += colWidths[2];
          
          // Count
          doc.text(earning.count.toString(), xPos, yPos, { width: colWidths[3] });
          xPos += colWidths[3];
          
          // USD Value
          if (earning.fiatValue) {
            doc.text(`$${earning.fiatValue.toFixed(2)}`, xPos, yPos, { width: colWidths[4] });
          } else {
            doc.text('-', xPos, yPos, { width: colWidths[4] });
          }
          
          yPos += 20;
        });
      }
      
      yPos += 40;
      
      // Footer
      const footerY = doc.page.height - 80;
      doc.moveTo(margin, footerY)
         .lineTo(pageWidth - margin, footerY)
         .strokeColor('#E5E7EB')
         .lineWidth(1)
         .stroke();
      
      doc.fillColor('#6B7280')
         .fontSize(10)
         .font('Helvetica')
         .text('Generated by Hedwig', margin, footerY + 20)
         .text(`Report generated on ${new Date().toLocaleDateString()}`, pageWidth - margin - 150, footerY + 20, { width: 150, align: 'right' });
      
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function drawRoundedStatCard(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number, value: string, label: string, bgColor: string) {
  // Card background with rounded corners
  const radius = 12;
  doc.roundedRect(x, y, width, height, radius)
     .fillColor(bgColor)
     .fill();
  
  // Value text
  doc.fillColor('white')
     .fontSize(20)
     .font('Helvetica-Bold')
     .text(value, x + 15, y + 15, { width: width - 30 });
  
  // Label text
  doc.fillColor('#D1D5DB')
     .fontSize(9)
     .font('Helvetica')
     .text(label, x + 15, y + height - 25, { width: width - 30 });
}

function getMostUsedChain(earnings: any[]): string {
  if (!earnings || earnings.length === 0) return 'Base';
  
  const chainCounts: { [key: string]: number } = {};
  
  earnings.forEach(earning => {
    const chain = earning.network || 'Base';
    chainCounts[chain] = (chainCounts[chain] || 0) + earning.count;
  });
  
  let mostUsedChain = 'Base';
  let maxCount = 0;
  
  Object.entries(chainCounts).forEach(([chain, count]) => {
    if (count > maxCount) {
      maxCount = count;
      mostUsedChain = chain;
    }
  });
  
  return mostUsedChain;
}

function getUserDisplayName(userData?: { name?: string; telegramFirstName?: string; telegramLastName?: string; telegramUsername?: string }): string {
  if (!userData) return 'User';
  
  // Priority: name > telegramFirstName > telegramUsername > fallback
  if (userData.name && userData.name.trim()) {
    return userData.name.trim();
  }
  
  if (userData.telegramFirstName && userData.telegramFirstName.trim()) {
    return userData.telegramFirstName.trim();
  }
  
  if (userData.telegramUsername && userData.telegramUsername.trim()) {
    return userData.telegramUsername.trim();
  }
  
  return 'User';
}

function generateDynamicTitle(totalEarnings: number, totalPayments: number): string {
  if (totalEarnings === 0) {
    return "Ready to\nstart earning!";
  } else if (totalEarnings < 100) {
    return "You're on\nthe up!";
  } else if (totalEarnings < 1000) {
    return "Building\nmomentum!";
  } else if (totalEarnings < 5000) {
    return "Crushing\nit out there!";
  } else {
    return "Absolute\nlegend!";
  }
}

function generateDynamicSubtitle(earnings: any[], totalEarnings: number): string {
  if (!earnings || earnings.length === 0) {
    return "Start your crypto earnings journey today!\n\nEvery expert was once a beginner - let's get you started!";
  }
  
  const topTokens = earnings
    .sort((a, b) => (b.fiatValue || b.total) - (a.fiatValue || a.total))
    .slice(0, 2)
    .map(e => e.token)
    .join(' and ');
  
  const networks = [...new Set(earnings.map(e => e.network))].slice(0, 2).join(' and ');
  
  if (totalEarnings < 100) {
    return `${topTokens} strategist across ${networks} - you're playing it smart!\n\nKeep building that crypto portfolio, you're doing great!`;
  } else if (totalEarnings < 1000) {
    return `Multi-token master with ${topTokens} leading the charge!\n\nYour diversified approach is really paying off - nice work!`;
  } else {
    return `Crypto veteran dominating ${networks} networks!\n\nYour expertise in ${topTokens} is absolutely crushing it!`;
  }
}

function calculateOfframpAmount(data: EarningsData): number {
  // Use actual offramp data from backend if available
  if (data.offrampSummary && data.offrampSummary.totalOfframped > 0) {
    return data.offrampSummary.totalOfframped;
  }
  
  // Fallback: Calculate from earnings data if offrampSummary not available
  if (!data.earnings || data.earnings.length === 0) return 0;
  
  // Look for offramp transactions in the earnings data
  const offrampEarnings = data.earnings.filter(earning => 
    earning.source && earning.source.includes('offramp')
  );
  
  if (offrampEarnings.length > 0) {
    // Sum up actual offramp amounts
    return offrampEarnings.reduce((sum, earning) => sum + (earning.fiatValue || 0), 0);
  }
  
  // If no offramp data available, return 0 instead of estimating
  return 0;
}