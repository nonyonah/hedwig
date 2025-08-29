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
         text.includes('guide') || text.includes('would like to') || text.includes('want to') ||
         text.includes('template') || text.includes('crypto template'))) {
      const result = { intent: 'instruction_send', params: {} };
      console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
      return result;
    }
    
    // Confirm send keywords - for transaction confirmations
    if (text.includes('confirm send') || 
        (text.includes('confirm') && text.includes('transfer')) ||
        (text.includes('confirm') && text.includes('transaction'))) {
      const result = { intent: 'send', params: { action: 'confirm_send' } };
      console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
      return result;
    }
    
    // Actual send transaction keywords - if the user is actually trying to send
    if ((text.includes('send') || text.includes('transfer')) && 
        (text.includes('crypto') || text.includes('token') || text.includes('eth') || 
         text.includes('sol') || text.includes('usdc') || text.includes('usdt') ||
         text.includes('btc') || text.includes('matic') || text.includes('avax') ||
         /\d+\s*(eth|sol|usdc|usdt|btc|matic|avax|bnb|ada|dot|link|uni)/i.test(text) ||
         /send\s+\d+/i.test(text) || /transfer\s+\d+/i.test(text))) {
      const result = { intent: 'send', params: {} };
      console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
      return result;
    }
    
    // More general send patterns
    if (text.includes('send') && 
        (text.includes('to') || text.includes('address') || /@/.test(text) || 
         /0x[a-fA-F0-9]{40}/.test(text) || /[a-zA-Z0-9]{32,44}/.test(text))) {
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
    
    // Payment link keywords - comprehensive detection without requiring emojis
    if (text.includes('payment link') || 
        text.includes('create payment link') || 
        text.includes('generate payment link') ||
        text.includes('payment request') || 
        text.includes('request payment') ||
        text.includes('send me a payment link') || 
        text.includes('i need a payment link') ||
        text.includes('request money') || 
        text.includes('ask for payment') ||
        (text.includes('create') && text.includes('payment') && text.includes('link')) ||
        (text.includes('make') && text.includes('payment') && text.includes('link')) ||
        (text.includes('generate') && text.includes('payment') && text.includes('request'))) {
      const result = { intent: 'create_payment_link', params: {} };
      console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
      return result;
    }
    
    // Invoice keywords - comprehensive detection without requiring emojis
     if (text.includes('invoice') || 
         text.includes('create invoice') || 
         text.includes('generate invoice') || 
         text.includes('send invoice') ||
         text.includes('bill someone') || 
         text.includes('billing') || 
         text.includes('create bill') ||
         text.includes('professional invoice') || 
         text.includes('invoice with pdf') ||
         text.includes('invoice for services') || 
         text.includes('invoice for project') ||
         text.includes('detailed invoice') || 
         text.includes('itemized invoice') ||
         (text.includes('create') && text.includes('invoice')) ||
         (text.includes('make') && text.includes('invoice')) ||
         (text.includes('generate') && text.includes('bill'))) {
       const result = { intent: 'create_invoice', params: {} };
       console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
       return result;
     }
     
     // Proposal keywords - comprehensive detection without requiring emojis
      if (text.includes('proposal') || 
          text.includes('create proposal') || 
          text.includes('generate proposal') || 
          text.includes('draft proposal') ||
          text.includes('project proposal') || 
          text.includes('proposal for') || 
          text.includes('need a proposal') ||
          text.includes('quote') || 
          text.includes('estimate') || 
          text.includes('project quote') || 
          text.includes('service quote') ||
          text.includes('proposal for web development') || 
          text.includes('mobile app proposal') || 
          text.includes('design proposal') ||
          (text.includes('create') && text.includes('proposal')) ||
          (text.includes('make') && text.includes('proposal')) ||
          (text.includes('generate') && text.includes('quote'))) {
        const result = { intent: 'create_proposal', params: {} };
        console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
        return result;
      }
      
      // Earnings keywords - comprehensive detection without requiring emojis
      if (text.includes('earnings') || 
          text.includes('how much have i earned') || 
          text.includes('money received') || 
          text.includes('income') ||
          text.includes('payments received') || 
          text.includes('what did i receive') || 
          text.includes('how much did i get') ||
          text.includes('earnings summary') || 
          text.includes('earnings report') || 
          text.includes('payment history') ||
          text.includes('how much money came in') || 
          text.includes('received payments') || 
          text.includes('incoming payments') ||
          (text.includes('how much') && text.includes('earned')) ||
          (text.includes('money') && text.includes('received'))) {
        const result = { intent: 'get_earnings', params: {} };
        console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
        return result;
      }
      
      // Spending keywords - comprehensive detection without requiring emojis
      if (text.includes('spending') || 
          text.includes('how much have i spent') || 
          text.includes('money sent') || 
          text.includes('payments made') ||
          text.includes('what did i spend') || 
          text.includes('how much did i pay') || 
          text.includes('outgoing payments') ||
          text.includes('spending summary') || 
          text.includes('spending report') || 
          text.includes('payment history sent') ||
          text.includes('how much money went out') || 
          text.includes('sent payments') || 
          text.includes('transactions sent') ||
          (text.includes('how much') && text.includes('spent')) ||
          (text.includes('money') && text.includes('sent'))) {
        const result = { intent: 'get_spending', params: {} };
        console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
        return result;
      }
      
      // Manual reminder keywords - comprehensive detection with parameter extraction
      if (text.includes('remind') || 
          text.includes('reminder') || 
          text.includes('nudge') || 
          text.includes('follow up') ||
          text.includes('chase') || 
          text.includes('contact client') || 
          text.includes('send reminder') ||
          text.includes('manual reminder') || 
          text.includes('remind client') || 
          text.includes('payment reminder') ||
          (text.includes('remind') && text.includes('client')) ||
          (text.includes('send') && text.includes('reminder'))) {
        
        const params: any = {};
        
        // Extract target type and ID patterns
        const paymentLinkMatch = text.match(/payment\s*link\s*(\w+)/i) || text.match(/link\s*(\w+)/i);
        const invoiceMatch = text.match(/invoice\s*(\w+)/i);
        const idMatch = text.match(/\b([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\b/i);
        
        if (paymentLinkMatch) {
          params.targetType = 'payment_link';
          params.targetId = paymentLinkMatch[1];
        } else if (invoiceMatch) {
          params.targetType = 'invoice';
          params.targetId = invoiceMatch[1];
        } else if (idMatch) {
          // If we find a UUID but no specific type, we'll let the function determine the type
          params.targetId = idMatch[1];
        }
        
        // Extract custom message if provided
        const messageMatch = text.match(/(?:message|say|tell them|with message)[\s:]+["']?([^"']+)["']?/i);
        if (messageMatch) {
          params.customMessage = messageMatch[1].trim();
        }
        
        // Extract client email if mentioned
        const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (emailMatch) {
          params.clientEmail = emailMatch[1];
        }
        
        const result = { intent: 'send_reminder', params };
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
    
    // Offramp keywords - comprehensive detection for cash out functionality
    if (text.includes('offramp') || 
        text.includes('cash out') || 
        text.includes('withdraw to bank') ||
        text.includes('convert to fiat') || 
        text.includes('sell crypto') ||
        text.includes('withdraw money') || 
        text.includes('send to bank') ||
        text.includes('bank transfer') || 
        text.includes('fiat withdrawal') ||
        text.includes('convert to cash') || 
        text.includes('withdraw funds') ||
        (text.includes('withdraw') && (text.includes('bank') || text.includes('fiat') || text.includes('cash'))) ||
        (text.includes('convert') && (text.includes('bank') || text.includes('fiat') || text.includes('cash'))) ||
        (text.includes('send') && text.includes('bank account')) ||
        text.includes('cash withdrawal') || 
        text.includes('money withdrawal')) {
      const result = { intent: 'offramp', params: {} };
      console.log('[intentParser] Detected intent:', result.intent, 'Params:', result.params);
      return result;
    }
    
    // KYC keywords - for KYC verification process
    if (text.includes('kyc') || 
        text.includes('verify identity') || 
        text.includes('identity verification') ||
        text.includes('complete verification') || 
        text.includes('verify account') ||
        text.includes('verification process') || 
        text.includes('identity check') ||
        (text.includes('verify') && text.includes('identity')) ||
        (text.includes('complete') && text.includes('verification'))) {
      const result = { intent: 'kyc_verification', params: {} };
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