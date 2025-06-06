import { getTransactionDetails } from '@/lib/agentkit';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const txHash = searchParams.get('txHash');

  if (!txHash) {
    return NextResponse.json({ error: 'Transaction hash is required' }, { status: 400 });
  }

  try {
    const details = await getTransactionDetails(txHash);
    return NextResponse.json(details);
  } catch (error) {
    console.error('Error getting transaction details:', error);
    return NextResponse.json({ error: 'Failed to get transaction details' }, { status: 500 });
  }
} 