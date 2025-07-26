// Simple script to apply the Telegram integration migration
// Run this in your Supabase SQL Editor or via CLI

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the migration file
const migrationPath = path.join(__dirname, '../supabase/migrations/20250129000000_telegram_integration.sql');
const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

console.log('='.repeat(80));
console.log('TELEGRAM INTEGRATION MIGRATION');
console.log('='.repeat(80));
console.log('');
console.log('Copy and paste the following SQL into your Supabase SQL Editor:');
console.log('');
console.log('-'.repeat(80));
console.log(migrationSQL);
console.log('-'.repeat(80));
console.log('');
console.log('This migration will:');
console.log('1. Add Telegram-specific columns to the users table');
console.log('2. Create indexes for faster lookups');
console.log('3. Create a function to get or create Telegram users');
console.log('4. Create telegram_sessions and telegram_message_logs tables');
console.log('5. Set up proper RLS policies');
console.log('');
console.log('After running this migration, your database will be ready for Telegram bot integration.');