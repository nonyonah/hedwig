import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { generatePDF } from '@/lib/proposalPDFService';
import { loadServerEnvironment } from '@/lib/serverEnv';

// Load environment variables
loadServerEnvironment();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Proposal ID is required' });
    }

    // Get the proposal from database
    const { data: proposal, error } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Get user name for branding
    const { data: user } = await supabase
      .from('users')
      .select('name')
      .eq('id', proposal.user_identifier)
      .single();

    const userName = user?.name || 'Professional Services';

    // Generate PDF using React-PDF (same as proposal service)
    const pdfBuffer = await generatePDF(proposal, {
      template: 'detailed',
      branding: {
        companyName: userName,
        primaryColor: '#2563eb',
        secondaryColor: '#64748b',
        contactInfo: `${userName} | Professional Services`
      },
      includeSignature: true
    });

    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="proposal-${proposal.client_name?.replace(/[^a-zA-Z0-9]/g, '_') || 'client'}-${id}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    
    return res.send(pdfBuffer);

  } catch (error) {
    console.error('Error generating proposal PDF:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}