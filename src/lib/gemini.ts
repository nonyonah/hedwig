import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

// Initialize the Google provider
// The API key is automatically read from the GOOGLE_GENERATIVE_AI_API_KEY environment variable
// If you want to keep using GEMINI_API_KEY, you'll need to create a custom provider
const model = google('gemini-2.0-flash');

// Process prompts with Gemini
export async function processPrompt(prompt: string, context?: string) {
  try {
    const { text } = await generateText({
      model,
      prompt: context ? `${context}\n${prompt}` : prompt,
    });
    
    return text;
  } catch (error) {
    console.error('Error processing prompt with Gemini:', error);
    throw error;
  }
}

// Generate invoice from prompt
export async function generateInvoiceFromPrompt(userId: string, clientId: string, prompt: string) {
  const context = `You are an AI assistant helping to generate an invoice. 
  Create a detailed invoice based on the following prompt. 
  Include service description, amount, and payment terms.`;
  
  try {
    const result = await processPrompt(prompt, context);
    
    // Parse the result to create an invoice object
    // This is a simplified version - you might want to use more structured prompting
    const invoice = {
      id: `inv-${Date.now()}`,
      userId,
      clientId,
      description: result,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    
    // Here you would typically save this to your database
    // For now, we'll just return the invoice object
    return invoice;
  } catch (error) {
    console.error('Error generating invoice:', error);
    throw error;
  }
}

// Check payment status with Gemini
export async function checkPaymentStatus(invoiceId: string, details: string) {
  const context = `You are an AI assistant helping to check payment status. 
  Analyze the following payment details and determine if the payment is pending, processing, or completed.`;
  
  try {
    const result = await processPrompt(details, context);
    return result;
  } catch (error) {
    console.error('Error checking payment status:', error);
    throw error;
  }
}

// Swap token recommendation with Gemini
export async function getSwapRecommendation(tokenA: string, tokenB: string, amount: string) {
  const context = `You are an AI assistant helping with token swaps. 
  Provide a recommendation for swapping tokens based on current market conditions.`;
  
  try {
    const prompt = `I want to swap ${amount} ${tokenA} for ${tokenB}. What's your recommendation?`;
    const result = await processPrompt(prompt, context);
    return result;
  } catch (error) {
    console.error('Error getting swap recommendation:', error);
    throw error;
  }
}

// Wallet balance analysis with Gemini
export async function analyzeWalletBalance(balance: string, chain: string) {
  const context = `You are an AI assistant helping to analyze wallet balances. 
  Provide insights on the following wallet balance.`;
  
  try {
    const prompt = `I have ${balance} on ${chain}. What can you tell me about my balance?`;
    const result = await processPrompt(prompt, context);
    return result;
  } catch (error) {
    console.error('Error analyzing wallet balance:', error);
    throw error;
  }
}