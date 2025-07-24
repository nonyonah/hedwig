export function parseIntentAndParams(llmResponse: string): { intent: string, params: Record<string, any> } {
  console.log('[intentParser] Input:', llmResponse);
  // First try to parse JSON response from LLM
  try {
    // Look for JSON object in the response
    const match = llmResponse.match(/{.*}/s);
    if (match) {
      try {
        const obj = JSON.parse(match[0]);
        if (obj.intent && typeof obj.intent === 'string') {
          // Special handling for specific intents
          if (obj.intent === 'deposit_received' || obj.intent === 'token_received') {
            const result = {
              intent: 'crypto_received',
              params: obj.params || {}
            };
            console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
            return result;
          }
          
          if (obj.intent === 'bridge_completed' || obj.intent === 'bridge_received') {
            // Ensure that this is handled as a bridge deposit notification
            const result = {
              intent: 'bridge',
              params: { ...obj.params, isExecute: true } // Force execution phase
            };
            console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
            return result;
          }
          
          const result = { 
            intent: obj.intent, 
            params: obj.params || {} 
          };
          console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
          return result;
        }
      } catch (e) {
        console.error('Error parsing JSON from LLM response:', e);
      }
    }
    
    // If JSON parsing fails, use keyword-based intent detection
    const text = llmResponse.toLowerCase();
    
    // Check for crypto received or bridge completed keywords
    if ((text.includes('received') || text.includes('deposit')) && 
        (text.includes('token') || text.includes('crypto') || text.includes('eth') || 
         text.includes('sol') || text.includes('usdc'))) {
      if (text.includes('bridge') || text.includes('cross chain') || text.includes('between chains')) {
        // Bridge deposit notification
        const result = { intent: 'bridge', params: { isExecute: true } };
        console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
        return result;
      } else {
        // Regular crypto deposit notification
        const result = { intent: 'crypto_received', params: {} };
        console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
        return result;
      }
    }
    
    // Wallet creation keywords
    if (text.includes('create wallet') || 
        text.includes('new wallet') || 
        text.includes('make wallet') ||
        text.includes('setup wallet') ||
        (text.includes('wallet') && text.includes('create'))) {
      const result = { intent: 'create_wallets', params: {} };
      console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
      return result;
    }
    
    // Wallet address keywords - broader matching for better recognition
    if (text.includes('wallet address') || 
        text.includes('my address') || 
        text.includes('show address') || 
        text.includes('view address') ||
        text.includes('what is my address') ||
        text.includes('what are my addresses') ||
        text.includes('what are my wallet addresses') ||
        text.includes('wallet addresses') ||
        text.includes('address') && text.includes('wallet') ||
        text.includes('show me my') && text.includes('address') ||
        text.includes('deposit') ||
        text.includes('receive') ||
        text.includes('where to send') ||
        text.includes('how to deposit') ||
        text.includes('deposit instructions') ||
        text.includes('receive crypto') ||
        text.includes('receive tokens')) {
      console.log('Intent parser detected wallet address request');
      const result = { intent: 'get_wallet_address', params: {} };
      console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
      return result;
    }
    
    // Balance check keywords
    if (text.includes('balance') || 
        text.includes('how much') && (text.includes('have') || text.includes('own')) ||
        text.includes('check wallet')) {
      const result = { intent: 'get_wallet_balance', params: {} };
      console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
      return result;
    }
    
    // Export keys keywords - make this more specific to avoid false positives
    if ((text.includes('export') && text.includes('key')) || 
        text.includes('private key') || 
        text.includes('seed phrase') ||
        text.includes('recovery phrase') ||
        text.includes('backup') && text.includes('key')) {
      const result = { intent: 'export_keys', params: {} };
      console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
      return result;
    }
    
    // Swap instruction keywords
    if ((text.includes('swap') || text.includes('exchange') || text.includes('convert')) &&
        (text.includes('help') || text.includes('how') || text.includes('instruct') || 
         text.includes('guide') || text.includes('would like to') || text.includes('want to'))) {
      const result = { intent: 'instruction_swap', params: {} };
      console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
      return result;
    }
    
    // Bridge instruction keywords
    if ((text.includes('bridge') || text.includes('transfer between chains') || 
        text.includes('move between chains') || text.includes('cross chain')) &&
        (text.includes('help') || text.includes('how') || text.includes('instruct') || 
         text.includes('guide') || text.includes('would like to') || text.includes('want to'))) {
      const result = { intent: 'instruction_bridge', params: {} };
      console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
      return result;
    }
    
    // Send/withdraw instruction keywords
    if ((text.includes('send') || text.includes('withdraw') || text.includes('transfer')) &&
        (text.includes('help') || text.includes('how') || text.includes('instruct') || 
         text.includes('guide') || text.includes('would like to') || text.includes('want to'))) {
      const result = { intent: 'instruction_send', params: {} };
      console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
      return result;
    }
    
    // Actual send transaction keywords - if the user is actually trying to send
    if ((text.includes('send') || text.includes('transfer')) && 
        (text.includes('crypto') || text.includes('token') || text.includes('eth') || 
         text.includes('sol') || text.includes('usdc'))) {
      const result = { intent: 'send', params: {} };
      console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
      return result;
    }
    
    // Actual swap keywords - if the user is actually trying to swap
    if (text.includes('swap') || 
        (text.includes('exchange') && (text.includes('token') || text.includes('crypto'))) ||
        text.includes('convert')) {
      const result = { intent: 'swap', params: {} };
      console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
      return result;
    }
    
    // Actual bridge keywords - if the user is actually trying to bridge
    if (text.includes('bridge') || 
        text.includes('cross chain') || 
        text.includes('move between chains')) {
      const result = { intent: 'bridge', params: {} };
      console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
      return result;
    }
    
    // Currency conversion and exchange rate keywords
    if (text.includes('exchange rate') || 
        text.includes('convert') && (text.includes('usd') || text.includes('ngn') || text.includes('eur') || 
                                    text.includes('btc') || text.includes('eth') || text.includes('dollar') || 
                                    text.includes('naira') || text.includes('euro')) ||
        text.includes('how much is') && (text.includes('in') || text.includes('to')) ||
        text.includes('value of') && text.includes('in') ||
        (text.includes('price') && text.includes('in')) ||
        text.includes('worth') && text.includes('in')) {
      const result = { intent: 'get_price', params: { original_message: llmResponse } };
      console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
      return result;
    }
    
    // Legacy price check keywords (for backward compatibility)
    if (text.includes('price') || 
        text.includes('how much is') || 
        text.includes('worth')) {
      const result = { intent: 'get_price', params: { original_message: llmResponse } };
      console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
      return result;
    }
    
    // News keywords
    if (text.includes('news') || 
        text.includes('latest') || 
        text.includes('updates')) {
      const result = { intent: 'get_news', params: {} };
      console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
      return result;
    }
    
    // Welcome/help keywords
    if (text.includes('hello') || 
        text.includes('hi') || 
        text.includes('hey') || 
        text.includes('start') || 
        text.includes('help')) {
      const result = { intent: 'welcome', params: {} };
      console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
      return result;
    }
    
    // If no specific intent is detected, return unknown
    const result = { intent: 'unknown', params: {} };
    console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
    return result;
  } catch (error) {
    console.error('Error in parseIntentAndParams:', error);
    return { intent: 'unknown', params: {} };
  }
}