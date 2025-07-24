-- Migration: Add missing fields to invoices table
-- This migration adds invoice_number, due_date, payment_instructions, and additional_notes fields

-- Add missing columns to invoices table
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS invoice_number text,
ADD COLUMN IF NOT EXISTS due_date text,
ADD COLUMN IF NOT EXISTS payment_instructions text,
ADD COLUMN IF NOT EXISTS additional_notes text;