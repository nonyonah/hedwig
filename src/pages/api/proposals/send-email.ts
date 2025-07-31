import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabase';
import { sendEmailWithAttachment, generateProposalEmailTemplate } from '@/lib/emailService';
import { generateProposalPDF } from '@/modules/pdf-generator';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { proposalId, recipientEmail } = req.body;

    if (!proposalId || !recipientEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Fetch proposal data
    const { data: proposal, error } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', proposalId)
      .single();

    if (error || !proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Generate PDF
    const pdfBuffer = await generateProposalPDF({
      proposal_number: proposal.proposal_number || `PROP-${proposal.id}`,
      freelancer_name: 'Freelancer Name',
      freelancer_email: 'freelancer@hedwigbot.xyz',
      client_name: proposal.client_name || 'Client',
      client_email: proposal.client_email || recipientEmail,
      project_description: proposal.description || 'Project description',
      scope_of_work: proposal.deliverables ? proposal.deliverables.join(', ') : '',
      timeline: proposal.timeline || '4 weeks',
      amount: proposal.budget || 0,
      currency: proposal.currency || 'USD',
      payment_terms: '50% deposit required to begin work, remaining balance due upon completion'
    });

    // Generate email HTML
    const emailHtml = generateProposalEmailTemplate({
      proposal_number: proposal.proposal_number || `PROP-${proposal.id}`,
      freelancer_name: 'Freelancer Name',
      freelancer_email: 'freelancer@hedwigbot.xyz',
      client_name: proposal.client_name || 'Client',
      project_description: proposal.description || 'Project description',
      scope_of_work: proposal.deliverables ? proposal.deliverables.join(', ') : '',
      timeline: proposal.timeline || '4 weeks',
      amount: proposal.budget || 0,
      currency: proposal.currency || 'USD',
      id: proposal.id
    });

    // Send email with PDF attachment
    const emailSent = await sendEmailWithAttachment({
      to: recipientEmail,
      subject: `Project Proposal ${proposal.proposal_number || `PROP-${proposal.id}`}`,
      html: emailHtml,
      attachments: [
        {
          filename: `proposal-${proposal.proposal_number || proposal.id}.pdf`,
          content: pdfBuffer
        }
      ]
    });

    if (!emailSent) {
      return res.status(500).json({ error: 'Failed to send email' });
    }

    // Update proposal status to 'sent'
    await supabase
      .from('proposals')
      .update({ status: 'sent' })
      .eq('id', proposalId);

    res.status(200).json({ success: true, message: 'Proposal sent successfully' });
  } catch (error) {
    console.error('Error sending proposal:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}