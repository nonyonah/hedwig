export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type MessageDirection = 'incoming' | 'outgoing';
export type MessageType = 'text' | 'image' | 'button' | 'list' | 'template' | 'interactive';

export interface Database {
  public: {
    Tables: {
      // Message logs for all Telegram interactions
      message_logs: {
        Row: {
          id: string;
          user_id: string;
          message_type: MessageType;
          content: string;
          direction: MessageDirection;
          created_at: string;
          metadata?: Json | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          message_type: MessageType;
          content: string;
          direction: MessageDirection;
          created_at?: string;
          metadata?: Json | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          message_type?: MessageType;
          content?: string;
          direction?: MessageDirection;
          created_at?: string;
          metadata?: Json | null;
        };
      };
      
      // Error logging
      errors: {
        Row: {
          id: string;
          user_id: string | null;
          error_type: string;
          error_message: string;
          stack_trace: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          error_type: string;
          error_message: string;
          stack_trace?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          error_type?: string;
          error_message?: string;
          stack_trace?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
      };
      
      // Rate limiting
      rate_limits: {
        Row: {
          id: string;
          user_id: string;
          request_count: number;
          first_request_at: string;
          last_request_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          request_count?: number;
          first_request_at?: string;
          last_request_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          request_count?: number;
          first_request_at?: string;
          last_request_at?: string;
        };
      };
      users: {
        Row: {
          id: string
          phone_number: string
          created_at: string
          last_active: string | null
        }
        Insert: {
          id?: string
          phone_number: string
          created_at?: string
          last_active?: string | null
        }
        Update: {
          id?: string
          phone_number?: string
          created_at?: string
          last_active?: string | null
        }
      }
      wallets: {
        Row: {
          id: string
          user_id: string
          address: string
          private_key_encrypted: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          address: string
          private_key_encrypted: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          address?: string
          private_key_encrypted?: string
          created_at?: string
        }
      }
      sessions: {
        Row: {
          id: string
          user_id: string
          token: string
          expires_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          token: string
          expires_at: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          token?: string
          expires_at?: string
          created_at?: string
        }
      }
      tokens: {
        Row: {
          id: string
          user_id: string
          token_address: string
          symbol: string
          name: string
          balance: string
          decimals: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          token_address: string
          symbol: string
          name: string
          balance: string
          decimals: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          token_address?: string
          symbol?: string
          name?: string
          balance?: string
          decimals?: number
          created_at?: string
        }
      }
      nfts: {
        Row: {
          id: string
          token_id: string
          contract_address: string
          owner_id: string
          name: string
          description: string | null
          image_url: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          token_id: string
          contract_address: string
          owner_id: string
          name: string
          description?: string | null
          image_url?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          token_id?: string
          contract_address?: string
          owner_id?: string
          name?: string
          description?: string | null
          image_url?: string | null
          metadata?: Json | null
          created_at?: string
        }
      }
      onramp_transactions: {
        Row: {
          id: string
          user_id: string
          fonbnk_transaction_id: string | null
          token: string
          chain: string
          amount: number
          fiat_amount: number
          fiat_currency: string
          wallet_address: string
          status: string
          tx_hash: string | null
          error_message: string | null
          error_step: string | null
          fonbnk_payment_url: string | null
          expires_at: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          fonbnk_transaction_id?: string | null
          token: string
          chain: string
          amount: number
          fiat_amount: number
          fiat_currency: string
          wallet_address: string
          status?: string
          tx_hash?: string | null
          error_message?: string | null
          error_step?: string | null
          fonbnk_payment_url?: string | null
          expires_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          fonbnk_transaction_id?: string | null
          token?: string
          chain?: string
          amount?: number
          fiat_amount?: number
          fiat_currency?: string
          wallet_address?: string
          status?: string
          tx_hash?: string | null
          error_message?: string | null
          error_step?: string | null
          fonbnk_payment_url?: string | null
          expires_at?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      google_calendar_credentials: {
        Row: {
          id: string
          user_id: string
          access_token: string
          refresh_token: string
          calendar_id: string
          connected_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          access_token: string
          refresh_token: string
          calendar_id?: string
          connected_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          access_token?: string
          refresh_token?: string
          calendar_id?: string
          connected_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
