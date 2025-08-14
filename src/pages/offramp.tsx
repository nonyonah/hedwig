import { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowDown, DollarSign, TrendingUp } from "lucide-react";

const BANKS: Record<string, string[]> = {
  NGN: [
    "Access Bank",
    "First Bank",
    "GTBank",
    "UBA",
    "Zenith Bank",
    "Fidelity Bank",
    "FCMB",
    "Sterling Bank",
  ],
  KSH: [
    "KCB Bank",
    "Equity Bank",
    "Cooperative Bank",
    "Standard Chartered",
    "Absa Bank",
    "NCBA Bank",
    "Diamond Trust Bank",
  ],
};

export default function OfframpForm() {
  const router = useRouter();
  const { userId, chatId, chain = "Base" } = router.query as { userId?: string; chatId?: string; chain?: string };

  const [amount, setAmount] = useState<string>("");
  const [currency, setCurrency] = useState<string>("");
  const [bank, setBank] = useState<string>("");
  const [accountName, setAccountName] = useState<string>("");
  const [accountNumber, setAccountNumber] = useState<string>("");
  const [exchangeRates, setExchangeRates] = useState<{ NGN: number; KSH: number }>({ NGN: 1650, KSH: 150 });
  const [senderAddress, setSenderAddress] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  // Fetch dynamic exchange rates from API every 10s
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/paycrest/rates`);
        const data = await res.json();
        if (mounted && data?.success && data.rates) {
          setExchangeRates({ NGN: data.rates.NGN, KSH: data.rates.KSH });
        }
      } catch (e) {
        // ignore; keep previous
      }
    };
    load();
    const id = setInterval(load, 10000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  // Fetch user wallet address to display sender
  useEffect(() => {
    const fetchWallet = async () => {
      if (!userId) return;
      try {
        const res = await fetch(`/api/user-wallet?userId=${encodeURIComponent(userId)}&chain=${encodeURIComponent(chain || "Base")}`);
        const data = await res.json();
        if (data?.address) setSenderAddress(data.address);
      } catch (e) {
        // ignore
      }
    };
    fetchWallet();
  }, [userId, chain]);

  const rate = currency ? exchangeRates[currency as keyof typeof exchangeRates] : null;
  const fiatAmount = amount && rate ? (parseFloat(amount) * rate).toLocaleString() : "";

  const handleVerifyAccount = async () => {
    setError("");
    setSuccess("");
    try {
      setLoading(true);
      const res = await fetch("/api/paycrest/verify-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency, bank, accountNumber }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Verification failed");
      setAccountName(data.accountName || accountName);
      setSuccess("✅ Account verified");
    } catch (e: any) {
      setError(e.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setError("");
    setSuccess("");
    try {
      if (!userId || !chatId) throw new Error("Missing context (user/chat)");
      setLoading(true);
      const res = await fetch("/api/paycrest/create-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          chatId,
          chain,
          amountUSD: amount,
          currency,
          bank,
          accountName,
          accountNumber,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to create payout");
      setSuccess("✅ Offramp order submitted. You will receive updates here and in Telegram.");
      // If running inside Telegram WebApp, optionally close
      try {
        // @ts-ignore
        if (window?.Telegram?.WebApp) {
          // @ts-ignore
          window.Telegram.WebApp.close();
        }
      } catch {}
    } catch (e: any) {
      setError(e.message || "Submission failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle p-4">
      <Head>
        <title>Offramp | Hedwig</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
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
            <CardTitle className="flex items-center justify-between gap-2 text-lg">
              <span className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                Amount to Convert
              </span>
              {senderAddress && (
                <span className="text-xs text-muted-foreground">
                  sender address: {senderAddress.slice(0, 6)}...{senderAddress.slice(-4)} · {chain}
                </span>
              )}
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
              <Select
                value={currency}
                onValueChange={(value) => {
                  setCurrency(value);
                  setBank(""); // Reset bank when currency changes
                }}
              >
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

        {/* Exchange Rate */}
        {rate && (
          <Card className="shadow-soft">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-secondary" />
                  <span className="text-sm font-medium">Exchange Rate</span>
                </div>
                <span className="font-semibold">1 USD = {rate.toLocaleString()} {currency}</span>
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
              <Label htmlFor="accountName">Account Name</Label>
              <Input
                id="accountName"
                placeholder="Enter full name as on bank account"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
              />
            </div>

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
              <Select value={bank} onValueChange={setBank} disabled={!currency}>
                <SelectTrigger>
                  <SelectValue placeholder={currency ? "Select bank" : "Select currency first"} />
                </SelectTrigger>
                <SelectContent>
                  {currency && BANKS[currency as keyof typeof BANKS]?.map((bankName) => (
                    <SelectItem key={bankName} value={bankName}>
                      {bankName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={handleVerifyAccount} disabled={!currency || !bank || !accountNumber || loading}>
                Verify Account
              </Button>
            </div>
          </CardContent>
        </Card>

        {error && <div className="text-red-500 text-sm">{error}</div>}
        {success && <div className="text-green-600 text-sm">{success}</div>}

        {/* Submit Button */}
        <Button
          className="w-full bg-gradient-primary hover:opacity-90 py-3 shadow-medium"
          disabled={!amount || !currency || !bank || !accountName || !accountNumber || loading}
          onClick={handleSubmit}
        >
          {loading ? "Processing..." : "Complete Cash Out"}
        </Button>
      </div>
    </div>
  );
}
