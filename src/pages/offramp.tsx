import { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowDown, DollarSign, TrendingUp } from "lucide-react";

interface Bank {
  name: string;
  code: string;
}

export default function OfframpForm() {
  const router = useRouter();
  const { userId, chatId } = router.query as { userId?: string; chatId?: string };

  const [amount, setAmount] = useState<string>("");
  const [currency, setCurrency] = useState<string>("");
  const [bank, setBank] = useState<string>("");
  const [banks, setBanks] = useState<Bank[]>([]);
  const [verifiedAccountName, setVerifiedAccountName] = useState<string>("");
  const [bankCode, setBankCode] = useState<string>("");
  const [accountNumber, setAccountNumber] = useState<string>("");
  const [exchangeRates, setExchangeRates] = useState<{ NGN: number; KSH: number }>({ NGN: 1650, KSH: 150 });
  const [senderAddress, setSenderAddress] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

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
        // ignore; keep previous
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

  // Fetch user wallet address to display sender
  useEffect(() => {
    const fetchWallet = async () => {
      if (!userId) return;
      try {
        const res = await fetch(`/api/user-wallet?userId=${encodeURIComponent(userId)}`);
        const data = await res.json();
        if (data?.address) setSenderAddress(data.address);
      } catch (e) {
        // ignore
      }
    };
    fetchWallet();
  }, [userId]);

  // Automatic account verification
  useEffect(() => {
    if (accountNumber.length >= 10 && bankCode && currency) {
      const verifyAccount = async () => {
        setError("");
        setSuccess("");
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
          setSuccess("✅ Account verified");
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
  const fiatAmount = amount && rate ? (parseFloat(amount) * rate).toLocaleString() : "";

  const handleSubmit = async () => {
    setError("");
    setSuccess("");
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
      setSuccess("Payout initiated successfully!");
    } catch (e: any) {
      setError(e.message || "Payout creation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle p-4">
      <Head>
        <title>Hedwig - Offramp</title>
      </Head>
      <div className="mx-auto max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Cash Out</h1>
          <p className="text-muted-foreground">Convert your crypto to local currency</p>
        </div>

        {/* Amount Section */}
        <Card className="shadow-medium">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <DollarSign className="h-5 w-5 text-primary" />
              Amount to Convert
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">USD Amount</Label>
              <Input
                id="amount"
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="text-xl font-semibold"
              />
            </div>

            <div className="flex items-center justify-center py-1">
              <ArrowDown className="h-5 w-5 text-muted-foreground" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select value={currency} onValueChange={(value) => {
                setCurrency(value);
                setBank(""); // Reset bank when currency changes
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NGN">🇳🇬 Nigerian Naira (NGN)</SelectItem>
                  <SelectItem value="KSH">🇰🇪 Kenyan Shilling (KSH)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {fiatAmount && (
              <div className="rounded-lg bg-gradient-primary p-3 text-center">
                <div className="text-xs text-primary-foreground/80">You'll receive</div>
                <div className="text-lg font-bold text-primary-foreground">
                  {currency} {fiatAmount}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sender Details */}
        <Card className="shadow-medium">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Sender Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Sender Address</Label>
              <div className="rounded-lg bg-secondary/20 p-3 border border-secondary/30">
                <div className="font-mono text-sm text-foreground break-all">{senderAddress || 'Loading wallet...'}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Exchange Rate */}
        {rate && (
          <Card className="shadow-soft">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-secondary" />
                  <span className="text-sm font-medium">Exchange Rate</span>
                </div>
                <span className="font-semibold">
                  1 USD = {rate.toLocaleString()} {currency}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Account Details */}
        <Card className="shadow-medium">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Account Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="accountNumber">Account Number</Label>
              <Input
                id="accountNumber"
                placeholder="Enter account number"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bank">Bank</Label>
              <Select value={bankCode} onValueChange={(value) => {
                  const selectedBank = banks.find(b => b.code === value);
                  setBank(selectedBank?.name || '');
                  setBankCode(value);
                }} disabled={!currency || banks.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={currency ? "Select bank" : "Select currency first"} />
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

            {/* Show verified account name after entering bank and account number */}
            {verifying && <div className="text-sm text-muted-foreground">Verifying...</div>}
            {verifiedAccountName && (
              <div className="rounded-lg bg-green-100 dark:bg-green-900/30 p-3 border border-green-400/50">
                <div className="text-xs text-green-800 dark:text-green-300">Verified Account Name</div>
                <div className="font-semibold text-green-900 dark:text-green-200">{verifiedAccountName}</div>
              </div>
            )}
          </CardContent>
        </Card>

        {error && <div className="text-red-500 text-sm p-2 bg-red-100 dark:bg-red-900/30 rounded-md">{error}</div>}
        {success && !error && <div className="text-green-600 text-sm p-2 bg-green-100 dark:bg-green-900/30 rounded-md">{success}</div>}

        {/* Submit Button */}
        <Button
          className="w-full bg-gradient-primary hover:opacity-90 py-3 shadow-medium"
          disabled={!amount || !currency || !bankCode || !verifiedAccountName || !accountNumber || loading}
          onClick={handleSubmit}
        >
          {loading ? "Processing..." : "Complete Cash Out"}
        </Button>

      </div>
    </div>
  );
}
