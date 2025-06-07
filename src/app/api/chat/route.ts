import { Message as VercelMessage } from 'ai';
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentKit } from '@coinbase/agentkit';
import { getLangChainTools } from '@coinbase/agentkit-langchain';
import { createReactAgent, createAgentExecutor } from '@langchain/langgraph/prebuilt';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { NextResponse } from 'next/server'; // Fallback for streaming responses

const model = new ChatGoogleGenerativeAI({
  model: "gemini-2.0-flash",
  
});



// Configure AgentKit
const configureAgentKit = async () => {
  try {
    const agentKit = await AgentKit.from({
      cdpApiKeyName: process.env.CDP_API_KEY_NAME,
      cdpApiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY,
    });
    return agentKit;
  } catch (error) {
    console.error('Error configuring AgentKit:', error);
    throw error;
  }
};

// Initialize Langchain agent with AgentKit tools
const initializeAgent = async () => {
  try {
    // 1. Configure AgentKit
    const agentKit = await configureAgentKit();

    // 2. Get AgentKit tools for LangChain
    const agentKitTools = await getLangChainTools(agentKit);

    // Use only the tools from AgentKit
    const tools = agentKitTools;

    // 4. Create the prompt
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", "You are Albus, a helpful crypto assistant that can interact with blockchain networks using AgentKit. You can help users with wallet operations and token swaps. Always be concise and helpful."],
      ["placeholder", "{chat_history}"],
      ["human", "{input}"],
      ["placeholder", "{agent_scratchpad}"],
    ]);

    // 5. Create the agent using LangGraph
    const agent = createReactAgent({
      llm: model,
      tools: tools as any, // Cast to any to resolve type mismatch
      prompt,
    });

    // Create the agent executor
    const agentExecutor = await createAgentExecutor({
      agentRunnable: agent,
      tools: tools as any, // Cast to any to resolve type mismatch
      // verbose: true, // Uncomment for debugging
    });

    return { agentExecutor };
  } catch (error) {
    console.error('Error initializing agent:', error);
    throw error;
  }
};

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    
    // Initialize agent executor
    const { agentExecutor } = await initializeAgent();
    
    // Convert messages to the format expected by LangChain
    const formattedMessages = messages.map((message: VercelMessage) => {
      if (message.role === 'user') {
        return new HumanMessage(message.content);
      } else if (message.role === 'assistant') {
        return new AIMessage(message.content);
      } else if (message.role === 'system') {
        return new SystemMessage(message.content);
      }
      return new HumanMessage(message.content);
    });
    
    // Get the last user message
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'user') {
      return new Response(JSON.stringify({ error: 'Last message must be from user' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Prepare input for the agent
    const lastMessageContent = lastMessage.content as string;
    const chatHistory = formattedMessages.slice(0, -1);

    // Create a streaming response using the agent executor
    const streamResult = await agentExecutor.stream({
      input: lastMessageContent,
      chat_history: chatHistory,
    });

    // Convert the stream to a format compatible with Vercel AI SDK
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        for await (const chunk of streamResult) {
          // Handle different chunk structures from the agent executor
          if (chunk && 'output' in chunk && typeof chunk.output === 'string') {
            controller.enqueue(encoder.encode(chunk.output));
          } else if (chunk && typeof chunk === 'object' && 'messages' in chunk && Array.isArray(chunk.messages)) {
            // Handle chunk with messages array
            const message = chunk.messages[0];
            if (message && 'content' in message && typeof message.content === 'string') {
              controller.enqueue(encoder.encode(message.content));
            }
          } else if (typeof chunk === 'string') {
            // Handle string chunks directly
            controller.enqueue(encoder.encode(chunk));
          }
        }
        controller.close();
      },
    });

    // Use StreamingTextResponse if available, otherwise fallback to NextResponse
    // return new StreamingTextResponse(stream);
    return new NextResponse(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (error) {
    console.error('Error in chat API:', error);
    return new Response(JSON.stringify({ error: 'Failed to process chat' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
} 