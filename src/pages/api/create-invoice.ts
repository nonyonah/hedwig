import { NextApiRequest, NextApiResponse } from 'next';
import { createInvoice, CreateInvoiceParams, CreateInvoiceResult } from '@/lib/invoiceService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateInvoiceResult>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const params: CreateInvoiceParams = req.body;
    const result = await createInvoice(params);

    if (result.success) {
      return res.status(201).json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (error) {
    console.error('Invoice creation API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}