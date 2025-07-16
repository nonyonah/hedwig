import { getRequiredEnvVar } from "@/lib/envUtils";
import { loadServerEnvironment } from "./serverEnv";
import { v4 as uuidv4 } from "uuid";
import fetch from "node-fetch";
import { textTemplate, txPending, sendTokenPrompt, sendFailed } from "./whatsappTemplates";
import { runLLM } from "./llmAgent";
import { createWallet } from "./cdp";
import { noWalletYet, walletCreated } from "./whatsappTemplates";
import { parseIntentAndParams } from "./intentParser";
import { handleAction } from "../api/actions";

// Helper function to extract and clean Ethereum addresses from text
function extractEthereumAddress(text: string): string | null {
  if (!text) return null;
  
  // Remove extra whitespace and convert to lowercase for processing
  const cleanText = text.trim();
  
  // Look for Ethereum addresses (0x followed by 40 hex characters)
  const ethAddressRegex = /0x[a-fA-F0-9]{40}/g;
  const matches = cleanText.match(ethAddressRegex);
  
  if (matches && matches.length > 0) {
    return matches[0]; // Return the first valid address found
  }
  
  // Look for ENS names
  const ensRegex = /\b[a-zA-Z0-9-]+\.eth\b/g;
  const ensMatches = cleanText.match(ensRegex);
  
  if (ensMatches && ensMatches.length > 0) {
    return ensMatches[0]; // Return the first ENS name found
  }
  
  return null;
}
import { createClient } from "@supabase/supabase-js";
import { toE164 } from "@/lib/phoneFormat";

// Extend the global object to include our message cache
declare global {
  var processedMessages: Record<string, number>;
}

// Initialize the global message cache if it doesn't exist
if (typeof global.processedMessages === "undefined") {
  global.processedMessages = {};
}

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
);

// Ensure environment variables are loaded
loadServerEnvironment();

interface WhatsAppTemplateMessage {
  to: string;
  template: {
    name: string;
    language: {
      code: string;
    };
    components?: Array<{
      type: string;
      parameters?: Array<{
        type: string;
        text?: string;
        image?: {
          link?: string;
        };
      }>;
    }>;
  };
}

/**
 * Sends a text message via WhatsApp
 */
interface WhatsAppMessageResponse {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

/**
 * Sends a text message via WhatsApp (template or string)
 */
export async function sendWhatsAppMessage(
  to: string,
  message: string | { text: string },
): Promise<WhatsAppMessageResponse> {
  try {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    
    // Check if we have valid credentials before attempting to send
    if (
      !accessToken ||
      accessToken.includes("dev-") ||
      accessToken === "EAABBC"
    ) {
      console.warn(
        `[WhatsApp] Missing valid WhatsApp access token. Message to ${to} will not be sent.`,
      );
      if (process.env.NODE_ENV === "development") {
        console.log(
          `[DEV MODE] Would have sent WhatsApp message to ${to}:`,
          message,
        );
        return {
          messaging_product: "whatsapp",
          contacts: [{ input: to, wa_id: to }],
          messages: [{ id: `mock-${Date.now()}` }],
        };
      }
      throw new Error("Missing valid WhatsApp access token");
    }
    if (!phoneNumberId || phoneNumberId.includes("dev-")) {
      console.warn(
        `[WhatsApp] Missing valid WhatsApp phone number ID. Message to ${to} will not be sent.`,
      );
      if (process.env.NODE_ENV === "development") {
        console.log(
          `[DEV MODE] Would have sent WhatsApp message to ${to} using phone ID: ${phoneNumberId}`,
        );
        return {
          messaging_product: "whatsapp",
          contacts: [{ input: to, wa_id: to }],
          messages: [{ id: `mock-${Date.now()}` }],
        };
      }
      throw new Error("Missing valid WhatsApp phone number ID");
    }
    console.log(
      `Sending WhatsApp message to ${to} using phone number ID: ${phoneNumberId}`,
    );
    const text = typeof message === "string" ? message : message.text;
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: {
            body: text || "No wallet found. Please create one.",
            preview_url: false,
          },
        }),
      },
    );
    if (!response.ok) {
      const errorData = await response.text();
      console.error(
        "Error sending WhatsApp message:",
        response.status,
        errorData,
      );
      throw new Error(`Failed to send WhatsApp message: ${errorData}`);
    }
    const result = await response.json();
    console.log("WhatsApp message sent successfully to:", to);
    return result;
  } catch (err) {
    console.error("Exception in sendWhatsAppMessage:", err);
    if (process.env.NODE_ENV === "development") {
      console.warn("[DEV MODE] Providing mock WhatsApp response due to error");
      return {
        messaging_product: "whatsapp",
        contacts: [{ input: to, wa_id: to }],
        messages: [{ id: `error-mock-${Date.now()}` }],
      };
    }
    throw err;
  }
}

/**
 * Sends an image via WhatsApp
 */
export async function sendWhatsAppImage(
  to: string,
  imageUrl: string,
  caption: string = "",
): Promise<WhatsAppMessageResponse> {
  try {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "image",
          image: {
            link: imageUrl,
            caption: caption || "",
          },
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error(
        "Error sending WhatsApp image:",
        response.status,
        errorData,
      );
      throw new Error(`Failed to send WhatsApp image: ${errorData}`);
    }
    
    return await response.json();
  } catch (err) {
    console.error("Exception in sendWhatsAppImage:", err);
    throw err;
  }
}

