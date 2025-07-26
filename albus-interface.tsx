import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowUp, Clock } from "lucide-react"

export default function Component() {
  return (
    <div className="min-h-screen bg-[#ffffff]">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4">
        <div className="text-lg font-medium text-[#000000]">albus.</div>
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-[#535862]" />
          <Button
            variant="outline"
            className="w-[106px] h-10 text-[#535862] hover:bg-[#e9eaeb] border-[#d5d7da] bg-transparent rounded-lg"
          >
            Sign in
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-col items-center justify-center px-6 pt-20">
        {/* Greeting Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-medium text-[#000000] mb-2">Good evening, Nonso</h1>
          <p className="text-[#535862] text-lg">How can I help you today?</p>
        </div>

        {/* Search Input */}
        <div className="relative w-full max-w-2xl mb-8">
          <Input
            placeholder="Ask anything..."
            className="w-full h-14 px-6 pr-14 text-lg border-[#d5d7da] rounded-xl bg-[#ffffff] placeholder:text-[#535862] focus:border-[#d5d7da] focus:ring-1 focus:ring-[#d5d7da]"
          />
          <Button
            size="icon"
            className="absolute right-2 top-2 h-10 w-10 rounded-full bg-[#535862] hover:bg-[#414651] text-white"
          >
            <ArrowUp className="w-4 h-4" />
          </Button>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            variant="outline"
            className="w-[117px] h-8 px-6 py-2 rounded-full border-[#d5d7da] text-[#262624] hover:bg-[#e9eaeb] hover:border-[#d5d7da] bg-transparent text-sm"
          >
            Create Invoice
          </Button>
          <Button
            variant="outline"
            className="w-[117px] h-8 px-6 py-2 rounded-full border-[#d5d7da] text-[#262624] hover:bg-[#e9eaeb] hover:border-[#d5d7da] bg-transparent text-sm"
          >
            View Summary
          </Button>
          <Button
            variant="outline"
            className="w-[117px] h-8 px-6 py-2 rounded-full border-[#d5d7da] text-[#262624] hover:bg-[#e9eaeb] hover:border-[#d5d7da] bg-transparent text-sm"
          >
            Send Reminder
          </Button>
          <Button
            variant="outline"
            className="w-[117px] h-8 px-6 py-2 rounded-full border-[#d5d7da] text-[#262624] hover:bg-[#e9eaeb] hover:border-[#d5d7da] bg-transparent text-sm"
          >
            Swap
          </Button>
        </div>
      </main>
    </div>
  )
}
