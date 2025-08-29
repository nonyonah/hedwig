import * as fs from 'fs';
import * as path from 'path';
import { getRequiredEnvVar, getEnvVar } from './envUtils';

// Load environment variables first before setting any defaults
if (!process.env.NETLIFY) {
  // Load environment variables from .env files first
  loadServerEnvironmentSync();
  
  // Only set defaults if still missing after loading .env files
  if (!process.env.PRIVY_APP_ID) {
    console.log('WARNING: PRIVY_APP_ID not found in environment files');
  }
  if (!process.env.PRIVY_APP_SECRET) {
    console.log('WARNING: PRIVY_APP_SECRET not found in environment files');
  }
  if (!process.env.PRIVY_KEY_QUORUM_ID) {
    console.log('WARNING: PRIVY_KEY_QUORUM_ID not set - KeyQuorum authorization will not work');
  }
  if (!process.env.PRIVY_AUTHORIZATION_KEY) {
    console.log('WARNING: PRIVY_AUTHORIZATION_KEY not set - KeyQuorum authorization will not work');
  }
}

/**
 * Synchronous version of loadServerEnvironment for module initialization
 */
function loadServerEnvironmentSync() {
  try {
    // Only run this in serverless function environment
    if (typeof window !== 'undefined') {
      return;
    }

    // Skip environment loading during build time or when CWD is root
    const cwd = process.cwd();
    if (cwd === '/' || cwd === 'C:\\' || process.env.NODE_ENV === 'production') {
      console.log('[ENV] Skipping sync environment loading during build or production');
      return;
    }

    // Try to load from .env files in different locations
    const possiblePaths = [
      path.join(process.cwd(), '.env.local'),
      path.join(process.cwd(), '.env'),
      path.join(process.cwd(), '.env.production'),
    ];

    // Try to load environment variables from the possible paths
    let loaded = false;
    for (const envPath of possiblePaths) {
      try {
        if (fs.existsSync(envPath)) {
          const envConfig = fs.readFileSync(envPath, 'utf8');
          
          // Parse the .env file and set environment variables
          if (envConfig && typeof envConfig === 'string' && envConfig.trim()) {
            try {
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
            } catch (parseError) {
              console.error(`Error parsing env file ${envPath}:`, parseError);
            }
          }
          
          console.log('Loaded environment variables from:', envPath);
          loaded = true;
          break; // Stop after loading the first found file
        }
      } catch (err) {
        console.error(`Error loading env file from ${envPath}:`, err);
      }
    }
    
    if (!loaded) {
      console.warn('No environment files found - using process.env values');
    }
  } catch (error) {
    console.error('Error in loadServerEnvironmentSync:', error);
  }
}

/**
 * Loads environment variables from .env.local file for serverless functions
 * This is needed because Netlify functions don't automatically load .env.local files
 * NOTE: This function only runs in local development, not on Netlify.
 *       Netlify injects environment variables automatically, so we skip loading .env files.
 */
export function loadServerEnvironment() {
  try {
    // Only run this in serverless function environment
    if (typeof window !== 'undefined') {
      return;
    }

    // Skip environment loading during build time or when CWD is root
    const cwd = process.cwd();
    if (cwd === '/' || cwd === 'C:\\' || process.env.NODE_ENV === 'production') {
      console.log('[ENV] Skipping environment loading during build or production');
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
          if (envConfig && typeof envConfig === 'string' && envConfig.trim()) {
            try {
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
            } catch (parseError) {
              console.error(`Error parsing env file ${envPath}:`, parseError);
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
 * Get CDP environment variables with network-specific configuration
 */
export function getCdpEnvironment() {
  console.log('[ENV DEBUG] Getting CDP environment');
  
  // Import the network configuration helper
  const { NetworkConfig, getCurrentNetworkEnvironment } = require('./envConfig');
  const currentNetwork = getCurrentNetworkEnvironment();
  
  // Use network-specific variables first, then fall back to general ones
  const apiKeyId = NetworkConfig.cdp.apiKeyId(currentNetwork) || process.env.NEXT_PUBLIC_CDP_API_KEY_ID;
  const apiKeySecret = NetworkConfig.cdp.apiKeySecret(currentNetwork) || process.env.NEXT_PUBLIC_CDP_API_KEY_SECRET;
  const walletSecret = NetworkConfig.cdp.walletSecret(currentNetwork) || process.env.NEXT_PUBLIC_CDP_WALLET_SECRET;
  
  // Check if we have all required CDP credentials
  if (!apiKeyId || !apiKeySecret || !walletSecret) {
    console.error('[ENV ERROR] Missing required CDP credentials for', currentNetwork, ':',
      !apiKeyId ? 'CDP_API_KEY_ID is missing' : '',
      !apiKeySecret ? 'CDP_API_KEY_SECRET is missing' : '',
      !walletSecret ? 'CDP_WALLET_SECRET is missing' : ''
    );
  } else {
    console.log(`[ENV] CDP credentials loaded successfully for ${currentNetwork}`);
  }
  
  const networkId = process.env.NETWORK_ID || process.env.NEXT_PUBLIC_NETWORK_ID || "base";
  
  // Log the CDP environment configuration (without exposing secrets)
  console.log('CDP environment loaded:', {
    network: currentNetwork,
    apiKeyId: apiKeyId ? 'PRESENT' : 'MISSING',
    apiKeySecret: apiKeySecret ? 'PRESENT' : 'MISSING',
    walletSecret: walletSecret ? 'PRESENT' : 'MISSING',
    networkId,
  });
  
  return {
    apiKeyId,
    apiKeySecret,
    walletSecret,
    networkId,
    network: currentNetwork,
  };
}

/**
 * Get Privy environment variables
 */
export function getPrivyEnvironment() {
  let appId = process.env.PRIVY_APP_ID || '';
  const appSecret = process.env.PRIVY_APP_SECRET || '';
  
  // Simple check for Privy App ID
  if (!appId) {
    console.warn('[ENV] Missing Privy App ID');
    
    const isDev = process.env.NODE_ENV === 'development';
    const useDevFallbacks = isDev || (global as any).__USE_DEV_FALLBACKS__;
    
    if (useDevFallbacks) {
      console.warn('[ENV] Using fallback Privy App ID');
      appId = 'demo-app-id'; // Simple placeholder
    }
  }
  
  if (appId) {
    console.log('[ENV] Using Privy App ID:', appId.substring(0, Math.min(5, appId.length)) + '...');
  }
  
  return {
    appId,
    appSecret
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

// Load environment variables immediately, but skip on Netlify (Netlify injects env vars automatically)
if (!process.env.NETLIFY) {
  loadServerEnvironment();
} else {
  console.log('[ENV] Skipping loadServerEnvironment on Netlify. Environment variables are injected by Netlify.');
}

/**
 * Get required environment variables
 */
export function getServerEnvironment() {
  // BlockRadar API key - make it optional to prevent build errors
  const blockRadarApiKey = getEnvVar('BLOCK_RADAR_API_KEY', '');

  return {
    blockRadarApiKey,
  };
}