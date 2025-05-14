import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { NextRequest } from 'next/server';
// Update the import to match the correct API
import { AgentKit } from '@coinbase/agentkit';

const SYSTEM_PROMPT = `
You're Albus, a smart AI onboarding agent for a web-based finance dashboard that tracks stablecoins and Nigerian bank accounts. Your job is to help users connect their wallet and bank in the simplest way possible.

Use this context:
- Users sign in using google, apple or passkey which also creates a smart wallet for them.
- Each user must have a smart wallet. If they don't, it should be automatically created using Thirdweb's embedded wallet SDK.
- Users also need to link their Nigerian bank account using Mono Connect.

Your goals:
- Welcome the user and explain that Albus tracks both on-chain and fiat money.
- Ensure they've logged in with email or Google.
- Check if their crypto wallet is connected. If not, offer to set it up instantly.
- Prompt the user to connect their bank account via Mono if they haven't already.
- Confirm when both wallet and bank are connected, and show them their dashboard.
- Provide financial insights by analyzing transaction patterns across both crypto and fiat accounts.
- Suggest budget improvements and highlight unusual transactions.

Be friendly, clear, and confident. Use short sentences and always offer a button or action to move forward, e.g. "Click 'Connect Wallet'" or "Tap 'Link My Bank'".

If they ask questions like "What is Mono?" or "Why do I need a wallet?", give simple, beginner-friendly explanations.
`;

export async function POST(req: NextRequest) {
  // Extract the messages and user context from the request
  const { messages, userContext } = await req.json();
  
  // Add user context to the system prompt
  const enhancedSystemPrompt = `${SYSTEM_PROMPT}\n\nCurrent user state:\n- User is ${userContext.isLoggedIn ? 'logged in' : 'not logged in'}.\n- User ${userContext.hasWallet ? 'has a connected wallet' : 'does not have a connected wallet'}.${userContext.walletAddress ? `\n- Wallet address: ${userContext.walletAddress}` : ''}\n- User ${userContext.hasBankConnected ? 'has connected their bank account' : 'has not connected their bank account yet'}.`;
  
  // Format messages for the model
  const formattedMessages = [
    { role: 'system', content: enhancedSystemPrompt },
    ...messages.map((message: any) => ({
      role: message.role,
      content: message.content,
    })),
  ];
  
  // Process the response with Coinbase Agent Kit if available
  if (userContext.agent && userContext.agent instanceof AgentKit) {
    try {
      // Use the agent directly with the Vercel AI SDK
      const agentKit = userContext.agent;
      
      // Process the messages with the agent
      const response = await agentKit.processMessages({
        messages: formattedMessages,
        walletData: userContext.walletData || {},
      });
      
      // Stream the response
      return streamText({
        model: google('gemini-pro'),
        messages: [...formattedMessages, { role: 'assistant', content: response }],
        temperature: 0.7,
      });
    } catch (error) {
      console.error('Error processing with Coinbase Agent Kit:', error);
      // Fall back to standard response
    }
  }
  
  // Fallback to standard response if agent is not available or there was an error
  return streamText({
    model: google('gemini-pro'),
    messages: formattedMessages,
    temperature: 0.7,
  });
}