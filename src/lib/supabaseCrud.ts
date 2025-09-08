import { supabase } from './supabaseClient';
import type { Client, Invoice } from '../types/supabase';

// Create a new client
export async function createClient(client: Omit<Client, 'id' | 'created_at'>) {
  const { data, error } = await (supabase as any)
    .from('clients')
    .insert([client])
    .single();
  if (error) throw error;
  return data;
}

// Fetch all clients for a user
export async function getClients(userId: string) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return data;
}

// Create an invoice
export async function createInvoice(invoice: Omit<Invoice, 'id' | 'created_at'>) {
  const { data, error } = await (supabase as any)
    .from('invoices')
    .insert([invoice])
    .single();
  if (error) throw error;
  return data;
}

// Fetch invoices for a user
export async function getInvoices(userId: string) {
  const { data, error } = await (supabase as any)
    .from('invoices')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return data;
}


// Update an invoice by ID
export async function updateInvoice(id: string, updates: Partial<Omit<Invoice, 'id' | 'created_at'>>) {
    const { data, error } = await (supabase as any)
      .from('invoices')
      .update(updates)
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }
  
  // Mark an invoice as paid
  export async function markInvoiceAsPaid(invoiceId: string) {
    return await updateInvoice(invoiceId, { status: 'paid' });
  }

  // Note: WhatsApp-specific functions have been removed in favor of Telegram integration
  