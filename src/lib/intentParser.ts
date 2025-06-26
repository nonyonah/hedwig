export function parseIntentAndParams(llmResponse: string): { intent: string, params: Record<string, any> } {
  // First try to parse JSON response from LLM
  try {
    // Look for JSON object in the response
    const match = llmResponse.match(/{.*}/s);
    if (match) {
      try {
        const obj = JSON.parse(match[0]);
        if (obj.intent && typeof obj.intent === 'string') {
          return { 
            intent: obj.intent, 
            params: obj.params || {} 
          };
        }
      } catch (e) {
        console.error('Error parsing JSON from LLM response:', e);
      }
    }
    
    // If JSON parsing fails, use keyword-based intent detection
    const text = llmResponse.toLowerCase();
    
    // Wallet creation keywords
    if (text.includes('create wallet') || 
        text.includes('new wallet') || 
        text.includes('make wallet') ||
        text.includes('setup wallet') ||
        (text.includes('wallet') && text.includes('create'))) {
      return { intent: 'create_wallets', params: {} };
    }
    
    // Wallet address keywords - make this check more prominent
    if (text.includes('wallet address') || 
        text.includes('my address') || 
        text.includes('show address') || 
        text.includes('view address') ||
        text.includes('what is my address') ||
        text.includes('what are my addresses') ||
        text.includes('what are my wallet addresses') ||
        text.includes('address') && text.includes('wallet') ||
        text.includes('show me my') && text.includes('address') ||
        text.includes('deposit') && !text.includes('how') ||
        text.includes('receive') && text.includes('crypto')) {
      console.log('Intent parser detected wallet address request');
      return { intent: 'instruction_deposit', params: {} };
    }
    
    // Balance check keywords
    if (text.includes('balance') || 
        text.includes('how much') && (text.includes('have') || text.includes('own')) ||
        text.includes('check wallet')) {
      return { intent: 'get_wallet_balance', params: {} };
    }
    
    // Export keys keywords - make this more specific to avoid false positives
    if ((text.includes('export') && text.includes('key')) || 
        text.includes('private key') || 
        text.includes('seed phrase') ||
        text.includes('recovery phrase') ||
        text.includes('backup') && text.includes('key')) {
      return { intent: 'export_keys', params: {} };
    }
    
    // Swap instruction keywords
    if ((text.includes('swap') || text.includes('exchange') || text.includes('convert')) &&
        (text.includes('help') || text.includes('how') || text.includes('instruct') || 
         text.includes('guide') || text.includes('would like to') || text.includes('want to'))) {
      return { intent: 'instruction_swap', params: {} };
    }
    
    // Bridge instruction keywords
    if ((text.includes('bridge') || text.includes('transfer between chains') || 
        text.includes('move between chains') || text.includes('cross chain')) &&
        (text.includes('help') || text.includes('how') || text.includes('instruct') || 
         text.includes('guide') || text.includes('would like to') || text.includes('want to'))) {
      return { intent: 'instruction_bridge', params: {} };
    }
    
    // Send/withdraw instruction keywords
    if ((text.includes('send') || text.includes('withdraw') || text.includes('transfer')) &&
        (text.includes('help') || text.includes('how') || text.includes('instruct') || 
         text.includes('guide') || text.includes('would like to') || text.includes('want to'))) {
      return { intent: 'instruction_send', params: {} };
    }
    
    // Actual send transaction keywords - if the user is actually trying to send
    if ((text.includes('send') || text.includes('transfer')) && 
        (text.includes('crypto') || text.includes('token') || text.includes('eth') || 
         text.includes('sol') || text.includes('usdc'))) {
      return { intent: 'send', params: {} };
    }
    
    // Actual swap keywords - if the user is actually trying to swap
    if (text.includes('swap') || 
        (text.includes('exchange') && (text.includes('token') || text.includes('crypto'))) ||
        text.includes('convert')) {
      return { intent: 'swap', params: {} };
    }
    
    // Actual bridge keywords - if the user is actually trying to bridge
    if (text.includes('bridge') || 
        text.includes('cross chain') || 
        text.includes('move between chains')) {
      return { intent: 'bridge', params: {} };
    }
    
    // Price check keywords
    if (text.includes('price') || 
        text.includes('how much is') || 
        text.includes('worth')) {
      return { intent: 'get_price', params: {} };
    }
    
    // News keywords
    if (text.includes('news') || 
        text.includes('latest') || 
        text.includes('updates')) {
      return { intent: 'get_news', params: {} };
    }
    
    // Welcome/help keywords
    if (text.includes('hello') || 
        text.includes('hi') || 
        text.includes('hey') || 
        text.includes('start') || 
        text.includes('help')) {
      return { intent: 'welcome', params: {} };
    }
    
    // If no specific intent is detected, return unknown
    return { intent: 'unknown', params: {} };
  } catch (error) {
    console.error('Error in parseIntentAndParams:', error);
    return { intent: 'unknown', params: {} };
  }
} 