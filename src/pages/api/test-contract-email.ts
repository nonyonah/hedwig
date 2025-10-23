import { NextApiRequest, NextApiResponse } from 'next';
import { generateContractEmailTemplate } from '../../lib/emailService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Sample contract data for testing
    const contractData = {
      id: 'test-contract-123',
      contractId: 'TEST-001',
      projectTitle: 'Sample Website Development Project',
      projectDescription: 'Development of a modern e-commerce website with payment integration, user authentication, and admin dashboard. The project includes responsive design, SEO optimization, and performance enhancements.',
      clientName: 'John Smith',
      freelancerName: 'Jane Developer',
      totalAmount: 5000,
      tokenType: 'USDC',
      chain: 'base',
      deadline: '2024-12-31',
      contractHash: 'abc123def456ghi789',
      createdAt: new Date().toISOString(),
      milestones: [
        {
          title: 'Design & Wireframes',
          description: 'Create initial designs, wireframes, and user interface mockups for client approval.',
          amount: 1500,
          deadline: '2024-11-15',
          status: 'pending'
        },
        {
          title: 'Frontend Development',
          description: 'Implement the user interface using React and modern CSS frameworks.',
          amount: 2000,
          deadline: '2024-12-01',
          status: 'pending'
        },
        {
          title: 'Backend Integration',
          description: 'Set up backend services, database, and API integrations.',
          amount: 1500,
          deadline: '2024-12-20',
          status: 'pending'
        }
      ]
    };

    // Generate email template
    const emailHtml = generateContractEmailTemplate(contractData);

    // Return HTML for preview
    res.setHeader('Content-Type', 'text/html');
    res.send(emailHtml);

  } catch (error) {
    console.error('Test email generation error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to generate test email' 
    });
  }
}