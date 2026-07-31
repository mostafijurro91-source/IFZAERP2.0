
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://vtlsluworsdcluuruneo.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0bHNsdXdvcnNkY2x1dXJ1bmVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyODg0MTIsImV4cCI6MjA4Mzg2NDQxMn0._GSQ5DSFaUkTVIMzdqWgGzMwBfoFyaTOxhSQdjFgHjM";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkTransactions() {
  const { data, error } = await supabase.from('transactions').select('customer_id, amount, payment_type').eq('company', 'SQ Cables');
  if (error) return;
  const balances = {};
  data.forEach(tx => {
    let amt = Number(String(tx.amount).replace(/[,\s]/g, '')) || 0;
    const cid = tx.customer_id;
    if (!balances[cid]) balances[cid] = 0;
    if (tx.payment_type === 'COLLECTION') balances[cid] -= amt;
    else if (tx.payment_type === 'DUE') balances[cid] += amt;
  });
  
  const sorted = Object.entries(balances).sort((a, b) => a[1] - b[1]);
  console.log("Top 5 Negative Balances:");
  for (let i = 0; i < 5; i++) {
     if (sorted[i]) {
        const { data: cust } = await supabase.from('customers').select('name').eq('id', sorted[i][0]).single();
        console.log(`${cust?.name || sorted[i][0]}: ${sorted[i][1]}`);
     }
  }
}
checkTransactions();
