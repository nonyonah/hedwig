import crypto from 'crypto';

function generateAdminKey() {
  // Generate a secure 256-bit (32 byte) random key
  const adminKey = crypto.randomBytes(32).toString('hex');
  
  console.log('🔑 Generated Hedwig Admin Key:');
  console.log(`HEDWIG_ADMIN_KEY=${adminKey}`);
  console.log('');
  console.log('⚠️  IMPORTANT SECURITY NOTES:');
  console.log('1. Save this key securely - it cannot be recovered if lost');
  console.log('2. Add it to your .env.local file');
  console.log('3. Never commit this key to version control');
  console.log('4. This key is required for:');
  console.log('   - Setting platform wallet address');
  console.log('   - Updating platform fees');
  console.log('   - Whitelisting/blacklisting tokens');
  console.log('   - Emergency contract management');
  console.log('');
  console.log('📝 Add this to your .env.local:');
  console.log(`HEDWIG_ADMIN_KEY=${adminKey}`);
  
  return adminKey;
}

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  generateAdminKey();
}

export { generateAdminKey };