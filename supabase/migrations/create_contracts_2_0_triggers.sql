-- =====================================================
-- Contracts 2.0 Automation Triggers
-- =====================================================
-- This file contains all the triggers and functions needed for
-- automating the Contracts 2.0 workflow including:
-- 1. Contract approval automation
-- 2. Invoice generation
-- 3. Payment tracking and status updates
-- 4. Contract completion detection
-- =====================================================

-- Create sequence for invoice numbers
CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1;

-- Function to update contract amount_paid when milestones are paid
CREATE OR REPLACE FUNCTION update_contract_amount_paid()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if milestone status changed to 'paid'
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
    UPDATE contracts 
    SET 
      amount_paid = COALESCE(amount_paid, 0) + NEW.amount,
      updated_at = NOW()
    WHERE id = NEW.contract_id;
  END IF;
  
  -- If milestone status changed from 'paid' to something else, subtract the amount
  IF OLD.status = 'paid' AND NEW.status != 'paid' THEN
    UPDATE contracts 
    SET 
      amount_paid = GREATEST(COALESCE(amount_paid, 0) - NEW.amount, 0),
      updated_at = NOW()
    WHERE id = NEW.contract_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to check and update contract completion status
CREATE OR REPLACE FUNCTION check_contract_completion()
RETURNS TRIGGER AS $$
DECLARE
  total_milestones INTEGER;
  paid_milestones INTEGER;
  contract_total NUMERIC;
  contract_paid NUMERIC;
BEGIN
  -- Get contract totals
  SELECT 
    COUNT(*) as total,
    COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid,
    c.total_amount,
    c.amount_paid
  INTO total_milestones, paid_milestones, contract_total, contract_paid
  FROM contract_milestones cm
  JOIN contracts c ON c.id = cm.contract_id
  WHERE cm.contract_id = NEW.contract_id
  GROUP BY c.total_amount, c.amount_paid;
  
  -- Check if all milestones are paid or if amount_paid equals total_amount
  IF (paid_milestones = total_milestones AND total_milestones > 0) OR 
     (contract_paid >= contract_total AND contract_total > 0) THEN
    
    -- Update contract status to completed
    UPDATE contracts 
    SET 
      status = 'completed',
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = NEW.contract_id AND status != 'completed';
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to generate milestone invoices when contract is approved
CREATE OR REPLACE FUNCTION generate_milestone_invoices()
RETURNS TRIGGER AS $$
DECLARE
  milestone_record RECORD;
  invoice_id UUID;
  invoice_number TEXT;
BEGIN
  -- Only proceed if status changed to 'approved'
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    
    -- Loop through all milestones for this contract
    FOR milestone_record IN 
      SELECT * FROM contract_milestones 
      WHERE contract_id = NEW.id 
      ORDER BY created_at ASC
    LOOP
      -- Generate invoice number (simple format)
      invoice_number := 'INV-' || EXTRACT(YEAR FROM NOW()) || '-' || LPAD(EXTRACT(DOY FROM NOW())::TEXT, 3, '0') || '-' || LPAD(nextval('invoice_seq')::TEXT, 4, '0');
      
      -- Create invoice record
      INSERT INTO contract_invoices (
        contract_id,
        milestone_id,
        invoice_number,
        amount,
        token_type,
        chain,
        token_address,
        status,
        due_date,
        created_at,
        updated_at
      ) VALUES (
        NEW.id,
        milestone_record.id,
        invoice_number,
        milestone_record.amount,
        NEW.token_type,
        NEW.chain,
        get_token_address(NEW.token_type, NEW.chain),
        'pending',
        milestone_record.due_date,
        NOW(),
        NOW()
      ) RETURNING id INTO invoice_id;
      
      -- Update milestone with invoice_id
      UPDATE contract_milestones 
      SET 
        invoice_id = invoice_id,
        updated_at = NOW()
      WHERE id = milestone_record.id;
      
    END LOOP;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update invoice status when milestone is paid
CREATE OR REPLACE FUNCTION update_invoice_status_on_milestone_payment()
RETURNS TRIGGER AS $$
BEGIN
  -- If milestone status changed to 'paid', update corresponding invoice
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
    UPDATE contract_invoices 
    SET 
      status = 'paid',
      payment_confirmed_at = NOW(),
      updated_at = NOW()
    WHERE milestone_id = NEW.id;
  END IF;
  
  -- If milestone status changed from 'paid', update invoice back to pending
  IF OLD.status = 'paid' AND NEW.status != 'paid' THEN
    UPDATE contract_invoices 
    SET 
      status = 'pending',
      payment_confirmed_at = NULL,
      updated_at = NOW()
    WHERE milestone_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle contract status changes and send notifications
