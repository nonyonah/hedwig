import { NextRequest, NextResponse } from 'next/server';
import { getInvoice, updateInvoiceStatus } from '@/lib/invoiceService';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const invoiceId = params.id;
    
    if (!invoiceId) {
      return NextResponse.redirect('/404');
    }

   // Get invoice data from database
    const invoice = await getInvoice(invoiceId);
    
    if (!invoice) {
      return NextResponse.redirect('/404');
    }

    // Redirect to the new invoice page
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://hedwigbot.xyz';
    return NextResponse.redirect(`${baseUrl}/invoice/${invoiceId}`);
  } catch (error) {
    console.error('Error processing payment request:', error);
    return NextResponse.redirect('/404');
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const invoiceId = params.id;
    const body = await request.json();
    
    if (!invoiceId) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 });
    }

    // Update invoice status to paid
    const updatedInvoice = await updateInvoiceStatus(invoiceId, 'paid');
    
    if (!updatedInvoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Payment recorded successfully',
      invoice: updatedInvoice 
    });
  } catch (error) {
    console.error('Error recording payment:', error);
    return NextResponse.json(
      { error: 'Failed to record payment' },
      { status: 500 }
    );
  }
}