/**
 * Sends a template message via WhatsApp
 */
export async function sendWhatsAppTemplateMessage(
  message: WhatsAppTemplateMessage,
): Promise<WhatsAppMessageResponse> {
  try {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: message.to,
          type: "template",
          template: message.template,
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error(
        "Error sending WhatsApp template message:",
        response.status,
        errorData,
      );
      throw new Error(`Failed to send WhatsApp template message: ${errorData}`);
    }
    
    return await response.json();
  } catch (err) {
    console.error("Exception in sendWhatsAppTemplateMessage:", err);
    throw err;
  }
}

/**
 * Sends a list message with interactive buttons
 */
interface WhatsAppListSection {
  title: string;
  rows: Array<{
    id: string;
    title: string;
    description?: string;
  }>;
}

export async function sendWhatsAppListMessage(
  to: string, 
  header: string, 
  body: string, 
  buttonText: string, 
  sections: WhatsAppListSection[],
): Promise<WhatsAppMessageResponse> {
  try {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "interactive",
          interactive: {
            type: "list",
            header: {
              type: "text",
              text: header,
            },
            body: {
              text: body,
            },
            action: {
              button: buttonText,
              sections,
            },
          },
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error(
        "Error sending WhatsApp list message:",
        response.status,
        errorData,
      );
      throw new Error(`Failed to send WhatsApp list message: ${errorData}`);
    }
    
    return await response.json();
  } catch (err) {
    console.error("Exception in sendWhatsAppListMessage:", err);
    throw err;
  }
}

/**
 * Sends a reply button message
 */
interface WhatsAppButton {
  id: string;
  title: string;
}

export async function sendWhatsAppReplyButtons(
  to: string,
  body: string,
  buttons: WhatsAppButton[],
): Promise<WhatsAppMessageResponse> {
  try {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "interactive",
          interactive: {
            type: "button",
            body: {
              text: body,
            },
            action: {
              buttons: buttons.map((button) => ({
                type: "reply",
                reply: {
                  id: button.id,
                  title: button.title,
                },
              })),
            },
          },
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error(
        "Error sending WhatsApp reply buttons:",
        response.status,
        errorData,
      );
      throw new Error(`Failed to send WhatsApp reply buttons: ${errorData}`);
    }
    
    return await response.json();
  } catch (err) {
    console.error("Exception in sendWhatsAppReplyButtons:", err);
    throw err;
  }
}

/**
 * Validates a WhatsApp phone number format
 */
export function validatePhoneNumber(phoneNumber: string): boolean {
  // Basic validation - should be in format 1234567890 or +1234567890
  return /^\+?[1-9]\d{1,14}$/.test(phoneNumber);
}

/**
 * Formats a phone number to E.164 format
 */
export function formatPhoneNumber(phoneNumber: string): string {
  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, "");
  
  // If it starts with a country code, add +
  if (digits.length > 10) {
    return `+${digits}`;
  }
  
  // Default to US country code if no country code provided
  return `+1${digits}`;
}

// Update the existing sanitizeWhatsAppParam function
export function sanitizeWhatsAppParam(text: string): string {
  if (!text) return "";

  return String(text)
    .replace(/[\n\r\t]/g, " ") // Replace newlines and tabs with spaces
    .replace(/ {5,}/g, "    ") // Replace 5+ consecutive spaces with 4 spaces
    .trim(); // Trim leading/trailing whitespace
}

// Add this function to clean WhatsApp template components
export function cleanWhatsAppTemplate(template: any) {
  if (!template) return template;

  // Create a deep copy to avoid modifying the original
  const cleanTemplate = JSON.parse(JSON.stringify(template));

  // Clean components if they exist
  if (cleanTemplate.components) {
    cleanTemplate.components = cleanTemplate.components.map(
      (component: any) => {
        // Clean parameters if they exist
        if (component.parameters) {
          component.parameters = component.parameters.map((param: any) => {
            if (param.type === 'text' && param.text) {
              param.text = sanitizeWhatsAppParam(param.text);
            }
            // Do not remove the 'name' property, as it's required for named templates.
            return param;
          });
        }
        return component;
      },
    );
  }

  return cleanTemplate;
}

// Before sending a WhatsApp template, sanitize and validate parameters
function sanitizeTemplateParams(template: any): any {
  if (!template || !template.components) return template;
  for (const component of template.components) {
    if (component.parameters) {
      component.parameters = component.parameters.filter((param: any) => {
        if (!param.text || param.text.trim() === "") {
          console.error("[WhatsApp] Skipping empty template parameter:", param);
          return false;
        }
        return true;
      });
    }
  }
  return template;
}

// Patch sendWhatsAppTemplate to always name the error parameter 'reason' for send_failed template
function patchSendFailedTemplate(template: any): any {
  if (template && template.name === "send_failed" && template.components) {
    for (const component of template.components) {
      if (component.parameters) {
        component.parameters = component.parameters.map((param: any) => {
          if (
            param.type === "text" &&
            (!param.name || param.name !== "reason")
          ) {
            return { ...param, name: "reason" };
          }
          return param;
        });
      }
    }
  }
  return template;
}

