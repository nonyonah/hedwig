import { StreamingTextResponse, Message as VercelMessage } from 'ai';
import { OpenRouter } from '@ai-sdk/openrouter';
import { AgentKit } from '@coinbase/agentkit';
import { getLangChainTools } from '@coinbase/agentkit-langchain';
import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent, createOpenAIFunctionsAgent } from 'langchain/agents';
import { formatToOpenAIFunction } from 'langchain/tools';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { MemorySaver } from '@coinbase/agentkit-langchain';

// Initialize OpenRouter model
const openRouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY || '',
  model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3-opus',
});

// Configure AgentKit
const configureAgentKit = async (walletAddress?: string) => {
  try {
    const agentKit = await AgentKit.from({
      cdpApiKeyName: process.env.CDP_API_KEY_NAME,
      cdpApiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY,
      networkId: process.env.NETWORK_ID || 'base-sepolia',
    });

    return agentKit;
  } catch (error) {
    console.error('Error configuring AgentKit:', error);
    throw error;
  }
};

// Initialize Langchain agent with AgentKit tools
const initializeAgent = async (walletAddress?: string) => {
  try {
    const agentKit = await configureAgentKit(walletAddress);
    
    // Create LangChain model
    const llm = new ChatOpenAI({
      model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3-opus',
      openAIApiKey: process.env.OPENROUTER_API_KEY || '',
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          'X-Title': 'Albus',
        },
      },
    });

    // Get AgentKit tools
    const agentKitTools = await getLangChainTools(agentKit);
    
    // Add payment link creation tool
    const createPaymentLinkTool = {
      name: 'create_payment_link',
      description: 'Create a payment link for a specific amount and currency',
      schema: {
        type: 'object',
        properties: {
          amount: {
            type: 'string',
            description: 'The amount to be paid',
          },
          currency: {
            type: 'string',
            description: 'The currency for the payment (e.g., ETH, USDC)',
          },
          description: {
            type: 'string',
            description: 'A description for the payment',
          },
        },
        required: ['amount', 'currency'],
      },
      func: async ({ amount, currency, description }: { amount: string; currency: string; description?: string }) => {
        // Generate a unique payment ID
        const paymentId = `payment_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
        
        // In a real implementation, you would store this in a database
        const paymentLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/pay/${paymentId}?amount=${amount}&currency=${currency}${description ? `&description=${encodeURIComponent(description)}` : ''}`;
        
        return {
          paymentId,
          paymentLink,
          amount,
          currency,
          description: description || '',
        };
      },
    };
    
    // Combine all tools
    const tools = [...agentKitTools, createPaymentLinkTool];
    
    // Store conversation history in memory
    const memory = new MemorySaver();
    
    // Create React Agent
    const agent = createReactAgent({
      llm,
      tools,
      checkpointSaver: memory,
      messageModifier: "You are Albus, a helpful crypto assistant that can interact with blockchain networks using AgentKit. You can help users with wallet operations, token swaps, and creating payment links. Always be concise and helpful.",
    });
    
    return { agent, tools };
  } catch (error) {
    console.error('Error initializing agent:', error);
    throw error;
  }
};

export async function POST(req: Request) {
  try {
    const { messages, walletAddress } = await req.json();
    
    // Initialize agent with the user's wallet address
    const { agent } = await initializeAgent(walletAddress);
    
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
    
    // Create a streaming response using the agent
    const result = await agent.stream({
      messages: formattedMessages,
    });
    
    // Convert the stream to a format compatible with Vercel AI SDK
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of result) {
          if (chunk.content) {
            controller.enqueue(new TextEncoder().encode(chunk.content));
          }
        }
        controller.close();
      },
    });
    
    return new StreamingTextResponse(stream);
  } catch (error) {
    console.error('Error in chat API:', error);
    return new Response(JSON.stringify({ error: 'Failed to process chat' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
} 