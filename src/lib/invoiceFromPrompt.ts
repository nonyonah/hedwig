import { processPrompt } from './gemini';
import { createInvoice } from './supabaseCrud';

export async function generateInvoiceFromPrompt(userId: string, clientId: string, prompt: string) {
  const invoiceText = await processPrompt(prompt);
  // TODO: Parse invoiceText for amount, due_date, etc. For now, use placeholder values.
  const invoice = await createInvoice({
    user_id: userId,
    client_id: clientId,
    amount: 100, // TODO: parse from invoiceText
    status: 'draft',
    due_date: null,
    description: invoiceText
  });
  return invoice;
}
