-- Add proposal_id and invoice_id columns to payment_links table to link them with proposals and invoices
-- This allows payment links to be associated with specific proposals or invoices

-- Add proposal_id column to link payment links with proposals
ALTER TABLE public.payment_links 
ADD COLUMN IF NOT EXISTS proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL;

-- Add invoice_id column to link payment links with invoices
ALTER TABLE public.payment_links 
ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_payment_links_proposal_id ON public.payment_links(proposal_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_invoice_id ON public.payment_links(invoice_id);

-- Add comments to explain the columns
COMMENT ON COLUMN public.payment_links.proposal_id IS 'References the proposal this payment link is associated with (optional)';
COMMENT ON COLUMN public.payment_links.invoice_id IS 'References the invoice this payment link is associated with (optional)';

-- Add constraint to ensure a payment link is associated with at most one proposal or invoice
ALTER TABLE public.payment_links 
ADD CONSTRAINT chk_payment_link_single_reference 
CHECK (
  (proposal_id IS NOT NULL AND invoice_id IS NULL) OR 
  (proposal_id IS NULL AND invoice_id IS NOT NULL) OR 
  (proposal_id IS NULL AND invoice_id IS NULL)
);