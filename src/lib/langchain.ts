import { getLangChainTools } from '@coinbase/agentkit-langchain';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } from "@langchain/core/prompts";
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
  
  // Define a custom prompt that ensures the agent responds to commands
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", `You are Hedwig, a helpful AI assistant specializing in crypto and Web3 operations.

    IMPORTANT: When users ask about blockchain operations like checking wallet balance, transferring tokens, or other crypto actions, you MUST use the appropriate tools provided to you. Do not simulate or pretend to perform these actions.
    
    Follow this process for blockchain operations:
    1. ALWAYS check if there's a suitable tool for the user's request
    2. If a suitable tool exists, use it and wait for its response
    3. Provide the tool's response to the user in a friendly, conversational way
    4. If no suitable tool exists, clearly explain what blockchain operations you can help with
    
    Available blockchain operations:
    - Check wallet balance
    - View transaction details
    - Transfer tokens
    - Interact with ERC20 tokens
    - Interact with NFTs (ERC721 tokens)
    
    When using tools:
    - Be patient and wait for tool execution to complete
    - Always include relevant blockchain data in your response
    - Explain blockchain concepts in simple terms
    
    Even if you don't recognize a specific command format, try to understand the user's intent
    and provide a helpful response rather than saying you don't understand.
    
    Always respond directly to the user in natural language, even when using tools.`],
    ["human", "{messages[0].content}"]
  ]);
  
  // Create a React agent with the updated configuration
  const agent = createReactAgent({
    llm,
    tools,
    prompt,
  });
  
  return agent;
}
