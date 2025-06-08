// Example integration file: demonstrates how to use AgentKit, LangChain, and Wallet logic together
import { getAgentKit } from './agentkit';
import { getOrCreateWallet } from './wallet';
import { getLangChainAgent } from './langchain';

/**
 * Example function to initialize all systems and return a LangChain agent with a wallet
 */
export async function setupFullAgent(userId: string, address?: string) {
  // 1. Get or create wallet provider
  const wallet = await getOrCreateWallet(userId, address);
  // 2. Get AgentKit instance
  const agentKit = await getAgentKit();
  // 3. Create LangChain agent with AgentKit
  const langchainAgent = await getLangChainAgent(agentKit);
  return { wallet, agentKit, langchainAgent };
}
