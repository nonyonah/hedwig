import { NextRequest, NextResponse } from 'next/server';
import { markPaymentCompleted, getPaymentDetails } from '@/lib/paymentTracker';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      paymentLinkId, 
      transactionHash, 
      paidAmount, 
      payerWalletAddress,
      blockNumber,
      gasUsed,
      gasPrice 
    } = body;

    // Validate required parameters
    if (!paymentLinkId) {
      return NextResponse.json(
        { error: 'paymentLinkId is required' },
        { status: 400 }
      );
    }

    if (!transactionHash) {
      return NextResponse.json(
        { error: 'transactionHash is required' },
        { status: 400 }
      );
    }

    if (!paidAmount) {
      return NextResponse.json(
        { error: 'paidAmount is required' },
        { status: 400 }
      );
    }

    if (!payerWalletAddress) {
      return NextResponse.json(
        { error: 'payerWalletAddress is required' },
        { status: 400 }
      );
    }

    // Validate wallet address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(payerWalletAddress)) {
      return NextResponse.json(
        { error: 'Invalid payer wallet address format' },
        { status: 400 }
      );
    }

    // Validate transaction hash format
    if (!/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
      return NextResponse.json(
        { error: 'Invalid transaction hash format' },
        { status: 400 }
      );
    }

    // Validate paid amount is a valid number
    if (isNaN(parseFloat(paidAmount))) {
      return NextResponse.json(
        { error: 'paidAmount must be a valid number' },
        { status: 400 }
      );
    }

    console.log('[API] Marking payment as completed:', {
      paymentLinkId,
      transactionHash,
      paidAmount,
      payerWalletAddress
    });

    // Check if payment exists and is not already paid
    const existingPayment = await getPaymentDetails(paymentLinkId);
    
    if (existingPayment.status === 'paid') {
      return NextResponse.json(
        { 
          success: true,
          message: 'Payment already marked as completed',
          data: existingPayment
        }
      );
    }

    // Mark payment as completed
    await markPaymentCompleted({
      paymentLinkId,
      transactionHash,
      paidAmount,
      payerWalletAddress,
      blockNumber,
      gasUsed,
      gasPrice
    });

    // Get updated payment details
    const updatedPayment = await getPaymentDetails(paymentLinkId);

    return NextResponse.json({
      success: true,
      message: 'Payment marked as completed successfully',
      data: updatedPayment
    });

  } catch (error) {
    console.error('[API] Error marking payment as completed:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to mark payment as completed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Get payment completion status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const paymentLinkId = searchParams.get('paymentLinkId');
    const transactionHash = searchParams.get('transactionHash');

    if (!paymentLinkId && !transactionHash) {
      return NextResponse.json(
        { error: 'Either paymentLinkId or transactionHash is required' },
        { status: 400 }
      );
    }

    let payment;
    
    if (paymentLinkId) {
      payment = await getPaymentDetails(paymentLinkId);
    } else if (transactionHash) {
      const { getPaymentByTransactionHash } = await import('@/lib/paymentTracker');
      payment = await getPaymentByTransactionHash(transactionHash);
    }

    return NextResponse.json({
      success: true,
      data: payment
    });

  } catch (error) {
    console.error('[API] Error fetching payment details:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch payment details',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}