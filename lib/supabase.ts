
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://vtlsluworsdcluuruneo.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0bHNsdXdvcnNkY2x1dXJ1bmVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyODg0MTIsImV4cCI6MjA4Mzg2NDQxMn0._GSQ5DSFaUkTVIMzdqWgGzMwBfoFyaTOxhSQdjFgHjM";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Normalizes company names to match the strict 'Company' type.
 * Ensures consistent plural naming for SQ Cables.
 */
export const mapToDbCompany = (company: string): string => {
  const c = company.trim().toLowerCase();
  if (c.includes('light')) return 'SQ Light';
  if (c.includes('cable') || c.includes('cables')) return 'SQ Cables';
  return 'Transtec';
};

export const checkSupabaseConnection = async (): Promise<boolean> => {
  try {
    const { error } = await supabase.from('users').select('id', { count: 'exact', head: true }).limit(1);
    return !error;
  } catch { return false; }
};

export const db = {
  async getCustomers() {
    const { data, error } = await supabase.from('customers').select('*').order('name');
    if (error) throw error;
    return data || [];
  },
  async getProducts(company: string) {
    const dbCo = mapToDbCompany(company);
    const { data, error } = await supabase.from('products').select('*').eq('company', dbCo).order('name');
    if (error) throw error;
    return data || [];
  },
  async getMarketOrders(company: string) {
    const dbCo = mapToDbCompany(company);
    const { data, error } = await supabase.from('market_orders').select('*, customers(name, address, phone)').eq('company', dbCo).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }
};
