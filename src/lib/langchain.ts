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
  console.log(`[LangChain] Available AgentKit tools: ${tools.length}`, 
    tools.map(tool => ({ name: tool.name, description: tool.description })));
  
  // Check if Google API key is available
  const googleApiKey = process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY || 
                      process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  
  if (!googleApiKey) {
    console.error("[LangChain] Missing Google API key for ChatGoogleGenerativeAI");
    
    // Return a simplified version that responds to basic queries
    return {
      invoke: async ({ messages }: { messages: any[] }) => {
        const userMessage = messages[messages.length - 1].content;
        console.log("[LangChain] No API key - using fallback for message:", userMessage);
        
        // Simple response logic for common queries
        let response = "I'm sorry, I can't process your request right now. Please try again later.";
        
        const lowercaseMessage = typeof userMessage === 'string' ? userMessage.toLowerCase() : '';
        
        if (lowercaseMessage.includes('hello') || lowercaseMessage.includes('hi ') || lowercaseMessage === 'hi') {
          response = "Hello! I'm Hedwig, your crypto assistant. How can I help you today?";
        } else if (lowercaseMessage.includes('how are you')) {
          response = "I'm doing well, thank you for asking! How can I assist you with crypto today?";
        } else if (lowercaseMessage.includes('your name')) {
          response = "I'm Hedwig, your friendly crypto and blockchain assistant. How can I help you today?";
        } else if (lowercaseMessage.includes('thank')) {
          response = "You're welcome! Is there anything else I can help you with?";
        } else if (lowercaseMessage.includes('bye') || lowercaseMessage.includes('goodbye')) {
          response = "Goodbye! Feel free to message me anytime you need assistance with crypto.";
        } else {
          response = "I'm here to help with crypto and blockchain questions. Would you like to learn about creating a wallet, checking balances, or sending crypto?";
        }
        
        return {
          messages: [{ content: response }]
        };
      }
    };
  }
  
  console.log(`[LangChain] Using Google API key: ${googleApiKey.substring(0, 5)}...`);
  
  try {
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
        `You are Albus, a helpful AI assistant specializing in crypto and Web3 operations. You maintain context throughout conversations and remember what users have asked about before.

        IMPORTANT CONVERSATION GUIDELINES:
        1. Maintain context between messages - refer back to previous messages when relevant
        2. Remember user preferences and past interactions
        3. Be friendly and conversational, using natural language
        4. When users ask follow-up questions, understand they're referring to previous context
        5. ALWAYS respond to basic greetings like "hello", "hi", "how are you" in a friendly way
        6. When asked about your name, respond that you are Hedwig, a crypto and blockchain assistant

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
        
        WALLET DETECTION:
        - If the user message contains [User has a wallet], NEVER suggest creating a wallet
        - If the user message contains [BLOCKCHAIN QUERY WITH WALLET], the user already has a wallet - use blockchain tools directly
        - If the user message contains [BLOCKCHAIN QUERY WITHOUT WALLET], the user doesn't have a wallet yet - suggest creating one
        - NEVER ask users who already have a wallet to create another wallet
        - If you see wallet address information in the conversation, the user already has a wallet
        
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
        - If a user already has a wallet (indicated by [User has a wallet] or [BLOCKCHAIN QUERY WITH WALLET]), NEVER suggest creating one
        
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
        - Always respond directly to the user in natural language, even when using tools
        - NEVER say you're having trouble understanding a request - always provide a helpful response`
      ),
      new MessagesPlaceholder("messages")
    ]);
    
    // Create a React agent with the updated configuration
    const agent = createReactAgent({
      llm,
      tools,
      prompt,
    });
    
    console.log('[LangChain] Agent created successfully');
    
    // Wrap the agent to add error handling
    return {
      invoke: async (params: any) => {
        try {
          console.log('[LangChain] Invoking agent with:', 
            params.messages[params.messages.length - 1].content);
          const result = await agent.invoke(params);
          console.log('[LangChain] Agent response successful');
          return result;
        } catch (error) {
          console.error('[LangChain] Error invoking agent:', error);
          
          // Provide a fallback response
          return {
            messages: [
              { 
                content: "I'm here to help with crypto and blockchain questions. Would you like to learn about creating a wallet, checking balances, or sending crypto?"
              }
            ]
          };
        }
      }
    };
  } catch (error) {
    console.error('[LangChain] Error setting up agent:', error);
    
    // Return a simplified fallback agent
    return {
      invoke: async ({ messages }: { messages: any[] }) => {
        const userMessage = messages[messages.length - 1].content;
        console.log("[LangChain] Using emergency fallback for message:", userMessage);
        
        return {
          messages: [
            { 
              content: "I'm here to help with crypto and blockchain questions. Would you like to learn about creating a wallet, checking balances, or sending crypto?"
            }
          ]
        };
      }
    };
  }
}
