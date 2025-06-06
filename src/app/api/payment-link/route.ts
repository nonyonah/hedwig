import { createPaymentLink } from '@/lib/agentkit';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { amount, currency, description } = await request.json();

    if (!amount || !currency) {
      return NextResponse.json({ error: 'Amount and currency are required' }, { status: 400 });
    }

    const result = await createPaymentLink(amount, currency, description);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error creating payment link:', error);
    return NextResponse.json({ error: 'Failed to create payment link' }, { status: 500 });
  }
} 