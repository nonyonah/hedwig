import puppeteer from 'puppeteer';
import { ProposalData } from './proposalservice';

// HTML template for proposals
const proposalHTMLTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Project Proposal</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #fff;
            padding: 40px;
        }
        
        .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 3px solid #2563eb;
            padding-bottom: 20px;
        }
        
        .logo {
            font-size: 28px;
            font-weight: bold;
            color: #2563eb;
            margin-bottom: 10px;
        }
        
        .tagline {
            color: #6b7280;
            font-size: 14px;
        }
        
        .proposal-title {
            font-size: 32px;
            font-weight: bold;
            color: #1f2937;
            margin: 30px 0 20px 0;
            text-align: center;
        }
        
        .client-info {
            background: #f8fafc;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 30px;
            border-left: 4px solid #2563eb;
        }
        
        .section {
            margin-bottom: 30px;
        }
        
        .section-title {
            font-size: 20px;
            font-weight: bold;
            color: #1f2937;
            margin-bottom: 15px;
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 5px;
        }
        
        .section-content {
            color: #4b5563;
            line-height: 1.8;
        }
        
        .features-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        
        .feature-item {
            background: #f0f9ff;
            padding: 15px;
            border-radius: 6px;
            border-left: 3px solid #0ea5e9;
        }
        
        .feature-title {
            font-weight: bold;
            color: #0c4a6e;
            margin-bottom: 5px;
        }
        
        .budget-section {
            background: #fef3c7;
            padding: 25px;
            border-radius: 8px;
            border: 2px solid #f59e0b;
            text-align: center;
            margin: 30px 0;
        }
        
        .budget-amount {
            font-size: 36px;
            font-weight: bold;
            color: #92400e;
            margin-bottom: 10px;
        }
        
        .budget-label {
            color: #78350f;
            font-size: 14px;
        }
        
        .timeline-section {
            background: #ecfdf5;
            padding: 20px;
            border-radius: 8px;
            border-left: 4px solid #10b981;
        }
        
        .deliverables-list {
            list-style: none;
            padding: 0;
        }
        
        .deliverables-list li {
            background: #f9fafb;
            margin: 8px 0;
            padding: 12px;
            border-radius: 6px;
            border-left: 3px solid #6366f1;
            position: relative;
            padding-left: 30px;
        }
        
        .deliverables-list li::before {
            content: "✓";
            position: absolute;
            left: 10px;
            color: #10b981;
            font-weight: bold;
        }
        
        .footer {
            margin-top: 50px;
            padding-top: 30px;
            border-top: 2px solid #e5e7eb;
            text-align: center;
            color: #6b7280;
            font-size: 14px;
        }
        
        .contact-info {
            margin-top: 20px;
            padding: 20px;
            background: #f8fafc;
            border-radius: 8px;
        }
        
        .contact-row {
            display: flex;
            justify-content: space-between;
            margin: 10px 0;
        }
        
        .contact-label {
            font-weight: bold;
            color: #374151;
        }
        
        .next-steps {
            background: #eff6ff;
            padding: 25px;
            border-radius: 8px;
            border: 2px solid #3b82f6;
            margin: 30px 0;
        }
        
        .next-steps-title {
            color: #1e40af;
            font-weight: bold;
            font-size: 18px;
            margin-bottom: 15px;
        }
        
        .next-steps ol {
            color: #1e3a8a;
            padding-left: 20px;
        }
        
        .next-steps li {
            margin: 8px 0;
        }
        
        @media print {
            body {
                padding: 20px;
            }
            
            .header {
                margin-bottom: 30px;
            }
            
            .section {
                margin-bottom: 25px;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">{{USER_NAME}}</div>
        <div class="tagline">Professional Services & Solutions</div>
    </div>
    
    <h1 class="proposal-title">{{PROJECT_TITLE}}</h1>
    
    <div class="client-info">
        <div class="contact-row">
            <span class="contact-label">Client:</span>
            <span>{{CLIENT_NAME}}</span>
        </div>
        <div class="contact-row">
            <span class="contact-label">Email:</span>
            <span>{{CLIENT_EMAIL}}</span>
        </div>
        <div class="contact-row">
            <span class="contact-label">Service Type:</span>
            <span>{{SERVICE_TYPE}}</span>
        </div>
        <div class="contact-row">
            <span class="contact-label">Date:</span>
            <span>{{CURRENT_DATE}}</span>
        </div>
    </div>
    
    <div class="section">
        <h2 class="section-title">Project Overview</h2>
        <div class="section-content">
            {{DESCRIPTION}}
        </div>
    </div>
    
    <div class="section">
        <h2 class="section-title">Key Features & Deliverables</h2>
        <div class="features-grid">
            {{FEATURES_HTML}}
        </div>
        
        <h3 style="margin-top: 25px; margin-bottom: 15px; color: #374151;">Deliverables:</h3>
        <ul class="deliverables-list">
            {{DELIVERABLES_HTML}}
        </ul>
    </div>
    
    <div class="budget-section">
        <div class="budget-amount">{{BUDGET}} {{CURRENCY}}</div>
        <div class="budget-label">Total Project Investment</div>
    </div>
    
    <div class="timeline-section">
        <h2 class="section-title" style="color: #065f46; border-bottom-color: #10b981;">Project Timeline</h2>
        <div class="section-content" style="color: #065f46;">
            <strong>Expected Duration:</strong> {{TIMELINE}}
        </div>
    </div>
    
    <div class="next-steps">
        <div class="next-steps-title">Next Steps</div>
        <ol>
            <li>Review this proposal and provide feedback</li>
            <li>Schedule a project kickoff meeting</li>
            <li>Begin discovery and planning phase</li>
            <li>Start development work</li>
        </ol>
    </div>
    
    <div class="contact-info">
        <h2 class="section-title">Contact Information</h2>
        <div class="contact-row">
            <span class="contact-label">Name:</span>
            <span>{{USER_NAME}}</span>
        </div>
        {{USER_EMAIL_ROW}}
        {{USER_PHONE_ROW}}
    </div>
    
    <div class="footer">
        <p>We're excited about the opportunity to work with you on this project.</p>
        <p>Please don't hesitate to reach out with any questions or to discuss modifications.</p>
        <p style="margin-top: 15px; font-style: italic;">This proposal is valid for 30 days from the date above.</p>
    </div>
</body>
</html>
`;

// HTML template for receipts (disabled for now)
const receiptHTMLTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Receipt</title>
    <style>
        /* Receipt styles - disabled until WhatsApp template is created */
        body { font-family: Arial, sans-serif; padding: 40px; }
        .receipt-header { text-align: center; margin-bottom: 30px; }
        .receipt-title { font-size: 24px; font-weight: bold; color: #2563eb; }
        /* More styles will be added when enabled */
    </style>
</head>
<body>
    <div class="receipt-header">
        <div class="receipt-title">Payment Receipt</div>
        <p>Receipt #{{RECEIPT_NUMBER}}</p>
    </div>
    <!-- Receipt content will be implemented when WhatsApp template is ready -->
</body>
</html>
`;

// HTML template for invoices (disabled for now)
const invoiceHTMLTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invoice</title>
    <style>
        /* Invoice styles - disabled until WhatsApp template is created */
        body { font-family: Arial, sans-serif; padding: 40px; }
        .invoice-header { text-align: center; margin-bottom: 30px; }
        .invoice-title { font-size: 24px; font-weight: bold; color: #2563eb; }
        /* More styles will be added when enabled */
    </style>
</head>
<body>
    <div class="invoice-header">
        <div class="invoice-title">Invoice</div>
        <p>Invoice #{{INVOICE_NUMBER}}</p>
    </div>
    <!-- Invoice content will be implemented when WhatsApp template is ready -->
</body>
</html>
`;

// Generate HTML for features
function generateFeaturesHTML(features: string[]): string {
    if (!features || features.length === 0) {
        return '<div class="feature-item"><div class="feature-title">Custom Solution</div><div>Tailored to your specific requirements</div></div>';
    }
    
    return features.map(feature => `
        <div class="feature-item">
            <div class="feature-title">${feature}</div>
        </div>
    `).join('');
}

// Generate HTML for deliverables
function generateDeliverablesHTML(deliverables: string[]): string {
    if (!deliverables || deliverables.length === 0) {
        return '<li>Complete project delivery</li><li>Documentation and support</li><li>Quality assurance testing</li>';
    }
    
    return deliverables.map(deliverable => `<li>${deliverable}</li>`).join('');
}

// Generate proposal HTML
export function generateProposalHTML(proposal: ProposalData & { user_name?: string; user_email?: string; user_phone?: string }): string {
    const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    const featuresHTML = generateFeaturesHTML(proposal.features || []);
    const deliverablesHTML = generateDeliverablesHTML(proposal.deliverables || []);
    
    // Optional contact rows
    const userEmailRow = proposal.user_email ? 
        `<div class="contact-row"><span class="contact-label">Email:</span><span>${proposal.user_email}</span></div>` : '';
    const userPhoneRow = proposal.user_phone ? 
        `<div class="contact-row"><span class="contact-label">Phone:</span><span>${proposal.user_phone}</span></div>` : '';
    
    return proposalHTMLTemplate
        .replace(/{{USER_NAME}}/g, proposal.user_name || 'Professional Services')
        .replace(/{{PROJECT_TITLE}}/g, proposal.project_title || `${proposal.service_type} Project for ${proposal.client_name}`)
        .replace(/{{CLIENT_NAME}}/g, proposal.client_name || 'Valued Client')
        .replace(/{{CLIENT_EMAIL}}/g, proposal.client_email || 'client@example.com')
        .replace(/{{SERVICE_TYPE}}/g, proposal.service_type || 'Professional Services')
        .replace(/{{CURRENT_DATE}}/g, currentDate)
        .replace(/{{DESCRIPTION}}/g, proposal.description || 'A comprehensive solution tailored to your business needs.')
        .replace(/{{FEATURES_HTML}}/g, featuresHTML)
        .replace(/{{DELIVERABLES_HTML}}/g, deliverablesHTML)
        .replace(/{{BUDGET}}/g, proposal.budget?.toString() || '0')
        .replace(/{{CURRENCY}}/g, proposal.currency || 'USD')
        .replace(/{{TIMELINE}}/g, proposal.timeline || 'To be determined')
        .replace(/{{USER_EMAIL_ROW}}/g, userEmailRow)
        .replace(/{{USER_PHONE_ROW}}/g, userPhoneRow);
}

// Generate PDF from HTML using Puppeteer
export async function generatePDFFromHTML(html: string, options: {
    format?: 'A4' | 'Letter';
    margin?: { top: string; right: string; bottom: string; left: string; };
} = {}): Promise<Buffer> {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
        const page = await browser.newPage();
        
        // Set content and wait for any dynamic content to load
        await page.setContent(html, { waitUntil: 'networkidle0' });
        
        // Generate PDF
        const pdfBuffer = await page.pdf({
            format: options.format || 'A4',
            margin: options.margin || {
                top: '20mm',
                right: '20mm',
                bottom: '20mm',
                left: '20mm'
            },
            printBackground: true,
            preferCSSPageSize: true
        });
        
        return Buffer.from(pdfBuffer);
    } finally {
        await browser.close();
    }
}

// Main function to generate proposal PDF
export async function generateProposalPDF(proposal: ProposalData): Promise<Buffer> {
    // Import Supabase client
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Fetch user information from the users table
    const { data: user } = await supabase
        .from('users')
        .select('name, phone_number, email')
        .eq('id', proposal.user_id)
        .single();
    
    // Create extended proposal data with user info
    const extendedProposal = {
        ...proposal,
        user_name: user?.name || 'Professional Services',
        user_email: user?.email || '',
        user_phone: user?.phone_number || ''
    };
    
    const html = generateProposalHTML(extendedProposal);
    return generatePDFFromHTML(html);
}

// Disabled functions for receipts and invoices (until WhatsApp templates are ready)
export async function generateReceiptPDF(receiptData: any): Promise<Buffer> {
    throw new Error('Receipt PDF generation is disabled until WhatsApp template is created');
}

export async function generateInvoicePDF(invoiceData: any): Promise<Buffer> {
    throw new Error('Invoice PDF generation is disabled until WhatsApp template is created');
}