-- Drop existing tables if they exist
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;

-- Invoices Table
create table invoices (
  id uuid primary key default gen_random_uuid(),
  freelancer_name text,
  freelancer_email text,
  client_name text,
  client_email text,
  date_created timestamp with time zone default now(),
  project_description text,
  deliverables text,
  price numeric,
  amount numeric,
  is_split_payment boolean default false,
  split_details jsonb,
  milestones jsonb,
  wallet_address text,
  blockchain text check (blockchain in ('base','optimism','bnb','celo')),
  -- DISABLED BLOCKCHAINS: BEP20 and Asset Chain are defined but not active
  -- Future blockchain options: 'bsc','bsc-testnet','asset-chain','asset-chain-testnet'
  status text default 'draft' check (status in ('draft','sent','paid','partial','overdue')),
  invoice_number text,
  due_date text,
  payment_instructions text,
  additional_notes text,
  created_by uuid,
  currency text default 'USD' check (currency in ('USD', 'NGN', 'USDC', 'CNGN')) not null,
  payment_methods jsonb default '[]',
  quantity integer default 1,
  rate numeric,
  user_id text,
  viewed_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  paid_at timestamp with time zone,
  payment_transaction text,
  nudge_count integer default 0,
  last_nudge_at timestamp with time zone,
  nudge_disabled boolean default false,
  -- Check constraint to ensure required fields are filled for non-draft invoices
  CONSTRAINT check_required_fields_for_sent_invoices CHECK (
    status = 'draft' OR (
      freelancer_name IS NOT NULL AND
      freelancer_email IS NOT NULL AND
      client_name IS NOT NULL AND
      client_email IS NOT NULL AND
      project_description IS NOT NULL AND
      deliverables IS NOT NULL AND
      price IS NOT NULL AND
      amount IS NOT NULL AND
      wallet_address IS NOT NULL AND
      blockchain IS NOT NULL
    )
  )
);

-- Payments Table
create table payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id) on delete cascade,
  amount_paid numeric not null,
  payment_date timestamp with time zone default now(),
  payer_wallet text not null,
  tx_hash text,
  status text default 'pending' check (status in ('pending','completed','failed'))
);

-- Create indexes after tables are created
create index idx_invoice_client on invoices(client_email);
create index idx_invoice_created_by on invoices(created_by);
create index idx_payment_invoice on payments(invoice_id);
create index idx_invoices_user_id on invoices(user_id);
create index idx_invoices_viewed_at on invoices(viewed_at);
create index idx_invoices_paid_at on invoices(paid_at);
create index idx_invoices_payment_transaction on invoices(payment_transaction);
create index idx_invoices_last_nudge_at on invoices(last_nudge_at);
create index idx_invoices_status on invoices(status);

-- Sessions table for user context and pending actions
create table if not exists public.sessions (
  user_id text primary key,
  context jsonb,
  updated_at timestamptz default now()
);

alter table public.sessions enable row level security;

-- Drop existing policy if it exists to avoid conflicts
drop policy if exists "Allow service role" on public.sessions;

create policy "Allow service role" on public.sessions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
