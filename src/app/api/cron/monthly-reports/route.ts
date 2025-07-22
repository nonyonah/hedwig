import { NextRequest, NextResponse } from 'next/server';
import { scheduleMonthlyReports } from '@/lib/proactiveSummaryService';

export async function POST(request: NextRequest) {
  try {
    // Verify the request is from a cron job (optional security check)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('Starting monthly reports cron job...');
    
    // Execute the monthly reports job
    await scheduleMonthlyReports();
    
    return NextResponse.json(
      { 
        success: true, 
        message: 'Monthly reports job completed successfully',
        timestamp: new Date().toISOString()
      },
      { status: 200 }
    );
    
  } catch (error) {
    console.error('Error in monthly reports cron job:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// Optional: Allow GET requests for testing
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const test = searchParams.get('test');
    
    if (test === 'true') {
      console.log('Testing monthly reports job...');
      await scheduleMonthlyReports();
      
      return NextResponse.json(
        { 
          success: true, 
          message: 'Monthly reports test completed successfully',
          timestamp: new Date().toISOString()
        },
        { status: 200 }
      );
    }
    
    return NextResponse.json(
      { 
        message: 'Monthly reports cron endpoint',
        usage: 'POST to trigger job, GET with ?test=true to test',
        timestamp: new Date().toISOString()
      },
      { status: 200 }
    );
    
  } catch (error) {
    console.error('Error in monthly reports test:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}