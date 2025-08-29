import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Copy, Download, Send, Calendar, DollarSign, Clock, CheckCircle, Mail, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { createClient } from '@supabase/supabase-js';
import { useHedwigPayment } from '@/hooks/useHedwigPayment';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { ConnectWallet } from '@coinbase/onchainkit/wallet';
import { useAccount } from 'wagmi';
import { BASE_MAINNET_CONFIG, SUPPORTED_TOKENS } from '@/contracts/config';

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
  id: string;
  proposalNumber: string;
  date: string;
  validUntil: string;
  status: "draft" | "sent" | "pending" | "accepted" | "rejected" | "paid";
  freelancer: {
    name: string;
    title: string;
    email: string;
    phone: string;
    website?: string;
    walletAddress?: string;
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

// Initialize Supabase client with environment variable checks
const getSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase environment variables not found');
    return null;
  }
  
  return createClient(supabaseUrl, supabaseAnonKey);
};

const Proposal = () => {
  const [deleting, setDeleting] = useState(false);
  // ... rest of hooks
  const router = useRouter();
  const { id } = router.query;
  // Using toast from sonner
  const [proposalData, setProposalData] = useState<ProposalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const { address, isConnected } = useAccount();
  const { 
    processPayment, 
    isProcessing, 
    isConfirming, 
    hash,
    receipt,
    error: paymentError
  } = useHedwigPayment();

  // Set up real-time subscription for proposal status updates
  useRealtimeSubscription({
    table: 'proposals',
    id: Array.isArray(id) ? id[0] : id,
    onUpdate: (payload) => {
      if (payload.new && payload.new.id === (Array.isArray(id) ? id[0] : id)) {
        const updatedData = payload.new;
        const normalizedStatus = updatedData.status === 'completed' ? 'paid' : updatedData.status;
        setProposalData(prev => prev ? {
          ...prev,
          status: normalizedStatus,
          updated_at: updatedData.updated_at
        } : null);
        
        if (normalizedStatus === 'paid') {
          toast.success('Payment received! Proposal status updated automatically.');
        }
      }
    }
  });

  useEffect(() => {
    if (id) {
      fetchProposalData();
    }
  }, [id]);

  // Keep minimal manual update for immediate UI feedback, but rely on realtime for persistence
  useEffect(() => {
    if (receipt && receipt.status === 'success' && proposalData?.status !== 'paid') {
      // Optimistically update local UI for immediate feedback
      setProposalData(prev => (prev ? { ...prev, status: 'paid' } : prev));
      toast.info('Payment confirmed! Updating status...');
      
      // The backend event listener will handle the database update
      // and the realtime subscription will sync the UI automatically
    }
  }, [receipt, proposalData?.status]);

  // Effect to show toast messages for payment status
  useEffect(() => {
    if (paymentError) {
      toast.error(paymentError.message || 'Payment failed');
    } else if (isProcessing) {
      toast.info('Processing payment...');
    }
  }, [isProcessing, paymentError]);

  const fetchProposalData = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.error('Supabase client not available');
      setLoading(false);
      return;
    }
    
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
          id: data.id,
          proposalNumber: data.proposal_number || `PROP-${data.id}`,
          date: new Date(data.created_at).toLocaleDateString(),
          validUntil: data.updated_at ? new Date(new Date(data.updated_at).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString() : '',
          status: data.status || 'draft',
          freelancer: {
            name: data.freelancer_name || 'Freelancer Name',
            title: 'Professional Developer',
            email: data.freelancer_email || 'freelancer@hedwigbot.xyz',
            phone: '+1 (555) 123-4567',
            website: 'https://hedwigbot.xyz',
            walletAddress: data.payment_methods?.usdc_base
          },
          client: {
            name: data.client_name || 'Client Name',
            company: 'Client Company',
            email: data.client_email || 'client@example.com'
          },
          project: {
            title: data.project_title || 'Project Title',
            description: data.description || 'Project description',
            totalCost: Number(data.budget) || 0,
            currency: data.currency || 'USD',
            timeline: data.timeline || '4 weeks'
          },
          sections: [
            {
              title: "Project Overview",
              content: data.description || "I'm excited to propose a comprehensive solution that will transform your business operations."
            },
            {
              title: "Deliverables",
              content: data.deliverables ? data.deliverables.join(', ') : "Custom deliverables based on project requirements"
            },
            {
              title: "Features",
              content: data.features ? data.features.join(', ') : "Advanced features tailored to your needs"
            }
          ],
          phases: [
            {
              name: "Discovery & Planning",
              duration: "1 week",
              deliverables: ["Requirements analysis", "Technical specification", "Project roadmap"]
            },
            {
              name: "Development",
              duration: data.timeline || "3 weeks",
              deliverables: data.deliverables || ["Core functionality", "Testing", "Documentation"]
            },
            {
              name: "Delivery & Support",
              duration: "1 week",
              deliverables: ["Final delivery", "Training", "Support documentation"]
            }
          ],
          terms: [
            "50% deposit required to begin work",
            "Remaining balance due upon project completion",
            "All deliverables included as specified",
            "30-day support period included"
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

  const handleDownloadPdf = async () => {
    if (!id) return;
    
    setDownloadingPdf(true);
    try {
      const response = await fetch(`/api/proposals/${id}/download-pdf`);
      
      if (!response.ok) {
        throw new Error('Failed to download PDF');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `proposal-${proposalData?.proposalNumber || id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success("PDF downloaded successfully");
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast.error("Failed to download PDF");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleSendEmail = async () => {
    if (!id || !proposalData?.client.email) return;
    
    setSendingEmail(true);
    try {
      const response = await fetch('/api/proposals/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          proposalId: id,
          recipientEmail: proposalData.client.email,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to send email');
      }
      
      toast.success("Proposal sent successfully via email");
      
      // Update proposal status to 'sent'
      if (proposalData) {
        setProposalData({
          ...proposalData,
          status: 'sent'
        });
      }
    } catch (error) {
      console.error('Error sending email:', error);
      toast.error("Failed to send proposal via email");
    } finally {
      setSendingEmail(false);
    }
  };

  const handlePayWithCrypto = () => {
    if (!proposalData || !proposalData.freelancer.walletAddress) {
      toast.error('Freelancer wallet address is not configured for this proposal.');
      return;
    }

    processPayment({
      amount: total, // Use the total amount including the fee
      freelancerAddress: proposalData.freelancer.walletAddress as `0x${string}`,
      invoiceId: proposalData.id, // Using proposal id as invoiceId for tracking
    });
  };

  const handleDeleteProposal = async () => {
    if (!window.confirm('Are you sure you want to delete this proposal? This action cannot be undone.')) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/proposals/${id}/delete`, { method: 'DELETE' });
      if (response.ok) {
        toast.success('Proposal deleted successfully');
        setTimeout(() => {
          window.location.href = '/proposals';
        }, 1200);
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to delete proposal');
      }
    } catch (error) {
      toast.error('Failed to delete proposal');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <span className="text-lg text-gray-600">Loading proposal...</span>
      </div>
    );
  }

  if (!proposalData) {
    return (
      <div className="flex items-center justify-center h-96">
        <span className="text-lg text-red-600">Proposal not found.</span>
      </div>
    );
  }

  const subtotal = proposalData.project.totalCost;
  const platformFee = subtotal * 0.01; // 1% platform fee deducted from payment
  const total = subtotal; // Total amount to be paid
  const freelancerReceives = subtotal - platformFee; // Amount freelancer receives after fee deduction

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
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
            >
              <Download className="w-4 h-4" />
              {downloadingPdf ? 'Downloading...' : 'Download PDF'}
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleSendEmail}
              disabled={sendingEmail || !proposalData?.client.email}
            >
              <Mail className="w-4 h-4" />
              {sendingEmail ? 'Sending...' : 'Send Email'}
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
              
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="text-xs text-gray-600">Project Amount</p>
                    <p className="font-semibold text-lg">${subtotal.toLocaleString()}</p>
                  </div>
                </div>
                <div className="text-sm space-y-1 pt-2 border-t border-gray-200">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Project Amount:</span>
                    <span className="font-medium">${subtotal.toLocaleString()} USDC</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Platform Fee (1% deducted):</span>
                    <span className="font-medium text-red-600">-${platformFee.toLocaleString()} USDC</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Freelancer Receives:</span>
                    <span className="font-medium">${freelancerReceives.toLocaleString()} USDC</span>
                  </div>
                  <div className="flex justify-between font-bold pt-1 border-t border-gray-200">
                    <span className="text-gray-800">Total to Pay:</span>
                    <span className="text-gray-800">${total.toLocaleString()} USDC</span>
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
            {/* Call to Action */}
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Ready to Get Started?</h3>
              <p className="text-gray-600 mb-4">
                To accept this proposal, please connect your wallet and complete the payment.
              </p>
              
              {proposalData.status === 'paid' ? (
                <div className="flex items-center gap-3 text-green-600">
                  <CheckCircle className="w-8 h-8" />
                  <div>
                    <p className="font-semibold text-lg">Proposal Paid</p>
                    <a 
                      href={`https://basescan.org/tx/${receipt?.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                    >
                      View Transaction <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-4 items-start">
                  <ConnectWallet />
                  {isConnected && (
                    <Button 
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={handlePayWithCrypto}
                      disabled={isProcessing || isConfirming}
                    >
                      {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {isProcessing ? 'Processing...' : `Pay ${total.toLocaleString()} USDC`}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Proposal;