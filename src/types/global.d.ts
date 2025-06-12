/// <reference types="@types/node" />

// Extend the global NodeJS namespace to include our custom environment variables
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production' | 'test';
      // Add other environment variables here as needed
    }
  }
}

// This is needed to make TypeScript happy about process.env
const processEnv: NodeJS.ProcessEnv;

export {}; // This file needs to be a module
