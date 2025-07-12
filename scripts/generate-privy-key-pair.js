/**
 * Script to generate a P-256 key pair for Privy KeyQuorum authorization
 * 
 * This script generates a P-256 key pair that can be used for signing Privy KeyQuorum API requests.
 * The private key should be set as PRIVY_AUTHORIZATION_KEY in your environment variables.
 * The public key should be registered with Privy for your KeyQuorum account.
 * 
 * Updated to use the dedicated cryptoUtils module for better security and maintainability.
 */

import { generateP256KeyPair, validateCryptoEnvironment } from '../src/lib/cryptoUtils.js';

// Main function to generate and display the key pair
async function main() {
  try {
    console.log('\n=== Privy KeyQuorum P-256 Key Pair Generator ===\n');
    
    // Validate crypto environment (optional for key generation)
    const validation = validateCryptoEnvironment();
    if (validation.warnings.length > 0) {
      console.log('Environment warnings:');
      validation.warnings.forEach(warning => console.log(`  - ${warning}`));
      console.log('');
    }
    
    console.log('Generating P-256 key pair...');
    
    // Generate the key pair using cryptoUtils
    const keyPair = await generateP256KeyPair();
    
    console.log('\n=== Generated Key Pair ===\n');
    
    console.log('PRIVATE KEY (base64, for PRIVY_AUTHORIZATION_KEY):');
    console.log(keyPair.privateKeyBase64);
    console.log('\nPRIVATE KEY (PEM format):');
    console.log(keyPair.privateKeyPem);
    
    console.log('\nPUBLIC KEY (base64, for Privy registration):');
    console.log(keyPair.publicKeyBase64);
    console.log('\nPUBLIC KEY (PEM format):');
    console.log(keyPair.publicKeyPem);
    
    console.log('\n=== Instructions ===');
    console.log('1. Set the PRIVY_AUTHORIZATION_KEY environment variable to the base64 private key');
    console.log('2. Register the base64 public key with Privy for your KeyQuorum account');
    console.log('3. Set the PRIVY_KEY_QUORUM_ID environment variable to the ID provided by Privy');
    console.log('4. Ensure all other required environment variables are set (see ENVIRONMENT.md)');
    
    console.log('\n=== Security Notes ===');
    console.log('- Keep the private key secure and never commit it to version control');
    console.log('- The private key should only be stored in environment variables');
    console.log('- The public key can be safely shared with Privy for registration');
    console.log('- Use the cryptoUtils module for all cryptographic operations in your application');
    
  } catch (error) {
    console.error('\nError generating key pair:', error);
    process.exit(1);
  }
}

// Run the main function
main();