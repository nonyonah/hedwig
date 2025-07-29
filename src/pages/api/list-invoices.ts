import { NextApiRequest, NextApiResponse } from 'next';
import { listInvoices, InvoiceListItem } from '../../lib/invoiceService';

interface ListInvoicesRequest {
  userName: string;
}

interface ListInvoicesResponse {
  success: boolean;
  invoices?: InvoiceListItem[];
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListInvoicesResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { userName }: ListInvoicesRequest = req.body;

    // Validate required fields
    if (!userName) {
      return res.status(400).json({ success: false, error: 'userName is required' });
    }

    // List invoices
    const result = await listInvoices(userName);

    if (result.success) {
      return res.status(200).json({
        success: true,
        invoices: result.invoices
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error || 'Failed to list invoices'
      });
    }
  } catch (error) {
    console.error('Error in list-invoices API:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}