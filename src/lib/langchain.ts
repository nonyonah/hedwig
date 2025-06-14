import { getLangChainTools } from '@coinbase/agentkit-langchain';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } from "@langchain/core/prompts";

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
  
  // Use a lower temperature for more deterministic responses
  const llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    temperature: 0.2, // Reduced from 0.7 to make responses more focused and deterministic
    maxOutputTokens: 2048, // Ensure we have enough tokens for detailed responses
  });
  
  // Define a custom prompt that ensures the agent responds to commands
  const prompt = ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate(
      `You are Hedwig, a helpful AI assistant specializing in crypto and Web3 operations.

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
      
      Always respond directly to the user in natural language, even when using tools.`
    ),
    HumanMessagePromptTemplate.fromTemplate("{input}")
  ]);
  
  // Create a React agent with the updated configuration
  const agent = createReactAgent({
    llm,
    tools,
    prompt,
  });
  
  return agent;
}
