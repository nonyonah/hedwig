import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateWallet } from '@/lib/wallet';
import { loadServerEnvironment } from '@/lib/serverEnv';

// Ensure environment variables are loaded
loadServerEnvironment();

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Ensure Node.js runtime

type WalletResponse = {
  success: boolean;
  address?: string;
  message: string;
  error?: string;
};

export async function POST(request: NextRequest): Promise<NextResponse<WalletResponse>> {
  try {
    const { userId, action, address } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'User ID is required',
          error: 'Missing userId'
        },
        { status: 400 }
      );
    }

    try {
      const wallet = await getOrCreateWallet(userId, address);
      const walletAddress = await wallet.getAddress();
      
      return NextResponse.json({ 
        success: true, 
        address: walletAddress,
        message: action === 'create' ? 'Wallet created successfully' : 'Wallet accessed successfully'
      });
    } catch (error) {
      console.error('Wallet operation failed:', error);
      return NextResponse.json(
        { 
          success: false, 
          message: 'Failed to access wallet',
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Request processing failed:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to process request',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse<WalletResponse>> {
  const userId = request.nextUrl.searchParams.get('userId');
  
  if (!userId) {
    return NextResponse.json(
      { 
        success: false, 
        message: 'User ID is required',
        error: 'Missing userId'
      },
      { status: 400 }
    );
  }

  try {
    // In a real app, you might want to store and retrieve wallet information from your database
    // For now, we'll just return a success response with instructions
    return NextResponse.json({
      success: true,
      message: 'Wallet information retrieved',
      // Include any wallet information you want to return
    });
  } catch (error) {
    console.error('Failed to get wallet info:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to retrieve wallet information',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
