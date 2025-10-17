import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { 
  getEarningsForNaturalQuery, 
  formatEarningsForNaturalLanguage,
  UserData 
} from '../../../lib/earningsService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface NaturalEarningsQueryRequest {
  query: string;
  walletAddresses: string[];
  generatePdf?: boolean;
  userId?: string;
}

export interface NaturalEarningsQueryResponse {
  success: boolean;
  data?: any;
  naturalLanguageResponse?: string;
  pdfUrl?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<NaturalEarningsQueryResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.'
    });
  }

  const { query, walletAddresses, generatePdf, userId }: NaturalEarningsQueryRequest = req.body;

  // Validate required fields
  if (!query || typeof query !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Query is required and must be a string'
    });
  }

  if (!walletAddresses || !Array.isArray(walletAddresses) || walletAddresses.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'walletAddresses is required and must be a non-empty array'
    });
  }

  // Sanitize query input
  const sanitizedQuery = query.trim().substring(0, 500); // Limit query length

  try {
    
    console.log('[natural-query] Processing query:', sanitizedQuery);
    console.log('[natural-query] Wallet addresses:', walletAddresses);

    // Get user data if userId is provided
    let userData: UserData | undefined;
    if (userId) {
      try {
        const { data: user } = await supabase
          .from('users')
          .select('name, telegram_first_name, telegram_last_name, telegram_username')
          .eq('id', userId)
          .single();
        
        if (user) {
          userData = {
            name: user.name,
            telegramFirstName: user.telegram_first_name,
            telegramLastName: user.telegram_last_name,
            telegramUsername: user.telegram_username
          };
        }
      } catch (userError) {
        console.warn('[natural-query] Could not fetch user data:', userError);
      }
    }

    // Process natural language query
    const earningsData = await getEarningsForNaturalQuery(
      sanitizedQuery,
      walletAddresses,
      userData
    );

    // Generate natural language response
    const naturalLanguageResponse = formatEarningsForNaturalLanguage(
      earningsData,
      sanitizedQuery
    );

    let pdfUrl: string | undefined;

    // Generate PDF if requested
    if (generatePdf) {
      try {
        const { generateEarningsPdfForQuery } = await import('../../../lib/earningsService');
        const pdfBuffer = await generateEarningsPdfForQuery(
          sanitizedQuery,
          walletAddresses,
          userData
        );

        // For now, we'll return the PDF as base64
        // In production, you might want to upload to cloud storage and return a URL
        const pdfBase64 = pdfBuffer.toString('base64');
        pdfUrl = `data:application/pdf;base64,${pdfBase64}`;
        
        console.log('[natural-query] PDF generated successfully, size:', pdfBuffer.length);
      } catch (pdfError) {
        console.error('[natural-query] PDF generation failed:', pdfError);
        // Don't fail the entire request if PDF generation fails
      }
    }

    console.log('[natural-query] Query processed successfully:', {
      totalEarnings: earningsData.totalEarnings,
      totalPayments: earningsData.totalPayments,
      timeframe: earningsData.timeframe,
      hasPdf: !!pdfUrl
    });

    return res.status(200).json({
      success: true,
      data: earningsData,
      naturalLanguageResponse,
      pdfUrl
    });

  } catch (error) {
    console.error('[natural-query] Error processing request:', error);
    
    // Import error handler
    const { EarningsErrorHandler } = await import('../../../lib/earningsErrorHandler');
    
    // Handle specific error types
    let statusCode = 500;
    let errorMessage = 'Internal server error';
    
    if (error instanceof Error && error.name === 'EarningsError') {
      const earningsError = error as any;
      
      // Map error codes to HTTP status codes
      switch (earningsError.code) {
        case 'MISSING_WALLET_ADDRESSES':
        case 'INVALID_QUERY_FORMAT':
        case 'INVALID_TIME_PERIOD':
          statusCode = 400;
          break;
        case 'RATE_LIMIT_EXCEEDED':
          statusCode = 429;
          break;
        case 'NO_DATA_FOUND':
          statusCode = 404;
          break;
        default:
          statusCode = 500;
      }
      
      errorMessage = EarningsErrorHandler.formatErrorForUser(earningsError, sanitizedQuery, 'api');
    } else {
      errorMessage = EarningsErrorHandler.formatErrorForUser(
        error instanceof Error ? error : new Error(String(error)),
        sanitizedQuery,
        'api'
      );
    }
    
    return res.status(statusCode).json({
      success: false,
      error: errorMessage
    });
  }
}

// Rate limiting helper (basic implementation)
const requestCounts = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(identifier: string, maxRequests = 10, windowMs = 60000): boolean {
  const now = Date.now();
  const userRequests = requestCounts.get(identifier);
  
  if (!userRequests || now > userRequests.resetTime) {
    requestCounts.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (userRequests.count >= maxRequests) {
    return false;
  }
  
  userRequests.count++;
  return true;
}