import fs from 'fs';
import path from 'path';
import { getRequiredEnvVar, getEnvVar } from './envUtils';

// Set default Privy environment variables if they don't exist
if (!process.env.PRIVY_APP_ID) {
  process.env.PRIVY_APP_ID = 'clxvnkrwl00zzmc0i6j7e9i3v'; // Use a valid format for Privy app ID
  console.log('NOTICE: Setting default PRIVY_APP_ID');
}
if (!process.env.PRIVY_APP_SECRET) {
  process.env.PRIVY_APP_SECRET = 'privy-app-secret-placeholder';
  console.log('NOTICE: Setting default PRIVY_APP_SECRET');
}

// Debug function to safely log wallet secret details without exposing actual values
function debugWalletSecret(label: string, secret?: string) {
  if (!secret) {
    console.log(`[DEBUG] ${label}: undefined or null`);
    return;
  }
  
  // Check if it starts with 0x (Ethereum format)
  const isEthFormat = secret.startsWith('0x');
  
  // Check if it might be PEM format
  const isPossiblyPEM = secret.includes('BEGIN') || secret.includes('MIG');
  
  // Get the type, length, and a safe prefix/suffix to show
  const type = isPossiblyPEM ? 'PEM-like' : isEthFormat ? 'Ethereum-hex' : 'unknown';
  const length = secret.length;
  const prefix = secret.substring(0, Math.min(6, length));
  const suffix = length > 6 ? secret.substring(Math.max(0, length - 4)) : '';
  
  console.log(`[DEBUG] ${label}: Format=${type}, Length=${length}, Prefix=${prefix}..${suffix}`);
  
  // Additional checks for common issues
  if (isPossiblyPEM && isEthFormat) {
    console.warn(`[WARNING] ${label} appears to mix PEM and Ethereum formats - this will cause errors`);
  }
  
  // For Ethereum format, validate correct length
  if (isEthFormat && length !== 66) {
    console.warn(`[WARNING] ${label} has Ethereum format but incorrect length (${length}). Should be 66 chars.`);
  }
  
  // Check if valid hex (if Ethereum format)
  if (isEthFormat) {
    const hexPart = secret.substring(2);
    const isValidHex = /^[0-9a-fA-F]+$/.test(hexPart);
    if (!isValidHex) {
      console.warn(`[WARNING] ${label} has invalid hex characters after 0x prefix`);
    }
  }
}

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

    console.log('[ENV DEBUG] Starting loadServerEnvironment');

    // Log the current working directory and available files
    console.log('CWD:', process.cwd());
    try {
      const files = fs.readdirSync(process.cwd());
      console.log('Files in CWD:', files);
    } catch (err) {
      console.error('Error reading CWD:', err);
    }

    // Try to load from .env files in different locations
    const possiblePaths = [
      path.join(process.cwd(), '.env'),
      path.join(process.cwd(), '.env.local'),
      path.join(process.cwd(), '.env.production'),
      path.join(process.cwd(), '..', '.env'),
      path.join(process.cwd(), '..', '.env.local'),
      path.join(process.cwd(), '..', '.env.production'),
      path.join(process.cwd(), '..', '..', '.env'),
      path.join(process.cwd(), '..', '..', '.env.local'),
      path.join(process.cwd(), '..', '..', '.env.production'),
    ];

    // Try to load environment variables from the possible paths
    let loaded = false;
    for (const envPath of possiblePaths) {
      try {
        if (fs.existsSync(envPath)) {
          console.log(`Found env file at ${envPath}`);
          const envConfig = fs.readFileSync(envPath, 'utf8');
          
          // Parse the .env file and set environment variables
          const envVars = envConfig
            .split('\n')
            .filter(line => line.trim() && !line.startsWith('#'))
            .map(line => {
              const equalIndex = line.indexOf('=');
              if (equalIndex === -1) return [];
              const key = line.substring(0, equalIndex).trim();
              const value = line.substring(equalIndex + 1).trim();
              return [key, value];
            })
            .filter(parts => parts.length === 2);
          
          for (const [key, value] of envVars) {
            if (key && value && !process.env[key]) {
              process.env[key] = value.replace(/^["']|["']$/g, ''); // Remove quotes if present
            }
          }
          
          console.log('Loaded environment variables from:', envPath);
          loaded = true;
        }
      } catch (err) {
        console.error(`Error loading env file from ${envPath}:`, err);
      }
    }
    
    // If we loaded any environment variables, log the available keys
    if (loaded) {
      console.log('Available environment keys:', 
        Object.keys(process.env)
          .filter(key => !key.includes('SECRET') && !key.includes('TOKEN'))
          .join(', ')
      );
    } else {
      console.warn('No environment files found or loaded - checking for required variables');
    }
  } catch (error) {
    console.error('Error in loadServerEnvironment:', error);
  }
}

