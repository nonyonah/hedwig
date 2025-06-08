
import { getLangChainTools } from '@coinbase/agentkit-langchain';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from '@langchain/langgraph/prebuilt';

/**
 * LangChain Agent Setup
 * Creates a LangChain agent with AgentKit tools
 * @param agentKit - An initialized AgentKit instance
 */
export async function getLangChainAgent(agentKit: any) {
  const tools = await getLangChainTools(agentKit);
  const llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    temperature: 0.7,
  });
  // Optionally, you can define a prompt here if you want to customize system instructions
  // Otherwise, createReactAgent will use the model's defaults
  const agent = createReactAgent({
    llm,
    tools,
    // prompt: ChatPromptTemplate.fromMessages([...]) // Uncomment if you want to use a custom prompt
  });
  return agent;
}
