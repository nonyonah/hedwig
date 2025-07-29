import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Copy, Download, Send, Calendar, DollarSign, Clock, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from '@/lib/supabase';

interface ProposalSection {
  title: string;
  content: string;
}

interface ProjectPhase {
  name: string;
  duration: string;
  deliverables: string[];
}

interface ProposalData {
  proposalNumber: string;
  date: string;
  validUntil: string;
  status: "draft" | "sent" | "pending" | "accepted" | "rejected";
  freelancer: {
    name: string;
    title: string;
    email: string;
    phone: string;
    website?: string;
  };
  client: {
    name: string;
    company: string;
    email: string;
  };
  project: {
    title: string;
    description: string;
    totalCost: number;
    currency: string;
    timeline: string;
  };
  sections: ProposalSection[];
  phases: ProjectPhase[];
  terms: string[];
}

const Proposal = () => {
  const router = useRouter();
  const { id } = router.query;
  // Using toast from sonner
  const [proposalData, setProposalData] = useState<ProposalData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchProposalData();
    }
  }, [id]);

  const fetchProposalData = async () => {
    try {
      const { data, error } = await supabase
        .from('proposals')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error fetching proposal:', error);
        return;
      }

      if (data) {
        // Transform the data to match our interface
        const transformedData: ProposalData = {
          proposalNumber: data.proposal_number || `PROP-${data.id}`,
          date: new Date(data.created_at).toLocaleDateString(),
          validUntil: data.valid_until ? new Date(data.valid_until).toLocaleDateString() : '',
          status: data.status || 'draft',
          freelancer: {
            name: data.freelancer_name || 'Freelancer Name',
            title: data.freelancer_title || 'Professional Title',
            email: data.freelancer_email || 'freelancer@example.com',
            phone: data.freelancer_phone || '+1 (555) 123-4567',
            website: data.freelancer_website
          },
          client: {
            name: data.client_name || 'Client Name',
            company: data.client_company || 'Client Company',
            email: data.client_email || 'client@example.com'
          },
          project: {
            title: data.project_title || 'Project Title',
            description: data.project_description || 'Project description',
            totalCost: data.total_cost || 0,
            currency: data.currency || 'USD',
            timeline: data.timeline || '4 weeks'
          },
          sections: data.sections || [
            {
              title: "Project Overview",
              content: "I'm excited to propose a comprehensive solution that will transform your business operations."
            }
          ],
          phases: data.phases || [
            {
              name: "Discovery & Planning",
              duration: "1 week",
              deliverables: ["Requirements analysis", "Technical specification"]
            }
          ],
          terms: data.terms || [
            "50% deposit required to begin work",
            "Remaining balance due upon project completion"
          ]
        };
        setProposalData(transformedData);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyProposal = () => {
    const proposalUrl = window.location.href;
    navigator.clipboard.writeText(proposalUrl);
    toast.success("Proposal URL copied to clipboard");
  };

  const handleAcceptProposal = () => {
    toast.success("Proposal accepted! The freelancer will be notified.");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading proposal...</p>
        </div>
      </div>
    );
  }

  if (!proposalData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Proposal Not Found</h1>
          <p className="text-gray-600">The proposal you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container max-w-4xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Project Proposal</h1>
            <p className="text-gray-600">Proposal #{proposalData.proposalNumber}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyProposal}>
              <Copy className="w-4 h-4" />
              Copy Link
            </Button>
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4" />
              Download PDF
            </Button>
            <Button variant="outline" size="sm">
              <Send className="w-4 h-4" />
              Send Proposal
            </Button>
          </div>
        </div>

        {/* Proposal Card */}
        <Card className="shadow-lg border-0 bg-white">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 border-b">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-1">{proposalData.project.title}</h2>
                <Badge variant="secondary" className="capitalize">
                  {proposalData.status}
                </Badge>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600 mb-1">Proposal Date</p>
                <p className="font-semibold">{proposalData.date}</p>
                <p className="text-sm text-gray-600 mt-2 mb-1">Valid Until</p>
                <p className="font-semibold">{proposalData.validUntil}</p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-8">
            {/* Contact Information */}
            <div className="grid md:grid-cols-2 gap-8 mb-8">
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Freelancer</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  <p className="font-medium text-gray-900">{proposalData.freelancer.name}</p>
                  <p className="text-blue-600">{proposalData.freelancer.title}</p>
                  <p>{proposalData.freelancer.email}</p>
                  <p>{proposalData.freelancer.phone}</p>
                  {proposalData.freelancer.website && (
                    <p className="text-blue-600">{proposalData.freelancer.website}</p>
                  )}
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Client</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  <p className="font-medium text-gray-900">{proposalData.client.name}</p>
                  <p>{proposalData.client.company}</p>
                  <p>{proposalData.client.email}</p>
                </div>
              </div>
            </div>

            {/* Project Summary */}
            <div className="bg-gray-50 rounded-lg p-6 mb-8">
              <h3 className="font-semibold text-gray-900 mb-4">Project Summary</h3>
              <p className="text-gray-600 mb-4">{proposalData.project.description}</p>
              
              <div className="grid md:grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="text-xs text-gray-600">Total Investment</p>
                    <p className="font-semibold text-lg">${proposalData.project.totalCost.toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="text-xs text-gray-600">Timeline</p>
                    <p className="font-semibold">{proposalData.project.timeline}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="text-xs text-gray-600">Start Date</p>
                    <p className="font-semibold">Upon Acceptance</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Proposal Sections */}
            <div className="space-y-6 mb-8">
              {proposalData.sections.map((section, index) => (
                <div key={index}>
                  <h3 className="font-semibold text-gray-900 mb-3">{section.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{section.content}</p>
                </div>
              ))}
            </div>

            {/* Project Phases */}
            <div className="mb-8">
              <h3 className="font-semibold text-gray-900 mb-4">Project Phases</h3>
              <div className="space-y-4">
                {proposalData.phases.map((phase, index) => (
                  <Card key={index} className="border border-gray-200">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <h4 className="font-medium text-gray-900">{phase.name}</h4>
                        <span className="text-sm text-gray-600">{phase.duration}</span>
                      </div>
                      <div className="space-y-1">
                        {phase.deliverables.map((deliverable, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-sm">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <span className="text-gray-600">{deliverable}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Terms & Conditions */}
            <div className="mb-8">
              <h3 className="font-semibold text-gray-900 mb-4">Terms & Conditions</h3>
              <div className="space-y-2">
                {proposalData.terms.map((term, index) => (
                  <div key={index} className="flex items-start gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-blue-600 mt-0.5" />
                    <span className="text-gray-600">{term}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Call to Action */}
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Ready to Get Started?</h3>
              <p className="text-gray-600 mb-4">
                I'm excited to work with you on this project. Click below to accept this proposal and we can begin immediately.
              </p>
              <div className="flex gap-3">
                <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleAcceptProposal}>
                  Accept Proposal
                </Button>
                <Button variant="outline">
                  Request Changes
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Proposal;