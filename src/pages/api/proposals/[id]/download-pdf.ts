import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabase';
import { generateProposalPDF } from '@/modules/pdf-generator';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid proposal ID' });
    }

    // Fetch proposal data
    const { data: proposal, error } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', id)
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
      client_email: proposal.client_email || 'client@example.com',
      project_description: proposal.description || 'Project description',
      scope_of_work: proposal.deliverables ? proposal.deliverables.join(', ') : '',
      timeline: proposal.timeline || '4 weeks',
      amount: proposal.budget || 0,
      currency: proposal.currency || 'USD',
      payment_terms: '50% deposit required to begin work, remaining balance due upon completion'
    });

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="proposal-${proposal.proposal_number || proposal.id}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    // Send PDF buffer
    res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}