import { swapTokens } from '@/lib/agentkit';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { fromToken, toToken, amount } = await request.json();

    if (!fromToken || !toToken || !amount) {
      return NextResponse.json({ error: 'From token, to token, and amount are required' }, { status: 400 });
    }

    const result = await swapTokens(fromToken, toToken, amount);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error swapping tokens:', error);
    return NextResponse.json({ error: 'Failed to swap tokens' }, { status: 500 });
  }
} 