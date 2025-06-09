import { NextRequest, NextResponse } from 'next/server';
import { HumanMessage } from '@langchain/core/messages';
import { getAgentKit } from '@/lib/agentkit';
import { getOrCreateWallet } from '@/lib/wallet';
import { getLangChainAgent } from '@/lib/langchain';

// WhatsApp webhook verification
export async function GET(request: NextRequest) {
  try {
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

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('Webhook verified successfully');
      return new NextResponse(challenge, { 
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    console.error('Webhook verification failed:', { mode, token, verifyToken });
    return new NextResponse('Verification failed: token or mode mismatch', { 
      status: 403,
      headers: { 'Content-Type': 'text/plain' }
    });
  } catch (error) {
    console.error('Error in webhook verification:', error);
    return new NextResponse('Server error during verification', { status: 500 });
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
                // --- DIRECT INTEGRATION STARTS
                const from = message.from;
                const messageType = message.type;
                if (messageType !== 'text') {
                  console.log(`Unsupported message type: ${messageType}`);
                  continue;
                }
                const messageText = message.text.body;
                console.log(`Received message from ${from}: ${messageText}`);

                let responseText = 'Sorry, I could not process your request.';
                try {
                  const userId = from;
                  let langchainAgent;
                  try {
                    await getOrCreateWallet(userId); // Ensures wallet exists (side effect, not directly used here)
                    const agentKit = await getAgentKit();
                    langchainAgent = await getLangChainAgent(agentKit);
                  } catch (setupError) {
                    console.error('Failed to setup agent:', setupError);
                    await sendWhatsAppMessage(from, 'Sorry, failed to initialize wallet or agent.');
                    continue;
                  }

                  const result = await langchainAgent.invoke({
                    messages: [
                      new HumanMessage({
                        content: messageText,
                      }),
                    ],
                  });

                  // Robust extraction: handle string, messages array, or fallback
                  if (typeof result === 'string') {
                    responseText = result;
                  } else if (result && typeof result === 'object') {
                    // Try to extract from messages array (LangChain convention)
                    if (Array.isArray(result.messages) && result.messages.length > 0) {
                      // Find the last AI message
                      const lastMsg = result.messages[result.messages.length - 1];
                      if (typeof lastMsg.content === 'string') {
                        responseText = lastMsg.content;
                      } else if (Array.isArray(lastMsg.content)) {
                        // Sometimes content is an array of strings/objects
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        responseText = (lastMsg.content as any[])
                          .map((c: any) => 
                            typeof c === 'string' ? c : c?.text ?? ''
                          )
                          .join(' ')
                          .trim();
                      }
                    } else {
                      // Fallback: stringified result
                      responseText = JSON.stringify(result);
                    }
                  }
                } catch (invokeError) {
                  console.error('Error invoking LangChain agent:', invokeError);
                  responseText = 'Sorry, an error occurred while processing your message.';
                }

                await sendWhatsAppMessage(from, responseText);
                console.log('Response sent to', from);
                // --- DIRECT INTEGRATION ENDS HERE ---
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

async function sendWhatsAppMessage(to: string, message: string) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          text: { body: message },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    return await response.json();
  } catch (err) {
    console.error('Failed to send WhatsApp message:', err);
  }
}