// Update the sendWhatsAppTemplate function to use the cleanWhatsAppTemplate function
export async function sendWhatsAppTemplate(
  phoneNumber: string,
  template: any,
): Promise<any> {
  // Extra logging for debugging template sending
  if (template && template.name) {
    if (["send_token_prompt", "tx_pending", "tx_sent_success", "send_failed"].includes(template.name)) {
      console.log(`[sendWhatsAppTemplate] Sending template: ${template.name}`);
      console.log(`[sendWhatsAppTemplate] Template params:`, JSON.stringify(template, null, 2));
    }
  }
  try {
    if (!phoneNumber) {
      console.error("[sendWhatsAppTemplate] Error: phoneNumber is required");
      throw new Error("Phone number is required for sending WhatsApp template");
    }
    
    // Format phone number
    const formattedPhoneNumber = formatPhoneNumber(phoneNumber);
    console.log(`[sendWhatsAppTemplate] Formatted phone number: ${formattedPhoneNumber}`);
    
    // Clean the template before sending and ensure it has the 'to' field
    const cleanedTemplate = cleanWhatsAppTemplate(template);
    
    // Create the final message with the formatted phone number
    const message: WhatsAppTemplateMessage = {
      to: formattedPhoneNumber,
      template: cleanedTemplate
    };
    
    console.log(`[sendWhatsAppTemplate] Final message:`, JSON.stringify(message, null, 2));
    
    // Send the template message
    return await sendWhatsAppTemplateMessage(message);
  } catch (error) {
    console.error("Exception in sendWhatsAppTemplate:", error);
    throw error;
  }
}

