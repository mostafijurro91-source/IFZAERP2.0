import React, { useState, useEffect, useMemo } from 'react';
import { Company, UserRole, formatCurrency } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';

interface DashboardProps {
  company: Company;
  role: UserRole;
}

const Dashboard: React.FC<DashboardProps> = ({ company, role }) => {
  const [stats, setStats] = useState({
    todaySales: 0, todayCollection: 0, regularDue: 0, bookingAdvance: 0, stockValue: 0
  });
  const [loading, setLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [overdueCustomers, setOverdueCustomers] = useState<any[]>([]);

  useEffect(() => { 
    fetchDashboardData(); 
  }, [company]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const dbCompany = mapToDbCompany(company);
      const todayStr = new Date().toISOString().split('T')[0];
      const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString();

      const [txRes, prodRes] = await Promise.all([
        supabase.from('transactions').select('*, customers(id, name, phone)').eq('company', dbCompany).gte('created_at', startOfYear),
        supabase.from('products').select('tp, stock').eq('company', dbCompany)
      ]);

      let t_sales = 0, t_coll = 0, reg_due = 0;
      const recent: any[] = [];
      const customerMap: Record<string, any> = {};
      
      const monthlyMap: Record<string, { month: string, sales: number, collection: number, returns: number }> = {};
      const monthNames = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
      
      monthNames.forEach((name, idx) => {
        const key = `${new Date().getFullYear()}-${(idx + 1).toString().padStart(2, '0')}`;
        monthlyMap[key] = { month: name, sales: 0, collection: 0, returns: 0 };
      });

      txRes.data?.forEach(tx => {
        const amt = Number(tx.amount) || 0;
        const txDate = tx.created_at.split('T')[0];
        const txMonth = tx.created_at.slice(0, 7);
        const txFullDate = new Date(tx.created_at);
        const custId = tx.customers?.id;

        // Monthly Ledger Logic with Returns
        if (monthlyMap[txMonth]) {
          if (tx.payment_type === 'DUE') monthlyMap[txMonth].sales += amt;
          else if (tx.payment_type === 'COLLECTION') monthlyMap[txMonth].collection += amt;
          else if (tx.payment_type === 'RETURN') monthlyMap[txMonth].returns += amt;
        }

        // Customer Due & Overdue Logic
        if (custId) {
          if (!customerMap[custId]) {
            customerMap[custId] = { name: tx.customers?.name, balance: 0, lastDate: txFullDate };
          }
          if (tx.payment_type === 'DUE') {
            customerMap[custId].balance += amt;
            reg_due += amt;
            if (txDate === todayStr) t_sales += amt;
          } else if (tx.payment_type === 'COLLECTION') {
            customerMap[custId].balance -= amt;
            reg_due -= amt;
            if (txDate === todayStr) t_coll += amt;
          } else if (tx.payment_type === 'RETURN') {
            customerMap[custId].balance -= amt;
            reg_due -= amt;
          }
          if (txFullDate > customerMap[custId].lastDate) customerMap[custId].lastDate = txFullDate;
        }

        if (txDate === todayStr) {
          recent.push({ name: tx.customers?.name, amount: amt, type: tx.payment_type, time: tx.created_at });
        }
      });

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const overdue = Object.values(customerMap)
        .filter((c: any) => c.balance > 100 && c.lastDate < thirtyDaysAgo)
        .sort((a: any, b: any) => b.balance - a.balance);

      setOverdueCustomers(overdue);
      setMonthlyData(Object.values(monthlyMap));
      setStats({
        todaySales: t_sales,
