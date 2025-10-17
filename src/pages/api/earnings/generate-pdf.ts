import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { 
  generateEarningsPdfForQuery,
  getEarningsForNaturalQuery,
  UserData 
} from '../../../lib/earningsService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface GenerateEarningsPdfRequest {
  walletAddresses: string[];
  timeframe?: string;
  startDate?: string;
  endDate?: string;
  userData?: UserData;
  naturalQuery?: string;
  userId?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.'
    });
  }

  try {
    const { 
      walletAddresses, 
      timeframe, 
      startDate, 
      endDate, 
      userData, 
      naturalQuery,
      userId 
    }: GenerateEarningsPdfRequest = req.body;

    // Validate required fields
    if (!walletAddresses || !Array.isArray(walletAddresses) || walletAddresses.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'walletAddresses is required and must be a non-empty array'
      });
    }

    console.log('[generate-pdf] Generating PDF for wallets:', walletAddresses);

    // Get user data if userId is provided and userData is not
    let finalUserData = userData;
    if (!finalUserData && userId) {
      try {
        const { data: user } = await supabase
          .from('users')
          .select('name, telegram_first_name, telegram_last_name, telegram_username')
          .eq('id', userId)
          .single();
        
        if (user) {
          finalUserData = {
            name: user.name,
            telegramFirstName: user.telegram_first_name,
            telegramLastName: user.telegram_last_name,
            telegramUsername: user.telegram_username
          };
        }
      } catch (userError) {
        console.warn('[generate-pdf] Could not fetch user data:', userError);
      }
    }

    let pdfBuffer: Buffer;

    // Generate PDF using natural query if provided
    if (naturalQuery) {
      console.log('[generate-pdf] Using natural query:', naturalQuery);
      pdfBuffer = await generateEarningsPdfForQuery(
        naturalQuery,
        walletAddresses,
        finalUserData
      );
    } else {
      // Generate PDF using traditional parameters
      console.log('[generate-pdf] Using traditional parameters');
      
      // First get the earnings data
      const { getEarningsSummary } = await import('../../../lib/earningsService');
      const earningsData = await getEarningsSummary({
        walletAddresses,
        timeframe: timeframe as any,
        startDate,
        endDate,
        includeInsights: true
      }, true);

      // Then generate PDF
      const { generateEarningsPDF } = await import('../../../modules/pdf-generator-earnings');
      const pdfData = {
        ...earningsData,
        userData: finalUserData
      };
      
      pdfBuffer = await generateEarningsPDF(pdfData);
    }

    console.log('[generate-pdf] PDF generated successfully, size:', pdfBuffer.length);

    // Set appropriate headers for PDF response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="earnings-report.pdf"');
    res.setHeader('Content-Length', pdfBuffer.length);

    // Send the PDF buffer
    return res.status(200).send(pdfBuffer);

  } catch (error) {
    console.error('[generate-pdf] Error generating PDF:', error);
    
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}

// Configure Next.js to handle larger response bodies for PDFs
export const config = {
  api: {
    responseLimit: '10mb',
  },
};