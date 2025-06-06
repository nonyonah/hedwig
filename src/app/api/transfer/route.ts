import { transferNativeTokens } from '@/lib/agentkit';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { to, amount } = await request.json();

    if (!to || !amount) {
      return NextResponse.json({ error: 'Recipient address and amount are required' }, { status: 400 });
    }

    const result = await transferNativeTokens(to, amount);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error transferring tokens:', error);
    return NextResponse.json({ error: 'Failed to transfer tokens' }, { status: 500 });
  }
} 