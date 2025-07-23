import { ProposalData } from './proposalservice';
import { Resend } from 'resend';

interface EmailResponse {
  id: string;
}

interface EmailOptions {
  from: string;
  to: string;
  subject: string;
  html: string;
}

interface ResendClient {
  emails: {
    send(options: EmailOptions): Promise<EmailResponse>;
  };
}

const resend = new Resend(process.env.RESEND_API_KEY);

export interface PDFGenerationOptions {
  template: 'minimal' | 'detailed' | 'creative';
  branding?: {
    logo?: string;
    primaryColor?: string;
    secondaryColor?: string;
    companyName?: string;
    contactInfo?: string;
  };
  includeSignature?: boolean;
}

export function generateProposalHTML(
  proposal: ProposalData, 
  options: PDFGenerationOptions = { template: 'detailed' }
): string {
  const { template, branding } = options;
  const primaryColor = branding?.primaryColor || '#2563eb';
  const secondaryColor = branding?.secondaryColor || '#64748b';
  
  const baseStyles = `
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { 
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
        line-height: 1.6; 
        color: #333; 
        background: #fff;
      }
      .container { max-width: 800px; margin: 0 auto; padding: 40px; }
      .header { 
        border-bottom: 3px solid ${primaryColor}; 
        padding-bottom: 20px; 
        margin-bottom: 30px; 
      }
      .logo { max-height: 60px; margin-bottom: 10px; }
      .title { 
        font-size: 28px; 
        font-weight: bold; 
        color: ${primaryColor}; 
        margin-bottom: 10px; 
      }
      .subtitle { 
        font-size: 16px; 
        color: ${secondaryColor}; 
        margin-bottom: 20px; 
      }
      .section { margin-bottom: 30px; }
      .section-title { 
        font-size: 20px; 
        font-weight: bold; 
        color: ${primaryColor}; 
        margin-bottom: 15px; 
        border-left: 4px solid ${primaryColor}; 
        padding-left: 15px; 
      }
      .deliverable-item, .feature-item { 
        margin-bottom: 8px; 
        padding-left: 20px; 
        position: relative; 
      }
      .deliverable-item:before, .feature-item:before { 
        content: "✓"; 
        position: absolute; 
        left: 0; 
        color: ${primaryColor}; 
        font-weight: bold; 
      }
      .timeline-box, .investment-box { 
        background: #f8fafc; 
        border: 1px solid #e2e8f0; 
        border-radius: 8px; 
        padding: 20px; 
        margin: 15px 0; 
      }
      .investment-amount { 
        font-size: 24px; 
        font-weight: bold; 
        color: ${primaryColor}; 
        text-align: center; 
        margin-bottom: 15px; 
      }
      .terms-list { 
        background: #fefefe; 
        border-left: 4px solid ${secondaryColor}; 
        padding: 15px 20px; 
        margin: 15px 0; 
      }
      .terms-list li { margin-bottom: 5px; }
      .signature-section { 
        margin-top: 50px; 
        border-top: 1px solid #e2e8f0; 
        padding-top: 30px; 
      }
      .signature-box { 
        border: 1px solid #e2e8f0; 
        height: 80px; 
        margin: 10px 0; 
        display: inline-block; 
        width: 300px; 
      }
      .contact-info { 
        background: ${primaryColor}; 
        color: white; 
        padding: 20px; 
        border-radius: 8px; 
        margin-top: 30px; 
      }
      .minimal { font-size: 14px; }
      .minimal .container { padding: 20px; }
      .minimal .title { font-size: 24px; }
      .minimal .section-title { font-size: 18px; }
      .creative { 
        background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); 
      }
      .creative .container { 
        background: white; 
        border-radius: 15px; 
        box-shadow: 0 10px 30px rgba(0,0,0,0.1); 
      }
    </style>
  `;

  const headerSection = `
    <div class="header">
      ${branding?.logo ? `<img src="${branding.logo}" alt="Logo" class="logo">` : ''}
      <div class="title">${proposal.project_title || 'Project Proposal'}</div>
      <div class="subtitle">
        <strong>For:</strong> ${proposal.client_name}<br>
        <strong>Date:</strong> ${new Date().toLocaleDateString()}<br>
        <strong>Proposal ID:</strong> ${proposal.id}
      </div>
    </div>
  `;

  const executiveSummary = `
    <div class="section">
      <div class="section-title">Executive Summary</div>
      <p>Thank you for considering our services for your ${proposal.service_type.replace('_', ' ')} project. 
      This proposal outlines our approach, deliverables, timeline, and investment for bringing your vision to life.</p>
      ${proposal.description ? `<p style="margin-top: 15px;"><strong>Project Overview:</strong><br>${proposal.description}</p>` : ''}
    </div>
  `;

  const scopeSection = `
    <div class="section">
      <div class="section-title">Scope of Work</div>
      
      <h4 style="margin-bottom: 10px; color: ${secondaryColor};">Deliverables</h4>
      ${proposal.deliverables?.map(item => `<div class="deliverable-item">${item}</div>`).join('') || 
        '<div class="deliverable-item">Deliverables to be defined based on project requirements</div>'}
      
      ${proposal.features && proposal.features.length > 0 ? `
        <h4 style="margin: 20px 0 10px 0; color: ${secondaryColor};">Key Features</h4>
        ${proposal.features.map(item => `<div class="feature-item">${item}</div>`).join('')}
      ` : ''}
      
      <div class="timeline-box">
        <h4 style="margin-bottom: 10px; color: ${secondaryColor};">Timeline</h4>
        <p><strong>Estimated Duration:</strong> ${proposal.timeline || 'To be determined'}</p>
        <p style="margin-top: 10px;"><strong>Project Phases:</strong></p>
        <ul style="margin-left: 20px; margin-top: 5px;">
          <li>Discovery & Planning (Week 1)</li>
          <li>Design & Development (Weeks 2-N)</li>
          <li>Testing & Refinement (Final Week)</li>
          <li>Launch & Handover</li>
        </ul>
      </div>
    </div>
  `;

  const investmentSection = `
    <div class="section">
      <div class="section-title">Investment</div>
      <div class="investment-box">
        <div class="investment-amount">
          ${proposal.budget ? 
            `${proposal.currency || 'USD'} ${proposal.budget.toLocaleString()}` : 
            'To be determined based on final requirements'
          }
        </div>
        <p style="text-align: center; color: ${secondaryColor};">Total Project Investment</p>
      </div>
      
      <h4 style="margin-bottom: 10px; color: ${secondaryColor};">Payment Schedule</h4>
      <ul style="margin-left: 20px;">
        <li>50% deposit to begin work</li>
        <li>25% at project milestone (mid-point)</li>
        <li>25% upon completion and delivery</li>
      </ul>
    </div>
  `;

  const termsSection = `
    <div class="section">
      <div class="section-title">Terms & Conditions</div>
      <div class="terms-list">
        <h4 style="margin-bottom: 10px; color: ${secondaryColor};">General Terms</h4>
        <ul>
          <li>All work will be completed professionally and on time</li>
          <li>Regular progress updates will be provided</li>
          <li>Source code/files will be delivered upon final payment</li>
          <li>30-day warranty on all deliverables</li>
          <li>Additional work beyond scope will be quoted separately</li>
        </ul>
      </div>
    </div>
  `;

  const nextStepsSection = `
    <div class="section">
      <div class="section-title">Next Steps</div>
      <ol style="margin-left: 20px;">
        <li>Review and approve this proposal</li>
        <li>Sign agreement and submit deposit</li>
        <li>Schedule project kickoff meeting</li>
        <li>Begin discovery and planning phase</li>
      </ol>
      <p style="margin-top: 15px;">We're excited about the opportunity to work with you on this project. 
      Please don't hesitate to reach out with any questions or to discuss any modifications to this proposal.</p>
    </div>
  `;

  const signatureSection = options.includeSignature ? `
    <div class="signature-section">
      <div class="section-title">Agreement</div>
      <p>By signing below, both parties agree to the terms outlined in this proposal.</p>
      
      <div style="display: flex; justify-content: space-between; margin-top: 30px;">
        <div>
          <p><strong>Client Signature:</strong></p>
          <div class="signature-box"></div>
          <p>Date: _______________</p>
        </div>
        <div>
          <p><strong>Service Provider:</strong></p>
          <div class="signature-box"></div>
          <p>Date: _______________</p>
        </div>
      </div>
    </div>
  ` : '';

  const contactSection = branding?.contactInfo ? `
    <div class="contact-info">
      <h4 style="margin-bottom: 10px;">Contact Information</h4>
      <p>${branding.contactInfo}</p>
    </div>
  ` : '';

  const footerSection = `
    <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: ${secondaryColor};">
      <p><em>This proposal is valid for 30 days from the date above.</em></p>
    </div>
  `;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Proposal - ${proposal.client_name}</title>
      ${baseStyles}
    </head>
    <body class="${template}">
      <div class="container">
        ${headerSection}
        ${executiveSummary}
        ${scopeSection}
        ${investmentSection}
        ${termsSection}
        ${nextStepsSection}
        ${signatureSection}
        ${contactSection}
        ${footerSection}
      </div>
    </body>
    </html>
  `;
}

export async function generatePDF(
  proposal: ProposalData, 
  options: PDFGenerationOptions = { template: 'detailed' }
): Promise<Buffer> {
  // For now, we'll use a simple HTML to PDF conversion
  // In production, you'd want to use puppeteer or similar
  const html = generateProposalHTML(proposal, options);
  
  // This is a placeholder - you'd implement actual PDF generation here
  // using libraries like puppeteer, jsPDF, or a service like HTMLtoPDF
  throw new Error('PDF generation not yet implemented - use HTML version for now');
}

export async function sendProposalEmail(
  proposal: ProposalData,
  clientEmail: string,
  options: PDFGenerationOptions = { template: 'detailed' }
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!clientEmail) {
      return { success: false, error: 'Client email is required to send proposal' };
    }

    const html = generateProposalHTML(proposal, options);
    
    await resend.emails.send({
      from: 'proposals@hedwigbot.xyz',
      to: clientEmail,
      subject: `Project Proposal - ${proposal.project_title || 'Your Project'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Project Proposal</h2>
          <p>Dear ${proposal.client_name},</p>
          <p>Please find attached your project proposal. We're excited about the opportunity to work with you!</p>
          <p>You can view the full proposal by clicking the link below:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="#" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              View Proposal
            </a>
          </div>
          <p>If you have any questions or would like to discuss the proposal, please don't hesitate to reach out.</p>
          <p>Best regards,<br>Your Development Team</p>
        </div>
      `,
      // attachments: [
      //   {
      //     filename: `${proposal.client_name}_${proposal.service_type}_Proposal.pdf`,
      //     content: await generatePDF(proposal, options)
      //   }
      // ]
    });

    return { success: true };
  } catch (error) {
    console.error('Error sending proposal email:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

export function optimizeForWhatsApp(content: string): string {
  // Optimize content for WhatsApp by:
  // 1. Limiting length
  // 2. Using WhatsApp-friendly formatting
  // 3. Adding clear call-to-actions
  
  const maxLength = 4000; // WhatsApp message limit
  
  if (content.length <= maxLength) {
    return content;
  }
  
  // Truncate and add continuation message
  const truncated = content.substring(0, maxLength - 200);
  const lastNewline = truncated.lastIndexOf('\n');
  
  return truncated.substring(0, lastNewline) + 
    '\n\n...\n\n📄 *Full proposal available via email or PDF download*\n\nType "email proposal" to send the complete version to your client.';
}