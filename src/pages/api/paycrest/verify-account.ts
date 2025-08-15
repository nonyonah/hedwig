import type { NextApiRequest, NextApiResponse } from 'next';

// Public Paycrest base URL per requested pattern
const PAYCREST_API_BASE_URL = 'https://api.paycrest.io/v1';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Basic CORS handling
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Accept either direct fields (institution, accountIdentifier) or FE convenience fields (bankCode, accountNumber)
    const {
      institution: directInstitution,
      accountIdentifier: directAccountIdentifier,
      bankCode,
      accountNumber,
    } = req.body || {};

    // Map to the exact fields expected by the public API
    const institution: string | undefined = typeof directInstitution === 'string'
      ? directInstitution
      : (typeof bankCode === 'string' ? bankCode : undefined);
    const accountIdentifier: string | undefined = typeof directAccountIdentifier === 'string'
      ? directAccountIdentifier
      : (typeof accountNumber === 'string' ? accountNumber : undefined);

    if (!institution || !accountIdentifier) {
      return res.status(400).json({
        error: 'Missing required fields: institution, accountIdentifier',
        hint: 'Send { institution, accountIdentifier } or { bankCode, accountNumber }'
      });
    }

    const payload = { institution, accountIdentifier };

    const response = await fetch(`${PAYCREST_API_BASE_URL}/verify-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({} as any));

    if (!response.ok) {
      console.error('[api/paycrest/verify-account] Paycrest API error:', { status: response.status, data });
      // Surface validation errors clearly
      if (response.status === 400) {
        return res.status(400).json({ error: data?.message || 'Verification validation failed' });
      }
      return res.status(response.status).json({ error: data?.message || 'Failed to verify account' });
    }

    // According to docs, success response data is the account name string
    return res.status(200).json({ success: true, accountName: data?.data });
  } catch (e: any) {
    console.error('[api/paycrest/verify-account] Error:', e);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
