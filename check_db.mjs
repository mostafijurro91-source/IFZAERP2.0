
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://vtlsluworsdcluuruneo.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0bHNsdXdvcnNkY2x1dXJ1bmVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyODg0MTIsImV4cCI6MjA4Mzg2NDQxMn0._GSQ5DSFaUkTVIMzdqWgGzMwBfoFyaTOxhSQdjFgHjM";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkColumns() {
  const { data, error } = await supabase.from('collection_requests').select('*').limit(1);
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Columns found in collection_requests:", Object.keys(data[0] || { 'status': 'No data' }));
  }
}

checkColumns();
