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
      console.warn('No environment files found or loaded');
      
      // Hard-code critical environment variables as a last resort
      if (!process.env.CDP_API_KEY_ID) {
        console.log('Setting CDP_API_KEY_ID from hard-coded value');
        process.env.CDP_API_KEY_ID = "7f01cde6-cb23-4677-8d6f-3bca08d597dc";
      }
      
      if (!process.env.CDP_API_KEY_SECRET) {
        console.log('Setting CDP_API_KEY_SECRET from hard-coded value');
        process.env.CDP_API_KEY_SECRET = "5LZgD6J5/6gsqKRM2G7VSp3KgO6uiB/4ZrxvlLkYafv+D15/Da+7q0HbBGExXN0pjzoZqRgZ24yMbT7yav0iLg==";
      }
      
      if (!process.env.CDP_WALLET_SECRET) {
        console.log('Setting CDP_WALLET_SECRET from hard-coded value');
        // Use valid hex format for Ethereum private key (64 hex chars with 0x prefix)
        process.env.CDP_WALLET_SECRET = "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b";
      }
      
      if (!process.env.NETWORK_ID) {
        console.log('Setting NETWORK_ID from hard-coded value');
        process.env.NETWORK_ID = "base-sepolia";
      }
      
      if (!process.env.WHATSAPP_ACCESS_TOKEN) {
        console.log('Setting WHATSAPP_ACCESS_TOKEN from hard-coded value');
        process.env.WHATSAPP_ACCESS_TOKEN = "EAA1khMe7o7wBOzZBrdCWID9s2Ecrw6RpBWr72gVB64w4ProZBSrOP3HyRHHrb3QjPFeLwEkjAjoZAG6rdeYLYEyULZCvuFyQz8yQjqk3qI7mARsVEZCTB9th704Ma9FALORvO5ZAhaDKUNH3yV3iOUIsvPIsIDFvsCsZAZCr6bezTHsdB2629NqlVlmpmJgWnAeZC2ERpoyMQs8rfeXxiPPZCusABRZCEypFz2Wyobvf4sg";
      }
      
      if (!process.env.WHATSAPP_PHONE_NUMBER_ID) {
        console.log('Setting WHATSAPP_PHONE_NUMBER_ID from hard-coded value');
        process.env.WHATSAPP_PHONE_NUMBER_ID = "592458597294251";
      }
    }
  } catch (error) {
    console.error('Error in loadServerEnvironment:', error);
    
    // Hard-code critical environment variables as a last resort after an error
    if (!process.env.CDP_API_KEY_ID) {
      console.log('Setting CDP_API_KEY_ID from hard-coded value after error');
      process.env.CDP_API_KEY_ID = "7f01cde6-cb23-4677-8d6f-3bca08d597dc";
    }
    
    if (!process.env.CDP_API_KEY_SECRET) {
      console.log('Setting CDP_API_KEY_SECRET from hard-coded value after error');
      process.env.CDP_API_KEY_SECRET = "5LZgD6J5/6gsqKRM2G7VSp3KgO6uiB/4ZrxvlLkYafv+D15/Da+7q0HbBGExXN0pjzoZqRgZ24yMbT7yav0iLg==";
    }
    
    if (!process.env.CDP_WALLET_SECRET) {
      console.log('Setting CDP_WALLET_SECRET from hard-coded value after error');
      // Use valid hex format for Ethereum private key (64 hex chars with 0x prefix)
      process.env.CDP_WALLET_SECRET = "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b";
    }
    
    if (!process.env.NETWORK_ID) {
      console.log('Setting NETWORK_ID from hard-coded value after error');
      process.env.NETWORK_ID = "base-sepolia";
    }
    
    if (!process.env.WHATSAPP_ACCESS_TOKEN) {
      console.log('Setting WHATSAPP_ACCESS_TOKEN from hard-coded value after error');
      process.env.WHATSAPP_ACCESS_TOKEN = "EAA1khMe7o7wBOzZBrdCWID9s2Ecrw6RpBWr72gVB64w4ProZBSrOP3HyRHHrb3QjPFeLwEkjAjoZAG6rdeYLYEyULZCvuFyQz8yQjqk3qI7mARsVEZCTB9th704Ma9FALORvO5ZAhaDKUNH3yV3iOUIsvPIsIDFvsCsZAZCr6bezTHsdB2629NqlVlmpmJgWnAeZC2ERpoyMQs8rfeXxiPPZCusABRZCEypFz2Wyobvf4sg";
    }
    
    if (!process.env.WHATSAPP_PHONE_NUMBER_ID) {
      console.log('Setting WHATSAPP_PHONE_NUMBER_ID from hard-coded value after error');
      process.env.WHATSAPP_PHONE_NUMBER_ID = "592458597294251";
    }
  }
}

/**
 * Get CDP environment variables
 */
export function getCdpEnvironment() {
  // Use non-public variables first, then fall back to public ones if needed
  const apiKeyId = process.env.CDP_API_KEY_ID || process.env.NEXT_PUBLIC_CDP_API_KEY_ID;
  const apiKeySecret = process.env.CDP_API_KEY_SECRET || process.env.NEXT_PUBLIC_CDP_API_KEY_SECRET;
  // Use a valid hex format for Ethereum private key (64 hex chars with 0x prefix)
  const walletSecret = process.env.CDP_WALLET_SECRET || process.env.NEXT_PUBLIC_CDP_WALLET_SECRET || "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b";
  const networkId = process.env.NETWORK_ID || process.env.NEXT_PUBLIC_NETWORK_ID || "base-sepolia";
  const chainId = 84532; // Base Sepolia testnet chain ID
  const rpcUrl = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.base.org";
  
  if (!apiKeyId) {
    throw new Error('Missing required CDP API Key ID');
  }
  
  if (!apiKeySecret) {
    throw new Error('Missing required CDP API Key Secret');
  }
  
  // Log available CDP environment variables
  console.log('Available CDP environment variable keys:', 
    Object.keys(process.env)
      .filter(key => key.startsWith('CDP_') || key.startsWith('NEXT_PUBLIC_CDP_'))
  );
  
  // Check for missing essential variables and log them
  const missingVars = [];
  if (!apiKeyId) missingVars.push('CDP_API_KEY_ID');
  if (!apiKeySecret) missingVars.push('CDP_API_KEY_SECRET');
  if (!walletSecret) missingVars.push('CDP_WALLET_SECRET');
  if (!networkId) missingVars.push('NETWORK_ID');
  
  if (missingVars.length > 0) {
    console.error('Missing required environment variable:', missingVars.join(', '));
    console.error('Available environment variables:', 
      Object.keys(process.env)
        .filter(key => !key.includes('SECRET') && !key.includes('TOKEN'))
        .join(', ')
    );
  }
  
  // Log the CDP environment configuration (without exposing secrets)
  console.log('CDP environment loaded:', {
    apiKeyId: apiKeyId ? 'PRESENT' : 'MISSING',
    apiKeySecret: apiKeySecret ? 'PRESENT' : 'MISSING',
    walletSecret: walletSecret ? 'PRESENT' : 'MISSING',
    networkId,
    chainId,
    rpcUrl
  });
  
  return {
    apiKeyId,
    apiKeySecret,
    walletSecret,
    networkId,
    chainId,
    rpcUrl,
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