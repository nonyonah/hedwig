import { getLangChainTools } from '@coinbase/agentkit-langchain';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatPromptTemplate, MessagesPlaceholder, SystemMessagePromptTemplate } from "@langchain/core/prompts";
import { loadServerEnvironment } from './serverEnv';

// Ensure environment variables are loaded
loadServerEnvironment();

/**
 * LangChain Agent Setup
 * Creates a LangChain agent with AgentKit tools
 * @param agentKit - An initialized AgentKit instance
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getLangChainAgent(agentKit: any) {
  const tools = await getLangChainTools(agentKit);
  
  // Log available tools to help with debugging
  console.log(`Available AgentKit tools: ${tools.length}`, 
    tools.map(tool => ({ name: tool.name, description: tool.description })));
  
  // Check if Google API key is available
  const googleApiKey = process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
  
  if (!googleApiKey) {
    console.error("Missing GOOGLE_API_KEY environment variable for ChatGoogleGenerativeAI");
    
    if (process.env.NODE_ENV === 'development') {
      console.warn("In development mode: Using a fallback text response mechanism");
      
      // Return a simplified version that just echoes the message
      return {
        invoke: async ({ messages }: { messages: any[] }) => {
          const userMessage = messages[messages.length - 1].content;
          console.log("[DEVELOPMENT] Received message:", userMessage);
          return {
            messages: [
              { 
                content: "I'm running in development mode without API keys. To use AI features, " +
                  "please set the GOOGLE_API_KEY environment variable. For now, I'll just acknowledge your message: " + 
                  userMessage
              }
            ]
          };
        }
      };
    }
    
    throw new Error("Please set an API key for Google GenerativeAI in the environment variable GOOGLE_API_KEY");
  }
  
  // Use a lower temperature for more deterministic responses
  const llm = new ChatGoogleGenerativeAI({
    apiKey: googleApiKey,
    model: "gemini-2.0-flash",
    temperature: 0.2, // Reduced from 0.7 to make responses more focused and deterministic
    maxOutputTokens: 2048, // Ensure we have enough tokens for detailed responses
  });
  
  // Define a custom prompt that ensures the agent responds to commands with context awareness
  const prompt = ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate(
      `You are Hedwig, a helpful AI assistant specializing in crypto and Web3 operations. You maintain context throughout conversations and remember what users have asked about before.

      IMPORTANT CONVERSATION GUIDELINES:
      1. Maintain context between messages - refer back to previous messages when relevant
      2. Remember user preferences and past interactions
      3. Be friendly and conversational, using natural language
      4. When users ask follow-up questions, understand they're referring to previous context

      BLOCKCHAIN OPERATIONS GUIDELINES:
      When users ask about blockchain operations like checking wallet balance, transferring tokens, or other crypto actions:
      
      1. ALWAYS check if there's a suitable tool for the user's request
      2. If tools can't be used (e.g., user doesn't have a wallet):
         - Explain what the tool would do if they had a wallet
         - Suggest creating a wallet with '/wallet create'
         - Provide educational information about the requested operation
      3. If a suitable tool exists and can be used, use it and wait for its response
      4. After a blockchain operation, ALWAYS request a WhatsApp template to show the result with interactive buttons
      5. Provide the tool's response to the user in a friendly, conversational way
      6. If no suitable tool exists, clearly explain what blockchain operations you can help with
      
      WHATSAPP TEMPLATE INSTRUCTIONS:
      For important blockchain operations, recommend using WhatsApp templates with interactive buttons:
      - After a transaction is sent, recommend a template with a "View Transaction" button
      - When showing wallet balances, recommend a template with "Send" and "Receive" buttons
      - For token information, recommend a template with "View on Explorer" button
      
      NOTIFICATION SCENARIOS:
      After these operations, suggest sending a notification with appropriate templates:
      1. When a user receives funds (recommend template with "View Transaction" button)
      2. When a transaction is confirmed (recommend template with "View Transaction" button)
      3. When there are price alerts for tokens user holds (recommend template with "View Price" button)

      AVAILABLE BLOCKCHAIN OPERATIONS:
      - Check wallet balance
      - View transaction details
      - Transfer tokens
      - Interact with ERC20 tokens
      - Interact with NFTs (ERC721 tokens)
      - Request testnet funds from faucet (special operation)
      
      WALLET CREATION:
      - If a user needs to perform blockchain operations but doesn't have a wallet, guide them to use '/wallet create' command
      - Explain that the wallet will be used for all future blockchain operations
      - NEVER suggest creating multiple wallets - one wallet per user is the intended design
      
      TESTNET FUNDS REQUEST:
      When a user asks for testnet funds, use a dedicated tool to request funds from the Base Sepolia faucet.
      Explain the following to users:
      1. Testnet funds are only for testing purposes, not real value
      2. There are daily limits on testnet fund requests
      3. After requesting funds, it may take a few minutes to arrive
      
      GENERAL GUIDANCE:
      - Always provide relevant blockchain data in your responses
      - Explain blockchain concepts in simple terms
      - Understand user intent even if their command format isn't precise
      - Keep responses concise but informative
      - Always respond directly to the user in natural language, even when using tools`
    ),
    new MessagesPlaceholder("messages")
  ]);
  
  // Create a React agent with the updated configuration
  const agent = createReactAgent({
    llm,
    tools,
    prompt,
  });
  
  return agent;
}
