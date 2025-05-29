export type User = {
    id: string;
    email: string;
    name?: string;
    created_at: string;
  };
  
  export type Client = {
    id: string;
    user_id: string;
    name: string;
    email?: string;
    company?: string;
    created_at: string;
  };
  
  export type Invoice = {
    id: string;
    user_id: string;
    client_id: string | null;
    amount: number;
    status: 'draft' | 'sent' | 'paid' | 'overdue';
    due_date: string | null;
    created_at: string;
    description?: string;
  };