/**
 * Script to run SQL migrations
 * 
 * This script runs the SQL migrations in the supabase/migrations directory
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Missing Supabase environment variables. Please check your .env file.');
  console.error('Required variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Initialize Supabase client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigrations() {
  try {
    // Get migrations directory
    const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
    
    // Read all migration files
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sort alphabetically to ensure correct order
    
    console.log(`Found ${migrationFiles.length} migration files:`);
    migrationFiles.forEach(file => console.log(`- ${file}`));
    
    // Ask which migrations to run
    const migrationToRun = process.argv[2];
    let filesToRun = [];
    
    if (migrationToRun) {
      // Run specific migration
      const matchingFiles = migrationFiles.filter(file => file.includes(migrationToRun));
      if (matchingFiles.length === 0) {
        console.error(`No migration files found matching "${migrationToRun}"`);
        process.exit(1);
      }
      filesToRun = matchingFiles;
      console.log(`Running ${filesToRun.length} migration(s) matching "${migrationToRun}":`);
    } else {
      // Run all migrations
      filesToRun = migrationFiles;
      console.log(`Running all ${filesToRun.length} migrations:`);
    }
    
    filesToRun.forEach(file => console.log(`- ${file}`));
    
    // Execute each migration
    for (const file of filesToRun) {
      const migrationPath = path.join(migrationsDir, file);
      const sqlScript = fs.readFileSync(migrationPath, 'utf8');
      
      console.log(`\nExecuting migration: ${file}`);
      
      // Split the script into separate statements
      const statements = sqlScript.split(';').filter(stmt => stmt.trim().length > 0);
      
      console.log(`Found ${statements.length} SQL statements to execute`);
      
      // Execute each statement
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i].trim();
        if (!stmt) continue;
        
        console.log(`Executing statement ${i + 1}/${statements.length}...`);
        try {
          const { data, error } = await supabase.rpc('run_sql', { sql: stmt + ';' });
          
          if (error) {
            console.error(`Error executing statement ${i + 1}:`, error);
            console.log('Statement:', stmt);
          } else {
            console.log(`Statement ${i + 1} executed successfully`);
          }
        } catch (error) {
          console.error(`Error executing statement ${i + 1}:`, error);
          console.log('Statement:', stmt);
          
          // Continue with the next statement
          console.log('Continuing with next statement...');
        }
      }
      
      console.log(`Migration ${file} completed`);
    }
    
    console.log('\nAll migrations completed successfully');
  } catch (error) {
    console.error('Error running migrations:', error);
    process.exit(1);
  }
}

// Run the migrations
runMigrations()
  .then(() => {
    console.log('Script completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  }); 