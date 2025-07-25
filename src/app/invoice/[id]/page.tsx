'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Download } from "lucide-react"
import { useState, useEffect } from "react"

interface InvoicePageProps {
  params: Promise<{
    id: string
  }>
}

export default function InvoicePage({ params }: InvoicePageProps) {
  const [id, setId] = useState<string>("")
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("crypto")
  const [selectedNetwork, setSelectedNetwork] = useState("Base")

  useEffect(() => {
    params.then((resolvedParams) => {
      setId(resolvedParams.id)
    })
  }, [params])

  if (!id) {
    return <div>Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md relative">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <h1 className="text-lg font-semibold">albus.</h1>
          <Button variant="outline" size="sm" className="flex items-center gap-2 bg-transparent">
            <Download className="h-4 w-4" />
            Download
          </Button>
        </div>

        <Card className="shadow-sm">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-lg font-semibold">Invoice #{id.padStart(5, "0")}</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">From</span>
                <span className="font-medium">Nonso</span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-600">To</span>
                <span className="font-medium">ChowDown</span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-600">Due Date</span>
                <span className="font-medium">21st Aug, 2025</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-600">Payment Method</span>
                <Select value={selectedPaymentMethod} onValueChange={setSelectedPaymentMethod}>
                  <SelectTrigger className="w-32 h-8 border-none shadow-none p-0 justify-end">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="crypto">Crypto</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedPaymentMethod === "crypto" && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Network</span>
                  <Select value={selectedNetwork} onValueChange={setSelectedNetwork}>
                    <SelectTrigger className="w-32 h-8 border-none shadow-none p-0 justify-end">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Base">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                            <span className="text-white text-xs font-bold">B</span>
                          </div>
                          Base
                        </div>
                      </SelectItem>
                      <SelectItem value="Celo">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                            <span className="text-white text-xs font-bold">C</span>
                          </div>
                          Celo
                        </div>
                      </SelectItem>
                      <SelectItem value="Ethereum">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-gray-800 flex items-center justify-center">
                            <span className="text-white text-xs font-bold">E</span>
                          </div>
                          Ethereum
                        </div>
                      </SelectItem>
                      <SelectItem value="Solana">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center">
                            <span className="text-white text-xs font-bold">S</span>
                          </div>
                          Solana
                        </div>
                      </SelectItem>
                      <SelectItem value="Lisk">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                            <span className="text-white text-xs font-bold">L</span>
                          </div>
                          Lisk
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <Separator className="my-6" />

            <div>
              <h3 className="font-semibold text-center mb-4">Breakdown</h3>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <div>
                    <div className="font-medium">Web Design</div>
                    <div className="text-sm text-gray-500">Qty: 0</div>
                  </div>
                  <span className="font-medium">$200</span>
                </div>

                <div className="flex justify-between">
                  <div>
                    <div className="font-medium">Web Design</div>
                    <div className="text-sm text-gray-500">Qty: 1</div>
                  </div>
                  <span className="font-medium">$200</span>
                </div>

                <Separator />

                <div className="flex justify-between font-semibold">
                  <span>Total due</span>
                  <span>200 USDC</span>
                </div>
              </div>
            </div>

            <div className="flex justify-center pt-4">
              {selectedPaymentMethod === "crypto" ? (
                <Button className="bg-purple-600 hover:bg-purple-700" size="custom">
                  Connect Wallet
                </Button>
              ) : (
                <Link href={`/invoice/${id}/paid`}>
                  <Button className="bg-purple-600 hover:bg-purple-700" size="custom">
                    Pay with Bank Account
                  </Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
