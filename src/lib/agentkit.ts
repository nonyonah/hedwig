export async function swapTokens(fromToken: string, toToken: string, amount: string) {
  try {
    const result = `Swapped ${amount} ${fromToken} to ${toToken}`;
    return result;
  } catch (error) {
    console.error('Error swapping tokens with AgentKit:', error);
    throw error;
  }
}