CREATE OR REPLACE FUNCTION handle_contract_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Contract approved
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    -- Insert notification for contract approval
    INSERT INTO contract_notifications (
      contract_id,
      recipient,
      notification_type,
      subject,
      message,
      sent_via_email,
      sent_via_telegram,
      created_at
    ) VALUES (
      NEW.id,
      'system',
      'contract_approved_trigger',
      'Contract Approved - Invoices Generated',
      'Contract "' || NEW.title || '" has been approved and invoices have been generated for all milestones.',
      false,
      false,
      NOW()
    );
  END IF;
  
  -- Contract completed
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Insert notification for contract completion
    INSERT INTO contract_notifications (
      contract_id,
      recipient,
      notification_type,
      subject,
      message,
      sent_via_email,
      sent_via_telegram,
      created_at
    ) VALUES (
      NEW.id,
      'system',
      'contract_completed_trigger',
      'Contract Completed',
      'Contract "' || NEW.title || '" has been completed. All milestones have been paid.',
      false,
      false,
      NOW()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update contract updated_at timestamp
CREATE OR REPLACE FUNCTION update_contract_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update milestone updated_at timestamp
CREATE OR REPLACE FUNCTION update_milestone_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update invoice updated_at timestamp
CREATE OR REPLACE FUNCTION update_invoice_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Trigger to update contract amount_paid when milestone status changes
DROP TRIGGER IF EXISTS trigger_update_contract_amount_paid ON contract_milestones;
CREATE TRIGGER trigger_update_contract_amount_paid
  AFTER UPDATE OF status ON contract_milestones
  FOR EACH ROW
  EXECUTE FUNCTION update_contract_amount_paid();

-- Trigger to check contract completion when milestone is paid
DROP TRIGGER IF EXISTS trigger_check_contract_completion ON contract_milestones;
CREATE TRIGGER trigger_check_contract_completion
  AFTER UPDATE OF status ON contract_milestones
  FOR EACH ROW
  WHEN (NEW.status = 'paid')
  EXECUTE FUNCTION check_contract_completion();

-- Trigger to generate invoices when contract is approved
DROP TRIGGER IF EXISTS trigger_generate_milestone_invoices ON contracts;
CREATE TRIGGER trigger_generate_milestone_invoices
  AFTER UPDATE OF status ON contracts
  FOR EACH ROW
  WHEN (NEW.status = 'approved')
  EXECUTE FUNCTION generate_milestone_invoices();

-- Trigger to update invoice status when milestone is paid
DROP TRIGGER IF EXISTS trigger_update_invoice_status ON contract_milestones;
CREATE TRIGGER trigger_update_invoice_status
  AFTER UPDATE OF status ON contract_milestones
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_status_on_milestone_payment();

-- Trigger to handle contract status changes
DROP TRIGGER IF EXISTS trigger_handle_contract_status_change ON contracts;
CREATE TRIGGER trigger_handle_contract_status_change
  AFTER UPDATE OF status ON contracts
  FOR EACH ROW
  EXECUTE FUNCTION handle_contract_status_change();

-- Trigger to update contract updated_at timestamp
DROP TRIGGER IF EXISTS trigger_update_contract_updated_at ON contracts;
CREATE TRIGGER trigger_update_contract_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW
  EXECUTE FUNCTION update_contract_updated_at();

-- Trigger to update milestone updated_at timestamp
DROP TRIGGER IF EXISTS trigger_update_milestone_updated_at ON contract_milestones;
CREATE TRIGGER trigger_update_milestone_updated_at
  BEFORE UPDATE ON contract_milestones
  FOR EACH ROW
  EXECUTE FUNCTION update_milestone_updated_at();

-- Trigger to update invoice updated_at timestamp
DROP TRIGGER IF EXISTS trigger_update_invoice_updated_at ON contract_invoices;
CREATE TRIGGER trigger_update_invoice_updated_at
  BEFORE UPDATE ON contract_invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_updated_at();

-- =====================================================
-- ADDITIONAL HELPER FUNCTIONS
-- =====================================================

-- Function to get contract summary with payment progress
CREATE OR REPLACE FUNCTION get_contract_summary(contract_uuid UUID)
RETURNS TABLE (
  contract_id UUID,
  title TEXT,
  status TEXT,
  total_amount NUMERIC,
  amount_paid NUMERIC,
  payment_progress NUMERIC,
  total_milestones INTEGER,
  paid_milestones INTEGER,
  pending_milestones INTEGER,
  overdue_milestones INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as contract_id,
    c.title,
    c.status,
    c.total_amount,
    COALESCE(c.amount_paid, 0) as amount_paid,
    CASE 
      WHEN c.total_amount > 0 THEN ROUND((COALESCE(c.amount_paid, 0) / c.total_amount) * 100, 2)
      ELSE 0 
    END as payment_progress,
    COUNT(cm.id)::INTEGER as total_milestones,
    COUNT(CASE WHEN cm.status = 'paid' THEN 1 END)::INTEGER as paid_milestones,
    COUNT(CASE WHEN cm.status = 'pending' THEN 1 END)::INTEGER as pending_milestones,
    COUNT(CASE WHEN cm.status = 'pending' AND cm.due_date < CURRENT_DATE THEN 1 END)::INTEGER as overdue_milestones
  FROM contracts c
  LEFT JOIN contract_milestones cm ON c.id = cm.contract_id
  WHERE c.id = contract_uuid
  GROUP BY c.id, c.title, c.status, c.total_amount, c.amount_paid;
END;
$$ LANGUAGE plpgsql;

-- Function to mark milestone as paid (for webhook usage)
CREATE OR REPLACE FUNCTION mark_milestone_as_paid(
  milestone_uuid UUID,
  payment_amount NUMERIC DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  milestone_amount NUMERIC;
  result BOOLEAN := FALSE;
BEGIN
  -- Get milestone amount
  SELECT amount INTO milestone_amount 
  FROM contract_milestones 
  WHERE id = milestone_uuid;
  
  -- Verify payment amount matches milestone amount (if provided)
  IF payment_amount IS NOT NULL AND payment_amount != milestone_amount THEN
    RAISE EXCEPTION 'Payment amount (%) does not match milestone amount (%)', payment_amount, milestone_amount;
  END IF;
  
  -- Update milestone status to paid
  UPDATE contract_milestones 
  SET 
    status = 'paid',
    completed_at = NOW(),
    updated_at = NOW()
  WHERE id = milestone_uuid AND status != 'paid';
  
  -- Check if update was successful
  GET DIAGNOSTICS result = ROW_COUNT;
  
  RETURN result > 0;
END;
$$ LANGUAGE plpgsql;

-- Function to get overdue milestones for reminder system
CREATE OR REPLACE FUNCTION get_overdue_milestones()
RETURNS TABLE (
  milestone_id UUID,
  contract_id UUID,
  contract_title TEXT,
  milestone_title TEXT,
  amount NUMERIC,
  token_type TEXT,
  due_date TIMESTAMPTZ,
  days_overdue INTEGER,
  freelancer_id UUID,
  client_email TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cm.id as milestone_id,
    c.id as contract_id,
    c.title as contract_title,
    cm.title as milestone_title,
    cm.amount,
    c.token_type,
    cm.due_date,
    (CURRENT_DATE - cm.due_date::DATE)::INTEGER as days_overdue,
    c.freelancer_id,
    c.client_email
  FROM contract_milestones cm
  JOIN contracts c ON c.id = cm.contract_id
  WHERE cm.status = 'pending' 
    AND cm.due_date < CURRENT_DATE
    AND c.status IN ('approved', 'active')
  ORDER BY cm.due_date ASC;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Indexes for contract queries
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_freelancer_id ON contracts(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client_email ON contracts(client_email);
CREATE INDEX IF NOT EXISTS idx_contracts_created_at ON contracts(created_at);
CREATE INDEX IF NOT EXISTS idx_contracts_approval_token ON contracts(approval_token) WHERE approval_token IS NOT NULL;

-- Indexes for milestone queries
CREATE INDEX IF NOT EXISTS idx_contract_milestones_contract_id ON contract_milestones(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_milestones_status ON contract_milestones(status);
CREATE INDEX IF NOT EXISTS idx_contract_milestones_due_date ON contract_milestones(due_date);
CREATE INDEX IF NOT EXISTS idx_contract_milestones_invoice_id ON contract_milestones(invoice_id);

-- Indexes for invoice queries
CREATE INDEX IF NOT EXISTS idx_contract_invoices_contract_id ON contract_invoices(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_invoices_milestone_id ON contract_invoices(milestone_id);
CREATE INDEX IF NOT EXISTS idx_contract_invoices_status ON contract_invoices(status);
CREATE INDEX IF NOT EXISTS idx_contract_invoices_token_type ON contract_invoices(token_type);

-- Indexes for notification queries
CREATE INDEX IF NOT EXISTS idx_contract_notifications_contract_id ON contract_notifications(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_notifications_recipient ON contract_notifications(recipient);
CREATE INDEX IF NOT EXISTS idx_contract_notifications_type ON contract_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_contract_notifications_created_at ON contract_notifications(created_at);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_milestones_contract_status ON contract_milestones(contract_id, status);
CREATE INDEX IF NOT EXISTS idx_contracts_freelancer_status ON contracts(freelancer_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_contract_status ON contract_invoices(contract_id, status);

-- =====================================================
-- COMMENTS AND DOCUMENTATION
-- =====================================================

COMMENT ON FUNCTION update_contract_amount_paid() IS 'Updates the total amount paid for a contract when milestone status changes';
COMMENT ON FUNCTION check_contract_completion() IS 'Checks if all milestones are paid and marks contract as completed';
COMMENT ON FUNCTION generate_milestone_invoices() IS 'Automatically generates invoices for all milestones when contract is approved';
COMMENT ON FUNCTION update_invoice_status_on_milestone_payment() IS 'Updates invoice status when corresponding milestone is paid';
COMMENT ON FUNCTION handle_contract_status_change() IS 'Handles contract status changes and creates system notifications';
COMMENT ON FUNCTION get_contract_summary(UUID) IS 'Returns comprehensive contract summary with payment progress';
COMMENT ON FUNCTION mark_milestone_as_paid(UUID, NUMERIC) IS 'Marks a milestone as paid, used by payment webhooks';
COMMENT ON FUNCTION get_overdue_milestones() IS 'Returns all overdue milestones for reminder system';

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_contract_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_milestone_as_paid(UUID, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION get_overdue_milestones() TO service_role;