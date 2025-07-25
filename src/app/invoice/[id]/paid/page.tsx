import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle } from "lucide-react"

interface PaidPageProps {
  params: {
    id: string
  }
}

export default function PaidPage({ params }: PaidPageProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-lg font-semibold">albus.</h1>
        </div>

        <Card className="shadow-sm">
          <CardHeader className="text-center pb-4">
            <div className="flex justify-center mb-3">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <CardTitle className="text-lg font-semibold text-green-700">Invoice Paid</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Invoice No.</span>
                <span className="font-medium">#{params.id.padStart(5, "0")}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-600">Method</span>
                <span className="font-medium">Crypto</span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-600">Payment Date</span>
                <span className="font-medium">21st Aug, 2025</span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-600">Network</span>
                <span className="font-medium">Base</span>
              </div>
            </div>

            <div className="flex justify-center pt-4">
              <Button className="bg-purple-600 hover:bg-purple-700" size="custom">Download Receipt</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
