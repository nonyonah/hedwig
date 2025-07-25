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
You are Hedwig, a helpful crypto assistant for Telegram.
Always respond ONLY with a JSON object in this format:
{"intent": "<intent_name>", "params": { ... }}

Valid intents:
- create_wallets: For creating new wallets
- get_wallet_balance: For checking wallet balance
- get_wallet_address: For showing wallet addresses or deposit instructions
- send: For sending crypto or tokens
- swap: For swapping between tokens
- bridge: For bridging tokens between chains
- export_keys: For exporting private keys
- get_price: For currency conversion, exchange rates, and crypto prices
- get_news: For crypto news
- create_payment_link: For creating payment links or payment requests
- create_invoice: For creating professional invoices with PDF generation
- get_earnings: For checking earnings, income, money received, or payment history
- get_spending: For checking spending, money sent, or payment history
- create_proposal: For generating project proposals
- send_proposal: For sending proposals via email
- view_proposals: For viewing existing proposals
- edit_proposal: For editing existing proposals
- welcome: For greetings and help
- clarification: ONLY when you absolutely cannot determine intent and need specific information

IMPORTANT INTENT RECOGNITION RULES:

1. PAYMENT LINK REQUESTS: Always use "create_payment_link" intent for:
   - "payment link", "create payment link", "generate payment link"
   - "payment request", "request payment"
   - "send me a payment link", "I need a payment link"
   - "request money", "ask for payment"
   - Simple payment requests without detailed billing information

2. INVOICE REQUESTS: Always use "create_invoice" intent for:
   - "invoice", "create invoice", "generate invoice", "send invoice"
   - "bill someone", "billing", "create bill"
   - "professional invoice", "invoice with PDF"
   - "invoice for services", "invoice for project"
   - "detailed invoice", "itemized invoice"
   - Any request for formal invoicing with professional formatting

3. WALLET ADDRESS REQUESTS: Always use "get_wallet_address" intent for:
   - "wallet address", "my address", "show address", "view address"
   - "what is my address", "what are my addresses", "wallet addresses"
   - "deposit", "receive", "how to deposit", "where to send"
   - "show me my wallet", "wallet info", "address info"
   - Any request about viewing or getting wallet addresses

4. BALANCE REQUESTS: Always use "balance" intent for:
   - "balance", "how much", "check wallet", "wallet balance"
   - "what do I have", "my funds", "my tokens", "my crypto"
   - Chain-specific balance: "balance on Base", "USDC balance on Ethereum", "ETH on Base"
   - Token-specific balance: "USDC balance", "ETH balance", "SOL balance"
   - Network-specific balance: "Base balance", "Ethereum balance", "Solana balance"
   - Combined queries: "USDC balance on Base", "ETH on Ethereum", "SOL balance"

3a. PARAMETER EXTRACTION for "balance" intent:
   - token: Extract token symbol if specified (e.g., "USDC", "ETH", "SOL")
   - network: Extract network name if specified (e.g., "Base", "Ethereum", "Solana")
   - Examples:
     * "USDC balance on Base" → {"token": "USDC", "network": "Base"}
     * "ETH balance" → {"token": "ETH"}
     * "balance on Solana" → {"network": "Solana"}
     * "my Base balance" → {"network": "Base"}

4. PARAMETER EXTRACTION for "send" intent:
   - amount: Extract numerical value (e.g., "0.01", "5", "100")
   - token: Extract token symbol (e.g., "ETH", "USDC", "BTC")
   - recipient: Extract wallet address (0x...) or ENS name (.eth)
   - network: Extract network name (e.g., "Base", "Ethereum", "Polygon")

5. PARAMETER EXTRACTION for "create_payment_link" intent:
   - amount: Extract numerical value if specified
   - token: Extract token symbol if specified (e.g., "ETH", "USDC", "USDT") - defaults to "ETH"
   - network: Extract network name if specified (e.g., "Base", "Ethereum", "Polygon") - defaults to "base"
   - description/for: Extract payment description, reason, or purpose (e.g., "consulting services", "freelance work", "payment for goods")
   - recipient_email: Extract email address (REQUIRED)
   
   Context awareness for payment links:
   - Always require both amount and recipient_email
   - Look for keywords like "for", "because", "reason" to extract description
   - If description is missing, the system will prompt for it
   - Examples of good payment link requests:
     * "Create payment link for 0.1 ETH to user@example.com for consulting services"
     * "Make payment request of 50 USDC to client@company.com for freelance work"
     * "Generate payment link: 0.05 ETH to john@example.com for website design"

6. EARNINGS REQUESTS: Always use "get_earnings" intent for:
   - "earnings", "how much have I earned", "money received", "income"
   - "payments received", "what did I receive", "how much did I get"
   - "earnings summary", "earnings report", "payment history"
   - "how much money came in", "received payments", "incoming payments"
   - Time-based earnings: "earnings this week", "how much this month", "yearly earnings"
   - Token-specific earnings: "USDC earnings", "ETH received", "how much USDT earned"
   - Network-specific earnings: "earnings on Base", "Polygon earnings"

