import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';

interface Bank {
  name: string;
  code: string;
}

export default function OfframpNew() {
  const router = useRouter();
  const { userId, chatId, chain: chainQuery } = router.query as { userId?: string; chatId?: string; chain?: string };
  const chain = (chainQuery as string) || 'Base';

  // Form State
  const [amount, setAmount] = useState<string>('');
  const [currency, setCurrency] = useState<string>('NGN'); // Default to NGN
  const [exchangeRates, setExchangeRates] = useState<{ NGN: number; KSH: number }>({ NGN: 1650, KSH: 150 });
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Bank Details
  const [bank, setBank] = useState<string>('');
  const [banks, setBanks] = useState<Bank[]>([]);
  const [verifiedAccountName, setVerifiedAccountName] = useState<string>('');
  const [bankCode, setBankCode] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState<string>('');

  // Wallet display
  const [walletAddress, setWalletAddress] = useState<string>('');

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

  // Load user wallet via API endpoint using userId and chain
  useEffect(() => {
    const loadWallet = async () => {
      if (!userId && !chatId) {
        console.log('Wallet fetch skipped: missing userId and chatId');
        return;
      }
      try {
        const qs = new URLSearchParams();
        if (userId) qs.set('userId', String(userId));
        if (chatId) qs.set('chatId', String(chatId));
        if (chain) qs.set('chain', String(chain));
        console.log(`Fetching wallet with: /api/user-wallet?${qs.toString()}`);
        const res = await fetch(`/api/user-wallet?${qs.toString()}`);
        const data = await res.json();
        if (!res.ok) {
          console.error(`user-wallet API error (${res.status}):`, data);
          setWalletAddress('');
          return;
        }
        console.log('user-wallet API success, data:', data);
        setWalletAddress(data?.address || '');
      } catch (e) {
        console.error('user-wallet fetch failed with exception:', e);
      }
    };
    loadWallet();
  }, [userId, chatId, chain]);

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
  const currencySymbol = currency === 'NGN' ? '₦' : (currency === 'KSH' ? 'KSh' : '');
  const fiatAmount = amount && rate ? (parseFloat(amount) * rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';

  const validateForm = () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Enter a valid amount in USD.');
      return false;
    }
    if (!verifiedAccountName || !bankCode || accountNumber.length < 10) {
      setError('Please provide valid bank details.');
      return false;
    }
    setError('');
    return true;
  };

  const handleSubmit = async () => {
    setError("");
    if (!userId || !chatId) {
      setError("Missing user or chat information.");
      return;
    }
    if (!validateForm()) return;
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
      // Navigate away or show toast in future; for now, simple confirm
      alert('Your cash out is being processed. You will receive a notification shortly.');
    } catch (e: any) {
      setError(e.message || "Payout creation failed");
    } finally {
      setLoading(false);
    }
  };
  const shortAddress = walletAddress ? `${walletAddress.slice(0,4)}...${walletAddress.slice(-5)}` : '0x…';

  const amountInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="min-h-screen bg-white dark:bg-black flex items-start justify-center p-4">
      <Head>
        <title>Hedwig - Offramp</title>
      </Head>

      <div className="w-full max-w-[430px] mx-auto relative pt-6 pb-28">
        {/* Currency selector top-right */}
        <div className="absolute right-0 top-2">
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger className="h-8 w-24 rounded-full bg-[#EDEDED] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NGN">NGN</SelectItem>
              <SelectItem value="KSH">KSH</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Amount display (editable) */}
        <div className="mt-20 text-center" onClick={() => amountInputRef.current?.focus()}>
          <div className="text-5xl font-bold inline-flex items-baseline">
            <span>$</span>
            <input
              ref={amountInputRef}
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              type="text"
              placeholder="0.00"
              autoFocus
              className="max-w-[220px] text-5xl font-bold bg-transparent outline-none border-0 p-0 text-center"
            />
          </div>
          <div className="mt-2 text-gray-500 flex items-center justify-center gap-1">
            <span className="inline-block w-4 h-4 rounded-full border border-gray-400 text-[10px] flex items-center justify-center">₮</span>
            <span>{currencySymbol}{fiatAmount}</span>
          </div>
          {rate && (
            <div className="mt-3 inline-flex px-3 h-8 items-center rounded-full bg-[#EDEDED] text-sm">
              Rate: {currencySymbol}{rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          )}
        </div>

        {/* Wallet card */}
        <div className="mt-8 w-full max-w-[367px] h-[76px] rounded-[12px] bg-[#EDEDED] py-[14px] px-[33px] flex flex-col items-start gap-[10px] mx-auto">
          <div className="flex items-center gap-[111px] w-full">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                {/* Simple ETH/Base glyph */}
                <span className="text-gray-700">◆</span>
              </div>
              <div>
                <div className="font-semibold">{chain || 'Base'}</div>
                <div className="text-xs text-gray-600">{shortAddress}</div>
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="rounded-[12px] h-8 px-3 text-sm"
              onClick={() => { if (walletAddress) navigator.clipboard.writeText(walletAddress); }}
            >
              <Copy className="w-4 h-4 mr-1" /> Copy
            </Button>
          </div>
        </div>

        {/* Account Number */}
        <div className="mt-6">
          <Label className="block mb-2 font-semibold">Account Number</Label>
          <Input
            inputMode="numeric"
            placeholder="Minimum 10 digits"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
            className="bg-[#EDEDED] rounded-[12px] w-full max-w-[367px] h-[52px] px-[22px] flex items-center mx-auto"
          />
        </div>

        {/* Bank */}
        <div className="mt-4">
          <Label className="block mb-2 font-semibold">Bank</Label>
          <Select value={bankCode} onValueChange={(value) => {
            const selectedBank = banks.find(b => b.code === value);
            setBank(selectedBank?.name || '');
            setBankCode(value);
          }} disabled={!currency || banks.length === 0 || loading}>
            <SelectTrigger className="bg-[#EDEDED] rounded-[12px] w-full max-w-[367px] h-[52px] px-[22px] flex items-center justify-between mx-auto">
              <SelectValue placeholder={loading ? 'Loading banks…' : (bank || 'Select bank')} />
            </SelectTrigger>
            <SelectContent>
              {banks.map((b) => (
                <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Resolved Account Name */}
        {verifiedAccountName && (
          <div className="mt-4 text-black dark:text-white font-semibold">{verifiedAccountName}</div>
        )}

        {verifying && <div className="mt-2 text-sm text-gray-500">Verifying account…</div>}
        {error && <div className="mt-2 text-sm text-red-500">{error}</div>}

        {/* Bottom fixed Continue button */}
        <div className="fixed left-0 right-0 bottom-4 px-4">
          <Button
            onClick={handleSubmit}
            className="w-full max-w-[359px] h-[52px] text-white font-bold text-lg rounded-[12px] mx-auto flex justify-center items-center gap-[10px]"
            style={{ backgroundColor: '#0466c8' }}
            disabled={loading || verifying}
          >
            {loading ? 'Processing…' : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}
