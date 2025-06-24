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
  const context = await getUserContext(userId);

  // 2. Compose prompt in Gemini API format (no system role)
  const systemMessage = `
You are Hedwig, a helpful crypto assistant for WhatsApp.
Always respond ONLY with a JSON object in this format:
{"intent": "<intent_name>", "params": { ... }}
Valid intents: create_wallet, get_balance, send, swap, get_price, get_news, etc.
If you need more info, set intent to "clarification" and ask a clarifying question in params.message.
`;
  const prompt = [
    { role: "user", parts: [{ text: systemMessage }] },
    ...context.map((msg: any) => ({
      role: msg.role,
      parts: [{ text: msg.content }]
    })),
    { role: "user", parts: [{ text: message }] }
  ];

  // 3. Call Gemini
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