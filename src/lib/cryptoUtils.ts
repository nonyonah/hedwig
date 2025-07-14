// src/lib/cryptoUtils.ts
import { webcrypto } from 'crypto';
import * as hpke from 'hpke-js';

/**
 * Cryptographic utilities for Privy KeyQuorum integration
 * Handles key generation, encryption, and decryption operations
 */

/**
 * Generate an ECDH P-256 key pair for Privy user signers
 * This follows Privy's recommendation for session signer authorization
 * @returns Promise containing the generated key pair
 */
export async function generateECDHP256KeyPair(): Promise<{
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  privateKeyBase64: string;
  publicKeyBase64: string;
  privateKeyPem: string;
  publicKeyPem: string;
}> {
  try {
    // Generate ECDH P-256 keypair as recommended by Privy support
    const keypair = await webcrypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true, // extractable
      ['deriveKey', 'deriveBits']
    );

    // Export keys in different formats
    const [publicKeySpki, privateKeyPkcs8] = await Promise.all([
      webcrypto.subtle.exportKey('spki', keypair.publicKey),
      webcrypto.subtle.exportKey('pkcs8', keypair.privateKey),
    ]);

    // Convert to base64
    const publicKeyBase64 = Buffer.from(publicKeySpki).toString('base64');
    const privateKeyBase64 = Buffer.from(privateKeyPkcs8).toString('base64');

    // Convert to PEM format
    const publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${publicKeyBase64}\n-----END PUBLIC KEY-----`;
    const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${privateKeyBase64}\n-----END PRIVATE KEY-----`;

    return {
      privateKey: keypair.privateKey,
      publicKey: keypair.publicKey,
      privateKeyBase64,
      publicKeyBase64,
      privateKeyPem,
      publicKeyPem,
    };
  } catch (error) {
    console.error('[generateECDHP256KeyPair] Failed to generate ECDH P-256 keypair:', error);
    throw new Error(`Failed to generate ECDH P-256 keypair: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate a P-256 key pair for Privy KeyQuorum authorization
 * @returns Promise containing the generated key pair
 */
export async function generateP256KeyPair(): Promise<{
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  privateKeyBase64: string;
  publicKeyBase64: string;
  privateKeyPem: string;
  publicKeyPem: string;
}> {
  try {
    // Generate P-256 key pair
    const keyPair = await webcrypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      true, // extractable
      ['sign', 'verify']
    );

    // Export keys in raw format
    const privateKeyRaw = await webcrypto.subtle.exportKey('pkcs8', keyPair.privateKey);
    const publicKeyRaw = await webcrypto.subtle.exportKey('spki', keyPair.publicKey);

    // Convert to base64
    const privateKeyBase64 = Buffer.from(privateKeyRaw).toString('base64');
    const publicKeyBase64 = Buffer.from(publicKeyRaw).toString('base64');

    // Convert to PEM format
    const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${privateKeyBase64.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----`;
    const publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${publicKeyBase64.match(/.{1,64}/g)?.join('\n')}\n-----END PUBLIC KEY-----`;

    return {
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
      privateKeyBase64,
      publicKeyBase64,
      privateKeyPem,
      publicKeyPem,
    };
  } catch (error) {
    console.error('[cryptoUtils] Failed to generate P-256 key pair:', error);
    throw new Error(`Key generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Import a private key from base64 string
 * @param privateKeyBase64 - Base64 encoded private key
 * @returns Promise containing the imported CryptoKey
 */
export async function importPrivateKeyFromBase64(privateKeyBase64: string): Promise<CryptoKey> {
  try {
    const privateKeyBuffer = Buffer.from(privateKeyBase64, 'base64');
    
    const privateKey = await webcrypto.subtle.importKey(
      'pkcs8',
      privateKeyBuffer,
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      true,
      ['sign']
    );

    return privateKey;
  } catch (error) {
    console.error('[cryptoUtils] Failed to import private key:', error);
    throw new Error(`Private key import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Import a public key from base64 string
 * @param publicKeyBase64 - Base64 encoded public key
 * @returns Promise containing the imported CryptoKey
 */
export async function importPublicKeyFromBase64(publicKeyBase64: string): Promise<CryptoKey> {
  try {
    const publicKeyBuffer = Buffer.from(publicKeyBase64, 'base64');
    
    const publicKey = await webcrypto.subtle.importKey(
      'spki',
      publicKeyBuffer,
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      true,
      ['verify']
    );

    return publicKey;
  } catch (error) {
    console.error('[cryptoUtils] Failed to import public key:', error);
    throw new Error(`Public key import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Sign data using ECDSA with P-256
 * @param data - Data to sign
 * @param privateKey - Private key for signing
 * @returns Promise containing the signature as base64 string
 */
export async function signData(data: string | Uint8Array, privateKey: CryptoKey): Promise<string> {
  try {
    const dataBuffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    
    const signature = await webcrypto.subtle.sign(
      {
        name: 'ECDSA',
        hash: 'SHA-256',
      },
      privateKey,
      dataBuffer
    );

    return Buffer.from(signature).toString('base64');
  } catch (error) {
    console.error('[cryptoUtils] Failed to sign data:', error);
    throw new Error(`Data signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Verify a signature using ECDSA with P-256
 * @param data - Original data
 * @param signature - Signature to verify (base64 string)
 * @param publicKey - Public key for verification
 * @returns Promise containing verification result
 */
export async function verifySignature(
  data: string | Uint8Array,
  signature: string,
  publicKey: CryptoKey
): Promise<boolean> {
  try {
    const dataBuffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const signatureBuffer = Buffer.from(signature, 'base64');
    
    const isValid = await webcrypto.subtle.verify(
      {
        name: 'ECDSA',
        hash: 'SHA-256',
      },
      publicKey,
      signatureBuffer,
      dataBuffer
    );

    return isValid;
  } catch (error) {
    console.error('[cryptoUtils] Failed to verify signature:', error);
    return false;
  }
}

/**
 * Generate a random nonce for cryptographic operations
 * @param length - Length of the nonce in bytes (default: 32)
 * @returns Base64 encoded nonce
 */
export function generateNonce(length: number = 32): string {
  const nonce = webcrypto.getRandomValues(new Uint8Array(length));
  return Buffer.from(nonce).toString('base64');
}

/**
 * Hash data using SHA-256
 * @param data - Data to hash
 * @returns Promise containing the hash as base64 string
 */
export async function sha256Hash(data: string | Uint8Array): Promise<string> {
  try {
    const dataBuffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const hashBuffer = await webcrypto.subtle.digest('SHA-256', dataBuffer);
    return Buffer.from(hashBuffer).toString('base64');
  } catch (error) {
    console.error('[cryptoUtils] Failed to hash data:', error);
    throw new Error(`Hashing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Utility function to validate environment variables for cryptographic operations
 */
export function validateCryptoEnvironment(): {
  isValid: boolean;
  missingVars: string[];
  warnings: string[];
} {
  const requiredVars = [
    'PRIVY_APP_ID',
    'PRIVY_APP_SECRET',
    'PRIVY_AUTHORIZATION_KEY',
    'PRIVY_KEY_QUORUM_ID'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  const warnings: string[] = [];

  // Check if authorization key looks like a valid base64 encoded key
  if (process.env.PRIVY_AUTHORIZATION_KEY) {
    try {
      const decoded = Buffer.from(process.env.PRIVY_AUTHORIZATION_KEY, 'base64');
      if (decoded.length < 32) {
        warnings.push('PRIVY_AUTHORIZATION_KEY appears to be too short for a secure key');
      }
    } catch {
      warnings.push('PRIVY_AUTHORIZATION_KEY does not appear to be valid base64');
    }
  }

  return {
    isValid: missingVars.length === 0,
    missingVars,
    warnings
  };
}