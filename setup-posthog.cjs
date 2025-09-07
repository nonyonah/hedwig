/**
 * Simple runner script for PostHog dashboard setup
 * This script can be run with: node setup-posthog.js
 */

const { execSync } = require('child_process');
const path = require('path');

try {
  console.log('🚀 Setting up PostHog dashboard...');
  
  // Run the TypeScript setup script
  const scriptPath = path.join(__dirname, 'src', 'scripts', 'setup-posthog-dashboard.ts');
  execSync(`npx tsx "${scriptPath}"`, { 
    stdio: 'inherit',
    cwd: __dirname 
  });
  
  console.log('✅ PostHog dashboard setup completed!');
} catch (error) {
  console.error('❌ Error setting up PostHog dashboard:', error.message);
  process.exit(1);
}