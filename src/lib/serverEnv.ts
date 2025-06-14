import fs from 'fs';
import path from 'path';
import { getRequiredEnvVar, getEnvVar } from './envUtils';

/**
 * Loads environment variables from .env.local file for serverless functions
 * This is needed because Netlify functions don't automatically load .env.local files
 */
export function loadServerEnvironment() {
  try {
    // Only run this in serverless function environment
    if (typeof window !== 'undefined') {
      return;
    }

    // Log the current working directory and available files
    console.log('CWD:', process.cwd());
    try {
      const files = fs.readdirSync(process.cwd());
      console.log('Files in CWD:', files);
    } catch (err) {
      console.error('Error reading CWD:', err);
    }

    // Try to load from .env.local in different locations
    const possiblePaths = [
      path.join(process.cwd(), '.env.local'),
      path.join(process.cwd(), '..', '.env.local'),
      path.join(process.cwd(), '..', '..', '.env.local'),
    ];

    for (const envPath of possiblePaths) {
      try {
        if (fs.existsSync(envPath)) {
          console.log(`Found .env.local at ${envPath}`);
          const envConfig = fs.readFileSync(envPath, 'utf8');
          
          // Parse the .env file and set environment variables
          const envVars = envConfig
            .split('\n')
            .filter(line => line.trim() && !line.startsWith('#'))
            .map(line => line.split('=').map(part => part.trim()));
          
          for (const [key, value] of envVars) {
            if (key && value && !process.env[key]) {
              process.env[key] = value.replace(/^["']|["']$/g, ''); // Remove quotes if present
            }
          }
          
          console.log('Loaded environment variables from:', envPath);
          console.log('Available environment keys:', 
            Object.keys(process.env)
              .filter(key => !key.includes('SECRET') && !key.includes('TOKEN'))
              .join(', ')
          );
          break;
        }
      } catch (err) {
        console.error(`Error loading .env.local from ${envPath}:`, err);
      }
    }
  } catch (error) {
    console.error('Error in loadServerEnvironment:', error);
  }
}

/**
 * Get CDP environment variables
 */
export function getCdpEnvironment() {
  // Use non-public variables first, then fall back to public ones if needed
  const apiKeyId = process.env.CDP_API_KEY_ID || process.env.NEXT_PUBLIC_CDP_API_KEY_ID;
  const apiKeySecret = process.env.CDP_API_KEY_SECRET || process.env.NEXT_PUBLIC_CDP_API_KEY_SECRET;
  const walletSecret = process.env.CDP_WALLET_SECRET || process.env.NEXT_PUBLIC_CDP_WALLET_SECRET || '';
  
  if (!apiKeyId) {
    throw new Error('Missing required CDP API Key ID');
  }
  
  if (!apiKeySecret) {
    throw new Error('Missing required CDP API Key Secret');
  }
  
  return {
    apiKeyId,
    apiKeySecret,
    walletSecret,
    networkId: getEnvVar('NETWORK_ID', 'base-sepolia'),
  };
}

/**
 * Get WhatsApp environment variables
 */
export function getWhatsAppEnvironment() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || '';
  
  if (!accessToken) {
    throw new Error('Missing required WhatsApp Access Token');
  }
  
  if (!phoneNumberId) {
    throw new Error('Missing required WhatsApp Phone Number ID');
  }
  
  return {
    accessToken,
    phoneNumberId,
    verifyToken,
  };
}

// Load environment variables immediately
loadServerEnvironment(); 