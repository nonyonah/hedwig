import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Download, Calendar, DollarSign, User, Clock, CheckCircle, FileText, Target } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { generateProposalPDF } from '@/modules/pdf-generator';

interface ProposalSection {
  title: string;
  content: string;
}

interface ProjectPhase {
  phase: string;
  duration: string;
  deliverables: string[];
  cost: number;
}

interface ProposalData {
  id: string;
  title: string;
  client: {
    name: string;
    email: string;
    company?: string;
  };
  freelancer: {
    name: string;
    email: string;
    company?: string;
  };
  projectSummary: string;
  totalAmount: number;
  currency: string;
  estimatedDuration: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
  createdAt: string;
  expiresAt: string;
  sections: ProposalSection[];
  phases: ProjectPhase[];
  terms: string[];
}

const Proposal: React.FC = () => {
  const router = useRouter();
  const { id } = router.query;
  const [proposalData, setProposalData] = useState<ProposalData | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Sample data for demonstration
  const sampleProposalData: ProposalData = {
    id: id as string || '1',
    title: 'E-commerce Website Development',
    client: {
      name: 'Sarah Johnson',
      email: 'sarah@techstartup.com',
      company: 'Tech Startup Inc.'
    },
    freelancer: {
      name: 'Alex Chen',
      email: 'alex@hedwig.app',
      company: 'Hedwig Studio'
    },
    projectSummary: 'Development of a modern, responsive e-commerce website with payment integration, inventory management, and admin dashboard. The project includes custom design, mobile optimization, and SEO implementation.',
    totalAmount: 8500,
    currency: 'USD',
    estimatedDuration: '6-8 weeks',
    status: 'sent',
    createdAt: '2024-01-15T10:00:00Z',
    expiresAt: '2024-02-15T23:59:59Z',
    sections: [
      {
        title: 'Project Overview',
        content: 'This project involves creating a comprehensive e-commerce solution that will serve as the foundation for your online business. We will focus on user experience, performance, and scalability to ensure your platform can grow with your business needs.'
      },
      {
        title: 'Technical Approach',
        content: 'We will use modern web technologies including React.js for the frontend, Node.js for the backend, and PostgreSQL for the database. The platform will be hosted on AWS with CDN integration for optimal performance worldwide.'
      },
      {
        title: 'Design Philosophy',
        content: 'Our design approach prioritizes user experience and conversion optimization. We will create a clean, intuitive interface that guides customers through the purchasing process while maintaining your brand identity.'
      }
    ],
    phases: [
      {
        phase: 'Discovery & Planning',
        duration: '1 week',
        deliverables: ['Requirements analysis', 'Technical specification', 'Project timeline', 'Wireframes'],
        cost: 1500
      },
      {
        phase: 'Design & Prototyping',
        duration: '2 weeks',
        deliverables: ['UI/UX design', 'Interactive prototype', 'Design system', 'Client feedback integration'],
        cost: 2500
      },
      {
        phase: 'Development',
        duration: '3-4 weeks',
        deliverables: ['Frontend development', 'Backend API', 'Database setup', 'Payment integration'],
        cost: 3500
      },
      {
        phase: 'Testing & Launch',
        duration: '1 week',
        deliverables: ['Quality assurance', 'Performance optimization', 'Deployment', 'Training & documentation'],
        cost: 1000
      }
    ],
    terms: [
      'Payment schedule: 30% upfront, 40% at milestone completion, 30% upon project delivery',
      'All source code and design files will be transferred upon final payment',
      'Includes 30 days of post-launch support and bug fixes',
      'Additional features or scope changes will be quoted separately',
      'Project timeline may vary based on client feedback and approval speed'
    ]
  };

  useEffect(() => {
    // In a real app, fetch proposal data from Supabase
    // For now, use sample data
    setProposalData(sampleProposalData);
    setLoading(false);
  }, [id]);

  const handleCopyProposalUrl = () => {
    const url = `${window.location.origin}/proposal/${id}`;
    navigator.clipboard.writeText(url);
    // You could add a toast notification here
  };

  const handleDownloadPDF = async () => {
    if (!proposalData) return;
    
    try {
      const pdfBuffer = await generateProposalPDF({
        proposalNumber: proposalData.id,
        clientName: proposalData.client.name,
        clientEmail: proposalData.client.email,
        freelancerName: proposalData.freelancer.name,
        freelancerEmail: proposalData.freelancer.email,
        projectTitle: proposalData.title,
        projectDescription: proposalData.projectSummary,
        totalAmount: proposalData.totalAmount,
        currency: proposalData.currency,
        createdAt: proposalData.createdAt,
        expiresAt: proposalData.expiresAt
      });
      
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `proposal-${proposalData.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  const handleAcceptProposal = () => {
    // Redirect to payment or acceptance flow
    router.push(`/proposal/${id}/accept`);
  };

  const handleRequestChanges = () => {
    // Redirect to feedback form
    router.push(`/proposal/${id}/feedback`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return 'bg-green-100 text-green-800';
      case 'sent': return 'bg-blue-100 text-blue-800';
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'expired': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const isExpired = () => {
    if (!proposalData) return false;
    return new Date(proposalData.expiresAt) < new Date();
  };

  const getTimeRemaining = () => {
    if (!proposalData) return '';
    const now = new Date();
    const expiry = new Date(proposalData.expiresAt);
    const diff = expiry.getTime() - now.getTime();
    
    if (diff <= 0) return 'Expired';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} remaining`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} remaining`;
    return 'Less than 1 hour remaining';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading proposal...</p>
        </div>
      </div>
    );
  }

  if (!proposalData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Proposal Not Found</h1>
          <p className="text-muted-foreground">The proposal you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Project Proposal</h1>
          <p className="text-muted-foreground">Review the project details and terms</p>
        </div>

        <div className="space-y-8">
          {/* Status and Overview Card */}
          <Card className="border border-border shadow-sm">
            <CardContent className="p-8">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">{proposalData.title}</h2>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      <span>Created {new Date(proposalData.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      <span>{proposalData.estimatedDuration}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 lg:mt-0 flex flex-col items-start lg:items-end gap-2">
                  <div className="flex items-center gap-2">
                    <Badge className={getStatusColor(proposalData.status)}>
                      {proposalData.status.charAt(0).toUpperCase() + proposalData.status.slice(1)}
                    </Badge>
                    {!isExpired() && proposalData.status === 'sent' && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        <span>{getTimeRemaining()}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-primary" />
                    <span className="text-2xl font-bold text-foreground">
                      {proposalData.totalAmount.toLocaleString()}
                    </span>
                    <span className="text-lg text-muted-foreground">{proposalData.currency}</span>
                  </div>
                </div>
              </div>

              {/* Client and Freelancer Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="bg-muted/30 rounded-lg p-4">
                  <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Client
                  </h3>
                  <div>
                    <p className="font-medium text-foreground">{proposalData.client.name}</p>
                    <p className="text-sm text-muted-foreground">{proposalData.client.email}</p>
                    {proposalData.client.company && (
                      <p className="text-sm text-muted-foreground">{proposalData.client.company}</p>
                    )}
                  </div>
                </div>
                <div className="bg-muted/30 rounded-lg p-4">
                  <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Freelancer
                  </h3>
                  <div>
                    <p className="font-medium text-foreground">{proposalData.freelancer.name}</p>
                    <p className="text-sm text-muted-foreground">{proposalData.freelancer.email}</p>
                    {proposalData.freelancer.company && (
                      <p className="text-sm text-muted-foreground">{proposalData.freelancer.company}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Project Summary */}
              <div className="bg-muted/30 rounded-lg p-6">
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Project Summary
                </h3>
                <p className="text-foreground leading-relaxed">{proposalData.projectSummary}</p>
              </div>
            </CardContent>
          </Card>

          {/* Detailed Proposal Sections */}
          {proposalData.sections.map((section, index) => (
            <Card key={index} className="border border-border shadow-sm">
              <CardContent className="p-8">
                <h3 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  {section.title}
                </h3>
                <p className="text-foreground leading-relaxed">{section.content}</p>
              </CardContent>
            </Card>
          ))}

          {/* Project Phases */}
          <Card className="border border-border shadow-sm">
            <CardContent className="p-8">
              <h3 className="text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                Project Phases & Deliverables
              </h3>
              <div className="space-y-6">
                {proposalData.phases.map((phase, index) => (
                  <div key={index} className="border border-border rounded-lg p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-4">
                      <div>
                        <h4 className="text-lg font-semibold text-foreground">{phase.phase}</h4>
                        <p className="text-sm text-muted-foreground">{phase.duration}</p>
                      </div>
                      <div className="mt-2 lg:mt-0">
                        <span className="text-lg font-bold text-foreground">
                          ${phase.cost.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground mb-2">Deliverables:</p>
                      <ul className="list-disc list-inside space-y-1">
                        {phase.deliverables.map((deliverable, idx) => (
                          <li key={idx} className="text-sm text-muted-foreground">{deliverable}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Terms & Conditions */}
          <Card className="border border-border shadow-sm">
            <CardContent className="p-8">
              <h3 className="text-xl font-semibold text-foreground mb-6">Terms & Conditions</h3>
              <ul className="space-y-3">
                {proposalData.terms.map((term, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                    <p className="text-foreground">{term}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              onClick={handleCopyProposalUrl}
              variant="outline"
              className="flex-1"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy Proposal Link
            </Button>
            <Button
              onClick={handleDownloadPDF}
              variant="outline"
              className="flex-1"
            >
              <Download className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
            {proposalData.status === 'sent' && !isExpired() && (
              <>
                <Button
                  onClick={handleRequestChanges}
                  variant="outline"
                  className="flex-1"
                >
                  Request Changes
                </Button>
                <Button
                  onClick={handleAcceptProposal}
                  className="flex-1"
                >
                  Accept Proposal
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Proposal;