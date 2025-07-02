import { getRequiredEnvVar } from "@/lib/envUtils";
import { loadServerEnvironment } from "./serverEnv";
import { v4 as uuidv4 } from "uuid";
import fetch from "node-fetch";
import { textTemplate, txPending, sendTokenPrompt } from "./whatsappTemplates";
import { runLLM } from "./llmAgent";
import { parseIntentAndParams } from "./intentParser";
import { handleAction } from "../api/actions";
import { createClient } from "@supabase/supabase-js";

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
            body: text,
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
            // Remove 'name' property
            const { name, ...rest } = param;

            // Sanitize text parameter
            if (rest.type === "text" && rest.text) {
              rest.text = sanitizeWhatsAppParam(rest.text);
            }

            return rest;
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
  try {
    // Validate template has required fields
    if (!template || !template.name || !template.language) {
      console.error("Invalid template format:", template);
      return sendWhatsAppMessage(phoneNumber, {
        text: "Sorry, there was an error with the message template.",
      });
    }

    // Clean the template to remove 'name' property from parameters and sanitize text
    const cleanTemplate = cleanWhatsAppTemplate(template);

    // Sanitize template parameters
    const sanitizedTemplate = sanitizeTemplateParams(cleanTemplate);

    // Patch send_failed template
    const patchedTemplate = patchSendFailedTemplate(sanitizedTemplate);

    // Construct the WhatsApp template message
    const message: WhatsAppTemplateMessage = {
      to: formatPhoneNumber(phoneNumber),
      template: patchedTemplate,
    };

    // Remove any accidental 'text' property at the root of the template object
    if ('text' in message.template) {
      delete (message.template as any).text;
    }

    // Log the actual message being sent for debugging
    console.log("Sending WhatsApp template:", JSON.stringify(message, null, 2));

    try {
      return await sendWhatsAppTemplateMessage(message);
    } catch (error) {
      console.error("Error sending WhatsApp template:", error);
      // Fallback to text message
      const fallbackText =
        "Sorry, there was an error sending the interactive message.";
      return sendWhatsAppMessage(phoneNumber, { text: fallbackText });
    }
  } catch (error) {
    console.error("Exception in sendWhatsAppTemplate:", error);
    return sendWhatsAppMessage(phoneNumber, {
      text: "Sorry, there was an error processing your request.",
    });
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
          .eq("user_id", userId)
          .single();
        const pendingTx = session?.context?.find(
          (item: { role: string; content: string }) =>
            item.role === "system" &&
            JSON.parse(item.content)?.pending?.action === "send",
        );
        let txParams = {};
        if (pendingTx) {
          txParams = JSON.parse(pendingTx.content)?.pending || {};
        }
        // Execute the send transaction
        const actionResult = await handleAction(
          "send",
          { ...txParams, isExecute: true },
          userId,
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
          if ("name" in actionResult) {
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

      const waitingForName = nameSession?.context?.find(
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
      // Check for pending action in session
      const { data: session } = await supabase
        .from("sessions")
        .select("context")
        .eq("user_id", userId)
        .single();
      let pending = null;
      if (session?.context) {
        pending = session.context.find(
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
        // Normalize token in pendingObj
        pendingObj.token =
          pendingObj.token || pendingObj.asset || pendingObj.symbol;
        // Fix merge order: params first, then pendingObj
        const mergedParams = { ...params, ...pendingObj };
        mergedParams.token =
          mergedParams.token || mergedParams.asset || mergedParams.symbol;
        const hasAll =
          mergedParams.token &&
          mergedParams.amount &&
          mergedParams.recipient &&
          mergedParams.network;
        // More debug logging
        console.log("Pending object:", pendingObj);
        console.log("Merged params:", mergedParams);
        console.log("Has all required fields:", hasAll);
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
            if ("name" in actionResult) {
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
          if ("name" in actionResult) {
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
          if ("name" in actionResult) {
            await sendWhatsAppTemplate(from, actionResult);
            return;
          } else if ("text" in actionResult) {
            await sendWhatsAppMessage(from, { text: actionResult.text });
            return;
          }
        }
      }

      const actionResult = await handleAction(intent, params, userId);
      console.log("Action result:", JSON.stringify(actionResult, null, 2));

      // Handle different result types
      if (!actionResult) {
        console.error("No action result returned");
        await sendWhatsAppMessage(from, {
          text: "I couldn't process that request.",
        });
        return;
      }

      if ("template" in actionResult && actionResult.template) {
        // Legacy template format with nested template property
        await sendWhatsAppTemplate(from, actionResult.template);
      } else if (Array.isArray(actionResult)) {
        // Safely handle array of messages
        for (let i = 0; i < actionResult.length; i++) {
          const msg = actionResult[i];
          try {
            if (msg && typeof msg === "object") {
              if ("template" in msg && msg.template) {
                await sendWhatsAppTemplate(from, msg.template);
              } else if ("name" in msg && msg.name) {
                await sendWhatsAppTemplate(from, msg);
              } else if ("text" in msg && typeof msg.text === "string") {
                await sendWhatsAppMessage(from, { text: msg.text });
              } else {
                console.warn("Unrecognized message format in array:", msg);
              }
            }
          } catch (err) {
            console.error("Error processing message in array:", err);
          }
        }
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
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Check if user exists with this phone number
    const { data: existingUser } = await supabase
      .from("users")
      .select("id, name")
      .eq("phone_number", phoneNumber)
      .maybeSingle();

    if (existingUser?.id) {
      console.log(
        `Found existing user ID ${existingUser.id} for phone ${phoneNumber}`,
      );

      // Update name if we have a new one from WhatsApp and it's different
      if (
        profileName &&
        (!existingUser.name || existingUser.name !== profileName)
      ) {
        console.log(
          `Updating name for user ${existingUser.id} from "${existingUser.name || "none"}" to "${profileName}"`,
        );
        await supabase
          .from("users")
          .update({ name: profileName })
          .eq("id", existingUser.id);
      }

      return existingUser.id;
    }

    // Create a new user with a valid UUID
    const newUserId = uuidv4();
    const { error } = await supabase.from("users").insert([
      {
        id: newUserId,
        phone_number: phoneNumber,
        name:
          profileName ||
          `User_${phoneNumber.substring(phoneNumber.length - 4)}`,
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
