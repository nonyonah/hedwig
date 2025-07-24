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
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #fff;
            padding: 40px;
        }
        
        .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 3px solid #a2d2ff;
            padding-bottom: 20px;
        }
        
        .logo {
            font-size: 28px;
            font-weight: 700;
            color: #a2d2ff;
            margin-bottom: 10px;
        }
        
        .tagline {
            color: #6b7280;
            font-size: 14px;
            font-weight: 500;
        }
        
        .proposal-title {
            font-size: 32px;
            font-weight: 700;
            color: #1f2937;
            margin: 30px 0 20px 0;
            text-align: center;
        }
        
        .client-info {
            background: #f8fafc;
            padding: 20px;
            border-radius: 12px;
            margin-bottom: 30px;
            border-left: 4px solid #a2d2ff;
        }
        
        .section {
            margin-bottom: 30px;
        }
        
        .section-title {
            font-size: 20px;
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 15px;
            border-bottom: 2px solid #a2d2ff;
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
            border-radius: 8px;
            border-left: 3px solid #a2d2ff;
        }
        
        .feature-title {
            font-weight: 600;
            color: #1e40af;
            margin-bottom: 5px;
        }
        
        .budget-section {
            background: linear-gradient(135deg, #a2d2ff 0%, #8bb8ff 100%);
            padding: 25px;
            border-radius: 12px;
            text-align: center;
            margin: 30px 0;
            color: white;
        }
        
        .budget-amount {
            font-size: 36px;
            font-weight: 700;
            margin-bottom: 10px;
        }
        
        .budget-label {
            font-size: 14px;
            font-weight: 500;
            opacity: 0.9;
        }
        
        .timeline-section {
            background: #f0f9ff;
            padding: 20px;
            border-radius: 12px;
            border-left: 4px solid #a2d2ff;
        }
        
        .deliverables-list {
            list-style: none;
            padding: 0;
        }
        
        .deliverables-list li {
            background: #f9fafb;
            margin: 8px 0;
            padding: 12px;
            border-radius: 8px;
            border-left: 3px solid #a2d2ff;
            position: relative;
            padding-left: 30px;
        }
        
        .deliverables-list li::before {
            content: "✓";
            position: absolute;
            left: 10px;
            color: #a2d2ff;
            font-weight: bold;
        }
        
        .footer {
            margin-top: 50px;
            padding-top: 30px;
            border-top: 2px solid #a2d2ff;
            text-align: center;
            color: #6b7280;
            font-size: 14px;
        }
        
        .contact-info {
            margin-top: 20px;
            padding: 20px;
            background: #f8fafc;
            border-radius: 12px;
        }
        
        .contact-row {
            display: flex;
            justify-content: space-between;
            margin: 10px 0;
        }
        
        .contact-label {
            font-weight: 600;
            color: #374151;
        }
        
        .next-steps {
            background: #f0f9ff;
            padding: 25px;
            border-radius: 12px;
            border: 2px solid #a2d2ff;
            margin: 30px 0;
        }
        
        .next-steps-title {
            color: #1e40af;
            font-weight: 600;
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
        <h2 class="section-title" style="color: #1e40af; border-bottom-color: #a2d2ff;">Project Timeline</h2>
        <div class="section-content" style="color: #1e40af;">
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

// HTML template for invoices
const invoiceHTMLTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invoice</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #ffffff;
            padding: 40px;
        }
        
        .invoice-container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }
        
        .invoice-header {
            background: linear-gradient(135deg, #a2d2ff 0%, #8bb8ff 100%);
            color: white;
            padding: 40px;
            position: relative;
        }
        
        .invoice-title {
            font-size: 36px;
            font-weight: 700;
            margin-bottom: 10px;
        }
        
        .invoice-number {
            position: absolute;
            top: 40px;
            right: 40px;
            text-align: right;
        }
        
        .invoice-number h3 {
            font-size: 14px;
            font-weight: 500;
            opacity: 0.9;
            margin-bottom: 5px;
        }
        
        .invoice-number .number {
            font-size: 24px;
            font-weight: 700;
        }
        
        .invoice-content {
            padding: 40px;
        }
        
        .billing-section {
            display: flex;
            justify-content: space-between;
            margin-bottom: 40px;
        }
        
        .billing-info {
            flex: 1;
        }
        
        .billing-info h3 {
            font-size: 14px;
            font-weight: 600;
            color: #666;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .billing-info .name {
            font-size: 18px;
            font-weight: 600;
            color: #333;
            margin-bottom: 5px;
        }
        
        .billing-info .details {
            color: #666;
            font-size: 14px;
        }
        
        .invoice-dates {
            text-align: right;
        }
        
        .date-item {
            margin-bottom: 15px;
        }
        
        .date-label {
            font-size: 14px;
            font-weight: 500;
            color: #666;
            display: block;
        }
        
        .date-value {
            font-size: 16px;
            font-weight: 600;
            color: #333;
        }
        
        .services-section {
            margin-bottom: 40px;
        }
        
        .services-title {
            font-size: 18px;
            font-weight: 600;
            color: #333;
            margin-bottom: 20px;
        }
        
        .services-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
        }
        
        .services-table th {
            background: #f8f9fa;
            padding: 15px;
            text-align: left;
            font-weight: 600;
            color: #333;
            border-bottom: 2px solid #e9ecef;
        }
        
        .services-table th:last-child,
        .services-table td:last-child {
            text-align: right;
        }
        
        .services-table td {
            padding: 15px;
            border-bottom: 1px solid #e9ecef;
        }
        
        .total-section {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            text-align: right;
            margin-bottom: 40px;
        }
        
        .total-label {
            font-size: 18px;
            font-weight: 600;
            color: #666;
            margin-right: 20px;
        }
        
        .total-amount {
            font-size: 32px;
            font-weight: 700;
            color: #333;
        }
        
        .company-section {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            background: #f8f9fa;
            padding: 30px;
            border-radius: 8px;
            margin-top: 40px;
        }
        
        .company-info {
            flex: 1;
        }
        
        .company-logo {
            width: 60px;
            height: 60px;
            background: #a2d2ff;
            border-radius: 8px;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            font-weight: 700;
            color: white;
        }
        
        .company-name {
            font-size: 20px;
            font-weight: 700;
            color: #333;
            margin-bottom: 5px;
        }
        
        .company-details {
            color: #666;
            font-size: 14px;
            line-height: 1.5;
        }
        
        .payment-info {
            flex: 1;
            margin-left: 40px;
        }
        
        .payment-info h3 {
            font-size: 16px;
            font-weight: 600;
            color: #333;
            margin-bottom: 15px;
        }
        
        .payment-details {
            color: #666;
            font-size: 14px;
            line-height: 1.6;
            margin-bottom: 20px;
        }
        
        .pay-button {
            background: #a2d2ff;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-weight: 600;
            font-size: 14px;
            text-decoration: none;
            display: inline-block;
            transition: background 0.3s ease;
        }
        
        .pay-button:hover {
            background: #8bb8ff;
        }
        
        .additional-notes {
            flex: 1;
            margin-left: 40px;
        }
        
        .additional-notes h3 {
            font-size: 16px;
            font-weight: 600;
            color: #333;
            margin-bottom: 15px;
        }
        
        .notes-content {
            color: #666;
            font-size: 14px;
            line-height: 1.6;
        }
        
        @media print {
            body { padding: 0; }
            .pay-button { background: #a2d2ff !important; }
        }
    </style>
</head>
<body>
    <div class="invoice-container">
        <div class="invoice-header">
            <div class="invoice-title">Invoice</div>
            <div class="invoice-number">
                <h3>Invoice No.</h3>
                <div class="number">{{INVOICE_NUMBER}}</div>
            </div>
        </div>
        
        <div class="invoice-content">
            <div class="billing-section">
                <div class="billing-info">
                    <h3>Billed To:</h3>
                    <div class="name">{{CLIENT_NAME}}</div>
                    <div class="details">{{CLIENT_EMAIL}}</div>
                </div>
                
                <div class="invoice-dates">
                    <div class="date-item">
                        <span class="date-label">Issued on</span>
                        <span class="date-value">{{ISSUE_DATE}}</span>
                    </div>
                    <div class="date-item">
                        <span class="date-label">Payment Due</span>
                        <span class="date-value">{{DUE_DATE}}</span>
                    </div>
                </div>
            </div>
            
            <div class="services-section">
                <h2 class="services-title">Services</h2>
                <table class="services-table">
                    <thead>
                        <tr>
                            <th>Description</th>
                            <th>Qty.</th>
                            <th>Price</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {{SERVICE_ITEMS}}
                    </tbody>
                </table>
                
                <div class="total-section">
                    <span class="total-label">Total ({{CURRENCY}})</span>
                    <span class="total-amount">{{TOTAL_AMOUNT}}</span>
                </div>
            </div>
        </div>
        
        <div class="company-section">
            <div class="company-info">
                <div class="company-logo">{{COMPANY_INITIAL}}</div>
                <div class="company-name">{{COMPANY_NAME}}</div>
                <div class="company-details">
                    {{COMPANY_ADDRESS}}<br>
                    {{FREELANCER_EMAIL}}<br>
                    {{COMPANY_ID1}}<br>
                    {{COMPANY_ID2}}
                </div>
            </div>
            
            <div class="payment-info">
                <h3>Payment Instructions</h3>
                <div class="payment-details">
                    {{PAYMENT_INSTRUCTIONS}}
                </div>
                <a href="{{PAYMENT_URL}}" class="pay-button">Pay Online</a>
            </div>
            
            <div class="additional-notes">
                <h3>Additional Notes</h3>
                <div class="notes-content">
                    {{ADDITIONAL_NOTES}}
                </div>
            </div>
        </div>
    </div>
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
    let browser = null;
    let page = null;
    
    try {
        // Launch browser with improved configuration for Windows
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding'
            ],
            timeout: 60000, // 60 second timeout for browser launch
            protocolTimeout: 60000
        });
        
        page = await browser.newPage();
        
        // Set page timeout
        page.setDefaultTimeout(45000); // 45 second timeout for page operations
        page.setDefaultNavigationTimeout(45000);
        
        // Set content with shorter timeout and simpler wait condition
        await page.setContent(html, { 
            waitUntil: 'domcontentloaded', // Changed from 'networkidle0' to be faster
            timeout: 30000 // 30 second timeout for content loading
        });
        
        // Wait a bit for any CSS to apply
        await page.waitForTimeout(1000);
        
        // Generate PDF with timeout
        const pdfBuffer = await Promise.race([
            page.pdf({
                format: options.format || 'A4',
                margin: options.margin || {
                    top: '20mm',
                    right: '20mm',
                    bottom: '20mm',
                    left: '20mm'
                },
                printBackground: true,
                preferCSSPageSize: true,
                timeout: 30000 // 30 second timeout for PDF generation
            }),
            new Promise<never>((_, reject) => 
                setTimeout(() => reject(new Error('PDF generation timed out after 30 seconds')), 30000)
            )
        ]);
        
        return Buffer.from(pdfBuffer);
    } catch (error) {
        console.error('Error generating PDF:', error);
        throw new Error(`PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
        // Ensure proper cleanup
        try {
            if (page) {
                await page.close();
            }
        } catch (e) {
            console.warn('Error closing page:', e);
        }
        
        try {
            if (browser) {
                await browser.close();
            }
        } catch (e) {
            console.warn('Error closing browser:', e);
        }
        
        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }
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

// Generate invoice HTML
export function generateInvoiceHTML(invoice: any): string {
    const issueDate = new Date(invoice.date_created || Date.now()).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    const dueDate = invoice.due_date ? 
        new Date(invoice.due_date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }) : 
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

    // Generate service items HTML
    const serviceItems = `
        <tr>
            <td>${invoice.project_description || 'Professional Services'}</td>
            <td>1</td>
            <td>${(invoice.price || invoice.amount || 0).toFixed(2)}</td>
            <td>${(invoice.amount || 0).toFixed(2)}</td>
        </tr>
    `;

    // Create payment URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://hedwigbot.xyz';
    const paymentUrl = `${baseUrl}/pay/${invoice.id}`;

    // Get company initial
    const companyInitial = (invoice.freelancer_name || 'C').charAt(0).toUpperCase();

    return invoiceHTMLTemplate
        .replace(/{{INVOICE_NUMBER}}/g, invoice.invoice_number || '#000123')
        .replace(/{{CLIENT_NAME}}/g, invoice.client_name || 'Client Name')
        .replace(/{{CLIENT_EMAIL}}/g, invoice.client_email || 'client@example.com')
        .replace(/{{ISSUE_DATE}}/g, issueDate)
        .replace(/{{DUE_DATE}}/g, dueDate)
        .replace(/{{SERVICE_ITEMS}}/g, serviceItems)
        .replace(/{{CURRENCY}}/g, 'USD')
        .replace(/{{TOTAL_AMOUNT}}/g, (invoice.amount || 0).toFixed(2))
        .replace(/{{COMPANY_INITIAL}}/g, companyInitial)
        .replace(/{{COMPANY_NAME}}/g, `${invoice.freelancer_name || 'Company Name'} LLC`)
        .replace(/{{COMPANY_ADDRESS}}/g, 'Address / Contact Info')
        .replace(/{{FREELANCER_EMAIL}}/g, invoice.freelancer_email || 'email@company.com')
        .replace(/{{COMPANY_ID1}}/g, 'ID#1 Label\n1234567890-123')
        .replace(/{{COMPANY_ID2}}/g, 'ID#2 Label\nABC-0987654321')
        .replace(/{{PAYMENT_INSTRUCTIONS}}/g, invoice.payment_instructions || 'Voluptas nisl aut. Eet vitae dolore molestias porro praesentium. Tempore recusandae voluptatem necessitatibus corporis inventore neque magnam ut.')
        .replace(/{{PAYMENT_URL}}/g, paymentUrl)
        .replace(/{{ADDITIONAL_NOTES}}/g, invoice.additional_notes || 'Have a great day');
}

// Disabled functions for receipts and invoices (until WhatsApp templates are ready)
export async function generateReceiptPDF(receiptData: any): Promise<Buffer> {
    throw new Error('Receipt PDF generation is disabled until WhatsApp template is created');
}

export async function generateInvoicePDF(invoiceData: any): Promise<Buffer> {
    const html = generateInvoiceHTML(invoiceData);
    return generatePDFFromHTML(html);
}