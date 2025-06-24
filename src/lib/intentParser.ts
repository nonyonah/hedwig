export function parseIntentAndParams(llmResponse: string): { intent: string, params: Record<string, any> } {
  // Simple regex or JSON parse (improve as needed)
  try {
    // If LLM outputs JSON, parse it
    const match = llmResponse.match(/{.*}/s);
    if (match) {
      const obj = JSON.parse(match[0]);
      return { intent: obj.intent, params: obj.params || {} };
    }
    // Fallback: keyword-based
    if (llmResponse.toLowerCase().includes('balance')) return { intent: 'get_balance', params: {} };
    if (llmResponse.toLowerCase().includes('wallet')) return { intent: 'create_wallet', params: {} };
    if (llmResponse.toLowerCase().includes('send')) return { intent: 'send', params: {} };
    if (llmResponse.toLowerCase().includes('swap')) return { intent: 'swap', params: {} };
    if (llmResponse.toLowerCase().includes('price')) return { intent: 'get_price', params: {} };
    if (llmResponse.toLowerCase().includes('news')) return { intent: 'get_news', params: {} };
    return { intent: 'unknown', params: {} };
  } catch {
    return { intent: 'unknown', params: {} };
  }
} 