#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// List of required polyfills for browser compatibility
const requiredPolyfills = [
  'crypto-browserify',
  'stream-browserify',
  'buffer',
  'util',
  'assert',
  'path-browserify',
  'process',
  'os-browserify',
  'https-browserify',
  'stream-http',
  'browserify-zlib',
  'querystring-es3',
  'url',
  'whatwg-url'
];

// Check if dependencies are installed
console.log('Checking for required Node.js polyfills...');

// Read package.json
const packageJsonPath = path.join(process.cwd(), 'package.json');
let packageJson;

try {
  packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
} catch (error) {
  console.error('Error reading package.json:', error);
  process.exit(1);
}

// Combine dependencies and devDependencies
const allDependencies = {
  ...(packageJson.dependencies || {}),
  ...(packageJson.devDependencies || {})
};

// Check which polyfills are missing
const missingPolyfills = requiredPolyfills.filter(polyfill => 
  !allDependencies[polyfill]
);

// Install missing polyfills if any
if (missingPolyfills.length > 0) {
  console.log(`Installing missing polyfills: ${missingPolyfills.join(', ')}`);
  try {
    execSync(`npm install ${missingPolyfills.join(' ')} --save`, { 
      stdio: 'inherit' 
    });
    console.log('Polyfills installed successfully.');
  } catch (error) {
    console.error('Error installing polyfills:', error);
    process.exit(1);
  }
} else {
  console.log('All required polyfills are installed.');
}

// Force update package-lock.json
try {
  execSync('npm install --package-lock-only', { stdio: 'inherit' });
  console.log('package-lock.json updated successfully.');
} catch (error) {
  console.error('Error updating package-lock.json:', error);
  process.exit(1);
}

console.log('Node.js polyfills check completed.'); 