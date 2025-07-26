import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function WalletPage() {
  return (
    <div className="min-h-screen bg-[#ffffff] p-6">
      {/* Header */}
      <header className="flex items-center gap-4 mb-8">
        <Link href="/">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-full border-[#d5d7da] hover:bg-[#e9eaeb]"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-medium text-[#000000]">Wallet</h1>
      </header>

      {/* Content */}
      <div className="max-w-2xl mx-auto">
        <div className="text-center py-20">
          <h2 className="text-xl font-medium text-[#000000] mb-4">
            Wallet Management
          </h2>
          <p className="text-[#535862] mb-8">
            Your wallet features are coming soon. For now, you can manage your wallet through the agent by asking questions like:
          </p>
          
          <div className="space-y-3 text-left bg-[#f8f9fa] p-6 rounded-lg">
            <p className="text-[#535862]">• "Show me my wallet balance"</p>
            <p className="text-[#535862]">• "What's my wallet address?"</p>
            <p className="text-[#535862]">• "Send 0.01 ETH to [address]"</p>
            <p className="text-[#535862]">• "Swap 10 USDC for ETH"</p>
          </div>

          <Link href="/">
            <Button className="mt-8 bg-[#535862] hover:bg-[#414651] text-white">
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}