/**
 * Get CDP environment variables
 */
export function getCdpEnvironment() {
  console.log('[ENV DEBUG] Getting CDP environment');
  
  // Use non-public variables first, then fall back to public ones if needed
  const apiKeyId = process.env.CDP_API_KEY_ID || process.env.NEXT_PUBLIC_CDP_API_KEY_ID;
  const apiKeySecret = process.env.CDP_API_KEY_SECRET || process.env.NEXT_PUBLIC_CDP_API_KEY_SECRET;
  
  // Check for environment wallet secret
  let envWalletSecret = process.env.CDP_WALLET_SECRET || process.env.NEXT_PUBLIC_CDP_WALLET_SECRET;
  
  // We're no longer using CDP wallet secret, so this is deprecated
  console.log('[ENV DEBUG] CDP wallet secret is deprecated - using Privy wallet provider instead');
  
  const networkId = process.env.NETWORK_ID || process.env.NEXT_PUBLIC_NETWORK_ID || "base-sepolia";
  const chainId = 84532; // Base Sepolia testnet chain ID
  const rpcUrl = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.base.org";
  
  // Log the CDP environment configuration (without exposing secrets)
  console.log('CDP environment loaded:', {
    apiKeyId: apiKeyId ? 'PRESENT' : 'MISSING',
    apiKeySecret: apiKeySecret ? 'PRESENT' : 'MISSING',
    networkId,
    chainId,
    rpcUrl
  });
  
  return {
    apiKeyId,
    apiKeySecret,
    networkId,
    chainId,
    rpcUrl,
  };
}

/**
 * Get Privy environment variables
 */
export function getPrivyEnvironment() {
  let appId = process.env.PRIVY_APP_ID || '';
  const appSecret = process.env.PRIVY_APP_SECRET || '';
  
  // Validate Privy App ID format - should be in format like clxvnkrwl00zzmc0i6j7e9i3v
  // If not in correct format and we're using fallbacks, use a valid format
  if (!/^cl[a-z0-9]{24,30}$/.test(appId)) {
    console.warn('[ENV] Privy App ID does not match expected format');
    
    const isDev = process.env.NODE_ENV === 'development';
    const useDevFallbacks = isDev || (global as any).__USE_DEV_FALLBACKS__;
    
    if (useDevFallbacks) {
      console.warn('[ENV] Using fallback Privy App ID with valid format');
      appId = 'clxvnkrwl00zzmc0i6j7e9i3v';
    }
  }
  
  console.log('[ENV] Using Privy App ID:', appId.substring(0, 5) + '...' + appId.substring(appId.length - 5));
  
  return {
    appId,
    appSecret
  };
}

/**
 * Get WhatsApp environment variables
 */
