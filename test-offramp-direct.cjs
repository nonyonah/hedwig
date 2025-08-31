// Direct test of offramp callback handling without Telegram API calls
// Since this is a TypeScript project, we need to use dynamic import
const path = require('path');
const { spawn } = require('child_process');

// Use tsx to run TypeScript directly
async function runTypeScriptTest() {
  return new Promise((resolve, reject) => {
    const testScript = `
import { handleAction } from './src/api/actions.js';

async function testOfframpDirect() {
  try {
    console.log('Testing offramp callback directly...');
    
    // Test with a real user ID
    const testUserId = 'd4f54ae7-18de-4593-b861-1d5c089cdf87';
    
    console.log('Testing payout_bank_ngn callback...');
    const result = await handleAction('offramp', { callback_data: 'payout_bank_ngn' }, testUserId);
    
    console.log('Result:', JSON.stringify(result, null, 2));
    
    if (result && result.reply_markup && result.reply_markup.inline_keyboard) {
      console.log('✅ Success! Banks were fetched and reply markup was generated.');
      console.log('Number of bank options:', result.reply_markup.inline_keyboard.length);
    } else {
      console.log('❌ No reply markup found - banks were not fetched.');
    }
    
  } catch (error) {
    console.error('Error testing offramp callback:', error.message);
    console.error('Stack:', error.stack);
  }
}

testOfframpDirect();
`;
    
    const child = spawn('npx', ['tsx', '--eval', testScript], {
      stdio: 'inherit',
      shell: true
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Process exited with code ${code}`));
      }
    });
  });
}

runTypeScriptTest().catch(console.error);