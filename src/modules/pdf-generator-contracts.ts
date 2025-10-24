import PDFDocument from 'pdfkit';

export interface ContractPDFData {
  contractId: string;
  projectTitle: string;
  projectDescription: string;
  clientName: string;
  clientEmail?: string;
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

export async function generateContractPDF(contractData: ContractPDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      console.log('[Contract PDF Generator] Starting PDF generation for:', contractData.contractId);

      // Validate required data
      if (!contractData.contractId || !contractData.projectTitle || !contractData.totalAmount) {
        throw new Error('Missing required contract data: contractId, projectTitle, or totalAmount');
      }

      // Sanitize and provide defaults for data
      const sanitizedData = {
        contractId: contractData.contractId || 'N/A',
        projectTitle: contractData.projectTitle || 'Untitled Project',
        projectDescription: contractData.projectDescription || 'No description provided',
        clientName: contractData.clientName || 'Client',
        clientEmail: contractData.clientEmail || 'client@email.com',
        freelancerName: contractData.freelancerName || 'Freelancer',
        totalAmount: contractData.totalAmount || 0,
        tokenType: contractData.tokenType || 'USDC',
        chain: contractData.chain || 'base',
        deadline: contractData.deadline || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: contractData.status || 'created',
        createdAt: contractData.createdAt || new Date().toISOString(),
        milestones: contractData.milestones || []
      };

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
          console.log('[Contract PDF Generator] PDF generated successfully, size:', pdfData.length, 'bytes');
          resolve(pdfData);
        } catch (error) {
          clearTimeout(timeout);
          console.error('[Contract PDF Generator] Error concatenating PDF buffers:', error);
          reject(error);
        }
      });

      doc.on('error', (error) => {
        clearTimeout(timeout);
        console.error('[Contract PDF Generator] PDF document error:', error);
        reject(error);
      });

      // Add timeout to prevent hanging
      const timeout = setTimeout(() => {
        console.error('[Contract PDF Generator] PDF generation timeout after 30 seconds');
        reject(new Error('PDF generation timeout'));
      }, 30000);

      // Header with close button and title
      doc.fontSize(16).fillColor('#6b7280').text('✕', 50, 50);
      doc.fontSize(18).fillColor('#374151').text('Contract Details', 80, 50);

      // General Information Section
      let yPosition = 90;
      doc.fontSize(16).fillColor('#374151').text('General Information', 50, yPosition);
      yPosition += 30;

      // Profile section with avatar placeholder
      doc.circle(70, yPosition + 15, 15).fillAndStroke('#d1d5db', '#9ca3af');
      doc.fontSize(14).fillColor('#374151').text(sanitizedData.clientName, 100, yPosition);
      doc.fontSize(12).fillColor('#6b7280').text(sanitizedData.clientEmail || 'client@email.com', 100, yPosition + 18);
      yPosition += 60;

      // Contract details in two columns
      doc.fontSize(12).fillColor('#6b7280').text('Contract Name', 50, yPosition);
      doc.fontSize(12).fillColor('#374151').text(sanitizedData.projectTitle, 50, yPosition + 15);

      doc.fontSize(12).fillColor('#6b7280').text('Team', 300, yPosition);
      doc.fontSize(12).fillColor('#374151').text('Hedwig Team', 300, yPosition + 15);
      yPosition += 50;

      doc.fontSize(12).fillColor('#6b7280').text('Job Title', 50, yPosition);
      doc.fontSize(12).fillColor('#374151').text('Freelancer', 50, yPosition + 15);

      doc.fontSize(12).fillColor('#6b7280').text('Start Date', 300, yPosition);
      const startDate = new Date(sanitizedData.createdAt);
      doc.fontSize(12).fillColor('#374151').text(startDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }), 300, yPosition + 15);
      yPosition += 60;

      // Area of Work section
      doc.fontSize(12).fillColor('#6b7280').text('Area of Work', 50, yPosition);
      yPosition += 20;

      doc.fontSize(11).fillColor('#374151');
      const workItems = [
        `1. Project Development: ${sanitizedData.projectDescription}`,
        '2. Milestone Delivery: Complete deliverables according to agreed timeline and specifications.'
      ];

      workItems.forEach((item, index) => {
        const itemHeight = doc.heightOfString(item, { width: 480 });
        doc.text(item, 50, yPosition, { width: 480 });
        yPosition += itemHeight + 10;
      });

      yPosition += 20;

      // Payment Information Section
      doc.fontSize(16).fillColor('#374151').text('Payment Information', 50, yPosition);
      yPosition += 30;

      // Payment details in grid layout
      doc.fontSize(12).fillColor('#6b7280').text('Type', 50, yPosition);
      doc.fontSize(12).fillColor('#374151').text('Milestone', 50, yPosition + 15);

      doc.fontSize(12).fillColor('#6b7280').text('No of Milestone', 300, yPosition);
      doc.fontSize(12).fillColor('#374151').text(sanitizedData.milestones.length.toString(), 300, yPosition + 15);
      yPosition += 50;

      doc.fontSize(12).fillColor('#6b7280').text('Payment Status', 50, yPosition);
      doc.fontSize(12).fillColor('#8b5cf6').text('Processing', 50, yPosition + 15);

      // Safe date parsing for deadline
      let deadlineText = 'Not specified';
      try {
        const deadlineDate = new Date(sanitizedData.deadline);
        if (!isNaN(deadlineDate.getTime())) {
          deadlineText = deadlineDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          });
        }
      } catch (error) {
        console.warn('[Contract PDF Generator] Invalid deadline date:', sanitizedData.deadline);
      }

      doc.fontSize(12).fillColor('#6b7280').text('Last Payment', 300, yPosition);
      doc.fontSize(12).fillColor('#374151').text(deadlineText, 300, yPosition + 15);
      yPosition += 50;

      doc.fontSize(12).fillColor('#6b7280').text('Total Amount', 50, yPosition);
      doc.fontSize(16).fillColor('#374151').text(`${sanitizedData.tokenType} $${sanitizedData.totalAmount.toLocaleString()}`, 50, yPosition + 15);

      doc.fontSize(12).fillColor('#6b7280').text('Each Milestone', 300, yPosition);
      const avgMilestone = sanitizedData.milestones.length > 0 ?
        sanitizedData.totalAmount / sanitizedData.milestones.length :
        sanitizedData.totalAmount;
      doc.fontSize(12).fillColor('#374151').text(`${sanitizedData.tokenType} $${Math.round(avgMilestone).toLocaleString()}`, 300, yPosition + 15);
      yPosition += 70;





      // Footer with contract info
      const footerY = doc.page.height - 60;
      doc.fontSize(10).fillColor('#9ca3af');

      // Safe created date parsing
      let createdDateText = 'Unknown';
      try {
        const createdDate = new Date(sanitizedData.createdAt);
        if (!isNaN(createdDate.getTime())) {
          createdDateText = createdDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          });
        }
      } catch (error) {
        console.warn('[Contract PDF Generator] Invalid created date:', sanitizedData.createdAt);
      }

      doc.text(`Contract ID: ${sanitizedData.contractId} • Created: ${createdDateText}`, 50, footerY);
      doc.text('Powered by Hedwig - Blockchain Contract Management', 50, footerY + 15);

      doc.end();
    } catch (error) {
      console.error('[Contract PDF Generator] Error in generateContractPDF:', error);
      reject(error);
    }
  });
}