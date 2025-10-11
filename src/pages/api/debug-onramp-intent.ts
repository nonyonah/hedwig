// src/pages/api/debug-onramp-intent.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { parseIntentAndParams } from '../../lib/intentParser';
import { runLLM } from '../../lib/llmAgent';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message = 'buy crypto', userId = 'test-user-123' } = req.body;

  try {
    console.log('[DebugOnramp] Testing message:', message);

    // Step 1: Test LLM Agent
    console.log('[DebugOnramp] Step 1: Testing LLM Agent...');
    let llmResponse = '';
    let llmError = null;
    
    try {
      llmResponse = await runLLM({
        userId,
        message,
        generateNaturalResponse: false
      });
      console.log('[DebugOnramp] LLM Raw Response:', llmResponse);
    } catch (error) {
      llmError = error.message;
      console.error('[DebugOnramp] LLM Error:', error);
    }

    // Step 2: Test Intent Parser
    console.log('[DebugOnramp] Step 2: Testing Intent Parser...');
    const intentResult: any = parseIntentAndParams(llmResponse || message);
    console.log('[DebugOnramp] Intent Parser Result:', intentResult);

    // Step 3: Test Direct Intent Parser (bypass LLM)
    console.log('[DebugOnramp] Step 3: Testing Direct Intent Parser...');
    const directIntentResult: any = parseIntentAndParams(message);
    console.log('[DebugOnramp] Direct Intent Parser Result:', directIntentResult);

    // Step 4: Test Actions Handler
    console.log('[DebugOnramp] Step 4: Testing Actions Handler...');
    let actionResult: any = null;
    let actionError: string | null = null;
    
    try {
      const { handleAction } = await import('../../api/actions');
      actionResult = await handleAction('onramp', {}, userId);
      console.log('[DebugOnramp] Action Result:', actionResult);
    } catch (error) {
      actionError = error.message;
      console.error('[DebugOnramp] Action Error:', error);
    }

    // Step 5: Parse LLM JSON Response
    let parsedLLMResponse: any = null;
    let parseError: string | null = null;
    
    if (llmResponse) {
      try {
        const match = llmResponse.match(/{.*}/s);
        if (match) {
          parsedLLMResponse = JSON.parse(match[0]);
        } else {
          parseError = 'No JSON found in LLM response';
        }
      } catch (error) {
        parseError = error.message;
      }
    }

    const debugInfo = {
      input: {
        message,
        userId
      },
      step1_llm: {
        success: !llmError,
        response: llmResponse,
        error: llmError,
        parsedResponse: parsedLLMResponse,
        parseError
      },
      step2_intentParser: {
        intent: intentResult.intent,
        params: intentResult.params,
        isOnramp: intentResult.intent === 'onramp'
      },
      step3_directIntentParser: {
        intent: directIntentResult.intent,
        params: directIntentResult.params,
        isOnramp: directIntentResult.intent === 'onramp'
      },
      step4_actionHandler: {
        success: !actionError,
        result: actionResult,
        error: actionError
      },
      analysis: {
        llmRecognizedOnramp: parsedLLMResponse?.intent === 'onramp',
        intentParserRecognizedOnramp: intentResult.intent === 'onramp',
        directParserRecognizedOnramp: directIntentResult.intent === 'onramp',
        actionHandlerWorking: !actionError,
        overallWorking: !llmError && !actionError && (
          parsedLLMResponse?.intent === 'onramp' || 
          intentResult.intent === 'onramp' || 
          directIntentResult.intent === 'onramp'
        )
      }
    };

    console.log('[DebugOnramp] Final Debug Info:', debugInfo);

    return res.status(200).json(debugInfo);

  } catch (error) {
    console.error('[DebugOnramp] Debug Error:', error);
    return res.status(500).json({ 
      error: 'Debug failed', 
      details: error.message,
      message 
    });
  }
}