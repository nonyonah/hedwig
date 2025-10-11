// src/pages/api/debug-simple-onramp.ts
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message = 'buy crypto' } = req.body;

  try {
    console.log('[DebugSimpleOnramp] Testing message:', message);

    // Test 1: Direct intent parsing
    const { parseIntentAndParams } = await import('../../lib/intentParser');
    const directResult = parseIntentAndParams(message);
    
    console.log('[DebugSimpleOnramp] Direct parsing result:', directResult);

    // Test 2: LLM + intent parsing
    const { runLLM } = await import('../../lib/llmAgent');
    const llmResponse = await runLLM({
      userId: 'test-user',
      message,
      generateNaturalResponse: false
    });
    
    console.log('[DebugSimpleOnramp] LLM response:', llmResponse);
    
    const llmParsedResult = parseIntentAndParams(llmResponse);
    console.log('[DebugSimpleOnramp] LLM parsed result:', llmParsedResult);

    // Test 3: Check if LLM response is already JSON
    let llmJson = null;
    try {
      const match = llmResponse.match(/{.*}/s);
      if (match) {
        llmJson = JSON.parse(match[0]);
      }
    } catch (e) {
      console.log('[DebugSimpleOnramp] LLM response is not JSON');
    }

    const result = {
      input: message,
      directParsing: {
        intent: directResult.intent,
        params: directResult.params,
        isOnramp: directResult.intent === 'onramp'
      },
      llmResponse: {
        raw: llmResponse,
        parsed: llmParsedResult,
        json: llmJson,
        isOnramp: llmParsedResult.intent === 'onramp'
      },
      analysis: {
        directRecognizesOnramp: directResult.intent === 'onramp',
        llmRecognizesOnramp: llmParsedResult.intent === 'onramp',
        eitherRecognizes: directResult.intent === 'onramp' || llmParsedResult.intent === 'onramp'
      }
    };

    console.log('[DebugSimpleOnramp] Final result:', result);

    return res.status(200).json(result);

  } catch (error) {
    console.error('[DebugSimpleOnramp] Error:', error);
    return res.status(500).json({ 
      error: 'Debug failed', 
      details: error.message
    });
  }
}