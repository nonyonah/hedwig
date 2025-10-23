import PDFDocument from 'pdfkit';

export interface ContractPDFData {
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

      // Header with Hedwig branding
      doc.fontSize(24).fillColor('#2563eb').text('HEDWIG', 50, 50);
      doc.fontSize(20).fillColor('#000000').text('FREELANCE CONTRACT', 50, 80);
      doc.fontSize(10).text(`Contract ID: ${sanitizedData.contractId}`, 50, 110);
      doc.text(`Status: ${sanitizedData.status.toUpperCase()}`, 400, 110);
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 50, 125);

      // Contract Information Section
      let yPosition = 160;
      doc.rect(50, yPosition - 10, 500, 40)
         .fillAndStroke('#f0f9ff', '#0ea5e9');
      
      doc.fontSize(16).fillColor('#0369a1').text('📋 PROJECT DETAILS', 60, yPosition + 5);
      yPosition += 50;

      doc.fontSize(12).fillColor('#374151');
      doc.text(`Title: ${sanitizedData.projectTitle}`, 60, yPosition);
      yPosition += 20;
      
      doc.text('Description:', 60, yPosition);
      yPosition += 15;
      doc.fontSize(11).fillColor('#6b7280');
      const descHeight = doc.heightOfString(sanitizedData.projectDescription, { width: 480 });
      doc.text(sanitizedData.projectDescription, 60, yPosition, { width: 480 });
      yPosition += descHeight + 30;

      // Parties Section
      doc.rect(50, yPosition - 10, 500, 40)
         .fillAndStroke('#f0fdf4', '#22c55e');
      
      doc.fontSize(16).fillColor('#15803d').text('👥 PARTIES', 60, yPosition + 5);
      yPosition += 50;

      doc.fontSize(12).fillColor('#374151');
      doc.text(`Client: ${sanitizedData.clientName}`, 60, yPosition);
      doc.text(`Freelancer: ${sanitizedData.freelancerName}`, 300, yPosition);
      yPosition += 40;

      // Payment Terms Section
      doc.rect(50, yPosition - 10, 500, 40)
         .fillAndStroke('#fef3c7', '#f59e0b');
      
      doc.fontSize(16).fillColor('#d97706').text('💰 PAYMENT TERMS', 60, yPosition + 5);
      yPosition += 50;

      doc.fontSize(12).fillColor('#374151');
      doc.text(`Total Amount: ${sanitizedData.totalAmount} ${sanitizedData.tokenType}`, 60, yPosition);
      doc.text(`Blockchain: ${sanitizedData.chain.toUpperCase()}`, 300, yPosition);
      yPosition += 20;
      
      // Safe date parsing
      let deadlineText = 'Not specified';
      try {
        const deadlineDate = new Date(sanitizedData.deadline);
        if (!isNaN(deadlineDate.getTime())) {
          deadlineText = deadlineDate.toLocaleDateString();
        }
      } catch (error) {
        console.warn('[Contract PDF Generator] Invalid deadline date:', sanitizedData.deadline);
      }
      
      doc.text(`Deadline: ${deadlineText}`, 60, yPosition);
      yPosition += 40;

      // Milestones Section
      if (sanitizedData.milestones && sanitizedData.milestones.length > 0) {
        doc.rect(50, yPosition - 10, 500, 40)
           .fillAndStroke('#f3e8ff', '#8b5cf6');
        
        doc.fontSize(16).fillColor('#7c3aed').text('🎯 MILESTONES', 60, yPosition + 5);
        yPosition += 50;

        sanitizedData.milestones.forEach((milestone, index) => {
          // Check if we need a new page
          if (yPosition > 650) {
            doc.addPage();
            yPosition = 50;
          }

          doc.rect(50, yPosition - 5, 500, 80)
             .fillAndStroke(index % 2 === 0 ? '#f9fafb' : '#ffffff', '#e5e7eb');

          doc.fontSize(12).fillColor('#1f2937');
          doc.text(`${index + 1}. ${milestone.title || 'Untitled Milestone'}`, 60, yPosition + 5);
          
          doc.fontSize(10).fillColor('#6b7280');
          doc.text(`Description: ${milestone.description || 'No description'}`, 60, yPosition + 20, { width: 300 });
          
          doc.fontSize(11).fillColor('#059669');
          doc.text(`Amount: ${milestone.amount || 0} ${sanitizedData.tokenType}`, 380, yPosition + 5);
          
          doc.fontSize(10).fillColor('#6b7280');
          
          // Safe milestone deadline parsing
          let milestoneDeadlineText = 'Not specified';
          try {
            const milestoneDeadline = new Date(milestone.deadline);
            if (!isNaN(milestoneDeadline.getTime())) {
              milestoneDeadlineText = milestoneDeadline.toLocaleDateString();
            }
          } catch (error) {
            console.warn('[Contract PDF Generator] Invalid milestone deadline:', milestone.deadline);
          }
          
          doc.text(`Deadline: ${milestoneDeadlineText}`, 380, yPosition + 20);
          doc.text(`Status: ${(milestone.status || 'pending').toUpperCase()}`, 380, yPosition + 35);
          
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
      
      // Safe created date parsing
      let createdDateText = 'Unknown';
      try {
        const createdDate = new Date(sanitizedData.createdAt);
        if (!isNaN(createdDate.getTime())) {
          createdDateText = createdDate.toLocaleDateString();
        }
      } catch (error) {
        console.warn('[Contract PDF Generator] Invalid created date:', sanitizedData.createdAt);
      }
      
      doc.text(`Contract created: ${createdDateText}`, 50, footerY);
      doc.text('Powered by Hedwig - Secure Freelance Payments on Blockchain', 50, footerY + 15);
      doc.text('🔗 Base & Celo Networks • 🔒 Smart Contract Escrow', 50, footerY + 30);

      doc.end();
    } catch (error) {
      console.error('[Contract PDF Generator] Error in generateContractPDF:', error);
      reject(error);
    }
  });
}