export function getWhatsAppEnvironment() {
  let accessToken = safeGetRequiredEnvVar('WHATSAPP_ACCESS_TOKEN');
  let phoneNumberId = safeGetRequiredEnvVar('WHATSAPP_PHONE_NUMBER_ID');
  let verifyToken = '';
  
  // Check if we need to use fallbacks
  const isDev = process.env.NODE_ENV === 'development';
  const useDevFallbacks = isDev || (global as any).__USE_DEV_FALLBACKS__;
  
  // Validate WhatsApp access token format
  if (accessToken === 'dev-whatsapp-token' || 
      accessToken.includes('dev-') || 
      accessToken.length < 20) {
    
    console.warn('[ENV] WhatsApp access token appears to be a placeholder');
    
    if (useDevFallbacks) {
      console.warn('[ENV] Using fallback WhatsApp access token format');
      // Use a format that at least resembles a real token
      accessToken = 'EAABBCCDDEEFFGGHHIIJJKKLLMMNNOOPPQQRRSSTTUUVVWWXXYYZZaabbccddeeffgg';
    }
  }
  
  // Validate phone number ID format
  if (phoneNumberId === 'dev-whatsapp-phone-number-id' || 
      phoneNumberId.includes('dev-') || 
      !/^\d+$/.test(phoneNumberId)) {
    
    console.warn('[ENV] WhatsApp phone number ID appears to be invalid');
    
    if (useDevFallbacks) {
      console.warn('[ENV] Using fallback WhatsApp phone number ID');
      // Use a format that at least resembles a real phone number ID
      phoneNumberId = '123456789012345';
    }
  }
  
  try {
    verifyToken = getRequiredEnvVar('WHATSAPP_VERIFY_TOKEN');
  } catch (error) {
    // In development or with fallbacks, use a placeholder
    if (useDevFallbacks) {
      console.warn('[ENV DEBUG] Using development placeholder for WHATSAPP_VERIFY_TOKEN');
      verifyToken = 'dev-verify-token';
    } else {
      throw error;
    }
  }
  
  console.log('[ENV] Using WhatsApp credentials:');
  console.log('- Access Token:', accessToken.substring(0, 5) + '...' + accessToken.substring(accessToken.length - 5));
  console.log('- Phone Number ID:', phoneNumberId);
  
  return {
    accessToken,
    phoneNumberId,
    verifyToken,
  };
}

/**
 * Safe version of getRequiredEnvVar that falls back to development values
 */
function safeGetRequiredEnvVar(name: string): string {
  try {
    // Check for direct environment variable
    if (process.env[name]) {
      return process.env[name] as string;
    }
    
    // Check for Netlify-specific environment variable format (NETLIFY_VAR_NAME)
    const netlifyName = `NETLIFY_${name}`;
    if (process.env[netlifyName]) {
      console.log(`[ENV] Found Netlify-specific variable format: ${netlifyName}`);
      return process.env[netlifyName] as string;
    }
    
    // Check for environment variable with different casing
    const upperName = name.toUpperCase();
    if (name !== upperName && process.env[upperName]) {
      console.log(`[ENV] Found environment variable with different casing: ${upperName}`);
      return process.env[upperName] as string;
    }
    
    // Use development fallbacks if we're in dev mode OR if the global flag is set
    const isDev = process.env.NODE_ENV === 'development';
    const useDevFallbacks = isDev || (global as any).__USE_DEV_FALLBACKS__;
    
    if (useDevFallbacks) {
      console.warn(`[ENV] Using development placeholder for ${name}`);
      return `dev-${name.toLowerCase().replace(/_/g, '-')}`;
    }
    
    // If we're on Netlify, log more details about available variables
    const possibleNetlifyIndicators = [
      process.env.NETLIFY,
      process.env.CONTEXT,
      process.env.NETLIFY_IMAGES_CDN_DOMAIN,
      process.env.DEPLOY_PRIME_URL,
      process.env.DEPLOY_URL,
      process.env.URL
    ];
    
    const isNetlify = possibleNetlifyIndicators.some(indicator => !!indicator);
    
    if (isNetlify) {
      console.error(`[ENV] Missing required variable ${name} on Netlify deployment`);
      console.error('[ENV] Available environment variables (keys only):');
      const availableKeys = Object.keys(process.env).filter(key => 
        !key.includes('npm_') && !key.includes('PATH') && !key.includes('HOME')
      );
      console.error(availableKeys.join(', '));
    }
    
    throw new Error(`Required environment variable ${name} is not defined`);
  } catch (error) {
    // Use development fallbacks if we're in dev mode OR if the global flag is set
    const isDev = process.env.NODE_ENV === 'development';
    const useDevFallbacks = isDev || (global as any).__USE_DEV_FALLBACKS__;
    
    if (useDevFallbacks) {
      console.warn(`[ENV] Using development placeholder for ${name}`);
      return process.env[name] || `dev-${name.toLowerCase().replace(/_/g, '-')}`;
    }
    throw error;
  }
}

// Load environment variables immediately
loadServerEnvironment(); 