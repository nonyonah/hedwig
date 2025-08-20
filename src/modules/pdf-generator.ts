import PDFDocument from 'pdfkit';
import { InvoiceData } from './invoices';

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

      // Header
      doc.fontSize(20).text('PROJECT PROPOSAL', 50, 50);
      doc.fontSize(12).text(`Proposal #: ${proposal.proposal_number}`, 50, 80);
      doc.text(`Date: ${new Date().toLocaleDateString()}`, 50, 95);

      // From section
      doc.fontSize(14).text('From:', 50, 130);
      doc.fontSize(12).text(proposal.freelancer_name, 50, 150);
      doc.text(proposal.freelancer_email, 50, 165);

      // To section
      doc.fontSize(14).text('To:', 300, 130);
      doc.fontSize(12).text(proposal.client_name, 300, 150);
      doc.text(proposal.client_email, 300, 165);

      // Project overview
      doc.fontSize(14).text('Project Overview:', 50, 200);
      doc.fontSize(12).text(proposal.project_description, 50, 220, { width: 500 });

      // Scope of work
      if (proposal.scope_of_work) {
        doc.fontSize(14).text('Scope of Work:', 50, 280);
        doc.fontSize(12).text(proposal.scope_of_work, 50, 300, { width: 500 });
      }

      // Timeline
      if (proposal.timeline) {
        doc.fontSize(14).text('Timeline:', 50, 360);
        doc.fontSize(12).text(proposal.timeline, 50, 380, { width: 500 });
      }

      // Investment
      doc.fontSize(16).text('Investment:', 50, 440);
      doc.fontSize(20).text(`${proposal.amount} ${proposal.currency}`, 50, 460);

      // Payment terms
      if (proposal.payment_terms) {
        doc.fontSize(14).text('Payment Terms:', 50, 500);
        doc.fontSize(12).text(proposal.payment_terms, 50, 520, { width: 500 });
      }

      // Next steps
      doc.fontSize(14).text('Next Steps:', 50, 580);
      doc.fontSize(12).text('1. Review this proposal', 50, 600);
      doc.text('2. Accept and make payment to begin work', 50, 615);
      doc.text('3. Project kickoff within 24 hours of payment', 50, 630);

      // Footer
      doc.fontSize(10).text('Thank you for considering our services!', 50, 700);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}