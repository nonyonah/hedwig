import type { NextApiRequest, NextApiResponse } from 'next';
import { loadServerEnvironment } from '@/lib/serverEnv';

// Ensure environment variables are loaded
loadServerEnvironment();

// CORS headers for API responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// WhatsApp webhook verification
export const dynamic = 'force-dynamic';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Handle different HTTP methods
  if (req.method === 'GET') {
    await handleWebhookVerification(req, res);
  } else if (req.method === 'POST') {
    await handleWebhookMessage(req, res);
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

async function handleWebhookVerification(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Log environment information
    console.log('=== Environment Information ===');
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('VERCEL_ENV:', process.env.VERCEL_ENV);
    console.log('VERCEL_REGION:', process.env.VERCEL_REGION);
    
    // Log all environment variables that might be relevant (filtered to avoid sensitive data)
    const envVars = Object.entries(process.env).filter(([key]) => 
      key.includes('VERCEL') || 
      key.includes('NEXT_') || 
      key.includes('WHAT') || 
      key.includes('WEBHOOK')
    );
    console.log('Relevant environment variables:', Object.fromEntries(envVars));

    // Log request details
    console.log('\n=== Request Information ===');
    console.log('Request URL:', req.url);
    console.log('Request method:', req.method);
    console.log('Request headers:', req.headers);
    
    // Log raw query string
    const rawQuery = req.url?.split('?')[1] || '';
    console.log('Raw query string:', rawQuery);
    
    // Get query parameters
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    
    console.log('Parsed query parameters:', req.query);
    
    // Get the verify token from environment variables
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || process.env.WEBHOOK_VERIFY_TOKEN;
    
    if (!verifyToken) {
      console.error('Error: No verification token found in environment variables. Please set WHATSAPP_VERIFY_TOKEN or WEBHOOK_VERIFY_TOKEN.');
      return res.status(500).send('Server configuration error');
    }
    
    // Log all environment variables for debugging
    console.log('\n=== Environment Debug ===');
    console.log('process.env keys:', Object.keys(process.env).join(', '));
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('VERCEL:', process.env.VERCEL);
    console.log('VERCEL_ENV:', process.env.VERCEL_ENV);
    
    // Try to read from .env file directly for debugging
    // Using dynamic import to handle ESM modules
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const envPath = path.join(process.cwd(), '.env');
      try {
        const envContent = await fs.readFile(envPath, 'utf8');
        console.log('.env file exists at:', envPath);
        console.log('.env content:', envContent);
      } catch (error) {
        console.log('No .env file found or cannot be read at:', envPath, 'Error:', error instanceof Error ? error.message : String(error));
      }
    } catch (importError) {
      console.error('Error importing modules for file system access:', importError);
    }
    
    // Log minimal verification details (avoid logging tokens in production)
    console.log('Webhook verification attempt:', {
      mode,
      hasReceivedToken: !!token,
      hasExpectedToken: !!verifyToken,
      hasChallenge: !!challenge
    });

    // Verify the webhook
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('Webhook verified successfully');
      // Return the challenge as plain text
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Length', challenge ? challenge.toString().length : 0);
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return res.status(200).send(challenge);
    }

    console.error('Webhook verification failed:', { 
      mode, 
      token, 
      verifyToken,
      isValid: mode === 'subscribe' && token === verifyToken,
      url: req.url
    });
    
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.status(403).send('Verification failed: token or mode mismatch');
  } catch (error) {
    console.error('Error in webhook verification:', error);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.status(500).send('Server error during verification');
  }
}

async function handleWebhookMessage(req: NextApiRequest, res: NextApiResponse) {
  try {
    const body = req.body;
    console.log('Received webhook payload:', JSON.stringify(body, null, 2));
    console.log('Webhook received:', JSON.stringify(body, null, 2));

    if (body.object === 'whatsapp_business_account') {
      if (body.entry && body.entry.length > 0) {
        for (const entry of body.entry) {
          for (const change of entry.changes) {
            if (change.field === 'messages') {
              const messages = change.value.messages || [];
              for (const message of messages) {
                const from = message.from;
                const messageType = message.type;
                if (messageType === 'text') {
                  const messageText = message.text.body;
                  console.log(`Received text message from ${from}: ${messageText}`);

                  // Get the base URL from environment variable or use relative URL for same-origin
                  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
                  const processApiUrl = `${baseUrl}/api/process-cdp-message`;
                  
                  console.log(`Forwarding message to: ${processApiUrl}`);
                  
                  try {
                    const response = await fetch(processApiUrl, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({ 
                        from, 
                        messageText,
                        timestamp: new Date().toISOString()
                      }),
                    });

                    if (!response.ok) {
                      const errorText = await response.text();
                      console.error(`API Error (${response.status}):`, errorText);
                    } else {
                      const result = await response.json();
                      console.log('Message processed successfully:', result);
                    }
                  } catch (fetchError) {
                    console.error('Failed to call process-cdp-message API:', fetchError);
                    // Optionally implement retry logic here
                  }

                  console.log(`Message from ${from} forwarded to CDP processor.`);
                } else {
                  console.log(`Unsupported message type: ${messageType} from ${from}. Not forwarding.`);
                }
              }
            }
          }
        }
      }
      return res.status(200).send('EVENT_RECEIVED');
    }
    return res.status(404).send('Invalid request');
  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).send('Error processing webhook');
  }
}