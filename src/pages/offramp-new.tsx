import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, ArrowLeftRight } from 'lucide-react';

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
  const [showBankDropdown, setShowBankDropdown] = useState<boolean>(false);
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState<boolean>(false);
  const [bankSearch, setBankSearch] = useState<string>('');

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
    const amountUSD = Number(amount) || 0;
    // Navigate to confirmation page with the form data
    router.push({
      pathname: "/withdrawal-confirmation",
      query: {
        amountUSD: String(amountUSD),
        currency,
        bank,
        bankCode,
        accountNumber,
        accountName: verifiedAccountName,
        userId: String(userId),
        chatId: String(chatId),
      },
    });
  };
  const shortAddress = walletAddress ? `${walletAddress.slice(0,4)}...${walletAddress.slice(-5)}` : '0x…';

  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const bankDropdownRef = useRef<HTMLDivElement | null>(null);
  const currencyDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const bankEl = bankDropdownRef.current;
      const currEl = currencyDropdownRef.current;
      if (bankEl && !bankEl.contains(target)) {
        setShowBankDropdown(false);
      }
      if (currEl && !currEl.contains(target)) {
        setShowCurrencyDropdown(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-black flex items-start justify-center p-4">
      <Head>
        <title>Hedwig - Offramp</title>
      </Head>

      <div className="w-full max-w-[430px] mx-auto relative pt-6 pb-28">

        {/* Amount display (editable) */}
        <div className="mt-20 text-center" onClick={() => amountInputRef.current?.focus()}>
          <div className="inline-flex items-center justify-center gap-0">
            <span className="text-5xl font-bold">$</span>
            <Input
              ref={amountInputRef}
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              type="text"
              placeholder="0.00"
              autoFocus
              className="text-5xl font-bold bg-transparent outline-none border-0 p-0 text-center inline-block min-w-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              style={{ width: `${Math.max((amount || '').length, 4)}ch` }}
            />
          </div>
          <div className="mt-2 text-gray-500 flex items-center justify-center gap-2">
            <Badge className="rounded-full px-2 py-0.5 bg-[#EDEDED] text-[#121212] flex items-center justify-center">
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </Badge>
            <span>{currencySymbol}{fiatAmount}</span>
          </div>
          {rate && (
            <div className="mt-3 inline-flex px-3 h-8 items-center rounded-full bg-[#EDEDED] text-sm">
              Rate: {currencySymbol}{rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          )}
        </div>

        {/* Currency (custom dropdown) */}
        <div className="w-full max-w-[367px] mx-auto mt-8 relative" ref={currencyDropdownRef}>
          <Label className="block mb-2 font-semibold">Currency</Label>
          <div
            className="bg-[#EDEDED] rounded-[12px] h-[52px] px-[22px] flex items-center justify-between cursor-pointer"
            onClick={() => setShowCurrencyDropdown(!showCurrencyDropdown)}
          >
            <span className="text-[#121212] text-base">{currency || 'Select currency'}</span>
            <ChevronRight className="w-5 h-5 text-[#121212]" />
          </div>
          {showCurrencyDropdown && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-60 overflow-y-auto">
              {['NGN','KSH'].map((c) => (
                <div
                  key={c}
                  className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 text-[#121212]"
                  onClick={() => {
                    setCurrency(c);
                    setShowCurrencyDropdown(false);
                  }}
                >
                  {c}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Account Number */}
        <div className="w-full max-w-[367px] mx-auto mt-6">
          <Label className="block mb-2 font-semibold">Account Number</Label>
          <Input
            inputMode="numeric"
            placeholder="Minimum 10 digits"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
            className="bg-[#EDEDED] rounded-[12px] w-full h-[52px] px-[22px]"
          />
        </div>

        {/* Bank (custom dropdown) */}
        <div className="w-full max-w-[367px] mx-auto mt-4 relative" ref={bankDropdownRef}>
          <Label className="block mb-2 font-semibold">Bank</Label>
          <div
            className={`bg-[#EDEDED] rounded-[12px] h-[52px] px-[22px] flex items-center justify-between cursor-pointer ${(!currency || banks.length === 0 || loading) ? 'opacity-60 pointer-events-none' : ''}`}
            onClick={() => setShowBankDropdown(!showBankDropdown)}
          >
            <span className="text-[#121212] text-base">{bank || (loading ? 'Loading banks…' : 'Select bank')}</span>
            <ChevronRight className="w-5 h-5 text-[#121212]" />
          </div>
          {showBankDropdown && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-60 overflow-y-auto">
              <div className="p-2 border-b border-gray-100 bg-white sticky top-0">
                <Input
                  placeholder="Search bank"
                  value={bankSearch}
                  onChange={(e) => setBankSearch(e.target.value)}
                  className="h-9"
                />
              </div>
              {(bankSearch ? banks.filter(b => b.name.toLowerCase().includes(bankSearch.toLowerCase())) : banks).map((b) => (
                <div
                  key={b.code}
                  className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 text-[#121212]"
                  onClick={() => {
                    setBank(b.name);
                    setBankCode(b.code);
                    setShowBankDropdown(false);
                  }}
                >
                  {b.name}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Resolved Account Name */}
        {verifiedAccountName && (
          <div className="w-full max-w-[367px] mx-auto mt-2">
            <div className="px-[22px] text-black dark:text-white font-semibold">
              {verifiedAccountName}
            </div>
          </div>
        )}

        {verifying && <div className="mt-2 text-sm text-gray-500">Verifying account…</div>}
        {error && <div className="mt-2 text-sm text-red-500">{error}</div>}

        {/* Bottom fixed Continue button */}
        <div className="fixed left-0 right-0 bottom-8 px-4">
          <Button
            onClick={handleSubmit}
            className="w-full max-w-[359px] h-[52px] text-white font-bold text-lg rounded-[16px] mx-auto flex justify-center items-center gap-[10px]"
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
