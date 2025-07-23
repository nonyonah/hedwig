import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabase';
import { generateProposalPDF } from '@/lib/htmlPDFService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid proposal ID' });
  }

  try {
    // Fetch proposal data from Supabase
    const { data: proposal, error } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !proposal) {
      console.error('Error fetching proposal:', error);
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Generate PDF using HTML/CSS + Puppeteer
    const pdfBuffer = await generateProposalPDF(proposal);

    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="proposal-${proposal.client_name?.replace(/[^a-zA-Z0-9]/g, '_') || 'client'}-${id}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    // Send the PDF
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
}