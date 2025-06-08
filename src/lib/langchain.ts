// IMPORTANT: Ensure that @coinbase/agentkit is deduped in node_modules to avoid type errors.
// If you get a type error about AgentKit, run `npm dedupe` or use a package manager resolution/override.
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { getLangChainTools } from '@coinbase/agentkit-langchain';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { AgentKit } from '@coinbase/agentkit';

/**
 * LangChain Agent Setup
 * Creates a LangChain agent with AgentKit tools
 * @param agentKit - An initialized AgentKit instance
 */
export async function getLangChainAgent(agentKit: AgentKit) {
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
