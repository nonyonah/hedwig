import React, { useState, useEffect } from 'react';
import { CheckCircleIcon, ClockIcon, ExclamationCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { formatDistanceToNow } from 'date-fns';

// Types based on Paycrest documentation and existing offramp service
export interface PaymentOrder {
  id: string;
  orderId?: string;
  gatewayId?: string;
  amount: number;
  token: string;
  fiatAmount: number;
  fiatCurrency: string;
  rate: number;
  status: 'initiated' | 'pending' | 'processing' | 'validated' | 'settled' | 'cancelled' | 'expired' | 'failed';
  recipient: {
    institution: string;
    accountIdentifier: string;
    accountName: string;
    memo?: string;
  };
  sender: {
    address: string;
    userId: string;
  };
  receiveAddress?: string;
  returnAddress?: string;
  txHash?: string;
  createdAt: Date;
  updatedAt: Date;
  estimatedCompletion?: Date;
  transactions?: {
    id: string;
    status: string;
    txHash?: string;
    createdAt: Date;
  }[];
}

interface PaymentOrderTemplateProps {
  order: PaymentOrder;
  onRefresh?: () => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

const PaymentOrderTemplate: React.FC<PaymentOrderTemplateProps> = ({
  order,
  onRefresh,
  onCancel,
  isLoading = false
}) => {
  const [timeAgo, setTimeAgo] = useState('');

  useEffect(() => {
    const updateTimeAgo = () => {
      setTimeAgo(formatDistanceToNow(order.createdAt, { addSuffix: true }));
    };

    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [order.createdAt]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'settled':
        return <CheckCircleIcon className="h-6 w-6 text-green-500" />;
      case 'failed':
      case 'cancelled':
      case 'expired':
        return <ExclamationCircleIcon className="h-6 w-6 text-red-500" />;
      case 'processing':
      case 'validated':
        return <ArrowPathIcon className="h-6 w-6 text-blue-500 animate-spin" />;
      default:
        return <ClockIcon className="h-6 w-6 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'settled':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'failed':
      case 'cancelled':
      case 'expired':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'processing':
      case 'validated':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  const getStatusMessage = (status: string) => {
    switch (status) {
      case 'initiated':
        return 'Order has been created and is awaiting processing';
      case 'pending':
        return 'Order is pending provider assignment';
      case 'processing':
        return 'Order is being processed by the provider';
      case 'validated':
        return 'Order has been validated and is ready for settlement';
      case 'settled':
        return 'Order has been completed successfully';
      case 'cancelled':
        return 'Order was cancelled by the provider';
      case 'expired':
        return 'Order expired due to timeout';
      case 'failed':
        return 'Order processing failed';
      default:
        return 'Order status unknown';
    }
  };

  const canCancel = ['initiated', 'pending'].includes(order.status);
  const isCompleted = ['settled', 'failed', 'cancelled', 'expired'].includes(order.status);

  return (
    <div className="max-w-2xl mx-auto bg-white shadow-lg rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Payment Order</h2>
            <p className="text-blue-100 text-sm">Order ID: {order.orderId || order.id}</p>
          </div>
          <div className="flex items-center space-x-2">
            {getStatusIcon(order.status)}
            <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(order.status)}`}>
              {order.status.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Order Details */}
      <div className="p-6">
        {/* Status Message */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <p className="text-gray-700 text-sm">
            <span className="font-medium">Status:</span> {getStatusMessage(order.status)}
          </p>
          {order.estimatedCompletion && !isCompleted && (
            <p className="text-gray-600 text-xs mt-1">
              Estimated completion: {formatDistanceToNow(order.estimatedCompletion, { addSuffix: true })}
            </p>
          )}
        </div>

        {/* Transaction Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Transaction Details</h3>
            
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Amount:</span>
                <span className="font-medium">{order.amount} {order.token}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600">Fiat Amount:</span>
                <span className="font-medium">{order.fiatAmount.toLocaleString()} {order.fiatCurrency}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600">Exchange Rate:</span>
                <span className="font-medium">1 {order.token} = {order.rate.toLocaleString()} {order.fiatCurrency}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600">Created:</span>
                <span className="font-medium">{timeAgo}</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Recipient Details</h3>
            
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Account Name:</span>
                <span className="font-medium">{order.recipient.accountName}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600">Account Number:</span>
                <span className="font-medium">{order.recipient.accountIdentifier}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-600">Bank:</span>
                <span className="font-medium">{order.recipient.institution}</span>
              </div>
              
              {order.recipient.memo && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Memo:</span>
                  <span className="font-medium">{order.recipient.memo}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Blockchain Details */}
        {(order.receiveAddress || order.txHash || order.gatewayId) && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="text-md font-semibold text-gray-900 mb-3">Blockchain Details</h4>
            <div className="space-y-2 text-sm">
              {order.gatewayId && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Gateway ID:</span>
                  <span className="font-mono text-xs">{order.gatewayId}</span>
                </div>
              )}
              
              {order.receiveAddress && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Receive Address:</span>
                  <span className="font-mono text-xs">{order.receiveAddress}</span>
                </div>
              )}
              
              {order.txHash && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Transaction Hash:</span>
                  <a 
                    href={`https://basescan.org/tx/${order.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    {order.txHash}
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Transaction History */}
        {order.transactions && order.transactions.length > 0 && (
          <div className="mb-6">
            <h4 className="text-md font-semibold text-gray-900 mb-3">Transaction History</h4>
            <div className="space-y-2">
              {order.transactions.map((tx, index) => (
                <div key={tx.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <div>
                    <span className="text-sm font-medium">{tx.status}</span>
                    <p className="text-xs text-gray-600">
                      {formatDistanceToNow(tx.createdAt, { addSuffix: true })}
                    </p>
                  </div>
                  {tx.txHash && (
                    <a 
                      href={`https://basescan.org/tx/${tx.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      View Transaction
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex space-x-4">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <ArrowPathIcon className="h-4 w-4 animate-spin mr-2" />
                  Refreshing...
                </div>
              ) : (
                'Refresh Status'
              )}
            </button>
          )}
          
          {onCancel && canCancel && (
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel Order
            </button>
          )}
        </div>

        {/* Help Text */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h5 className="text-sm font-semibold text-blue-900 mb-2">What happens next?</h5>
          <div className="text-sm text-blue-800 space-y-1">
            {order.status === 'initiated' && (
              <p>• Your order will be assigned to a provider within 30 seconds</p>
            )}
            {order.status === 'pending' && (
              <p>• A provider will be assigned to process your order</p>
            )}
            {order.status === 'processing' && (
              <>
                <p>• The provider is processing your payment</p>
                <p>• Most orders complete within 1-2 minutes</p>
              </>
            )}
            {order.status === 'validated' && (
              <p>• Your order is being settled on the blockchain</p>
            )}
            {order.status === 'settled' && (
              <p>• Your payment has been completed successfully!</p>
            )}
            {['failed', 'cancelled', 'expired'].includes(order.status) && (
              <p>• If you have questions, please contact support</p>
            )}
            <p>• Orders are automatically refunded if not completed within 5 minutes</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentOrderTemplate;