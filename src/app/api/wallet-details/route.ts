import { getWalletDetails } from '@/lib/agentkit';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const details = await getWalletDetails();
    return NextResponse.json(details);
  } catch (error) {
    console.error('Error getting wallet details:', error);
    return NextResponse.json({ error: 'Failed to get wallet details' }, { status: 500 });
  }
} 