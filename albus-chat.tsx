import { Clock, Copy, RotateCcw, ThumbsDown, Share2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function Component() {
  return (
    <div className="min-h-screen bg-[#ffffff] flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 border-b border-[#e9eaeb] bg-[#ffffff]">
        <div className="text-[#0a0d12] font-medium text-lg">albus.</div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="text-[#414651] hover:bg-[#f2f1ef]">
            <Clock className="h-5 w-5" />
          </Button>
          <Button variant="outline" className="text-[#0a0d12] border-[#d5d7da] hover:bg-[#f2f1ef] bg-transparent">
            Sign in
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-8 pt-20 pb-32">
        <div className="space-y-[114px]">
          {/* Question */}
          <div className="text-right">
            <div className="inline-block bg-[#f2f1ef] px-4 py-2 rounded-lg text-[#0a0d12]">
              How do I build an ai agent?
            </div>
          </div>

          {/* Response */}
          <div className="space-y-6">
            <div className="text-[#0a0d12] space-y-4">
              <p>Building an AI agent involves several key components and decisions. Here's a practical breakdown:</p>

              <div>
                <h3 className="font-medium mb-2">Core Architecture</h3>
              </div>

              <div>
                <p className="mb-3">
                  <strong>Agent Framework:</strong> Start with the basic loop - perception, reasoning, and action. Your
                  agent needs to:
                </p>
                <ul className="space-y-2 ml-6">
                  <li className="flex items-start">
                    <span className="text-[#0a0d12] mr-2">•</span>
                    <span>Receive inputs (text, data, API responses)</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-[#0a0d12] mr-2">•</span>
                    <span>Process and reason about those inputs</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-[#0a0d12] mr-2">•</span>
                    <span>Take actions based on its reasoning</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-[#0a0d12] mr-2">•</span>
                    <span>Learn from the results</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-[16px]">
              <Button variant="ghost" size="icon" className="text-[#414651] hover:bg-[#f2f1ef] h-8 w-8">
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="text-[#414651] hover:bg-[#f2f1ef] h-8 w-8">
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="text-[#414651] hover:bg-[#f2f1ef] h-8 w-8">
                <ThumbsDown className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="text-[#414651] hover:bg-[#f2f1ef] h-8 w-8">
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Input Area */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-6 bg-[#ffffff]">
        <div className="max-w-3xl mx-auto">
          <div className="relative">
            <Input
              placeholder="Ask anything..."
              className="w-full max-w-[793px] h-[74px] pr-12 text-[#414651] placeholder:text-[#414651] border-[#d5d7da] focus:border-[#0a0d12] bg-[#ffffff]"
            />
            <Button
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-[#0a0d12] hover:bg-[#181d27] text-white rounded-full h-8 w-8"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
