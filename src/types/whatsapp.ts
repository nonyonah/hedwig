// Response types for WhatsApp messages
export interface TextResponse {
  type: 'text';
  text: string;
}

export interface ImageResponse {
  type: 'image';
  url: string;
  caption?: string;
}

export interface ListResponse {
  type: 'list';
  header: string;
  body: string;
  buttonText: string;
  sections: Array<{
    title: string;
    rows: Array<{
      id: string;
      title: string;
      description?: string;
    }>;
  }>;
}

export interface ButtonsResponse {
  type: 'buttons';
  text: string;
  buttons: Array<{
    id: string;
    title: string;
  }>;
}

export type WhatsAppResponse = TextResponse | ImageResponse | ListResponse | ButtonsResponse | string;

// Message type for command context
export interface CommandMessage {
  text: string;
  preview_url?: string;
}

// Command context
export interface CommandContext {
  userId: string;
  message: CommandMessage;
  messageType: 'text' | 'image' | 'button' | 'list' | 'interactive';
  phoneNumber: string;
  mediaUrl?: string;
  mediaType?: string;
  buttonPayload?: string;
  listPayload?: string;
}

// Webhook types
export interface WebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: string;
      metadata: {
        display_phone_number: string;
        phone_number_id: string;
      };
      contacts?: Array<{
        profile: {
          name: string;
        };
        wa_id: string;
      }>;
      messages?: Array<{
        from: string;
        id: string;
        timestamp: string;
        type: 'text' | 'image' | 'button' | 'interactive';
        text?: {
          body: string;
        };
        image?: {
          caption?: string | undefined;
          mime_type: string;
          sha256: string;
          id: string;
        };
        button?: {
          text: string;
          payload: string;
        };
        interactive?: {
          type: 'list_reply' | 'button_reply';
          list_reply?: {
            id: string;
            title: string;
            description?: string;
          };
          button_reply?: {
            id: string;
            title: string;
          };
        };
      }>;
      statuses?: Array<{
        id: string;
        status: 'sent' | 'delivered' | 'read' | 'failed';
        timestamp: string;
        recipient_id: string;
      }>;
    };
    field: string;
  }>;
}
