import PDFDocument from 'pdfkit';
import { InvoiceData } from './invoices';
import { NaturalProposalGenerator } from '../lib/naturalProposalGenerator';

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