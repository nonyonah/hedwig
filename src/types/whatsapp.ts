// Response types for WhatsApp messages
export type TextResponse = {
  type: 'text';
  text: string;
};

export type ImageResponse = {
  type: 'image';
  url: string;
  caption?: string;
};

export type ListResponse = {
  type: 'list';
  text: string;
  button: string;
  sections: Array<{
    title: string;
    rows: Array<{
      id: string;
      title: string;
      description?: string;
    }>;
  }>;
};

export type ButtonsResponse = {
  type: 'buttons';
  text: string;
  buttons: Array<{
    id: string;
    title: string;
  }>;
};

export type InteractiveTemplateResponse = {
  type: 'interactive_template';
  messaging_product: string;
  recipient_type: string;
  interactive: {
    type: string;
    body: {
      text: string;
    };
    action: {
      buttons: Array<{
        type: string;
        reply: {
          id: string;
          title: string;
        };
      }>;
    };
  };
};

export type WhatsAppResponse = TextResponse | ImageResponse | ListResponse | ButtonsResponse | InteractiveTemplateResponse;

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
