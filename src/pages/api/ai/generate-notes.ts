import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    try {
      const { invoiceId, invoiceData } = req.body;

      if (!invoiceId || !invoiceData) {
        return res.status(400).json({ error: 'Invoice ID and data are required' });
      }

      // Generate AI notes based on invoice data
      const aiNotes = generateAINotesForInvoice(invoiceData);

      // Update the invoice with AI-generated notes
      const { error } = await supabase
        .from('invoices')
        .update({ notes: aiNotes })
        .eq('id', invoiceId);

      if (error) {
        console.error('Error updating invoice with AI notes:', error);
        return res.status(500).json({ error: 'Failed to update invoice' });
      }

      res.status(200).json({ notes: aiNotes });
    } catch (error) {
      console.error('Error generating AI notes:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

function generateAINotesForInvoice(invoiceData: any): string {
  const { items, client_name, freelancer_name, amount, currency, due_date } = invoiceData;
  
  // Generate contextual notes based on invoice data
  let notes = `Invoice generated for ${client_name} by ${freelancer_name}.\n\n`;
  
  if (items && items.length > 0) {
    notes += `Services provided:\n`;
    items.forEach((item: any, index: number) => {
      notes += `${index + 1}. ${item.description} - ${item.quantity || 1} × ${item.rate} ${currency}\n`;
    });
    notes += `\n`;
  }
  
  notes += `Total amount: ${amount} ${currency}\n`;
  notes += `Payment due by: ${due_date}\n\n`;
  
  // Add payment instructions
  notes += `Payment Instructions:\n`;
  notes += `• Please ensure payment is made by the due date to avoid late fees\n`;
  notes += `• For any questions regarding this invoice, please contact ${freelancer_name}\n`;
  notes += `• Thank you for your business!`;
  
  return notes;
}