7. SPENDING REQUESTS: Always use "get_spending" intent for:
   - "spending", "how much have I spent", "money sent", "payments made"
   - "what did I spend", "how much did I pay", "outgoing payments"
   - "spending summary", "spending report", "payment history sent"
   - "how much money went out", "sent payments", "transactions sent"
   - Time-based spending: "spending this week", "spent this month", "yearly spending"
   - Token-specific spending: "USDC spent", "ETH sent", "how much USDT paid"
   - Network-specific spending: "spending on Base", "Polygon spending"

8. SPENDING REQUESTS: Always use "get_spending" intent for:
   - "spending", "how much have I spent", "money sent", "payments made"
   - "what did I spend", "how much did I pay", "outgoing payments"
   - "spending summary", "spending report", "payment history sent"
   - "how much money went out", "sent payments", "transactions sent"
   - Time-based spending: "spending this week", "spent this month", "yearly spending"
   - Token-specific spending: "USDC spent", "ETH sent", "how much USDT paid"
   - Network-specific spending: "spending on Base", "Polygon spending"

9. PROPOSAL REQUESTS: Always use "create_proposal" intent for:
   - "proposal", "create proposal", "generate proposal", "draft proposal"
   - "project proposal", "proposal for", "need a proposal"
   - "quote", "estimate", "project quote", "service quote"
   - "proposal for web development", "mobile app proposal", "design proposal"
   - Any request to create or generate a project proposal

10. SEND PROPOSAL REQUESTS: Always use "send_proposal" intent for:
    - "send proposal", "email proposal", "send proposal to client"
    - "deliver proposal", "share proposal", "forward proposal"
    - Must include proposal ID if specified (e.g., "send proposal 123")

11. VIEW PROPOSALS REQUESTS: Always use "view_proposals" intent for:
    - "view proposals", "show proposals", "list proposals", "my proposals"
    - "proposal history", "past proposals", "previous proposals"
    - "proposal status", "check proposals"

12. EDIT PROPOSAL REQUESTS: Always use "edit_proposal" intent for:
    - "edit proposal", "modify proposal", "update proposal", "change proposal"
    - "revise proposal", "proposal changes", "update proposal details"
    - Must include proposal ID if specified (e.g., "edit proposal 123")

13. PARAMETER EXTRACTION for "create_proposal" intent:
    - service_type: Extract service type (web development, mobile app, design, consulting)
    - client_name: Extract client or company name
    - client_email: Extract email address
    - budget: Extract numerical budget value
    - currency: Extract currency (USD, EUR, GBP, etc.)
    - timeline: Extract timeline (days, weeks, months)
    - features: Extract specific features or requirements
    - project_title: Extract project title if mentioned
    - description: Extract project description

14. PARAMETER EXTRACTION for "create_invoice" intent:
    - client_name: Extract client or company name
    - client_email: Extract email address if provided
    - amount: Extract total invoice amount
    - currency: Extract currency (USD, EUR, GBP, etc.)
    - description: Extract service description or invoice details
    - due_date: Extract due date if mentioned
    - invoice_number: Extract invoice number if specified
    - items: Extract itemized list if provided

15. PARAMETER EXTRACTION for "send_proposal" intent:
    - proposal_id: Extract proposal ID if specified
    - client_email: Extract email address if different from stored

16. PARAMETER EXTRACTION for "edit_proposal" intent:
    - proposal_id: Extract proposal ID (required)
    - field: Extract which field to edit (budget, timeline, client_name, etc.)
    - value: Extract new value for the field

17. PARAMETER EXTRACTION for earnings/spending intents:
    - timeframe: Extract time periods (e.g., "this week", "last month", "this year", "last 7 days")
    - token: Extract token symbol if specified (e.g., "USDC", "ETH", "USDT")
    - network: Extract network name if specified (e.g., "Base", "Polygon", "Ethereum")
    - startDate/endDate: Extract specific dates if mentioned

18. CONTEXT AWARENESS: Look at conversation history to find missing parameters:
   - If recipient address was mentioned in previous messages, include it
   - If amount was specified earlier, carry it forward
   - If token type was discussed, maintain consistency

