import { useState } from 'react';
import { useRouter } from 'next/router';

export default function CreatePaymentPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    amount: '',
    token: 'USDC',
    network: 'base',
    walletAddress: '',
    userName: '',
    paymentReason: '',
    recipientEmail: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; paymentLink?: string; error?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/create-payment-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: parseFloat(formData.amount),
          token: formData.token,
          network: formData.network,
          walletAddress: formData.walletAddress,
          userName: formData.userName,
          for: formData.paymentReason,
          recipientEmail: formData.recipientEmail || undefined
        }),
      });

      const data = await response.json();
      setResult(data);

      if (data.success && data.paymentLink) {
        // Optionally redirect to the payment link
        // router.push(data.paymentLink);
      }
    } catch (error) {
      setResult({ success: false, error: 'Failed to create payment link' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Create Payment Link</h1>
          <p className="text-sm text-gray-600">Generate a secure crypto payment request</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
                Amount
              </label>
              <input
                type="number"
                id="amount"
                name="amount"
                step="0.000001"
                required
                value={formData.amount}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="0.00"
              />
            </div>

            <div>
              <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-1">
                Token
              </label>
              <select
                id="token"
                name="token"
                required
                value={formData.token}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="USDC">USDC</option>
                <option value="ETH">ETH</option>
                <option value="USDT">USDT</option>
                <option value="DAI">DAI</option>
                <option value="WETH">WETH</option>
              </select>
            </div>

            <div>
              <label htmlFor="network" className="block text-sm font-medium text-gray-700 mb-1">
                Network
              </label>
              <select
                id="network"
                name="network"
                required
                value={formData.network}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="base">Base</option>
                <option value="ethereum">Ethereum</option>
                <option value="polygon">Polygon</option>
                <option value="arbitrum">Arbitrum</option>
                <option value="optimism">Optimism</option>
              </select>
            </div>

            <div>
              <label htmlFor="walletAddress" className="block text-sm font-medium text-gray-700 mb-1">
                Recipient Wallet Address
              </label>
              <input
                type="text"
                id="walletAddress"
                name="walletAddress"
                required
                value={formData.walletAddress}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="0x..."
              />
            </div>

            <div>
              <label htmlFor="userName" className="block text-sm font-medium text-gray-700 mb-1">
                Your Name
              </label>
              <input
                type="text"
                id="userName"
                name="userName"
                required
                value={formData.userName}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label htmlFor="paymentReason" className="block text-sm font-medium text-gray-700 mb-1">
                Payment For
              </label>
              <input
                type="text"
                id="paymentReason"
                name="paymentReason"
                required
                value={formData.paymentReason}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Service, product, etc."
              />
            </div>

            <div>
              <label htmlFor="recipientEmail" className="block text-sm font-medium text-gray-700 mb-1">
                Recipient Email (Optional)
              </label>
              <input
                type="email"
                id="recipientEmail"
                name="recipientEmail"
                value={formData.recipientEmail}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="recipient@example.com"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Creating...
                </>
              ) : (
                'Create Payment Link'
              )}
            </button>
          </form>

          {result && (
            <div className="mt-6">
              {result.success ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-green-800 mb-2">Payment Link Created!</h3>
                  <p className="text-xs text-green-700 mb-3">Your payment link has been generated successfully.</p>
                  <div className="bg-white border border-green-200 rounded p-3">
                    <p className="text-xs text-gray-600 mb-1">Payment Link:</p>
                    <p className="text-sm font-mono text-green-800 break-all">{result.paymentLink}</p>
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(result.paymentLink!)}
                    className="mt-3 text-xs text-green-600 hover:text-green-800 underline"
                  >
                    Copy Link
                  </button>
                </div>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-red-800 mb-1">Error</h3>
                  <p className="text-xs text-red-700">{result.error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 text-center">
          <p className="text-xs text-gray-500">
            Powered by Hedwig • Secure crypto payments
          </p>
        </div>
      </div>
    </div>
  );
}