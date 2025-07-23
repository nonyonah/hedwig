import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { ProposalDocument } from '../components/ProposalDocument';

export interface ProposalData {
  id?: string;
  user_id?: string;
  client_name?: string;
  client_email?: string;
  service_type: string;
  project_title?: string;
  description?: string;
  deliverables?: string[];
  timeline?: string;
  budget?: number;
  currency?: string;
  features?: string[];
  status?: 'draft' | 'sent' | 'accepted' | 'rejected';
  user_name?: string;
  user_phone?: string;
  user_email?: string;
  created_at?: string;
  updated_at?: string;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

export async function generatePDF(proposal: ProposalData, options: PDFGenerationOptions = { template: 'detailed' }): Promise<Buffer> {
  try {
    console.log('[generatePDF] Generating PDF for proposal:', proposal.id);
    
    // Create the PDF document using react-pdf
    const pdfDoc = pdf(
      React.createElement(ProposalDocument, { proposal, options }) as any
    );
    
    // Convert to blob first, then to buffer
    const blob = await pdfDoc.toBlob();
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log('[generatePDF] PDF generated successfully, size:', buffer.length);
    return buffer;
  } catch (error) {
    console.error('[generatePDF] Error generating PDF:', error);
    throw new Error(`Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
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

    // Get user name for personalized email
    const { data: user } = await supabase
      .from('users')
      .select('name')
      .eq('id', proposal.user_id)
      .single();

    const userName = user?.name || 'Professional Services';
    
    // Create user-specific email address
    const userEmailName = userName.toLowerCase()
      .replace(/[^a-z0-9]/g, '') // Remove non-alphanumeric characters
      .substring(0, 20); // Limit length
    
    const fromEmail = `${userEmailName}@hedwigbot.xyz`;
    
    // Generate proposal URL for viewing
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://hedwigbot.xyz';
    const proposalUrl = `${baseUrl}/api/proposal-pdf/${proposal.id}`;
    
    await resend.emails.send({
      from: fromEmail,
      to: clientEmail,
      subject: `Project Proposal - ${proposal.project_title || 'Your Project'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; margin-bottom: 10px;">Project Proposal</h1>
            <p style="color: #64748b; font-size: 16px;">From ${userName}</p>
          </div>
          
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
            <h2 style="color: #1e293b; margin-bottom: 15px;">Dear ${proposal.client_name},</h2>
            <p style="line-height: 1.6; color: #334155;">
              Thank you for considering our services for your ${proposal.service_type.replace('_', ' ')} project. 
              I'm excited about the opportunity to work with you and bring your vision to life.
            </p>
            <p style="line-height: 1.6; color: #334155;">
              Please find your detailed project proposal attached. This proposal outlines our approach, 
              deliverables, timeline, and investment for your project.
            </p>
          </div>

          <div style="background: #2563eb; color: white; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
            <h3 style="margin-bottom: 15px;">Project Overview</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
              <div>
                <strong>Service:</strong><br>
                ${proposal.service_type.replace('_', ' ')}
              </div>
              <div>
                <strong>Timeline:</strong><br>
                ${proposal.timeline}
              </div>
              <div>
                <strong>Investment:</strong><br>
                ${proposal.currency} ${proposal.budget?.toLocaleString()}
              </div>
              <div>
                <strong>Proposal ID:</strong><br>
                ${proposal.id}
              </div>
            </div>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${proposalUrl}" 
               style="background: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              📄 View Full Proposal
            </a>
          </div>
          
          <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 30px;">
            <p style="line-height: 1.6; color: #334155;">
              I'm here to answer any questions you might have about this proposal. 
              Please don't hesitate to reach out if you'd like to discuss any details or modifications.
            </p>
            <p style="line-height: 1.6; color: #334155;">
              I look forward to the opportunity to work together on this exciting project!
            </p>
          </div>
          
          <div style="margin-top: 30px; padding: 20px; background: #f1f5f9; border-radius: 8px;">
            <p style="margin: 0; color: #64748b; font-size: 14px;">
              <strong>Best regards,</strong><br>
              ${userName}<br>
              <a href="mailto:${fromEmail}" style="color: #2563eb;">${fromEmail}</a>
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
            <p style="color: #94a3b8; font-size: 12px;">
              This proposal is valid for 30 days from the date sent.
            </p>
          </div>
        </div>
      `
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