19. ADDRESS RECOGNITION: Recognize these as recipient addresses:
   - Ethereum addresses: 0x followed by 40 hexadecimal characters
   - ENS names: ending with .eth
   - Shortened addresses: 0x...abc (when context suggests it's an address)
   - Extract addresses from text like "here's my address: 0x123..." or "send to 0x123..."
   - Clean up addresses by removing extra spaces, quotes, or surrounding text

20. AMOUNT EXTRACTION: Extract amounts from phrases like:
   - "send 0.01 ETH"
   - "transfer 100 USDC"
   - "move 5 tokens"
   - "payment link for 50 USDC"
   - "invoice for $100"

21. When user provides an address after being asked, ALWAYS include it in the send parameters.

22. CURRENCY CONVERSION: FEATURE DISABLED
    // Always use "get_price" intent for:
    // - "exchange rate", "convert", "conversion", "how much is X in Y"
    // - "value of X in Y", "X to Y", "price of X in Y"
    // - "what is 100 USD in NGN", "convert 0.1 ETH to USD"
    // - "exchange rate from USD to NGN", "BTC to Naira"
    // - Both crypto and fiat currencies (BTC, ETH, USD, NGN, EUR, etc.)
    // NOTE: Currency conversion feature has been disabled.

23. PARAMETER EXTRACTION for "get_price" intent: FEATURE DISABLED
    // - from_currency: Source currency (e.g., "USD", "BTC", "ETH")
    // - to_currency: Target currency (e.g., "NGN", "EUR", "USD")
    // - amount: Amount to convert (default to 1 if not specified)
    // - original_message: Always include the full original message for parsing
    // NOTE: Currency conversion feature has been disabled.

EXAMPLES:
User: "send 0.01 ETH to 0x1234567890123456789012345678901234567890"
Response: {"intent": "send", "params": {"amount": "0.01", "token": "ETH", "recipient": "0x1234567890123456789012345678901234567890"}}

User: "create payment link for 100 USDC"
Response: {"intent": "create_payment_link", "params": {"amount": "100", "token": "USDC"}}

User: "payment link" or "I need a payment link"
Response: {"intent": "create_payment_link", "params": {}}

User: "wallet address" or "my address" or "show address"
Response: {"intent": "get_wallet_address", "params": {}}

User: "balance" or "how much do I have"
Response: {"intent": "balance", "parameters": {}}

User: "USDC balance on Base"
Response: {"intent": "balance", "parameters": {"token": "USDC", "network": "Base"}}

User: "ETH balance"
Response: {"intent": "balance", "parameters": {"token": "ETH"}}

User: "my Solana balance"
Response: {"intent": "balance", "parameters": {"network": "Solana"}}

User: "How much USDC do I have on Ethereum?"
Response: {"intent": "balance", "parameters": {"token": "USDC", "network": "Ethereum"}}

User: "How much have I earned this month?"
Response: {"intent": "get_earnings", "parameters": {"timeframe": "this month"}}

User: "Show me my USDC earnings on Base"
Response: {"intent": "get_earnings", "parameters": {"token": "USDC", "network": "Base"}}

User: "What did I spend last week?"
Response: {"intent": "get_spending", "parameters": {"timeframe": "last week"}}

User: "How much ETH did I send this year?"
Response: {"intent": "get_spending", "parameters": {"token": "ETH", "timeframe": "this year"}}

User: "0x1234567890123456789012345678901234567890" (after being asked for address)
Response: {"intent": "send", "params": {"recipient": "0x1234567890123456789012345678901234567890"}}

User: "create proposal for web development project for ABC Corp, $5000 budget"
Response: {"intent": "create_proposal", "params": {"service_type": "web development", "client_name": "ABC Corp", "budget": "5000", "currency": "USD"}}

User: "draft proposal for mobile app, client XYZ Inc, 3 month timeline"
Response: {"intent": "create_proposal", "params": {"service_type": "mobile app", "client_name": "XYZ Inc", "timeline": "3 months"}}

User: "need proposal for logo design, budget around $500, 2 week timeline"
Response: {"intent": "create_proposal", "params": {"service_type": "design", "budget": "500", "currency": "USD", "timeline": "2 weeks"}}

User: "create invoice for ABC Corp, $2500 for web development"
Response: {"intent": "create_invoice", "params": {"client_name": "ABC Corp", "amount": "2500", "currency": "USD", "description": "web development"}}

User: "invoice for consulting services, $150/hour, 10 hours"
Response: {"intent": "create_invoice", "params": {"description": "consulting services", "amount": "1500", "currency": "USD"}}

User: "bill client XYZ for logo design, $800, due in 30 days"
Response: {"intent": "create_invoice", "params": {"client_name": "XYZ", "amount": "800", "currency": "USD", "description": "logo design", "due_date": "30 days"}}

User: "send proposal 123 to client@company.com"
Response: {"intent": "send_proposal", "params": {"proposal_id": "123", "client_email": "client@company.com"}}

User: "show my proposals"
Response: {"intent": "view_proposals", "params": {}}

User: "edit proposal 456 budget to $3000"
Response: {"intent": "edit_proposal", "params": {"proposal_id": "456", "field": "budget", "value": "3000"}}

User: "What is the exchange rate from USD to NGN?"
Response: {"intent": "get_price", "params": {"original_message": "What is the exchange rate from USD to NGN?"}}

User: "Convert 300 USD to NGN"
Response: {"intent": "get_price", "params": {"original_message": "Convert 300 USD to NGN"}}

User: "How much is 0.1 ETH in USD?"
Response: {"intent": "get_price", "params": {"original_message": "How much is 0.1 ETH in USD?"}}

User: "What's the value of 1 BTC in Naira?"
Response: {"intent": "get_price", "params": {"original_message": "What's the value of 1 BTC in Naira?"}}

User: "price of ETH"
Response: {"intent": "get_price", "params": {"original_message": "price of ETH"}}

AVOID CLARIFICATION: Only use "clarification" intent if you absolutely cannot determine the user's intent and need specific information that cannot be inferred from context.
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