// Handle incoming WhatsApp messages
export async function handleIncomingWhatsAppMessage(body: any) {
  console.log(
    "Received WhatsApp webhook payload:",
    JSON.stringify(body, null, 2),
  );

  // Parse the incoming WhatsApp message
  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;

  // Check if this is a message
  const message = value?.messages?.[0];

  // Check if this is a button click
  const interactive = message?.interactive;
  const buttonReply = interactive?.button_reply;

  // Get the sender - could be in different places depending on message type
  const from =
    message?.from ||
    value?.contacts?.[0]?.wa_id ||
    value?.metadata?.phone_number_id;

  // Extract profile name from WhatsApp contacts
  const profileName = value?.contacts?.[0]?.profile?.name;
  console.log(`Profile name from WhatsApp: ${profileName || "Not provided"}`);

  // No sender, no processing
  if (!from) {
    console.log(
      "No sender found in the message. Full payload:",
      JSON.stringify(body, null, 2),
    );
    return;
  }

  console.log(
    `Processing message from: ${from}${profileName ? ` (${profileName})` : ""}`,
  );

  // Detect duplicate messages using a simple timestamp-based approach
  // This helps prevent processing the same message twice
  const messageId =
    message?.id ||
    (interactive ? `interactive_${Date.now()}` : `unknown_${Date.now()}`);
  const timestamp = value?.timestamp || Date.now();

  // Use a static cache for simplicity (in production, use Redis or similar)
  if (!global.processedMessages) {
    global.processedMessages = {};
  }

  // Check if we've seen this message before
  if (messageId && global.processedMessages[messageId]) {
    console.log(`Skipping duplicate message ${messageId}`);
    return;
  }

  // Mark this message as processed
  if (messageId) {
    global.processedMessages[messageId] = timestamp;

    // Clean up old messages (keep last 100)
    const messageIds = Object.keys(global.processedMessages);
    if (messageIds.length > 100) {
      const oldestKeys = messageIds
        .sort(
          (a, b) => global.processedMessages[a] - global.processedMessages[b],
        )
        .slice(0, messageIds.length - 100);

      oldestKeys.forEach((key) => {
        delete global.processedMessages[key];
      });
    }
  }

  try {
    // Generate a proper UUID for the user based on the phone number
    // This ensures we have a valid UUID for database operations
    // Pass the profile name to store it with the user
        const userId = await getUserIdFromPhone(from, profileName);

    // Check if the user has a wallet
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('id, address')
      .eq('user_id', userId)
      .maybeSingle();

    if (walletError) {
      console.error(`[Wallet Check] Error fetching wallet for user ${userId}:`, walletError);
      await sendWhatsAppMessage(from, { text: "I'm having trouble accessing your wallet information right now. Please try again in a moment." });
      return; // Stop processing
    }

    // Handle wallet creation flow if the user has no wallet
    if (!wallet) {
      // First check if this is a message (not a status update)
      if (!value?.messages || !value.messages[0]) {
        // This is likely a status update, not a message - skip processing
        console.log("Received a status update or non-message webhook, skipping wallet creation flow");
        return;
      }
      
      const message = value.messages[0];
      // Check if the user clicked the 'Create Wallet' button
      if (message.type === 'interactive' && message.interactive.type === 'button_reply' && message.interactive.button_reply.id === 'create_wallets') {
        console.log(`[Wallet Creation] User ${userId} initiated wallet creation.`);
        await sendWhatsAppMessage(from, { text: "Got it! Creating your secure wallets now, this may take a moment..." });
        
        // Use handleAction to create both EVM and Solana wallets
        const actionResult = await handleAction("create_wallets", {}, userId);
        
        if (!actionResult) {
          console.error("No action result returned from create_wallets");
          await sendWhatsAppMessage(from, {
            text: "I couldn't create your wallets. Please try again.",
          });
          return;
        }

        if ("name" in actionResult) {
          await sendWhatsAppTemplate(from, actionResult);
        } else if (
          "text" in actionResult &&
          typeof actionResult.text === "string"
        ) {
          await sendWhatsAppMessage(from, { text: actionResult.text });
        } else {
          console.error(
            "Unknown action result format from create_wallets:",
            actionResult,
          );
          await sendWhatsAppMessage(from, {
            text: "I couldn't process your wallet creation properly.",
          });
        }
        return; // End processing after handling wallet creation
      } else {
        // If no wallet and not a creation request, prompt the user to create one.
        console.log(`[Wallet Check] User ${userId} has no wallet. Sending creation prompt with name: ${profileName || 'not provided'}`);
        await sendWhatsAppTemplate(from, noWalletYet(profileName));
        return; // Stop further processing
      }
    }

    // Handle button clicks
    if (buttonReply) {
      console.log("Button clicked:", buttonReply);
      const buttonId = buttonReply.id;

      // Handle specific button actions
      if (buttonId === "create_wallets") {
        console.log("Create wallets button clicked by:", from);
        const actionResult = await handleAction("create_wallets", {}, userId);

        if (!actionResult) {
          console.error("No action result returned from create_wallets");
          await sendWhatsAppMessage(from, {
            text: "I couldn't create your wallets. Please try again.",
          });
          return;
        }

        if ("name" in actionResult) {
          await sendWhatsAppTemplate(from, actionResult);
        } else if (
          "text" in actionResult &&
          typeof actionResult.text === "string"
        ) {
          await sendWhatsAppMessage(from, { text: actionResult.text });
        } else {
          console.error(
            "Unknown action result format from create_wallets:",
            actionResult,
          );
          await sendWhatsAppMessage(from, {
            text: "I couldn't process your wallet creation properly.",
          });
        }

        return;
      }

      // Handle send confirmation buttons
      if (
        buttonId === "confirm_send" ||
        buttonReply.title.toLowerCase() === "yes"
      ) {
        console.log("Send confirmation button clicked by:", from);
        // Show pending message
        await sendWhatsAppTemplate(from, txPending());
        // Get transaction details from the session
        const { data: session } = await supabase
          .from("sessions")
          .select("context")
          .eq("user_id", userId) // Use the correct Supabase ID for the session lookup
          .single();
        const pendingTx = session?.context?.find(
          (item: { role: string; content: string }) =>
            item.role === "system" &&
            JSON.parse(item.content)?.pending?.action === "send",
        );
        let txParams: any = {};
        if (pendingTx) {
          txParams = JSON.parse(pendingTx.content)?.pending || {};
        }

        // Critical fix: The txParams from the session might contain an old or incorrect userId.
        // We must always use the userId (Supabase UUID) fetched at the start of this function.
        if ('userId' in txParams) {
          delete txParams.userId;
        }
        // Execute the send transaction
        const actionResult = await handleAction(
          "send",
          { ...txParams, isExecute: true },
          userId, // Always use the correct Supabase UUID
        );
        // Clear the session context after execution
        await supabase.from("sessions").upsert(
          [
            {
              user_id: userId,
              context: [],
              updated_at: new Date().toISOString(),
            },
          ],
          { onConflict: "user_id" },
        );
        if (actionResult) {
          if (typeof actionResult === 'object' && actionResult !== null && 'pending' in actionResult && 'result' in actionResult) {
            await sendWhatsAppTemplate(from, actionResult.pending);
            await sendWhatsAppTemplate(from, actionResult.result);
          } else if ("name" in actionResult) {
            await sendWhatsAppTemplate(from, actionResult);
          } else if ("text" in actionResult) {
            await sendWhatsAppMessage(from, { text: actionResult.text });
          }
        }
        return;
      }

      if (buttonId === "cancel_send") {
        console.log("Send canceled by:", from);
        // Clear the session context
        await supabase.from("sessions").upsert(
          [
            {
              user_id: userId,
              context: [],
              updated_at: new Date().toISOString(),
            },
          ],
          { onConflict: "user_id" },
        );
        await sendWhatsAppMessage(from, {
          text: "Transaction canceled. Your funds have not been sent.",
        });
        return;
      }

      // For other buttons, we can handle them here
      // ...
    }

    // Handle text messages
    const text = message?.text?.body;
    if (text) {
      // Check if we're waiting for a name response
      const { data: nameSession } = await supabase
        .from("sessions")
        .select("context")
        .eq("user_id", userId)
        .single();

      // Defensive: ensure context is always an array for .find
      let contextArr = Array.isArray(nameSession?.context)
        ? nameSession.context
        : nameSession?.context
          ? [nameSession.context]
          : [];
      const waitingForName = contextArr.find(
        (item: any) =>
          item.role === "system" &&
          JSON.parse(item.content)?.waiting_for === "name",
      );

      if (waitingForName) {
        console.log(`Received name response from user ${userId}: ${text}`);

        // Update the user's name in the database
        await supabase.from("users").update({ name: text }).eq("id", userId);

        // Clear the waiting_for context
        await supabase.from("sessions").upsert(
          [
            {
              user_id: userId,
              context: [],
              updated_at: new Date().toISOString(),
            },
          ],
          { onConflict: "user_id" },
        );

        // Thank the user and continue with welcome flow
        await sendWhatsAppMessage(from, {
          text: `Thanks, ${text}! I'll remember your name. Now, how can I help you today?`,
        });

        return;
      }

      // Check for greetings before anything else
      const greetings = [
        "hi",
        "hello",
        "hey",
        "good morning",
        "good afternoon",
        "good evening",
      ];
      if (
        greetings.some((greet) => text.trim().toLowerCase().startsWith(greet))
      ) {
        await sendWhatsAppMessage(from, {
          text: "Hi! I'm Hedwig, your crypto assistant. I can help you create wallets, check balances, send, swap, and bridge tokens, and more. How can I help you today?",
        });
        return;
      }

      // Check if the user is asking about the bot's identity
      const lowerText = text.toLowerCase();
      if (
        lowerText.includes("who are you") ||
        lowerText.includes("what are you") ||
        lowerText.includes("what is your name") ||
        lowerText.includes("what do you do") ||
        (lowerText.includes("your") && lowerText.includes("name")) ||
        (lowerText.includes("what") && lowerText.includes("hedwig"))
      ) {
        await sendWhatsAppMessage(from, {
          text: "I'm Hedwig, your crypto assistant bot! I can help you manage your crypto wallets, send and receive tokens, swap between different cryptocurrencies, and bridge tokens between chains. Just let me know what you'd like to do!",
        });
        return;
      }

      // Use Gemini LLM (Hedwig) for response
      const llmResponse = await runLLM({ userId, message: text });
      console.log("LLM Response:", llmResponse);

      // Add detailed logging for intent detection
      console.log("User message:", text);

      const { intent, params } = parseIntentAndParams(llmResponse);
      console.log("Detected intent:", intent);
      console.log("Detected params:", params);

      // Normalize token field in params
      params.token = params.token || params.asset || params.symbol;
      
      // Enhanced address extraction as fallback if LLM didn't extract it
      if (intent === 'send' && !params.recipient) {
        const extractedAddress = extractEthereumAddress(text);
        if (extractedAddress) {
          params.recipient = extractedAddress;
          console.log('Extracted address from text:', extractedAddress);
        }
      }
      
      // Enhanced context preservation for send transactions
      if (intent === 'send' && (!params.amount || !params.recipient)) {
        // Store partial transaction data in session for context preservation
        const partialTxData = {
          action: 'send',
          ...params, // Include any parameters we did extract
          timestamp: new Date().toISOString()
        };
        
        await supabase.from('sessions').upsert([
          {
            user_id: userId,
            context: [{
              role: 'system',
              content: JSON.stringify({ pending: partialTxData })
            }],
            updated_at: new Date().toISOString()
          }
        ], { onConflict: 'user_id' });
        
        console.log('Stored partial transaction data:', partialTxData);
      }
      
      // Check for pending action in session
      const { data: session } = await supabase
        .from("sessions")
        .select("context")
        .eq("user_id", userId)
        .single();
      let pending = null;
      if (session?.context) {
        const contextArr = Array.isArray(session.context) ? session.context : [session.context];
        pending = contextArr.find(
          (item: any) =>
            item.role === "system" && JSON.parse(item.content)?.pending,
        );
      }
      
      // Add debug logging
      console.log("Session context:", session?.context);
      console.log("User text:", text);
      
      // Intercept 'yes' for send confirmation if pending send flow is ready
      if (pending) {
        const pendingObj = JSON.parse(pending.content).pending;
        console.log("Found pending context:", pendingObj);
        
        // First check if this is a simple yes/confirm response to a pending transaction
        if (
          pendingObj?.action === "send" &&
          (text.trim().toLowerCase() === "yes" ||
           text.trim().toLowerCase() === "confirm" ||
           text.trim().toLowerCase() === "send" ||
           text.trim().toLowerCase() === "go ahead" ||
           text.trim().toLowerCase() === "proceed" ||
           text.trim().toLowerCase().includes("confirm"))
        ) {
          console.log("Detected confirmation response for pending transaction");
          
          // Validate that we have all required fields in the pending object
          if (
            pendingObj.token &&
            pendingObj.amount &&
            pendingObj.recipient &&
            (pendingObj.network || pendingObj.chain)
          ) {
            console.log("All required fields present in pending transaction");
            
            // Show tx_pending message first
            console.log("Sending tx_pending template");
            await sendWhatsAppTemplate(from, txPending());
            
            // Prepare the execution parameters
            const txParams = {
              token: pendingObj.token,
              amount: pendingObj.amount,
              recipient: pendingObj.recipient,
              network: pendingObj.network || pendingObj.chain,
              isExecute: true // Mark as execution
            };
            
            console.log("Executing transaction with params:", txParams);
            
            try {
              // Execute the send transaction
              const actionResult = await handleAction(
                "send",
                txParams,
                userId
              );
              
              // Log the action result
              console.log("Send transaction result:", actionResult);
              
              // Clear pending context after execution
              await supabase.from("sessions").upsert(
                [
                  {
                    user_id: userId,
                    context: [],
                    updated_at: new Date().toISOString(),
                  },
                ],
                { onConflict: "user_id" }
              );
              
              // Display the result to the user
              if (actionResult) {
                console.log("Sending transaction result template to user");
                if ("name" in actionResult) {
                  await sendWhatsAppTemplate(from, actionResult);
                } else if ("text" in actionResult) {
                  await sendWhatsAppMessage(from, { text: actionResult.text });
                } else {
                  // If we get an unexpected response format, provide a fallback
                  await sendWhatsAppMessage(from, { text: "Your transaction has been processed. Check your wallet for confirmation." });
                }
              }
              
              return;
            } catch (error) {
              console.error("Error executing transaction:", error);
              // Send error message to user
              await sendWhatsAppTemplate(from, sendFailed({ reason: "Failed to execute transaction. Please try again later." }));
              return;
            }
          } else {
            console.log("Missing required fields in pending transaction:", pendingObj);
            await sendWhatsAppMessage(from, { text: "Missing information for transaction. Please try sending again with all required details." });
            return;
          }
        }
        
        // Enhanced parameter merging with better context awareness
        // If user just provided an address (detected by LLM), merge it with pending data
        const mergedParams = { ...pendingObj, ...params }; // Pending first, then new params override
        mergedParams.token = mergedParams.token || mergedParams.asset || mergedParams.symbol;
        
        // Special handling for address-only responses
        const isAddressOnlyResponse = params.recipient && !params.amount && !params.token;
        if (isAddressOnlyResponse && pendingObj?.action === 'send') {
          console.log('Detected address-only response, merging with pending transaction');
          mergedParams.recipient = params.recipient;
        }
        
        const hasAll =
          mergedParams.token &&
          mergedParams.amount &&
          mergedParams.recipient &&
          (mergedParams.network || mergedParams.chain);
          
        console.log('Enhanced merged params:', mergedParams);
        console.log('Is address-only response:', isAddressOnlyResponse);
        console.log("Has all required fields:", hasAll);
        
        // Auto-proceed with transaction if we have all parameters after address input
        if (hasAll && isAddressOnlyResponse) {
          console.log('All parameters available after address input, showing confirmation prompt');
          
          // Update session with complete transaction data
          await supabase.from('sessions').upsert([
            {
              user_id: userId,
              context: [{
                role: 'system',
                content: JSON.stringify({ pending: mergedParams })
              }],
              updated_at: new Date().toISOString()
            }
          ], { onConflict: 'user_id' });
          
          // Show confirmation prompt instead of executing immediately
          const actionResult = await handleAction('send', mergedParams, userId);
          if (actionResult) {
            if ('name' in actionResult) {
              await sendWhatsAppTemplate(from, actionResult);
            } else if ('text' in actionResult) {
              await sendWhatsAppMessage(from, { text: actionResult.text });
            }
          }
          return;
        }
        if (
          hasAll &&
          (text.trim().toLowerCase() === "yes" ||
            text.trim().toLowerCase() === "confirm")
        ) {
          // Show tx_pending
          await sendWhatsAppTemplate(from, txPending());
          // Execute the send transaction
          const actionResult = await handleAction(
            "send",
            { ...mergedParams, isExecute: true },
            userId,
          );
          if (actionResult) {
            if (typeof actionResult === 'object' && actionResult !== null && 'pending' in actionResult && 'result' in actionResult) {
              await sendWhatsAppTemplate(from, actionResult.pending);
              await sendWhatsAppTemplate(from, actionResult.result);
            } else if ("name" in actionResult) {
              await sendWhatsAppTemplate(from, actionResult);
            } else if ("text" in actionResult) {
              await sendWhatsAppMessage(from, { text: actionResult.text });
            }
          }
          // Clear pending context
          await supabase.from("sessions").upsert(
            [
              {
                user_id: userId,
                context: [],
                updated_at: new Date().toISOString(),
              },
            ],
            { onConflict: "user_id" },
          );
          return;
        }
      }

      // Direct keyword detection for certain operations
      // This helps catch specific user requests even if LLM parsing fails

      // Check for deposit-related keywords
      if (
        lowerText.includes("deposit") ||
        lowerText.includes("receive") ||
        (lowerText.includes("wallet") && lowerText.includes("address"))
      ) {
        console.log("Deposit request detected, overriding intent");
        const actionResult = await handleAction(
          "instruction_deposit",
          {},
          userId,
        );
        console.log(
          "Action result for instruction_deposit:",
          JSON.stringify(actionResult, null, 2),
        );

        if (actionResult && "text" in actionResult) {
          await sendWhatsAppMessage(from, { text: actionResult.text });
          return;
        }
      }

      // Check for send-related keywords to provide guidance
      if (
        (lowerText.includes("send") || lowerText.includes("transfer")) &&
        (lowerText.includes("token") ||
          lowerText.includes("eth") ||
          lowerText.includes("sol") ||
          lowerText.includes("usdc") ||
          lowerText === "send" ||
          lowerText === "send tokens")
      ) {
        console.log("Send request detected, providing guidance");
        // If this is a generic send request, prompt for all fields with an example
        if (
          lowerText === "send" ||
          lowerText === "send tokens" ||
          lowerText === "i want to send tokens" ||
          lowerText === "i want to send"
        ) {
          await sendWhatsAppMessage(from, {
            text: 'Sure! What token would you like to send? For example: "Send 0.1 USDC to 0x123... on Base Sepolia"',
          });
          // Store pending context for send with all required fields as empty strings
          const pendingSend = {
            action: "send",
            token: "",
            amount: "",
            recipient: "",
            network: "",
          };
          console.log(
            "Writing pending send context for user:",
            userId,
            pendingSend,
          );
          await supabase.from("sessions").upsert(
            [
              {
                user_id: userId,
                context: [
                  {
                    role: "system",
                    content: JSON.stringify({ pending: pendingSend }),
                  },
                ],
                updated_at: new Date().toISOString(),
              },
            ],
            { onConflict: "user_id" },
          );
          return;
        }
        // Get the detected parameters
        const token = params.token || params.asset || params.symbol || "";
        const amount = params.amount || "";
        const recipient = params.recipient || params.to || "";
        const network = params.network || params.chain || "";
        // If we're missing details, ask for them
        const missing: string[] = [];
        if (!token) missing.push("token");
        if (!amount) missing.push("amount");
        if (!recipient) missing.push("recipient");
        if (!network) missing.push("network");
        if (missing.length > 0) {
          let promptText = "To send tokens, please specify: ";
          if (missing.length === 4) {
            promptText =
              'What token would you like to send? For example: "Send 0.1 USDC to 0x123... on Base Sepolia"';
          } else {
            promptText += missing.join(", ");
          }
          // Store pending context in session with all current params
          const pendingSend = {
            action: "send",
            token,
            amount,
            recipient,
            network,
          };
          console.log(
            "Writing pending send context for user:",
            userId,
            pendingSend,
          );
          await supabase.from("sessions").upsert(
            [
              {
                user_id: userId,
                context: [
                  {
                    role: "system",
                    content: JSON.stringify({ pending: pendingSend }),
                  },
                ],
                updated_at: new Date().toISOString(),
              },
            ],
            { onConflict: "user_id" },
          );
          await sendWhatsAppMessage(from, { text: promptText });
          return;
        }
        // If we have all parameters, proceed with the send prompt
        const actionResult = await handleAction(
          "send_token_prompt",
          {
            amount,
            token,
            recipient,
            network,
          },
          userId,
        );
        // Store pending context for confirmation
        const pendingSend = {
          action: "send",
          token,
          amount,
          recipient,
          network,
        };
        console.log(
          "Writing pending send context for user (confirmation):",
          userId,
          pendingSend,
        );
        await supabase.from("sessions").upsert(
          [
            {
              user_id: userId,
              context: [
                {
                  role: "system",
                  content: JSON.stringify({ pending: pendingSend }),
                },
              ],
              updated_at: new Date().toISOString(),
            },
          ],
          { onConflict: "user_id" },
        );
        if (actionResult) {
          if (typeof actionResult === 'object' && actionResult !== null && 'pending' in actionResult && 'result' in actionResult) {
            await sendWhatsAppTemplate(from, actionResult.pending);
            await sendWhatsAppTemplate(from, actionResult.result);
          } else if ("name" in actionResult) {
            await sendWhatsAppTemplate(from, actionResult);
          } else if ("text" in actionResult) {
            await sendWhatsAppMessage(from, { text: actionResult.text });
          }
        }
        return;
      }

      // Check for swap instruction keywords
      if (
        (lowerText.includes("swap") ||
          lowerText.includes("exchange") ||
          lowerText.includes("convert")) &&
        (lowerText.includes("how") ||
          lowerText.includes("help") ||
          lowerText.includes("instruct") ||
          lowerText.includes("want to"))
      ) {
        console.log("Swap instruction request detected, overriding intent");
        const actionResult = await handleAction("instruction_swap", {}, userId);
        console.log(
          "Action result for instruction_swap:",
          JSON.stringify(actionResult, null, 2),
        );

        if (actionResult && "text" in actionResult) {
          await sendWhatsAppMessage(from, { text: actionResult.text });
          return;
        }
      }

      // Check for bridge instruction keywords
      if (
        (lowerText.includes("bridge") ||
          lowerText.includes("cross chain") ||
          lowerText.includes("move between chains")) &&
        (lowerText.includes("how") ||
          lowerText.includes("help") ||
          lowerText.includes("instruct") ||
          lowerText.includes("want to"))
      ) {
        console.log("Bridge instruction request detected, overriding intent");
        const actionResult = await handleAction(
          "instruction_bridge",
          {},
          userId,
        );
        console.log(
          "Action result for instruction_bridge:",
          JSON.stringify(actionResult, null, 2),
        );

        if (actionResult && "text" in actionResult) {
          await sendWhatsAppMessage(from, { text: actionResult.text });
          return;
        }
      }

      // Check for send instruction keywords
      if (
        (lowerText.includes("send") ||
          lowerText.includes("withdraw") ||
          lowerText.includes("transfer")) &&
        (lowerText.includes("how") ||
          lowerText.includes("help") ||
          lowerText.includes("instruct") ||
          lowerText.includes("want to"))
      ) {
        console.log("Send instruction request detected, overriding intent");
        const actionResult = await handleAction("instruction_send", {}, userId);
        console.log(
          "Action result for instruction_send:",
          JSON.stringify(actionResult, null, 2),
        );

        if (actionResult && "text" in actionResult) {
          await sendWhatsAppMessage(from, { text: actionResult.text });
          return;
        }
      }

      // Add extra check for wallet address requests
      if (
        lowerText.includes("wallet address") ||
        lowerText.includes("my address") ||
        lowerText.includes("show address") ||
        lowerText.includes("view address")
      ) {
        console.log("Wallet address request detected, overriding intent");
        const actionResult = await handleAction(
          "get_wallet_address",
          {},
          userId
        );
        console.log(
          "Action result for get_wallet_address:",
          JSON.stringify(actionResult, null, 2)
        );

        if (actionResult) {
          if (typeof actionResult === 'object' && actionResult !== null && 'pending' in actionResult && 'result' in actionResult) {
            await sendWhatsAppTemplate(from, actionResult.pending);
            await sendWhatsAppTemplate(from, actionResult.result);
          } else if ("name" in actionResult) {
            await sendWhatsAppTemplate(from, actionResult);
          } else if ("text" in actionResult) {
            await sendWhatsAppMessage(from, { text: actionResult.text });
          }
        }
      }

      const actionResult = await handleAction(intent, { ...params, text }, userId);
      console.log("Action result:", JSON.stringify(actionResult, null, 2));

      // Handle different result types
      if (!actionResult) {
        console.error("No action result returned");
        await sendWhatsAppMessage(from, {
          text: "I couldn't process that request.",
        });
        return;
      }

      if (typeof actionResult === 'object' && actionResult !== null && 'pending' in actionResult && 'result' in actionResult) {
        await sendWhatsAppTemplate(from, actionResult.pending);
        await sendWhatsAppTemplate(from, actionResult.result);
      } else if ("name" in actionResult) {
        // Direct template format
        await sendWhatsAppTemplate(from, actionResult);
      } else if (
        "text" in actionResult &&
        typeof actionResult.text === "string"
      ) {
        // Plain text response
        await sendWhatsAppMessage(from, { text: actionResult.text });
      } else if (
        "success" in actionResult &&
        "message" in actionResult
      ) {
        // ActionResponse format
        console.log("Received ActionResponse format:", actionResult);
        if (actionResult.success) {
          try {
            // Try to parse the message as a template
            const templateData = JSON.parse(actionResult.message as string);
            if (templateData && "name" in templateData) {
              await sendWhatsAppTemplate(from, templateData);
            } else {
              // Fallback to plain text if parsing succeeds but format is unexpected
              await sendWhatsAppMessage(from, { text: actionResult.message as string });
            }
  } catch (err) {
            console.error("Error parsing ActionResponse message as JSON:", err);
            // If parsing fails, just send as plain text
            await sendWhatsAppMessage(from, { text: actionResult.message as string });
          }
        } else {
          // If success is false, send the message as plain text
          await sendWhatsAppMessage(from, { text: actionResult.message as string });
        }
      } else {
        console.error("Unknown action result format:", actionResult);
        await sendWhatsAppMessage(from, {
          text: "I couldn't process that request properly.",
        });
      }
    }
  } catch (error) {
    console.error("Error handling WhatsApp message:", error);
    await sendWhatsAppMessage(from, {
      text: "Sorry, I encountered an error processing your request.",
    });
  }
}

