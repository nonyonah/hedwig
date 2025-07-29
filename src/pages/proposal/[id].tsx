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

  useEffect(() => {
    const fetchProposalData = async () => {
      if (!id) return;
      
      try {
        const { data: proposal, error } = await supabase
          .from('proposals')
          .select('*')
          .eq('id', id)
          .single();

        if (error) {
          console.error('Error fetching proposal:', error);
          setLoading(false);
          return;
        }

        if (proposal) {
          // Transform database data to match our interface
          const transformedData: ProposalData = {
            id: proposal.id,
            title: proposal.project_title || 'Project Proposal',
            client: {
              name: proposal.client_name,
              email: proposal.client_email,
              company: proposal.client_name // Using client_name as company for now
            },
            freelancer: {
              name: 'Hedwig User', // Could be enhanced with user data
              email: 'user@hedwig.app',
              company: 'Hedwig Studio'
            },
            projectSummary: proposal.description || 'No description provided',
            totalAmount: proposal.budget || 0,
            currency: proposal.currency || 'USD',
            estimatedDuration: proposal.timeline || 'To be determined',
            status: proposal.status || 'draft',
            createdAt: proposal.created_at,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
            sections: [
              {
                title: 'Project Overview',
                content: proposal.description || 'No description provided'
              },
              {
                title: 'Service Type',
                content: `This proposal is for ${proposal.service_type || 'general services'}.`
              },
              {
                title: 'Deliverables',
                content: proposal.deliverables || 'Deliverables to be defined during project planning.'
              }
            ],
            phases: [
              {
                phase: 'Project Execution',
                duration: proposal.timeline || 'To be determined',
                deliverables: proposal.deliverables ? proposal.deliverables.split(',').map((d: string) => d.trim()) : ['To be defined'],
                cost: proposal.budget || 0
              }
            ],
            terms: [
              'Payment terms to be agreed upon project acceptance',
              'All deliverables will be provided as specified in the proposal',
              'Project timeline may vary based on client feedback and requirements',
              'Additional features or scope changes will be quoted separately'
            ]
          };
          
          setProposalData(transformedData);
        }
      } catch (error) {
        console.error('Error fetching proposal:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProposalData();
  }, [id, supabase]);

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