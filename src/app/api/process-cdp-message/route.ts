import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsAppMessage } from '@/lib/whatsappUtils'; // Import from the new utility file

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { from, messageText } = body;

    if (!from || !messageText) {
      return new NextResponse('Missing from or messageText in request body', { status: 400 });
    }

    console.log(`Processing CDP message for ${from}: ${messageText}`);

    let responseText = 'Sorry, I could not process your request at this moment.';

    try {
      // Dynamically import necessary modules
      const { HumanMessage } = await import('@langchain/core/messages');
      const { getAgentKit } = await import('@/lib/agentkit');
      const { getOrCreateWallet } = await import('@/lib/wallet');
      const { getLangChainAgent } = await import('@/lib/langchain');

      const userId = from;
      let langchainAgent;

      try {
        await getOrCreateWallet(userId); // Ensures wallet exists
        const agentKit = await getAgentKit();
        langchainAgent = await getLangChainAgent(agentKit);
      } catch (setupError) {
        console.error('Failed to setup agent components:', setupError);
        await sendWhatsAppMessage(from, 'Sorry, there was an issue setting up the AI agent.');
        return new NextResponse('Agent setup failed, WhatsApp notification sent.', { status: 200 });
      }

      const result = await langchainAgent.invoke({
        messages: [
          new HumanMessage({
            content: messageText,
          }),
        ],
      });

      if (typeof result === 'string') {
        responseText = result;
      } else if (result && typeof result === 'object') {
        if (Array.isArray(result.messages) && result.messages.length > 0) {
          const lastMsg = result.messages[result.messages.length - 1];
          if (typeof lastMsg.content === 'string') {
            responseText = lastMsg.content;
          } else if (Array.isArray(lastMsg.content)) {
            // Disable ESLint for dynamic content handling
            /* eslint-disable @typescript-eslint/no-explicit-any */
            responseText = (lastMsg.content as any[])
              .map((c: any) => typeof c === 'string' ? c : c?.text ?? '')
              .join(' ')
              .trim();
            /* eslint-enable @typescript-eslint/no-explicit-any */
          }
        } else {
          responseText = JSON.stringify(result);
        }
      }
    } catch (invokeError) {
      console.error('Error invoking LangChain agent or dynamic imports:', invokeError);
      responseText = 'Sorry, an error occurred while the AI was processing your message.';
    }

    await sendWhatsAppMessage(from, responseText);
    console.log('Response sent to', from, 'via CDP processor.');
    
    return new NextResponse('Message processed and response sent.', { status: 200 });

  } catch (error) {
    console.error('Error in process-cdp-message handler:', error);
    return new NextResponse('Internal Server Error in CDP processor.', { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
