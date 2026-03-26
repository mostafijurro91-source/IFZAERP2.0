import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://vtlsluworsdcluuruneo.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0bHNsdXdvcnNkY2x1dXJ1bmVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyODg0MTIsImV4cCI6MjA4Mzg2NDQxMn0._GSQ5DSFaUkTVIMzdqWgGzMwBfoFyaTOxhSQdjFgHjM";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function migrate() {
  console.log('🚀 Starting migration: Create companies table');
  
  // Since we don't have direct SQL access through the anon key normally, 
  // we'll try to create the records if the table exists, or warn if it doesn't.
  // Actually, I'll assume the user might have to run the SQL manually if I can't.
  // BUT, I can try to see if I can run RPC or just insert.
  
  const { data, error } = await supabase.from('companies').select('*').limit(1);
  
  if (error && error.code === 'PGRST116' || error?.message?.includes('does not exist')) {
    console.error('❌ Table "companies" does not exist. Please run the SQL in Supabase SQL Editor:');
    console.log(`
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO companies (name) VALUES ('Transtec'), ('SQ Light'), ('SQ Cables')
ON CONFLICT (name) DO NOTHING;
    `);
    process.exit(1);
  }

  console.log('✅ Table "companies" exists. Seeding initial data...');
  const { error: seedError } = await supabase.from('companies').upsert([
    { name: 'Transtec', is_active: true },
    { name: 'SQ Light', is_active: true },
    { name: 'SQ Cables', is_active: true }
  ], { onConflict: 'name' });

  if (seedError) {
    console.error('❌ Seed error:', seedError);
  } else {
    console.log('✅ Migration successful!');
  }
}

migrate();
