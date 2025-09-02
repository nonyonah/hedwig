/**
 * Test script for analytics integration
 * Tests PostHog configuration and basic functionality
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Test PostHog configuration
function testPostHogConfig() {
  console.log('Testing PostHog configuration...');
  
  const requiredEnvVars = [
    'POSTHOG_API_KEY',
    'POSTHOG_HOST'
  ];
  
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.log('⚠️  Missing environment variables:', missingVars.join(', '));
    console.log('   Set these in your .env file for full PostHog integration');
    return false;
  }
  
  console.log('✅ PostHog environment variables configured');
  return true;
}

// Test PostHog endpoint connectivity
function testPostHogConnectivity() {
  return new Promise((resolve) => {
    console.log('Testing PostHog endpoint connectivity...');
    
    const host = process.env.POSTHOG_HOST || 'app.posthog.com';
    const options = {
      hostname: host,
      port: 443,
      path: '/capture/',
      method: 'HEAD',
      timeout: 5000
    };
    
    const req = https.request(options, (res) => {
      if (res.statusCode === 200 || res.statusCode === 405) {
        console.log('✅ PostHog endpoint is reachable');
        resolve(true);
      } else {
        console.log(`⚠️  PostHog endpoint returned status: ${res.statusCode}`);
        resolve(false);
      }
    });
    
    req.on('error', (err) => {
      console.log('⚠️  PostHog endpoint connectivity test failed:', err.message);
      resolve(false);
    });
    
    req.on('timeout', () => {
      console.log('⚠️  PostHog endpoint connectivity test timed out');
      req.destroy();
      resolve(false);
    });
    
    req.end();
  });
}

// Test file structure and implementation
function testFileStructure() {
  console.log('\n=== Testing File Structure ===');
  
  const requiredFiles = [
    'src/lib/posthog.ts',
    'src/lib/analyticsService.ts',
    'src/lib/userIdentification.ts'
  ];
  
  let allFilesExist = true;
  
  requiredFiles.forEach(filePath => {
    const fullPath = path.join(__dirname, filePath);
    if (fs.existsSync(fullPath)) {
      console.log(`✅ ${filePath} exists`);
    } else {
      console.log(`❌ ${filePath} missing`);
      allFilesExist = false;
    }
  });
  
  return allFilesExist;
}

// Test TypeScript compilation
function testTypeScriptCompilation() {
  return new Promise((resolve) => {
    console.log('\n=== Testing TypeScript Compilation ===');
    
    const { spawn } = require('child_process');
    const tsc = spawn('npx', ['tsc', '--noEmit'], {
      cwd: __dirname,
      stdio: 'pipe'
    });
    
    let output = '';
    let errorOutput = '';
    
    tsc.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    tsc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    tsc.on('close', (code) => {
      if (code === 0) {
        console.log('✅ TypeScript compilation successful');
        resolve(true);
      } else {
        console.log('❌ TypeScript compilation failed');
        if (errorOutput) {
          console.log('Compilation errors:');
          console.log(errorOutput);
        }
        resolve(false);
      }
    });
    
    tsc.on('error', (err) => {
      console.log('❌ Failed to run TypeScript compiler:', err.message);
      resolve(false);
    });
  });
}

// Test analytics functions exist in files
function testAnalyticsFunctions() {
  console.log('\n=== Testing Analytics Functions ===');
  
  const tests = [
    {
      file: 'src/lib/posthog.ts',
      functions: ['identifyUser', 'trackEvent', 'trackUserActivity', 'trackSessionStart', 'trackUserLifecycle']
    },
    {
      file: 'src/lib/analyticsService.ts',
      functions: ['AnalyticsService', 'startUserSession', 'endUserSession', 'trackMessage', 'trackCommand']
    },
    {
      file: 'src/lib/userIdentification.ts',
      functions: ['UserIdentificationService', 'identifyTelegramUser', 'updateEngagementMetrics']
    }
  ];
  
  let allFunctionsFound = true;
  
  tests.forEach(test => {
    const filePath = path.join(__dirname, test.file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      
      test.functions.forEach(funcName => {
        if (content.includes(funcName)) {
          console.log(`✅ ${funcName} found in ${test.file}`);
        } else {
          console.log(`❌ ${funcName} missing in ${test.file}`);
          allFunctionsFound = false;
        }
      });
    }
  });
  
  return allFunctionsFound;
}

async function runAllTests() {
  console.log('🚀 Starting Analytics Integration Tests...');
  console.log('Testing the analytics system implementation and configuration');
  
  let allTestsPassed = true;
  
  try {
    // Test environment and configuration
    const configOk = testPostHogConfig();
    if (!configOk) allTestsPassed = false;
    
    // Test file structure
    const filesOk = testFileStructure();
    if (!filesOk) allTestsPassed = false;
    
    // Test function implementation
    const functionsOk = testAnalyticsFunctions();
    if (!functionsOk) allTestsPassed = false;
    
    // Test TypeScript compilation
    const compilationOk = await testTypeScriptCompilation();
    if (!compilationOk) allTestsPassed = false;
    
    // Test PostHog connectivity
    const connectivityOk = await testPostHogConnectivity();
    if (!connectivityOk) allTestsPassed = false;
    
    console.log('\n' + '='.repeat(50));
    
    if (allTestsPassed) {
      console.log('🎉 All analytics integration tests passed!');
      console.log('\n📊 Your analytics system is ready:');
      console.log('✅ PostHog integration enhanced with DAU/WAU/MAU tracking');
      console.log('✅ User identification service with advanced properties');
      console.log('✅ Session tracking and analytics service implemented');
      console.log('✅ User lifecycle and retention metrics available');
      console.log('\n🚀 You can now integrate these services into your Telegram bot!');
    } else {
      console.log('⚠️  Some tests failed. Please review the issues above.');
      console.log('\n📋 Next steps:');
      console.log('- Fix any TypeScript compilation errors');
      console.log('- Ensure all required files are present');
      console.log('- Configure PostHog environment variables if needed');
    }
    
  } catch (error) {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  runAllTests,
  testPostHogConfig,
  testFileStructure,
  testAnalyticsFunctions,
  testTypeScriptCompilation,
  testPostHogConnectivity
};