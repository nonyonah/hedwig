'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';

interface Invoice {
  id: string;
  freelancer_name: string;
  freelancer_email: string;
  client_name: string;
  client_email: string;
  date_created: string;
  project_description: string;
  deliverables: string;
  price: number;
  amount: number;
  is_split_payment: boolean;
  split_details?: Record<string, unknown>;
  milestones?: Record<string, unknown>;
  wallet_address: string;
  blockchain: string;
  status: string;
}

export default function InvoicePage() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const id = searchParams?.get('id') || pathname.split('/').pop() || '';
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/invoice?id=${id}`)
      .then(res => res.json())
      .then((data: { invoices?: Invoice[] }) => {
        setInvoice(data.invoices?.[0] || null);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }
  if (!invoice) {
    return <div className="flex items-center justify-center min-h-screen">Invoice not found.</div>;
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(invoice.wallet_address);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 1200);
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-[#f7f8fa]">
      <div className="bg-white rounded-2xl shadow-xl w-[420px] p-8 flex flex-col gap-6 border border-gray-100">
        {/* Invoice Header */}
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-gray-400 font-semibold tracking-widest">INVOICE NO</span>
          <span className="text-xs text-gray-400">{invoice.id.slice(0, 6).toUpperCase()}</span>
        </div>
        <div className="flex gap-6 mb-4">
          {/* FROM (Freelancer) */}
          <div className="flex-1">
            <div className="text-xs text-gray-400 mb-1">FROM</div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#e7f5d8] flex items-center justify-center font-bold text-lg text-gray-700">
                {invoice.freelancer_name[0]}
              </div>
              <div>
                <div className="font-semibold text-gray-800">{invoice.freelancer_name}</div>
                <div className="text-xs text-gray-500">{invoice.freelancer_email}</div>
              </div>
            </div>
          </div>
          {/* TO (Client) */}
          <div className="flex-1">
            <div className="text-xs text-gray-400 mb-1">TO</div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#e3e3f7] flex items-center justify-center font-bold text-lg text-gray-700">
                {invoice.client_name[0]}
              </div>
              <div>
                <div className="font-semibold text-gray-800">{invoice.client_name}</div>
                <div className="text-xs text-gray-500">{invoice.client_email}</div>
              </div>
            </div>
          </div>
        </div>
        {/* Project & Deliverables */}
        <div className="mb-2">
          <div className="text-xs text-gray-400 mb-1">PROJECT</div>
          <div className="font-semibold text-gray-800">{invoice.project_description}</div>
          <div className="text-xs text-gray-500 mt-1">{invoice.deliverables}</div>
        </div>
        {/* Amount and Due Date */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-xs text-gray-400 mb-1">AMOUNT</div>
            <div className="text-2xl font-bold text-gray-900">${invoice.amount.toLocaleString()}</div>
            <div className="text-xs text-gray-500">Due {new Date(invoice.date_created).toLocaleDateString()}</div>
          </div>
        </div>
        {/* Payment Method & Wallet */}
        <div className="mb-2">
          <div className="text-xs text-gray-400 mb-1">Payment method</div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">USDC</span>
            <span className="text-xs text-gray-500">{invoice.blockchain.charAt(0).toUpperCase() + invoice.blockchain.slice(1)}</span>
          </div>
        </div>
        <div className="mb-2">
          <div className="text-xs text-gray-400 mb-1">Network</div>
          <span className="text-xs text-gray-700 font-medium">{invoice.blockchain.charAt(0).toUpperCase() + invoice.blockchain.slice(1)}</span>
        </div>
        <div className="mb-2">
          <div className="text-xs text-gray-400 mb-1">Wallet</div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-700 font-mono">{invoice.wallet_address.slice(0, 6)}...{invoice.wallet_address.slice(-4)}</span>
            <Button size="icon" variant="ghost" onClick={handleCopy}><Copy size={14} /></Button>
            {copySuccess && <span className="text-xs text-green-600 ml-2">Copied!</span>}
          </div>
        </div>
        {/* Connect Wallet Button */}
        <Button className="w-full h-12 mt-3 text-lg font-semibold bg-gray-900 text-white rounded-xl hover:bg-gray-700 transition">Connect wallet</Button>
      </div>
    </div>
  );
}
