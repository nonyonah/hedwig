import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import PaymentSummary from '../../components/PaymentSummary'

interface PaymentData {
  id: string
  recipient: string
  amount: string
  currency: string
  description: string
  network: string
  token_address?: string
  reason?: string
}

export default function PaymentPage() {
  const router = useRouter()
  const { id } = router.query
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (id && typeof id === 'string') {
      fetchPaymentData(id)
    }
  }, [id])

  const fetchPaymentData = async (paymentId: string) => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('payment_links')
        .select('*')
        .eq('id', paymentId)
        .single()

      if (error) {
        console.error('Error fetching payment data:', error)
        setError('Payment not found')
        return
      }

      if (!data) {
        setError('Payment not found')
        return
      }

      setPaymentData({
        id: data.id,
        recipient: data.wallet_address,
        amount: data.amount,
        currency: data.token,
        description: data.payment_reason || 'Payment',
        network: data.network || 'Base',
        token_address: data.token_address,
        reason: data.payment_reason
      })
    } catch (err) {
      console.error('Error:', err)
      setError('Failed to load payment data')
    } finally {
      setLoading(false)
    }
  }

  const handlePaymentSuccess = async (txHash: string) => {
    try {
      // Update payment status in database
      await supabase
        .from('payment_links')
        .update({ 
          status: 'completed',
          transaction_hash: txHash,
          completed_at: new Date().toISOString()
        })
        .eq('id', id)

      console.log('Payment completed successfully:', txHash)
    } catch (err) {
      console.error('Error updating payment status:', err)
    }
  }

  const handlePaymentError = (error: string) => {
    console.error('Payment error:', error)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading payment details...</p>
        </div>
      </div>
    )
  }

  if (error || !paymentData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Payment Not Found</h1>
          <p className="text-gray-600 mb-8">{error || 'The payment link you\'re looking for doesn\'t exist.'}</p>
          <button
            onClick={() => router.push('/')}
            className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-lg"
          >
            Go Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <PaymentSummary
      paymentData={paymentData}
      onPaymentSuccess={handlePaymentSuccess}
      onPaymentError={handlePaymentError}
    />
  )
}