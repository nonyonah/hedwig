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
    
    // Balance check keywords
    if (text.includes('balance') || 
        text.includes('how much') && (text.includes('have') || text.includes('own')) ||
        text.includes('check wallet')) {
      return { intent: 'get_wallet_balance', params: {} };
    }
    
    // Send transaction keywords
    if ((text.includes('send') || text.includes('transfer')) && 
        (text.includes('crypto') || text.includes('token') || text.includes('eth') || 
         text.includes('sol') || text.includes('usdc'))) {
      return { intent: 'send', params: {} };
    }
    
    // Swap keywords
    if (text.includes('swap') || 
        (text.includes('exchange') && (text.includes('token') || text.includes('crypto'))) ||
        text.includes('convert')) {
      return { intent: 'swap', params: {} };
    }
    
    // Bridge keywords
    if (text.includes('bridge') || 
        text.includes('cross chain') || 
        text.includes('move between chains')) {
      return { intent: 'bridge', params: {} };
    }
    
    // Export keys keywords
    if (text.includes('export') || 
        text.includes('private key') || 
        text.includes('seed phrase') ||
        text.includes('recovery phrase') ||
        text.includes('backup')) {
      return { intent: 'export_keys', params: {} };
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