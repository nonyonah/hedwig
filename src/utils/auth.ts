import { NextApiRequest } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface AuthResult {
  success: boolean;
  userId?: string;
  error?: string;
}

/**
 * Verify API key from request headers or admin access
 */
export async function verifyApiKey(req: NextApiRequest): Promise<AuthResult> {
  try {
    // Check for API key in headers
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    
    if (apiKey) {
      // Verify API key against environment variable
      const validApiKey = process.env.HEDWIG_API_KEY || process.env.API_KEY;
      if (validApiKey && apiKey === validApiKey) {
        return {
          success: true,
          userId: 'api-user'
        };
      }
    }

    // Check for admin access token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      // Verify JWT token with Supabase
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error || !user) {
        return {
          success: false,
          error: 'Invalid token'
        };
      }

      // Check if user has admin role
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (profileError || !profile || profile.role !== 'admin') {
        return {
          success: false,
          error: 'Admin access required'
        };
      }

      return {
        success: true,
        userId: user.id
      };
    }

    return {
      success: false,
      error: 'No valid authentication provided'
    };
  } catch (error) {
    console.error('Auth verification error:', error);
    return {
      success: false,
      error: 'Authentication failed'
    };
  }
}

/**
 * Verify user session token
 */
export async function verifyUserSession(req: NextApiRequest): Promise<AuthResult> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        success: false,
        error: 'No authorization header'
      };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return {
        success: false,
        error: 'Invalid session token'
      };
    }

    return {
      success: true,
      userId: user.id
    };
  } catch (error) {
    console.error('Session verification error:', error);
    return {
      success: false,
      error: 'Session verification failed'
    };
  }
}