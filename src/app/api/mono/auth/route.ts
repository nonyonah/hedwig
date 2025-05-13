import { NextResponse } from 'next/server';
import { getSession } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    // Get the current user session
    const { data: session } = await getSession();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Get the code from the request body
    const { code } = await request.json();
    if (!code) {
      return NextResponse.json(
        { error: 'Missing code' },
        { status: 400 }
      );
    }
    
    // Exchange the code for an account ID
    // This should be done on your server for security
    const response = await fetch('https://api.withmono.com/account/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'mono-sec-key': process.env.MONO_SECRET_KEY || '',
      },
      body: JSON.stringify({ code }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { error: errorData.message || 'Failed to authenticate with Mono' },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    
    return NextResponse.json({
      accountId: data.id,
    });
  } catch (error) {
    console.error('Error in Mono auth API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}