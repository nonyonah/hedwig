import { getWalletBalance } from '@/lib/agentkit';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');

  if (!address) {
    return NextResponse.json({ error: 'Address is required' }, { status: 400 });
  }

  try {
    const balance = await getWalletBalance(address);
    return NextResponse.json({ balance });
  } catch (error) {
    console.error('Error getting wallet balance:', error);
    return NextResponse.json({ error: 'Failed to get wallet balance' }, { status: 500 });
  }
} 