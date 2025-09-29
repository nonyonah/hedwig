import { runLLM } from './llmAgent';

export interface ActionResult {
  text: string;
  reply_markup?: any;
  data?: any;
}

export interface ResponseContext {
  userId: string;
  userMessage: string;
  intent: string;
  params: any;
  actionResult: ActionResult;
  userContext?: {
    name?: string;
    telegram_username?: string;
    recent_activity?: string[];
  };
}

export class ResponseGenerator {
  /**
   * Generate a dynamic, contextual response based on action results
   */
  static async generateDynamicResponse(context: ResponseContext): Promise<ActionResult> {
    const { userId, userMessage, intent, params, actionResult, userContext } = context;

    // For certain intents, preserve the original structured response (like buttons/keyboards)
    const preserveStructuredResponse = [
      'offramp',
      'send_reminder',
      'business_dashboard',
      'create_proposal',
      'create_invoice'
    ];

    if (preserveStructuredResponse.includes(intent) && actionResult.reply_markup) {
      return actionResult;
    }

    // For balance queries, skip dynamic response generation to avoid malformed JSON
    if (intent === 'balance') {
      console.log('[ResponseGenerator] Skipping dynamic response for balance query to prevent malformed JSON');
      return actionResult;
    }

    // For earnings and spending queries, skip dynamic response generation to avoid malformed JSON
    if (['get_earnings', 'earnings_summary', 'get_spending'].includes(intent)) {
      console.log(`[ResponseGenerator] Skipping dynamic response for ${intent} query to prevent malformed JSON`);
      return actionResult;
    }

    // For wallet and financial data queries, skip dynamic response generation to avoid malformed JSON
    const financialDataIntents = [
      'wallet_balance', 'get_wallet_balance', 'show_balance', 'wallet',
      'get_wallet_address', 'instruction_deposit', 'earnings', 'show_earnings_summary',
      'generate_earnings_pdf', 'earnings_pdf', 'business_dashboard', 'show_business_dashboard'
    ];
    
    if (financialDataIntents.includes(intent)) {
      console.log(`[ResponseGenerator] Skipping dynamic response for ${intent} query to prevent malformed JSON`);
      return actionResult;
    }

    // Generate a more natural, contextual response
    const responsePrompt = this.buildResponsePrompt(context);
    
    try {
      const generatedResponse = await runLLM({
        userId: userId,
        message: responsePrompt,
        systemOverride: this.getResponseSystemPrompt()
      });

      // Parse the generated response
      let parsedResponse: any;
      if (typeof generatedResponse === 'string') {
        try {
          parsedResponse = JSON.parse(generatedResponse);
        } catch (parseError) {
          console.warn('[ResponseGenerator] Failed to parse LLM response as JSON:', parseError);
          console.warn('[ResponseGenerator] Raw response:', generatedResponse);
          // If not JSON, treat as plain text
          return {
            text: generatedResponse,
            reply_markup: actionResult.reply_markup,
            data: actionResult.data
          };
        }
      } else {
        parsedResponse = generatedResponse;
      }

      // Validate that we have a proper response structure
      if (!parsedResponse || typeof parsedResponse !== 'object') {
        console.warn('[ResponseGenerator] Invalid response structure:', parsedResponse);
        return actionResult;
      }

      // Extract the response text, handling different possible structures
      let responseText = parsedResponse.response || parsedResponse.text || parsedResponse.naturalResponse;
      
      // If we still don't have valid response text, fall back to original
      if (!responseText || typeof responseText !== 'string') {
        console.warn('[ResponseGenerator] No valid response text found in:', parsedResponse);
        return actionResult;
      }

      return {
        text: responseText,
        reply_markup: actionResult.reply_markup,
        data: actionResult.data
      };

    } catch (error) {
      console.error('[ResponseGenerator] Error generating dynamic response:', error);
      // Fallback to original response
      return actionResult;
    }
  }

  private static buildResponsePrompt(context: ResponseContext): string {
    const { userMessage, intent, params, actionResult, userContext } = context;

    return `
User asked: "${userMessage}"
Intent identified: ${intent}
Parameters extracted: ${JSON.stringify(params)}
Action executed successfully with result: ${actionResult.text}

User context:
- Name: ${userContext?.name || 'Not provided'}
- Username: ${userContext?.telegram_username || 'Not provided'}

Please generate a more natural, conversational response that:
1. Acknowledges what the user asked for
2. Provides the same information as the action result
3. Uses a friendly, helpful tone
4. Maintains all important details and numbers
5. Keeps any important warnings or instructions
6. Makes the response feel more personal and less templated

Return your response as a JSON object with a "response" field containing the natural language response.
`;
  }

  private static getResponseSystemPrompt(): string {
    return `You are Hedwig, a friendly AI crypto assistant. Your job is to take structured action results and make them sound more natural and conversational while preserving all important information.

Guidelines:
- Be conversational and friendly
- Acknowledge the user's request naturally
- Preserve all important data, numbers, and addresses
- Keep security warnings and important instructions
- Use emojis sparingly and naturally
- Don't add information that wasn't in the original result
- Make responses feel personal but professional

Always respond with valid JSON containing a "response" field.`;
  }

  /**
   * Enhance the LLM to generate both intent/params AND a natural response
   */
  static async generateEnhancedResponse(userId: string, message: string): Promise<{
    intent: string;
    params: any;
    naturalResponse?: string;
  }> {
    const enhancedPrompt = `
User message: "${message}"

Please analyze this message and provide:
1. The intent and parameters (as you normally do)
2. A natural, conversational response that acknowledges the user's request

If this is a request that requires action (like checking balance, sending crypto, etc.), 
generate a response that shows you understand and are processing their request.

If this is a simple question or conversation, provide a helpful response directly.

Return as JSON with:
{
  "intent": "...",
  "params": {...},
  "naturalResponse": "A friendly response acknowledging their request"
}
`;

    try {
      const response = await runLLM({
        userId: userId,
        message: enhancedPrompt
      });

      if (typeof response === 'string') {
        return JSON.parse(response);
      }
      return response;
    } catch (error) {
      console.error('[ResponseGenerator] Error generating enhanced response:', error);
      throw error;
    }
  }
}