/**
 * Get or create a UUID for a user based on their phone number
 * @param phoneNumber The user's phone number
 * @returns A valid UUID for the user
 */
async function getUserIdFromPhone(
  phoneNumber: string,
  profileName?: string,
): Promise<string> {
  // Always normalize to E.164 before any database operations
  const e164PhoneNumber = toE164(phoneNumber, "NG");

  if (!e164PhoneNumber) {
    console.error(
      `[getUserIdFromPhone] Invalid phone number received: ${phoneNumber}. Cannot get or create user.`,
    );
    // Fallback to a random UUID to prevent crashing the flow, but log the error.
    return uuidv4();
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    console.log(
      `[Supabase] Attempting to connect to Supabase at ${supabaseUrl} for user ${e164PhoneNumber}`,
    );
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      supabaseUrl!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Check if user exists with the E.164 phone number
    const { data: existingUser } = await supabase
      .from("users")
      .select("id, name")
      .eq("phone_number", e164PhoneNumber)
      .maybeSingle();

    if (existingUser?.id) {
      console.log(
        `Found existing user ID ${existingUser.id} for phone ${e164PhoneNumber}`,
      );

      // Update name if we have a new one from WhatsApp and it's different
      if (
        profileName &&
        (!existingUser.name || existingUser.name !== profileName)
      ) {
        console.log(
          `Updating name for user ${existingUser.id} from "${
            existingUser.name || "none"
          }" to "${profileName}"`,
        );
        await supabase
          .from("users")
          .update({ name: profileName })
          .eq("id", existingUser.id);
      }

      return existingUser.id;
    }

    // Create a new user with a valid UUID and the E.164 phone number
    const newUserId = uuidv4();
    const { error } = await supabase.from("users").insert([
      {
        id: newUserId,
        phone_number: e164PhoneNumber, // Always store in E.164 format
        name:
          profileName ||
          `User_${e164PhoneNumber.substring(e164PhoneNumber.length - 4)}`,
        created_at: new Date().toISOString(),
      },
    ]);

    if (error) {
      console.error("Error creating user:", error);
      throw error;
    }

    console.log(
      `Created new user ID ${newUserId} for phone ${phoneNumber} with name "${profileName || "not provided"}"`,
    );
    return newUserId;
  } catch (error) {
    console.error("Error in getUserIdFromPhone:", error);
    // Return a valid UUID as fallback
    const fallbackId = uuidv4();
    console.log(
      `Using fallback UUID ${fallbackId} for phone ${phoneNumber} due to error`,
    );
    return fallbackId;
  }
}
