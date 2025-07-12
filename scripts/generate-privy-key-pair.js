/**
 * Script to generate a P-256 key pair for Privy KeyQuorum authorization
 * 
 * This script generates a P-256 key pair that can be used for signing Privy KeyQuorum API requests.
 * The private key should be set as PRIVY_AUTHORIZATION_KEY in your environment variables.
 * The public key should be registered with Privy for your KeyQuorum account.
 */

const crypto = require('crypto');

// Generate a P-256 key pair
function generateP256KeyPair() {
  // Generate the key pair
  const keyPair = crypto.generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  // Extract the raw keys (without PEM headers)
  const privateKeyPem = keyPair.privateKey;
  const publicKeyPem = keyPair.publicKey;
  
  // Convert PEM to raw base64 (remove headers, footers, and newlines)
  const privateKeyRaw = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');
  
  const publicKeyRaw = publicKeyPem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\n/g, '');

  return {
    privateKey: {
      raw: privateKeyRaw,
      pem: privateKeyPem
    },
    publicKey: {
      raw: publicKeyRaw,
      pem: publicKeyPem
    }
  };
}

// Generate and display the key pair
const keyPair = generateP256KeyPair();

console.log('\n=== Privy KeyQuorum P-256 Key Pair ===\n');

console.log('PRIVATE KEY (raw base64, for PRIVY_AUTHORIZATION_KEY):');
console.log(keyPair.privateKey.raw);
console.log('\nPRIVATE KEY (PEM format, alternative for PRIVY_AUTHORIZATION_KEY):');
console.log(keyPair.privateKey.pem);

console.log('\nPUBLIC KEY (raw base64, for Privy registration):');
console.log(keyPair.publicKey.raw);
console.log('\nPUBLIC KEY (PEM format):');
console.log(keyPair.publicKey.pem);

console.log('\n=== Instructions ===');
console.log('1. Set the PRIVY_AUTHORIZATION_KEY environment variable to either:');
console.log('   - The raw base64 private key (recommended)');
console.log('   - The full PEM format private key (including BEGIN/END headers)');
console.log('2. Register the raw base64 public key with Privy for your KeyQuorum account');
console.log('3. Set the PRIVY_KEY_QUORUM_ID environment variable to the ID provided by Privy');