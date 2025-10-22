import PDFDocument from 'pdfkit';
import { InvoiceData } from './invoices';
import { NaturalProposalGenerator } from '../lib/naturalProposalGenerator';
import { EarningsSummaryResponse } from '../lib/earningsService';

export interface EarningsData {
  walletAddress: string;
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

export async function generateInvoicePDF(invoice: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // Header
      doc.fontSize(20).text('INVOICE', 50, 50);
      doc.fontSize(12).text(`Invoice #: ${invoice.invoice_number}`, 50, 80);
      doc.text(`Date: ${new Date().toLocaleDateString()}`, 50, 95);
      doc.text(`Due Date: ${invoice.due_date}`, 50, 110);

      // From section
      doc.fontSize(14).text('From:', 50, 150);
      doc.fontSize(12).text(invoice.freelancer_name, 50, 170);
      doc.text(invoice.freelancer_email, 50, 185);

      // To section
      doc.fontSize(14).text('To:', 300, 150);
      doc.fontSize(12).text(invoice.client_name, 300, 170);
      doc.text(invoice.client_email, 300, 185);

      // Project details
      doc.fontSize(14).text('Project Description:', 50, 230);
      doc.fontSize(12).text(invoice.project_description, 50, 250, { width: 500 });

      // Optional deliverables section (if available)
      if ((invoice as any).deliverables) {
        doc.fontSize(14).text('Deliverables:', 50, 300);
        doc.fontSize(12).text((invoice as any).deliverables, 50, 320, { width: 500 });
      }

      // Amount section
      doc.fontSize(16).text('Amount Due:', 50, 400);
      doc.fontSize(20).text(`${invoice.amount} ${invoice.currency}`, 50, 420);

      // Payment methods
      doc.fontSize(14).text('Payment Methods:', 50, 470);
      doc.fontSize(12).text('• USDC on Base Network', 50, 490);

      // Payment link
      doc.fontSize(12).text(`Payment Link: ${process.env.NEXT_PUBLIC_APP_URL}/invoice/${invoice.id}`, 50, 550);

      // Footer
      doc.fontSize(10).text('Thank you for your business!', 50, 700);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

export async function generateEarningsPDF(data: EarningsData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // Header with gradient background
      doc.rect(0, 0, doc.page.width, 120)
         .fillAndStroke('#4f46e5', '#4338ca');
      
      doc.fontSize(28)
         .fillColor('white')
         .text('💰 Earnings Report', 50, 30);
      
      doc.fontSize(14)
         .text(`${data.timeframe} • ${data.period.startDate} to ${data.period.endDate}`, 50, 70);
      
      doc.fontSize(12)
         .text(`Wallet: ${data.walletAddress.slice(0, 6)}...${data.walletAddress.slice(-4)}`, 50, 90);

      let yPosition = 150;

      // Summary Cards
      const cardWidth = 150;
      const cardHeight = 80;
      const cardSpacing = 20;
      
      // Total Earnings Card
      doc.rect(50, yPosition, cardWidth, cardHeight)
         .fillAndStroke('#f0f9ff', '#0ea5e9');
      doc.fontSize(12).fillColor('#0369a1').text('Total Earnings', 60, yPosition + 15);
      doc.fontSize(18).fillColor('#0c4a6e').text(`$${data.totalEarnings.toFixed(2)}`, 60, yPosition + 35);
      
      // Total Payments Card
      doc.rect(50 + cardWidth + cardSpacing, yPosition, cardWidth, cardHeight)
         .fillAndStroke('#f0fdf4', '#22c55e');
      doc.fontSize(12).fillColor('#15803d').text('Total Payments', 60 + cardWidth + cardSpacing, yPosition + 15);
      doc.fontSize(18).fillColor('#14532d').text(`${data.totalPayments}`, 60 + cardWidth + cardSpacing, yPosition + 35);
      
      // Average Payment Card
      const avgPayment = data.totalPayments > 0 ? data.totalEarnings / data.totalPayments : 0;
      doc.rect(50 + (cardWidth + cardSpacing) * 2, yPosition, cardWidth, cardHeight)
         .fillAndStroke('#fef3c7', '#f59e0b');
      doc.fontSize(12).fillColor('#d97706').text('Avg Payment', 60 + (cardWidth + cardSpacing) * 2, yPosition + 15);
      doc.fontSize(18).fillColor('#92400e').text(`$${avgPayment.toFixed(2)}`, 60 + (cardWidth + cardSpacing) * 2, yPosition + 35);

      yPosition += cardHeight + 40;

      // Earnings Breakdown
      doc.fontSize(16).fillColor('#1f2937').text('💎 Earnings Breakdown', 50, yPosition);
      yPosition += 30;

      if (data.earnings && data.earnings.length > 0) {
        data.earnings.forEach((earning, index) => {
          if (yPosition > 700) {
            doc.addPage();
            yPosition = 50;
          }
          
          // Token row
          doc.rect(50, yPosition, 500, 40)
             .fillAndStroke(index % 2 === 0 ? '#f9fafb' : '#ffffff', '#e5e7eb');
          
          doc.fontSize(12)
             .fillColor('#374151')
             .text(`${earning.token} (${earning.network})`, 60, yPosition + 8);
          
          doc.fontSize(10)
             .fillColor('#6b7280')
             .text(`${earning.count} payments`, 60, yPosition + 24);
          
          doc.fontSize(12)
             .fillColor('#059669')
             .text(`$${earning.total.toFixed(2)}`, 450, yPosition + 8);
          
          doc.fontSize(10)
             .fillColor('#6b7280')
             .text(`Avg: $${earning.averageAmount.toFixed(2)}`, 450, yPosition + 24);
          
          yPosition += 45;
        });
      }

      // Insights Section
      if (data.insights) {
        yPosition += 20;
        if (yPosition > 650) {
          doc.addPage();
          yPosition = 50;
        }
        
        doc.fontSize(16).fillColor('#1f2937').text('🎯 Key Insights', 50, yPosition);
        yPosition += 30;
        
        if (data.insights.largestPayment) {
          doc.fontSize(12)
             .fillColor('#374151')
             .text(`🏆 Largest Payment: $${data.insights.largestPayment.amount.toFixed(2)} in ${data.insights.largestPayment.token}`, 50, yPosition);
          yPosition += 20;
        }
        
        if (data.insights.topToken) {
          doc.text(`🥇 Top Token: ${data.insights.topToken.token} (${data.insights.topToken.percentage.toFixed(1)}% of earnings)`, 50, yPosition);
          yPosition += 20;
        }
        
        if (data.insights.motivationalMessage) {
          yPosition += 10;
          doc.rect(50, yPosition - 10, 500, 60)
             .fillAndStroke('#fef3c7', '#f59e0b');
          
          doc.fontSize(12)
             .fillColor('#92400e')
             .text('💪 ' + data.insights.motivationalMessage, 60, yPosition + 15, { width: 480 });
        }
      }

      // Footer
      const footerY = doc.page.height - 80;
      doc.fontSize(10)
         .fillColor('#6b7280')
         .text(`Generated on ${new Date().toLocaleDateString()}`, 50, footerY)
         .text('Powered by Hedwig - Professional Crypto Earnings Tracking', 50, footerY + 15);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

export async function generateProposalPDF(proposal: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // Header with Hedwig branding
      doc.fontSize(24).fillColor('#2563eb').text('HEDWIG', 50, 50);
      doc.fontSize(16).fillColor('#000000').text('Project Proposal', 50, 80);
      doc.fontSize(10).text(`Proposal #: ${proposal.proposal_number}`, 50, 105);
      doc.text(`Date: ${new Date().toLocaleDateString()}`, 50, 120);

      // Client and Project Info
      doc.fontSize(14).fillColor('#374151').text(`For: ${proposal.client_name}`, 50, 150);
      doc.fontSize(12).fillColor('#6b7280').text(proposal.client_email, 50, 170);
      doc.fontSize(16).fillColor('#000000').text(`Project: ${proposal.project_description}`, 50, 200);

      // Generate natural language proposal content
      const naturalGenerator = new NaturalProposalGenerator();
      const naturalInputs = NaturalProposalGenerator.standardizeProposalInputs(proposal);
      
      const proposalContent = naturalGenerator.generateFullProposal(naturalInputs);
      
      // Add the dynamic proposal content
      let yPosition = 240;
      const lineHeight = 18;
      const paragraphSpacing = 12;
      
      // Split content into paragraphs and render
      const paragraphs = proposalContent.split('\n\n');
      
      for (const paragraph of paragraphs) {
        if (paragraph.trim()) {
          // Check if we need a new page
          if (yPosition > 700) {
            doc.addPage();
            yPosition = 50;
          }
          
          doc.fontSize(11)
             .fillColor('#374151')
             .text(paragraph.trim(), 50, yPosition, { 
               width: 500, 
               align: 'left',
               lineGap: 4
             });
          
          // Calculate height of rendered text and update position
          const textHeight = doc.heightOfString(paragraph.trim(), { width: 500 });
          yPosition += textHeight + paragraphSpacing;
        }
      }
      
      // Rate section (highlighted)
      yPosition += 20;
      if (yPosition > 650) {
        doc.addPage();
        yPosition = 50;
      }
      
      doc.rect(50, yPosition - 10, 500, 60)
         .fillAndStroke('#f3f4f6', '#e5e7eb');
      
      doc.fontSize(14)
         .fillColor('#1f2937')
         .text('Total Rate:', 70, yPosition + 10);
      
      doc.fontSize(20)
         .fillColor('#059669')
         .text(`${proposal.amount} ${proposal.currency}`, 70, yPosition + 30);

      // Footer
      const footerY = doc.page.height - 100;
      doc.fontSize(10)
         .fillColor('#6b7280')
         .text(`Prepared by: ${proposal.freelancer_name}`, 50, footerY)
         .text(`Contact: ${proposal.freelancer_email}`, 50, footerY + 15)
         .text('Powered by Hedwig - Professional Freelance Management', 50, footerY + 35);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

export interface ContractData {
  contractId: string;
  projectTitle: string;
  projectDescription: string;
  clientName: string;
  freelancerName: string;
  totalAmount: number;
  tokenType: string;
  chain: string;
  deadline: string;
  status: string;
  createdAt: string;
  milestones?: Array<{
    title: string;
    description: string;
    amount: number;
    deadline: string;
    status: string;
  }>;
}

export async function generateContractPDF(contractData: ContractData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      console.log('[PDF Generator] Starting contract PDF generation for:', contractData.contractId);
      
      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];

      // Add error handling for PDF document events
      doc.on('data', (chunk) => {
        buffers.push(chunk);
      });
      
      doc.on('end', () => {
        try {
          clearTimeout(timeout);
          const pdfData = Buffer.concat(buffers);
          console.log('[PDF Generator] Contract PDF generated successfully, size:', pdfData.length, 'bytes');
          resolve(pdfData);
        } catch (error) {
          clearTimeout(timeout);
          console.error('[PDF Generator] Error concatenating PDF buffers:', error);
          reject(error);
        }
      });

      doc.on('error', (error) => {
        clearTimeout(timeout);
        console.error('[PDF Generator] PDF document error:', error);
        reject(error);
      });

      // Add timeout to prevent hanging
      const timeout = setTimeout(() => {
        console.error('[PDF Generator] PDF generation timeout after 30 seconds');
        reject(new Error('PDF generation timeout'));
      }, 30000);

      // Header with Hedwig branding
      doc.fontSize(24).fillColor('#2563eb').text('HEDWIG', 50, 50);
      doc.fontSize(20).fillColor('#000000').text('FREELANCE CONTRACT', 50, 80);
      doc.fontSize(10).text(`Contract ID: ${contractData.contractId}`, 50, 110);
      doc.text(`Status: ${contractData.status.toUpperCase()}`, 400, 110);
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 50, 125);

      // Contract Information Section
      let yPosition = 160;
      doc.rect(50, yPosition - 10, 500, 40)
         .fillAndStroke('#f0f9ff', '#0ea5e9');
      
      doc.fontSize(16).fillColor('#0369a1').text('📋 PROJECT DETAILS', 60, yPosition + 5);
      yPosition += 50;

      doc.fontSize(12).fillColor('#374151');
      doc.text(`Title: ${contractData.projectTitle}`, 60, yPosition);
      yPosition += 20;
      
      doc.text('Description:', 60, yPosition);
      yPosition += 15;
      doc.fontSize(11).fillColor('#6b7280');
      const descHeight = doc.heightOfString(contractData.projectDescription, { width: 480 });
      doc.text(contractData.projectDescription, 60, yPosition, { width: 480 });
      yPosition += descHeight + 30;

      // Parties Section
      doc.rect(50, yPosition - 10, 500, 40)
         .fillAndStroke('#f0fdf4', '#22c55e');
      
      doc.fontSize(16).fillColor('#15803d').text('👥 PARTIES', 60, yPosition + 5);
      yPosition += 50;

      doc.fontSize(12).fillColor('#374151');
      doc.text(`Client: ${contractData.clientName}`, 60, yPosition);
      doc.text(`Freelancer: ${contractData.freelancerName}`, 300, yPosition);
      yPosition += 40;

      // Payment Terms Section
      doc.rect(50, yPosition - 10, 500, 40)
         .fillAndStroke('#fef3c7', '#f59e0b');
      
      doc.fontSize(16).fillColor('#d97706').text('💰 PAYMENT TERMS', 60, yPosition + 5);
      yPosition += 50;

      doc.fontSize(12).fillColor('#374151');
      doc.text(`Total Amount: ${contractData.totalAmount} ${contractData.tokenType}`, 60, yPosition);
      doc.text(`Blockchain: ${contractData.chain}`, 300, yPosition);
      yPosition += 20;
      doc.text(`Deadline: ${new Date(contractData.deadline).toLocaleDateString()}`, 60, yPosition);
      yPosition += 40;

      // Milestones Section
      if (contractData.milestones && contractData.milestones.length > 0) {
        doc.rect(50, yPosition - 10, 500, 40)
           .fillAndStroke('#f3e8ff', '#8b5cf6');
        
        doc.fontSize(16).fillColor('#7c3aed').text('🎯 MILESTONES', 60, yPosition + 5);
        yPosition += 50;

        contractData.milestones.forEach((milestone, index) => {
          // Check if we need a new page
          if (yPosition > 650) {
            doc.addPage();
            yPosition = 50;
          }

          doc.rect(50, yPosition - 5, 500, 80)
             .fillAndStroke(index % 2 === 0 ? '#f9fafb' : '#ffffff', '#e5e7eb');

          doc.fontSize(12).fillColor('#1f2937');
          doc.text(`${index + 1}. ${milestone.title}`, 60, yPosition + 5);
          
          doc.fontSize(10).fillColor('#6b7280');
          doc.text(`Description: ${milestone.description}`, 60, yPosition + 20, { width: 300 });
          
          doc.fontSize(11).fillColor('#059669');
          doc.text(`Amount: ${milestone.amount} ${contractData.tokenType}`, 380, yPosition + 5);
          
          doc.fontSize(10).fillColor('#6b7280');
          doc.text(`Deadline: ${new Date(milestone.deadline).toLocaleDateString()}`, 380, yPosition + 20);
          doc.text(`Status: ${milestone.status.toUpperCase()}`, 380, yPosition + 35);
          
          yPosition += 85;
        });
      }

      // Legal Notice Section
      yPosition += 20;
      if (yPosition > 600) {
        doc.addPage();
        yPosition = 50;
      }

      doc.rect(50, yPosition - 10, 500, 100)
         .fillAndStroke('#fef2f2', '#ef4444');
      
      doc.fontSize(14).fillColor('#dc2626').text('⚖️ LEGAL NOTICE', 60, yPosition + 5);
      yPosition += 25;
      
      doc.fontSize(10).fillColor('#7f1d1d');
      const legalText = 'This contract is secured by blockchain technology and smart contracts. All payments are processed through decentralized protocols. By proceeding with this contract, both parties agree to the terms and conditions outlined above. Disputes will be resolved according to the platform\'s dispute resolution mechanism.';
      doc.text(legalText, 60, yPosition, { width: 480 });

      // Footer
      const footerY = doc.page.height - 80;
      doc.fontSize(10).fillColor('#6b7280');
      doc.text(`Contract created: ${new Date(contractData.createdAt).toLocaleDateString()}`, 50, footerY);
      doc.text('Powered by Hedwig - Secure Freelance Payments on Blockchain', 50, footerY + 15);
      doc.text('🔗 Base & Celo Networks • 🔒 Smart Contract Escrow', 50, footerY + 30);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}