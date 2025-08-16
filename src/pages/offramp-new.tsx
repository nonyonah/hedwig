import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ArrowRight, ArrowLeft, CheckCircle } from 'lucide-react';

// Define the steps in the offramp flow
type OfframpStep = 'amount' | 'bankDetails' | 'confirm' | 'success' | 'error';

interface Bank {
  name: string;
  code: string;
}

export default function OfframpNew() {
  const router = useRouter();
  const { userId, chatId } = router.query as { userId?: string; chatId?: string };

  const [step, setStep] = useState<OfframpStep>('amount');
  const [amount, setAmount] = useState<string>('');
  const [currency, setCurrency] = useState<string>('NGN'); // Default to NGN
  const [exchangeRates, setExchangeRates] = useState<{ NGN: number; KSH: number }>({ NGN: 1650, KSH: 150 });
  const [error, setError] = useState<string>('');

  // Bank Details State
  const [bank, setBank] = useState<string>("");
  const [banks, setBanks] = useState<Bank[]>([]);
  const [verifiedAccountName, setVerifiedAccountName] = useState<string>("");
  const [bankCode, setBankCode] = useState<string>("");
  const [accountNumber, setAccountNumber] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  

  // Fetch dynamic exchange rates from API every 10s
  useEffect(() => {
    const loadRates = async () => {
      try {
        const res = await fetch(`/api/paycrest/rates`);
        const data = await res.json();
        if (data?.success && data.rates) {
          setExchangeRates({ NGN: data.rates.NGN, KSH: data.rates.KSH });
        }
      } catch (e) {
        // ignore; keep previous rates
      }
    };
    loadRates();
    const id = setInterval(loadRates, 10000);
    return () => clearInterval(id);
  }, []);

  // Fetch institutions when currency changes
  useEffect(() => {
    if (!currency) {
      setBanks([]);
      return;
    }
    const fetchInstitutions = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/paycrest/institutions/${currency}`);
        const data = await res.json();
        if (data.success) {
          setBanks(data.institutions);
        } else {
          setError(data.error || 'Failed to load banks.');
        }
      } catch (e: any) {
        setError(e.message || 'Failed to load banks.');
      } finally {
        setLoading(false);
      }
    };
    fetchInstitutions();
  }, [currency]);

  // Automatic account verification
  useEffect(() => {
    if (accountNumber.length >= 10 && bankCode && currency) {
      const verifyAccount = async () => {
        setError("");
        try {
          setVerifying(true);
          const res = await fetch("/api/paycrest/verify-account", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ currency, bankCode, accountNumber }),
          });
          const data = await res.json();
          if (!data.success) throw new Error(data.error || "Verification failed");
          setVerifiedAccountName(data.accountName);
        } catch (e: any) {
          setError(e.message || "Verification failed");
          setVerifiedAccountName("");
        } finally {
          setVerifying(false);
        }
      };
      verifyAccount();
    }
  }, [accountNumber, bankCode, currency]);

  const rate = currency ? exchangeRates[currency as keyof typeof exchangeRates] : null;
  const fiatAmount = amount && rate ? (parseFloat(amount) * rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';

  const handleAmountSubmit = () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount.');
      return;
    }
    setError('');
    setStep('bankDetails');
  };

  const handleBankDetailsSubmit = () => {
    if (!verifiedAccountName) {
        setError('Please verify your account details.');
        return;
    }
    setError('');
    setStep('confirm');
  };

  const handleSubmit = async () => {
    setError("");
    if (!userId || !chatId) {
      setError("Missing user or chat information.");
      return;
    }
    try {
      setLoading(true);
      // 1) Create Paycrest sender order to get a receive address
      const orderRes = await fetch("/api/paycrest/create-sender-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountUSD: Number(amount), currency }),
      });
      const orderData = await orderRes.json();
      if (!orderData.success) throw new Error(orderData.error || "Failed to create sender order");

      const receiveAddress: string = orderData.receiveAddress;
      const senderOrderId: string | undefined = orderData.orderId;

      // 2) Send USDC on Base from treasury to receiveAddress
      const sendRes = await fetch("/api/onchain/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "USDC", amount: String(amount), receiveAddress }),
      });
      const sendData = await sendRes.json();
      if (!sendRes.ok || !sendData?.success) throw new Error(sendData.error || "On-chain transfer failed");
      const txHash: string = sendData.txHash;

      // 3) Create payout and include txHash for linkage
      const res = await fetch("/api/paycrest/create-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          chatId,
          amountUSD: Number(amount),
          currency,
          accountName: verifiedAccountName,
          accountNumber,
          bankCode,
          bank: bank,
          txHash,
          senderOrderId,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Payout creation failed");
      setStep('success');
    } catch (e: any) {
      setError(e.message || "Payout creation failed");
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 'amount':
        return (
          <div className="w-full max-w-sm mx-auto flex flex-col items-center">
            <h1 className="text-2xl font-bold mb-2">Cash Out</h1>
            <p className="text-gray-500 mb-8">Enter the amount you want to convert.</p>

            <div className="w-full mb-4">
              <Label htmlFor="amount" className="mb-2 block text-left">You send</Label>
              <div className="relative">
                <Input
                  id="amount"
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-[52px] w-full pl-12 text-lg"
                  style={{ width: '367px' }}
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-semibold">USD</span>
              </div>
            </div>

            <div className="w-full mb-4">
              <Label htmlFor="currency" className="mb-2 block text-left">You get</Label>
              <div className="flex items-center gap-2">
                 <div className="relative w-full">
                    <Input
                        id="fiatAmount"
                        type="text"
                        readOnly
                        value={fiatAmount}
                        className="h-[52px] w-full bg-gray-100 dark:bg-gray-800 text-lg"
                        style={{ width: '367px' }}
                    />
                 </div>
                 <div className="relative">
                    <Select value={currency} onValueChange={setCurrency}>
                        <SelectTrigger className="h-[31px] w-[83px] bg-gray-200 dark:bg-gray-700">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="NGN">NGN</SelectItem>
                            <SelectItem value="KSH">KSH</SelectItem>
                        </SelectContent>
                    </Select>
                 </div>
              </div>
            </div>

            {rate && (
              <div className="h-[31px] w-[133px] bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-sm font-medium mb-8">
                1 USD = {rate.toLocaleString()} {currency}
              </div>
            )}

            {error && <p className="text-red-500 mb-4">{error}</p>}

            <Button
              onClick={handleAmountSubmit}
              className="w-[359px] h-[52px] text-white font-bold text-lg rounded-full flex items-center justify-center gap-2"
              style={{ backgroundColor: '#0466c8' }}
            >
              Continue <ArrowRight size={20} />
            </Button>
          </div>
        );
      case 'bankDetails':
        return (
            <div className="w-full max-w-sm mx-auto flex flex-col items-center">
                <h1 className="text-2xl font-bold mb-2">Bank Details</h1>
                <p className="text-gray-500 mb-8">Enter your bank account information.</p>

                <div className="w-full mb-4">
                    <Label htmlFor="bank" className="mb-2 block text-left">Bank</Label>
                     <Select value={bankCode} onValueChange={(value) => {
                        const selectedBank = banks.find(b => b.code === value);
                        setBank(selectedBank?.name || '');
                        setBankCode(value);
                        }} disabled={!currency || banks.length === 0 || loading}>
                        <SelectTrigger className="h-[52px] w-full" style={{ width: '367px' }}>
                            <SelectValue placeholder={loading ? "Loading banks..." : (currency ? "Select bank" : "Select currency first")} />
                        </SelectTrigger>
                        <SelectContent>
                        {banks.map((bank) => (
                            <SelectItem key={bank.code} value={bank.code}>
                            {bank.name}
                            </SelectItem>
                        ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="w-full mb-4">
                    <Label htmlFor="accountNumber" className="mb-2 block text-left">Account Number</Label>
                    <Input
                        id="accountNumber"
                        placeholder="Enter account number"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        className="h-[52px] w-full text-lg"
                        style={{ width: '367px' }}
                    />
                </div>

                {verifying && <p className="text-gray-500 mb-4">Verifying account...</p>}
                
                {verifiedAccountName && (
                    <div className="w-full p-4 rounded-lg bg-gray-100 dark:bg-gray-800 mb-8" style={{ width: '367px', height: '76px' }}>
                        <p className="text-sm text-gray-500">Account Name</p>
                        <p className="text-lg font-semibold">{verifiedAccountName}</p>
                    </div>
                )}

                {error && <p className="text-red-500 mb-4">{error}</p>}

                <div className="w-full flex gap-4">
                    <Button
                        onClick={() => setStep('amount')}
                        variant="outline"
                        className="w-full h-[52px] text-lg rounded-full flex items-center justify-center gap-2"
                    >
                        <ArrowLeft size={20} /> Back
                    </Button>
                    <Button
                        onClick={handleBankDetailsSubmit}
                        className="w-full h-[52px] text-white font-bold text-lg rounded-full flex items-center justify-center gap-2"
                        style={{ backgroundColor: '#0466c8' }}
                        disabled={!verifiedAccountName || verifying}
                    >
                        Continue <ArrowRight size={20} />
                    </Button>
                </div>
            </div>
        );
      case 'confirm':
        return (
            <div className="w-full max-w-sm mx-auto flex flex-col items-center">
                <h1 className="text-2xl font-bold mb-2">Confirm Details</h1>
                <p className="text-gray-500 mb-8">Please review the details before confirming.</p>

                <div className="w-full space-y-4 text-left p-4 border rounded-lg mb-8" style={{ width: '367px' }}>
                    <div>
                        <p className="text-sm text-gray-500">You Send</p>
                        <p className="text-lg font-semibold">{amount} USD</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">You Get</p>
                        <p className="text-lg font-semibold">{fiatAmount} {currency}</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Exchange Rate</p>
                        <p className="text-lg font-semibold">1 USD = {rate?.toLocaleString()} {currency}</p>
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Receiving Account</p>
                        <p className="text-lg font-semibold">{verifiedAccountName}</p>
                        <p className="text-sm text-gray-500">{bank} - {accountNumber}</p>
                    </div>
                </div>

                {error && <p className="text-red-500 mb-4">{error}</p>}

                <div className="w-full flex gap-4">
                    <Button
                        onClick={() => setStep('bankDetails')}
                        variant="outline"
                        className="w-full h-[52px] text-lg rounded-full flex items-center justify-center gap-2"
                        disabled={loading}
                    >
                        <ArrowLeft size={20} /> Back
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        className="w-full h-[52px] text-white font-bold text-lg rounded-full flex items-center justify-center gap-2"
                        style={{ backgroundColor: '#0466c8' }}
                        disabled={loading}
                    >
                        {loading ? "Processing..." : "Cash Out"}
                    </Button>
                </div>
            </div>
        );
    case 'success':
        return (
            <div className="w-full max-w-sm mx-auto flex flex-col items-center text-center">
                <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
                <h1 className="text-2xl font-bold mb-2">Success!</h1>
                <p className="text-gray-500 mb-8">Your cash out is being processed. You will receive a notification shortly.</p>
                <Button
                    onClick={() => router.push('/close') } // Or some other final destination
                    className="w-[359px] h-[52px] text-white font-bold text-lg rounded-full"
                    style={{ backgroundColor: '#0466c8' }}
                >
                    Done
                </Button>
            </div>
        );
    case 'error':
        return (
            <div className="w-full max-w-sm mx-auto flex flex-col items-center text-center">
                <h1 className="text-2xl font-bold mb-2 text-red-500">Error</h1>
                <p className="text-gray-500 mb-8">{error || 'An unexpected error occurred.'}</p>
                <div className="w-full flex gap-4">
                     <Button
                        onClick={() => { setError(''); setStep('confirm'); }}
                        variant="outline"
                        className="w-full h-[52px] text-lg rounded-full"
                    >
                        Try Again
                    </Button>
                    <Button
                        onClick={() => router.push('/close')}
                        className="w-full h-[52px] text-lg rounded-full"
                    >
                        Close
                    </Button>
                </div>
            </div>
        );
      default:
        return <div>Loading...</div>;
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center p-4">
      <Head>
        <title>Hedwig - Offramp</title>
      </Head>
      {renderStep()}
    </div>
  );
}
