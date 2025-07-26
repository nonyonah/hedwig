// src/components/BaseAccountWallet.tsx
'use client';

import { useState } from 'react';
import { useWallet } from '@/providers/WalletProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wallet, Send, Copy, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export function BaseAccountWallet() {
  const { 
    address, 
    isConnected, 
    isLoading, 
    network, 
    error, 
    connectBaseAccount, 
    disconnectWallet, 
    signMessage, 
    pay 
  } = useWallet();

  const [paymentAmount, setPaymentAmount] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [messageToSign, setMessageToSign] = useState('');
  const [signedMessage, setSignedMessage] = useState('');
  const [paymentResult, setPaymentResult] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleConnect = async () => {
    try {
      await connectBaseAccount();
    } catch (error) {
      console.error('Connection failed:', error);
    }
  };

  const handleSignMessage = async () => {
    if (!messageToSign.trim()) return;
    
    setIsProcessing(true);
    try {
      const signature = await signMessage(messageToSign);
      setSignedMessage(signature);
    } catch (error) {
      console.error('Signing failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePayment = async () => {
    if (!paymentAmount || !recipientAddress) return;
    
    setIsProcessing(true);
    try {
      const result = await pay({
        amount: paymentAmount,
        to: recipientAddress,
        testnet: process.env.NODE_ENV === 'development',
      });
      setPaymentResult(result);
    } catch (error) {
      console.error('Payment failed:', error);
      setPaymentResult({ error: error instanceof Error ? error.message : 'Payment failed' });
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Base Account Wallet</h1>
        <p className="text-gray-600">
          Universal sign-on and one-tap payments powered by Base Account <mcreference link="https://docs.base.org/base-account/overview/what-is-base-account" index="0">0</mcreference>
        </p>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Wallet Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isConnected ? (
            <div className="space-y-4">
              <p className="text-gray-600">
                Connect your Base Account to get started with universal sign-on and USDC payments.
              </p>
              <Button 
                onClick={handleConnect} 
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  'Connect Base Account'
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="font-medium">Connected</span>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Address:</span>
                  <div className="flex items-center gap-2">
                    <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                      {address ? formatAddress(address) : 'N/A'}
                    </code>
                    {address && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(address)}
                      >
                        {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Network:</span>
                  <span className="text-sm font-medium">{network || 'Unknown'}</span>
                </div>
              </div>
              
              <Button 
                onClick={disconnectWallet} 
                variant="outline"
                className="w-full"
              >
                Disconnect
              </Button>
            </div>
          )}
          
          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Section */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              USDC Payment
            </CardTitle>
            <CardDescription>
              Send USDC payments with one-tap using Base Account <mcreference link="https://docs.base.org/base-account/overview/what-is-base-account" index="0">0</mcreference>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (USDC)</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="10.50"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="recipient">Recipient Address</Label>
                <Input
                  id="recipient"
                  placeholder="0x..."
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                />
              </div>
            </div>
            
            <Button 
              onClick={handlePayment}
              disabled={!paymentAmount || !recipientAddress || isProcessing}
              className="w-full"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing Payment...
                </>
              ) : (
                'Send USDC Payment'
              )}
            </Button>
            
            {paymentResult && (
              <div className="mt-4 p-3 bg-gray-50 rounded">
                <h4 className="font-medium mb-2">Payment Result:</h4>
                <pre className="text-sm overflow-auto">
                  {JSON.stringify(paymentResult, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Message Signing Section */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle>Message Signing</CardTitle>
            <CardDescription>
              Sign messages with your Base Account for authentication
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="message">Message to Sign</Label>
              <Input
                id="message"
                placeholder="Enter message to sign..."
                value={messageToSign}
                onChange={(e) => setMessageToSign(e.target.value)}
              />
            </div>
            
            <Button 
              onClick={handleSignMessage}
              disabled={!messageToSign.trim() || isProcessing}
              className="w-full"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing...
                </>
              ) : (
                'Sign Message'
              )}
            </Button>
            
            {signedMessage && (
              <div className="space-y-2">
                <Label>Signature:</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm bg-gray-100 p-2 rounded break-all">
                    {signedMessage}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(signedMessage)}
                  >
                    {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Features Info */}
      <Card>
        <CardHeader>
          <CardTitle>Base Account Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium">Universal Sign-On</h4>
              <p className="text-sm text-gray-600">
                One passkey works across every Base-enabled app <mcreference link="https://docs.base.org/base-account/overview/what-is-base-account" index="0">0</mcreference>
              </p>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium">One-Tap Payments</h4>
              <p className="text-sm text-gray-600">
                Low-friction USDC payments built into the account layer <mcreference link="https://docs.base.org/base-account/overview/what-is-base-account" index="0">0</mcreference>
              </p>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium">Multi-Chain Support</h4>
              <p className="text-sm text-gray-600">
                One address that works across nine EVM networks <mcreference link="https://docs.base.org/base-account/overview/what-is-base-account" index="0">0</mcreference>
              </p>
            </div>
            
            <div className="space-y-2">
              <h4 className="font-medium">Self-Custodial</h4>
              <p className="text-sm text-gray-600">
                Users hold the keys; you never touch private data or funds <mcreference link="https://docs.base.org/base-account/overview/what-is-base-account" index="0">0</mcreference>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}