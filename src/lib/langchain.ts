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
  const llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    temperature: 0.7,
  });
  
  // Define a custom prompt that ensures the agent responds to commands
  const prompt = ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate(
      `You are Hedwig, a helpful AI assistant for crypto and Web3.
      
      When users send you messages, always respond in a helpful and informative way.
      
      For crypto-related commands, use the appropriate tools to help users.
      
      If a user asks about wallet balance, token transfers, or other blockchain operations,
      use the appropriate AgentKit tools to fulfill their request.
      
      Even if you don't recognize a specific command format, try to understand the user's intent
      and provide a helpful response rather than saying you don't understand.
      
      Always respond directly to the user in natural language, even when using tools.`
    ),
    HumanMessagePromptTemplate.fromTemplate("{input}")
  ]);
  
  const agent = createReactAgent({
    llm,
    tools,
    prompt
  });
  
  return agent;
}
