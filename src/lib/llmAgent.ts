import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

const gemini = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase environment variables are missing: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY');
}
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MODEL = "gemini-2.0-flash";

export async function getUserContext(userId: string) {
  const { data } = await supabase
    .from("sessions")
    .select("context")
    .eq("user_id", userId)
    .single();
  return data?.context || [];
}

export async function setUserContext(userId: string, context: any[]) {
  await supabase
    .from("sessions")
    .upsert([{ user_id: userId, context, last_active: new Date().toISOString() }], { onConflict: "user_id" });
}

export async function runLLM({
  userId,
  message,
}: {
  userId: string;
  message: string;
}) {
  // 1. Get last N messages for context
  let context = await getUserContext(userId);

  // Defensive: ensure context is always an array for .filter
  if (!Array.isArray(context)) {
    context = context ? [context] : [];
  }

  // 2. Compose prompt in Gemini API format (no system role)
  const systemMessage = `
You are Hedwig, a helpful crypto assistant for WhatsApp.
Always respond ONLY with a JSON object in this format:
{"intent": "<intent_name>", "params": { ... }}

Valid intents:
- create_wallets: For creating new wallets
- get_wallet_balance: For checking wallet balance
- send: For sending crypto or tokens
- swap: For swapping between tokens
- bridge: For bridging tokens between chains
- export_keys: For exporting private keys
- get_price: For checking crypto prices
- get_news: For crypto news
- welcome: For greetings and help

Only use "clarification" intent if absolutely necessary when you cannot determine the user's intent.
For blockchain-related queries, try to match to the closest intent rather than asking for clarification.
If the user mentions blockchain, crypto, wallet, tokens, etc., assume they want to perform a blockchain action.

For unknown requests that are clearly not blockchain-related, use intent "unknown".
`;
  const prompt = [
    { role: "user", parts: [{ text: systemMessage }] },
    ...context
      .filter((msg: any) => msg.role !== 'system' && msg.content && typeof msg.content === 'string')
      .map((msg: any) => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      })),
    { role: "user", parts: [{ text: message }] }
  ];

  // 3. Call Gemini
  console.log(`[LLM] Attempting to generate content with Google Gemini model: ${MODEL}`);
  const model = gemini.getGenerativeModel({ model: MODEL });
  const result = await model.generateContent({
    contents: prompt,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1024,
    },
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ],
  });

  const llmResponse = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't process your request.";

  // 4. Update context
  const newContext = [
    ...context.slice(-8), // keep last 8
    { role: "user", content: message },
    { role: "assistant", content: llmResponse }
  ];
  await setUserContext(userId, newContext);

  return llmResponse;
} 