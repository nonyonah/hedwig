import { NextRequest, NextResponse } from 'next/server';
import { runLLM } from '@/lib/llmAgent';
import { parseIntentAndParams } from '@/lib/intentParser';
import { handleAction } from '../../../api/actions';

export async function POST(request: NextRequest) {
  try {
    const { message, type } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required and must be a string' },
        { status: 400 }
      );
    }

    // For web interface, we'll use a default user ID
    // In a real implementation, this would come from authentication
    const userId = 'web_user_default';

    console.log('[Chat API] Processing message:', message, 'Type:', type);

    // Run the LLM to get intent and response
    const llmResponse = await runLLM({
      userId,
      message,
    });

    console.log('[Chat API] LLM Response:', llmResponse);

    // Parse the intent and parameters
    const { intent, params } = parseIntentAndParams(llmResponse);

    console.log('[Chat API] Parsed intent:', intent, 'Params:', params);

    // Execute the action based on the intent
    let actionResult;
    try {
      actionResult = await handleAction(
        intent,
        params,
        userId
      );
    } catch (actionError) {
      console.error('[Chat API] Action execution error:', actionError);
      actionResult = {
        text: 'I encountered an error processing your request. Please try again.',
      };
    }

    // Return the response
    let responseMessage = 'Request processed successfully';
    
    if (actionResult) {
      if (typeof actionResult === 'string') {
        responseMessage = actionResult;
      } else if (actionResult && typeof actionResult === 'object' && 'text' in actionResult) {
        responseMessage = actionResult.text;
      } else if (actionResult && typeof actionResult === 'object' && 'name' in actionResult) {
        // This is a WhatsApp template object, extract meaningful info
        responseMessage = `Template sent: ${actionResult.name}`;
      }
    }

    return NextResponse.json({
      message: responseMessage,
      intent,
      params,
      success: true,
    });

  } catch (error) {
    console.error('[Chat API] Error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'Sorry, I encountered an error processing your request. Please try again.',
        success: false,
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/chat',
    description: 'Chat API for web interface interactions with the Hedwig agent',
    method: 'POST',
    parameters: {
      message: 'Required. The user message to process',
      type: 'Optional. The type of interface (e.g., "web_interface")',
    },
    example: {
      message: 'Show me my earnings summary',
      type: 'web_interface',
    },
  });
}