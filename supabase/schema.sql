-- Drop existing tables if they exist
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;

-- Invoices Table
create table invoices (
  id uuid primary key default gen_random_uuid(),
  freelancer_name text not null,
  freelancer_email text not null,
  client_name text not null,
  client_email text not null,
  date_created timestamp with time zone default now(),
  project_description text not null,
  deliverables text not null,
  price numeric not null,
  amount numeric not null,
  is_split_payment boolean default false,
  split_details jsonb,
  milestones jsonb,
  wallet_address text not null,
  blockchain text check (blockchain in ('base','optimism','bnb','celo')) not null,
  status text default 'draft' check (status in ('draft','sent','paid','partial','overdue'))
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
create index idx_payment_invoice on payments(invoice_id);

-- Sessions table for user context and pending actions
create table if not exists public.sessions (
  user_id text primary key,
  context jsonb,
  updated_at timestamptz default now()
);

alter table public.sessions enable row level security;

create policy "Allow service role" on public.sessions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
