/**
 * PDF Generation Service for Proposals
 * Generates PDF documents from proposal data
 */

import { ProposalData } from './proposalService';

export interface PDFGenerationOptions {
  includeHeader?: boolean;
  includeFooter?: boolean;
  template?: 'standard' | 'modern' | 'minimal';
}

/**
 * Generate a PDF from proposal data
 * This is a placeholder implementation - in production, you would use a PDF library like jsPDF or Puppeteer
 */
export async function generateProposalPDF(
  proposalData: ProposalData,
  options: PDFGenerationOptions = {}
): Promise<string> {
  try {
    // In a real implementation, you would use a PDF generation library
    // For now, we'll return a mock PDF URL
    
    const pdfContent = generatePDFContent(proposalData, options);
    
    // Mock PDF generation - in production, this would create an actual PDF
    const pdfUrl = await uploadPDFToStorage(pdfContent, proposalData);
    
    return pdfUrl;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF');
  }
}

/**
 * Generate PDF content as HTML (for conversion to PDF)
 */
function generatePDFContent(proposalData: ProposalData, options: PDFGenerationOptions): string {
  const { template = 'standard' } = options;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Proposal - ${proposalData.projectTitle}</title>
      <style>
        ${getPDFStyles(template)}
      </style>
    </head>
    <body>
      ${options.includeHeader !== false ? generateHeader() : ''}
      
      <div class="proposal-content">
        <h1>Project Proposal</h1>
        
        <section class="client-info">
          <h2>Client Information</h2>
          <p><strong>Name:</strong> ${proposalData.clientName}</p>
          <p><strong>Email:</strong> ${proposalData.clientEmail}</p>
        </section>
        
        <section class="project-details">
          <h2>Project Details</h2>
          <h3>${proposalData.projectTitle}</h3>
          <p><strong>Description:</strong></p>
          <p>${proposalData.description}</p>
          
          <p><strong>Deliverables:</strong></p>
          <div class="deliverables">
            ${formatDeliverables(proposalData.deliverables)}
          </div>
          
          <p><strong>Timeline:</strong></p>
          <p>Start Date: ${formatDate(proposalData.timelineStart)}</p>
          <p>End Date: ${formatDate(proposalData.timelineEnd)}</p>
        </section>
        
        <section class="payment-info">
          <h2>Payment Information</h2>
          <p><strong>Total Amount:</strong> $${proposalData.paymentAmount?.toLocaleString() || 'TBD'}</p>
          <p><strong>Payment Method:</strong> ${proposalData.paymentMethod || 'TBD'}</p>
        </section>
        
        <section class="terms">
          <h2>Terms & Conditions</h2>
          <p>This proposal is valid for 30 days from the date of issue.</p>
          <p>Payment terms: 50% upfront, 50% upon completion.</p>
          <p>All work will be completed according to the specified timeline.</p>
        </section>
      </div>
      
      ${options.includeFooter !== false ? generateFooter() : ''}
    </body>
    </html>
  `;
  
  return html;
}

/**
 * Get CSS styles for different PDF templates
 */
function getPDFStyles(template: string): string {
  const baseStyles = `
    body {
      font-family: 'Arial', sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    
    h1 {
      color: #2c3e50;
      border-bottom: 3px solid #3498db;
      padding-bottom: 10px;
    }
    
    h2 {
      color: #34495e;
      margin-top: 30px;
      margin-bottom: 15px;
    }
    
    h3 {
      color: #2980b9;
      margin-bottom: 10px;
    }
    
    section {
      margin-bottom: 25px;
      padding: 15px;
      border-left: 4px solid #3498db;
      background-color: #f8f9fa;
    }
    
    .deliverables {
      background-color: white;
      padding: 10px;
      border-radius: 5px;
      margin: 10px 0;
    }
    
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #ecf0f1;
    }
    
    .footer {
      text-align: center;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 2px solid #ecf0f1;
      font-size: 12px;
      color: #7f8c8d;
    }
  `;
  
  switch (template) {
    case 'modern':
      return baseStyles + `
        body { font-family: 'Helvetica', sans-serif; }
        h1 { color: #e74c3c; border-bottom-color: #e74c3c; }
        section { border-left-color: #e74c3c; }
      `;
    case 'minimal':
      return baseStyles + `
        section { border-left: none; background-color: transparent; }
        h1 { border-bottom: 1px solid #bdc3c7; }
      `;
    default:
      return baseStyles;
  }
}

/**
 * Generate PDF header
 */
function generateHeader(): string {
  return `
    <div class="header">
      <h1>Professional Services Proposal</h1>
      <p>Generated on ${new Date().toLocaleDateString()}</p>
    </div>
  `;
}

/**
 * Generate PDF footer
 */
function generateFooter(): string {
  return `
    <div class="footer">
      <p>This proposal was generated automatically by Hedwig AI Assistant</p>
      <p>For questions or modifications, please contact us directly</p>
    </div>
  `;
}

/**
 * Format deliverables for PDF display
 */
function formatDeliverables(deliverables: string): string {
  if (!deliverables) return '<p>No deliverables specified</p>';
  
  // Split by newlines and create a list
  const items = deliverables.split('\n').filter(item => item.trim());
  
  if (items.length === 1) {
    return `<p>${items[0]}</p>`;
  }
  
  return `
    <ul>
      ${items.map(item => `<li>${item.trim()}</li>`).join('')}
    </ul>
  `;
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  if (!dateString) return 'TBD';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch (error) {
    return dateString;
  }
}

/**
 * Mock function to upload PDF to storage
 * In production, this would upload to AWS S3, Google Cloud Storage, etc.
 */
async function uploadPDFToStorage(pdfContent: string, proposalData: ProposalData): Promise<string> {
  // Mock implementation - in production, you would:
  // 1. Convert HTML to PDF using Puppeteer or similar
  // 2. Upload the PDF to cloud storage
  // 3. Return the public URL
  
  const fileName = `proposal-${proposalData.clientName?.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`;
  const mockUrl = `https://storage.example.com/proposals/${fileName}`;
  
  // Simulate upload delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log(`PDF generated for proposal: ${proposalData.projectTitle}`);
  console.log(`Mock PDF URL: ${mockUrl}`);
  
  return mockUrl;
}

/**
 * Generate a simple text-based proposal for immediate use
 */
export function generateTextProposal(proposalData: ProposalData): string {
  return `
📋 **PROJECT PROPOSAL**

👤 **Client Information**
Name: ${proposalData.clientName}
Email: ${proposalData.clientEmail}

🎯 **Project Details**
Title: ${proposalData.projectTitle}
Description: ${proposalData.description}

📦 **Deliverables**
${proposalData.deliverables}

📅 **Timeline**
Start Date: ${formatDate(proposalData.timelineStart)}
End Date: ${formatDate(proposalData.timelineEnd)}

💰 **Payment Information**
Amount: $${proposalData.paymentAmount?.toLocaleString() || 'TBD'}
Method: ${proposalData.paymentMethod || 'TBD'}

📋 **Terms & Conditions**
• This proposal is valid for 30 days
• Payment terms: 50% upfront, 50% upon completion
• All work will be completed according to the specified timeline

Generated on ${new Date().toLocaleDateString()}
  `.trim();
}