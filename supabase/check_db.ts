import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envLocalPath = path.resolve(process.cwd(), '.env.local');
const envPath = path.resolve(process.cwd(), '.env');

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('your-project')) {
  console.error('❌ Cannot test Supabase connectivity: missing or placeholder credentials in .env / .env.local');
  process.exit(1);
}

async function checkConnection() {
  console.log(`Connecting to Supabase at: ${supabaseUrl}...`);
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    // Simple query to verify connection
    const { data, error } = await supabase.from('projects').select('id').limit(1);
    if (error) {
      // If table doesn't exist or permissions error, but service responded
      console.warn(`⚠️ Connected to Supabase, but received error when querying 'projects':`, error.message);
      process.exit(0);
    }
    console.log('✅ Successfully connected to Supabase database!');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ Failed to connect to Supabase:', err.message || err);
    process.exit(1);
  }
}

checkConnection();
