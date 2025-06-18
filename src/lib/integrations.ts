// Example integration file: demonstrates how to use AgentKit, LangChain, and Wallet logic together
import { getAgentKit } from './agentkit';
import { getOrCreateWallet } from './wallet';
import { getLangChainAgent } from './langchain';

/**
 * Example function to initialize all systems and return a LangChain agent with a wallet
 */
export async function setupFullAgent(userId: string) {
  // 1. Get or create wallet provider
  const walletResult = await getOrCreateWallet(userId);
  // 2. Get AgentKit instance with the user ID to ensure wallet is registered
  const agentKit = await getAgentKit(userId);
  // 3. Create LangChain agent with AgentKit
  const langchainAgent = await getLangChainAgent(agentKit);
  return { wallet: walletResult.provider, agentKit, langchainAgent };
}
