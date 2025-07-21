import type { NextApiRequest, NextApiResponse } from 'next';
import { ProposalService } from '@/lib/proposalService';
import { sendWhatsAppMessage } from '@/lib/whatsappUtils';
import { loadServerEnvironment } from '@/lib/serverEnv';

loadServerEnvironment();

interface SendProposalRequest {
  proposalId: string;
  userId: string;
  userPhone: string;
  sendToClient?: boolean;
}

interface SendProposalResponse {
  success: boolean;
  whatsappSent?: boolean;
  emailSent?: boolean;
  proposalUrl?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SendProposalResponse>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const {
      proposalId,
      userId,
      userPhone,
      sendToClient = false
    }: SendProposalRequest = req.body;

    // Validate required fields
    if (!proposalId || !userId || !userPhone) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: proposalId, userId, userPhone'
      });
    }

    // Get proposal and summary
    const summary = await ProposalService.generateProposalSummary(proposalId, userId);
    
    if (!summary) {
      return res.status(404).json({
        success: false,
        error: 'Proposal not found'
      });
    }

    const { proposal } = summary;

    // Generate proposal URL
    const proposalUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://hedwig.xyz'}/api/get-proposal?proposalId=${proposalId}&format=html&includeSummary=true`;

    let whatsappSent = false;
    let emailSent = false;

    try {
      // Send WhatsApp confirmation to user with natural language
      const confirmationMessage = `✅ *Proposal Created Successfully!*

📋 *Project:* ${proposal.projectTitle}
👤 *Client:* ${proposal.clientName}
💰 *Total Amount:* $${summary.totalAmount.toLocaleString()}
📅 *Timeline:* ${summary.formattedTimeline}

🔗 *Proposal Link:* ${summary.paymentLink || proposalUrl}

Your professional proposal has been generated and is ready to share with your client!`;

      await sendWhatsAppMessage(userPhone, confirmationMessage);
      whatsappSent = true;
      console.log('WhatsApp confirmation sent to user:', userPhone);
    } catch (error) {
      console.error('Failed to send WhatsApp message:', error);
    }

    // Send email to client if requested and email is provided
    if (sendToClient && proposal.clientEmail) {
      try {
        await sendProposalEmail({
          recipientEmail: proposal.clientEmail,
          proposal,
          summary,
          proposalUrl
        });
        emailSent = true;
        console.log('Email sent to client:', proposal.clientEmail);

        // Send WhatsApp notification about email sent
        try {
          const emailSentMessage = `📧 *Proposal Sent Successfully!*

✅ Your proposal for "${proposal.projectTitle}" has been sent to ${proposal.clientName} at ${proposal.clientEmail}

The client will receive:
• Professional proposal document
• Project details and timeline
• Payment information

You'll be notified when the client views or responds to the proposal.`;

          await sendWhatsAppMessage(userPhone, emailSentMessage);
        } catch (whatsappError) {
          console.error('Failed to send email confirmation via WhatsApp:', whatsappError);
        }
      } catch (error) {
        console.error('Failed to send email to client:', error);
      }
    }

    // Update proposal status to sent
    await ProposalService.updateProposalStatus(proposalId, 'sent', userId);

    return res.status(200).json({
      success: true,
      whatsappSent,
      emailSent,
      proposalUrl
    });

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

// Email sending function using Resend
async function sendProposalEmail({
  recipientEmail,
  proposal,
  summary,
  proposalUrl
}: {
  recipientEmail: string;
  proposal: any;
  summary: any;
  proposalUrl: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('Resend API key not configured, skipping email');
    return;
  }

  const proposalHTML = ProposalService.generateProposalHTML(summary);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Hedwig <proposals@hedwig.xyz>',
        to: [recipientEmail],
        subject: `Project Proposal: ${proposal.projectTitle}`,
        html: proposalHTML,
        attachments: [
          {
            filename: `${proposal.projectTitle.replace(/[^a-zA-Z0-9]/g, '_')}_proposal.html`,
            content: Buffer.from(proposalHTML).toString('base64'),
            content_type: 'text/html'
          }
        ]
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Resend API error: ${response.status} ${errorData}`);
    }

    const result = await response.json();
    console.log('Email sent successfully:', result);
    return result;
  } catch (error) {
    console.error('Error sending email via Resend:', error);
    throw error;
  }
}