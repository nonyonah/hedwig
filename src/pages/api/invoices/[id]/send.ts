import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '../../../../lib/emailService';
import { generateInvoicePDF } from '../../../../modules/pdf-generator';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;

  if (req.method === 'POST') {
    try {
      const { data: invoice, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      // Generate PDF
      const pdfBuffer = await generateInvoicePDF(invoice);

      // Send email with PDF attachment
      const emailResult = await sendEmail({
        to: invoice.client_email,
        subject: `Invoice ${invoice.invoice_number} from ${invoice.freelancer_name}`,
        html: `
          <h2>Invoice ${invoice.invoice_number}</h2>
          <p>Dear ${invoice.client_name},</p>
          <p>Please find attached your invoice for the amount of ${invoice.amount} ${invoice.currency}.</p>
          <p>Due Date: ${invoice.due_date}</p>
          <p>Best regards,<br>${invoice.freelancer_name}</p>
        `,
        attachments: [{
          filename: `invoice-${invoice.invoice_number}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }]
      });

      if (emailResult.success) {
        // Update invoice status to sent
        await supabase
          .from('invoices')
          .update({ status: 'sent' })
          .eq('id', id);

        res.status(200).json({ success: true, message: 'Invoice sent successfully' });
      } else {
        res.status(500).json({ error: 'Failed to send invoice email' });
      }
    } catch (error) {
      console.error('Error sending invoice:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}