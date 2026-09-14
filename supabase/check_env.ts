import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load .env.local first, fallback to .env
const envLocalPath = path.resolve(process.cwd(), '.env.local');
const envPath = path.resolve(process.cwd(), '.env');

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
  console.log('Loaded environment from .env.local');
} else if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('Loaded environment from .env');
} else {
  console.warn('⚠️ Neither .env.local nor .env found in root directory.');
}

const requiredVars = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
const optionalVars = ['GEMINI_API_KEY', 'APP_URL'];

let missingRequired = 0;

console.log('\n--- Environment Variables Check ---');
for (const varName of requiredVars) {
  const value = process.env[varName];
  if (!value || value.includes('your-project') || value.includes('your-supabase-anon-key')) {
    console.error(`❌ ${varName}: Missing or placeholder value`);
    missingRequired++;
  } else {
    console.log(`✅ ${varName}: Set (${value.substring(0, 15)}...)`);
  }
}

for (const varName of optionalVars) {
  const value = process.env[varName];
  if (!value || value.includes('MY_GEMINI_API_KEY')) {
    console.warn(`⚠️ ${varName}: Not configured (optional)`);
  } else {
    console.log(`✅ ${varName}: Set`);
  }
}

if (missingRequired > 0) {
  console.error(`\nFound ${missingRequired} missing required environment variables.`);
  console.error('Please configure .env.local with valid Supabase credentials.\n');
  process.exit(1);
} else {
  console.log('\nAll required environment variables are set.\n');
  process.exit(0);
}
