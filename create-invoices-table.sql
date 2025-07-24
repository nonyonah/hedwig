-- Complete SQL script to create invoices and payments tables
-- Copy and paste this entire script into your Supabase SQL Editor and run it

-- Drop existing tables if they exist (optional - remove these lines if you want to keep existing data)
-- DROP TABLE IF EXISTS payments CASCADE;
-- DROP TABLE IF EXISTS invoices CASCADE;

-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
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
  status text default 'draft' check (status in ('draft','sent','paid','partial','overdue')),
  invoice_number text,
  due_date text,
  payment_instructions text,
  additional_notes text
);

-- Create payments table
CREATE TABLE IF NOT EXISTS payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id) on delete cascade,
  amount_paid numeric not null,
  payment_date timestamp with time zone default now(),
  payer_wallet text not null,
  tx_hash text,
  status text default 'pending' check (status in ('pending','completed','failed'))
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_invoice_client ON invoices(client_email);
CREATE INDEX IF NOT EXISTS idx_invoice_freelancer ON invoices(freelancer_email);
CREATE INDEX IF NOT EXISTS idx_invoice_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_payment_invoice ON payments(invoice_id);

-- Verify tables were created
SELECT 'invoices' as table_name, count(*) as row_count FROM invoices
UNION ALL
SELECT 'payments' as table_name, count(*) as row_count FROM payments;