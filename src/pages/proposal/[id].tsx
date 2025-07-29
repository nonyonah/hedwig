import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useWallet } from '@/providers/WalletProvider';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Proposal {
  id: string;
  proposal_number: string;
  client_name: string;
  client_email: string;
  service_type: string;
  project_title: string;
  description: string;
  deliverables: string;
  timeline: string;
  budget: number;
  currency: string;
  features: string;
  status: string;
  freelancer_name: string;
  freelancer_email: string;
  wallet_address: string;
  blockchain: string;
  created_at: string;
}

export default function ProposalPage() {
  const router = useRouter();
  const { id } = router.query;
  const { connectBaseAccount, pay, isConnected, address } = useWallet();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchProposal(id as string);
    }
  }, [id]);

  const fetchProposal = async (proposalId: string) => {
    try {
      const { data, error } = await supabase
        .from('proposals')
        .select('*')
        .eq('id', proposalId)
        .single();

      if (error) throw error;
      setProposal(data);
    } catch (err) {
      setError('Proposal not found');
      console.error('Error fetching proposal:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptProposal = async () => {
    if (!proposal || !isConnected) return;

    setAccepting(true);
    try {
      const result = await pay({
        to: proposal.wallet_address,
        amount: proposal.budget.toString()
      });

      if (result.status === 'success') {
        // Update proposal status
        await supabase
          .from('proposals')
          .update({ status: 'accepted' })
          .eq('id', proposal.id);

        alert('Proposal accepted and payment sent!');
        router.reload();
      } else {
        throw new Error('Payment failed');
      }
    } catch (err) {
      console.error('Payment error:', err);
      alert('Payment failed. Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading proposal...</div>
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-500 text-lg">{error || 'Proposal not found'}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8">
        <div className="border-b pb-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900">{proposal.project_title}</h1>
          <p className="text-gray-600 mt-2">Proposal #{proposal.proposal_number}</p>
          <p className="text-gray-600">From: {proposal.freelancer_name}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Client Information:</h3>
            <p className="text-gray-700">{proposal.client_name}</p>
            <p className="text-gray-600">{proposal.client_email}</p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Proposal Details:</h3>
            <p className="text-gray-700">Service Type: {proposal.service_type}</p>
            <p className="text-gray-700">Timeline: {proposal.timeline}</p>
            <p className="text-gray-700">Status: <span className={`px-2 py-1 rounded text-sm ${
              proposal.status === 'accepted' ? 'bg-green-100 text-green-800' : 
              proposal.status === 'rejected' ? 'bg-red-100 text-red-800' :
              'bg-yellow-100 text-yellow-800'
            }`}>{proposal.status}</span></p>
          </div>
        </div>

        <div className="space-y-6 mb-8">
          <div className="bg-gray-50 rounded-lg p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Project Description</h3>
            <p className="text-gray-700 whitespace-pre-wrap">{proposal.description}</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Deliverables</h3>
            <p className="text-gray-700 whitespace-pre-wrap">{proposal.deliverables}</p>
          </div>

          {proposal.features && (
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Key Features</h3>
              <p className="text-gray-700 whitespace-pre-wrap">{proposal.features}</p>
            </div>
          )}
        </div>

        <div className="border-t pt-6">
          <div className="flex justify-between items-center mb-6">
            <span className="text-xl font-semibold text-gray-900">Total Investment:</span>
            <span className="text-3xl font-bold text-green-600">
              {proposal.budget} {proposal.currency}
            </span>
          </div>

          {proposal.status === 'pending' && (
            <div className="space-y-4">
              {!isConnected ? (
                <button
                  onClick={connectBaseAccount}
                  className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                  Connect Wallet to Accept Proposal
                </button>
              ) : (
                <div className="flex space-x-4">
                  <button
                    onClick={handleAcceptProposal}
                    disabled={accepting}
                    className="flex-1 bg-green-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    {accepting ? 'Processing...' : `Accept & Pay ${proposal.budget} ${proposal.currency}`}
                  </button>
                  <button
                    onClick={() => {
                      // Handle rejection
                      supabase
                        .from('proposals')
                        .update({ status: 'rejected' })
                        .eq('id', proposal.id)
                        .then(() => router.reload());
                    }}
                    className="px-6 py-3 border border-red-600 text-red-600 rounded-lg font-semibold hover:bg-red-50 transition-colors"
                  >
                    Decline
                  </button>
                </div>
              )}
              
              <div className="text-center text-gray-600">
                <p>Payment will be sent to: {proposal.wallet_address}</p>
                <p>Network: {proposal.blockchain}</p>
              </div>
            </div>
          )}

          {proposal.status === 'accepted' && (
            <div className="text-center py-4">
              <div className="inline-flex items-center px-4 py-2 bg-green-100 text-green-800 rounded-lg">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Proposal Accepted
              </div>
            </div>
          )}

          {proposal.status === 'rejected' && (
            <div className="text-center py-4">
              <div className="inline-flex items-center px-4 py-2 bg-red-100 text-red-800 rounded-lg">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm4.707-10.293a1 1 0 00-1.414-1.414L10 11.586 6.707 8.293a1 1 0 00-1.414 1.414L8.586 13l-2.293 2.293a1 1 0 101.414 1.414L10 14.414l2.293 2.293a1 1 0 001.414-1.414L11.414 13l2.293-2.293z" clipRule="evenodd" />
                </svg>
                Proposal Declined
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 text-center text-gray-500 text-sm">
          <p>Created on {new Date(proposal.created_at).toLocaleDateString()}</p>
        </div>
      </div>
    </div>
  );
}