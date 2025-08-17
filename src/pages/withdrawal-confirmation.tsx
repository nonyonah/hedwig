import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WithdrawalConfirmation() {
  const router = useRouter();
  const {
    amountUSD: amountUSDParam,
    currency,
    bank,
    bankCode,
    accountNumber,
    accountName,
    userId,
    chatId,
  } = router.query as {
    amountUSD?: string;
    currency?: string;
    bank?: string;
    bankCode?: string;
    accountNumber?: string;
    accountName?: string;
    userId?: string;
    chatId?: string;
  };

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [rate, setRate] = useState<number | null>(null);

  const amountUSD = useMemo(() => {
    const v = parseFloat(String(amountUSDParam || "0"));
    return Number.isFinite(v) ? v : 0;
  }, [amountUSDParam]);

  useEffect(() => {
    const loadRates = async () => {
      try {
        const res = await fetch(`/api/paycrest/rates`);
        const data = await res.json();
        if (data?.success && data.rates && currency) {
          setRate(data.rates[currency as keyof typeof data.rates] ?? null);
        }
      } catch (e) {
        // ignore
      }
    };
    loadRates();
  }, [currency]);

  const currencySymbol = currency === "NGN" ? "₦" : currency === "KSH" ? "KSh" : "";
  const fiatAmount = useMemo(() => {
    if (!rate || !amountUSD) return "0.00";
    const gross = amountUSD * rate;
    const fee = gross * (0.5 / 100);
    const net = gross - fee;
    return net.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, [amountUSD, rate]);

  const feePercent = 0.5; // display only

  const onConfirm = async () => {
    if (!userId || !chatId || !amountUSD || !currency || !bank || !bankCode || !accountNumber) {
      setError("Missing payout details. Please go back and try again.");
      return;
    }

    router.push('/offramp/loading');

    try {
      // 1) Create Paycrest sender order to get a receive address
      const orderRes = await fetch("/api/paycrest/create-sender-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountUSD: Number(amountUSD), currency }),
      });
      const orderData = await orderRes.json();
      if (!orderData.success) throw new Error(orderData.error || "Failed to create sender order");

      const receiveAddress: string = orderData.receiveAddress;
      const senderOrderId: string | undefined = orderData.orderId;

      // 2) Send USDC on Base from treasury to receiveAddress
      const sendRes = await fetch("/api/onchain/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "USDC", amount: String(amountUSD), receiveAddress }),
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
          amountUSD: Number(amountUSD),
          currency,
          accountName,
          accountNumber,
          bankCode,
          bank,
          txHash,
          senderOrderId,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Payout creation failed");

      router.replace('/offramp/success');
    } catch (e: any) {
      console.error("Payout failed:", e.message);
      router.replace('/offramp/failure');
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black flex items-start justify-center p-4">
      <div className="w-full max-w-[430px] mx-auto relative pt-6 pb-28">
        {/* Header with back arrow */}
        <div className="px-2 pt-2">
          <button onClick={() => router.back()} aria-label="Go back">
            <ArrowLeft className="w-6 h-6 text-black dark:text-white" />
          </button>
        </div>

        {/* Title */}
        <div className="text-center mt-8 mb-12">
          <h1 className="text-3xl font-bold text-black dark:text-white">Confirm Withdrawal</h1>
        </div>

        {/* Transaction details */}
        <div className="w-full max-w-[367px] mx-auto space-y-8">
          <div className="flex justify-between items-center">
            <span className="text-lg text-black dark:text-white">You send</span>
            <span className="text-lg font-medium text-black dark:text-white">${amountUSD.toFixed(2)}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-lg text-black dark:text-white">You receive</span>
            <span className="text-lg font-medium text-black dark:text-white">{currencySymbol}{fiatAmount}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-lg text-black dark:text-white">Transaction Fee</span>
            <span className="text-lg font-medium text-black dark:text-white">{feePercent}%</span>
          </div>

          <div className="flex justify-between items-start">
            <span className="text-lg text-black dark:text-white">Bank Details</span>
            <div className="text-right">
              {accountName && (
                <div className="text-lg font-medium text-black dark:text-white">{accountName}</div>
              )}
              <div className="text-lg font-medium text-black dark:text-white">{accountNumber}</div>
              <div className="text-lg font-medium text-black dark:text-white">{bank}</div>
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600">{error}</div>
          )}
        </div>

        {/* Bottom fixed Confirm button */}
        <div className="fixed left-0 right-0 bottom-8 px-4">
          <Button
            className="w-full max-w-[359px] h-[52px] text-white font-bold text-lg rounded-[16px] mx-auto flex justify-center items-center"
            style={{ backgroundColor: '#0466c8' }}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Processing…' : 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );
}
