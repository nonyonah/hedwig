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

  export type ProjectContract = {
    id: string;
    contract_id: number;
    client_id: string;
    freelancer_id: string;
    project_title: string;
    project_description?: string;
    legal_contract_hash?: string;
    total_amount: number;
    platform_fee: number;
    token_address: string;
    chain: string;
    contract_address?: string;
    deployment_tx_hash?: string;
    deadline: string;
    created_at: string;
    funded_at?: string;
    started_at?: string;
    completed_at?: string;
    approved_at?: string;
    disputed_at?: string;
    resolved_at?: string;
    status: 'created' | 'funded' | 'in_progress' | 'completed' | 'approved' | 'disputed' | 'cancelled' | 'refunded';
    extension_requests_count: number;
    client_approval_required: boolean;
    dispute_reason?: string;
    resolution_notes?: string;
    created_from?: string;
    source_id?: string;
    updated_at: string;
  };

  export type ContractMilestone = {
    id: string;
    milestone_id: number;
    contract_id: string;
    title: string;
    description?: string;
    amount: number;
    deadline?: string;
    status: 'pending' | 'completed' | 'approved' | 'disputed';
    completed_at?: string;
    approved_at?: string;
    created_at: string;
    updated_at: string;
  };
