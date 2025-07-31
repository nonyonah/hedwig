-- Add quantity and rate columns to invoices table
ALTER TABLE invoices 
ADD COLUMN quantity INTEGER DEFAULT 1,
ADD COLUMN rate DECIMAL(10,2);

-- Update existing invoices to have quantity = 1 if null
UPDATE invoices 
SET quantity = 1 
WHERE quantity IS NULL;