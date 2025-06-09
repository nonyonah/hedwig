import { NextRequest, NextResponse } from 'next/server';
// WhatsApp webhook verification
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Log the full URL and query parameters
    console.log('Request URL:', request.url);
    console.log('Query params:', Object.fromEntries(request.nextUrl.searchParams.entries()));
    
    const mode = request.nextUrl.searchParams.get('hub.mode');
    const token = request.nextUrl.searchParams.get('hub.verify_token');
    const challenge = request.nextUrl.searchParams.get('hub.challenge');
    const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    
    console.log('Webhook verification attempt:', {
      mode,
      receivedToken: token,
      expectedToken: verifyToken,
      hasChallenge: !!challenge
    });

    // Verify the webhook
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('Webhook verified successfully');
      // Return the challenge as plain text
      return new NextResponse(challenge, { 
        status: 200,
        headers: { 
          'Content-Type': 'text/plain',
          'Content-Length': challenge?.length?.toString() || '0',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    }

    console.error('Webhook verification failed:', { 
      mode, 
      token, 
      verifyToken,
      isValid: mode === 'subscribe' && token === verifyToken,
      url: request.url
    });
    
    return new NextResponse('Verification failed: token or mode mismatch', { 
      status: 403,
      headers: { 
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    console.error('Error in webhook verification:', error);
    return new NextResponse('Server error during verification', { 
      status: 500,
      headers: { 
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  }
}

// Webhook handler for WhatsApp messages
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Received webhook payload:', JSON.stringify(body, null, 2));
    console.log('Webhook received:', JSON.stringify(body, null, 2));

    if (body.object === 'whatsapp_business_account') {
      if (body.entry && body.entry.length > 0) {
        for (const entry of body.entry) {
          for (const change of entry.changes) {
            if (change.field === 'messages') {
              const messages = change.value.messages || [];
              for (const message of messages) {
                const from = message.from;
                const messageType = message.type;
                if (messageType === 'text') {
                  const messageText = message.text.body;
                  console.log(`Received text message from ${from}: ${messageText}`);

                  // Asynchronously forward to CDP processor
                  // Use a more robust way to get the base URL in production
                  const processApiUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/process-cdp-message`;
                  
                  fetch(processApiUrl, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ from, messageText }),
                  }).catch(fetchError => {
                    console.error('Failed to call process-cdp-message API:', fetchError);
                    // Optionally, implement a retry mechanism or notify admin
                  });

                  console.log(`Message from ${from} forwarded to CDP processor.`);
                } else {
                  console.log(`Unsupported message type: ${messageType} from ${from}. Not forwarding.`);
                }
              }
            }
          }
        }
      }
      return new NextResponse('EVENT_RECEIVED', { status: 200 });
    }
    return new NextResponse('Invalid request', { status: 404 });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return new NextResponse('Error processing webhook', { status: 500 });
  }
}

