import React, { useState, useEffect, useMemo } from 'react';
import { Company, UserRole, formatCurrency } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

interface DashboardProps {
  company: Company;
  role: UserRole;
}

const Dashboard: React.FC<DashboardProps> = ({ company, role }) => {
  const [stats, setStats] = useState({
    todaySales: 0, todayCollection: 0, regularDue: 0, bookingAdvance: 0, stockValue: 0, monthSales: 0
  });
  const [loading, setLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [overdueCustomers, setOverdueCustomers] = useState<any[]>([]);

  useEffect(() => { fetchDashboardData(); }, [company]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const dbCompany = mapToDbCompany(company);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];
      const startOfYear = new Date(today.getFullYear(), 0, 1).toISOString();

      const [txRes, prodRes] = await Promise.all([
        supabase.from('transactions').select('*, customers(id, name, phone)').eq('company', dbCompany).gte('created_at', startOfYear),
        supabase.from('products').select('tp, stock').eq('company', dbCompany)
      ]);

      let t_sales = 0, t_coll = 0, reg_due = 0, book_adv = 0;
      const recent: any[] = [];
      const customerMap: Record<string, { name: string, balance: number, lastDate: Date, phone: string }> = {};
      
      const monthlyMap: Record<string, { month: string, sales: number, collection: number }> = {};
      const monthNames = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
      monthNames.forEach((name, idx) => {
        const key = `${today.getFullYear()}-${(idx + 1).toString().padStart(2, '0')}`;
        monthlyMap[key] = { month: name, sales: 0, collection: 0 };
      });

      txRes.data?.forEach(tx => {
        const amt = Number(tx.amount) || 0;
        const txDate = tx.created_at.split('T')[0];
        const txFullDate = new Date(tx.created_at);
        const txMonth = tx.created_at.slice(0, 7);
        const isBooking = tx.meta?.is_booking === true || tx.items?.[0]?.note?.includes('বুকিং');
        const custId = tx.customers?.id || 'unknown';

        if (!customerMap[custId] && custId !== 'unknown') {
          customerMap[custId] = { 
            name: tx.customers?.name || 'Unknown', 
            balance: 0, 
            lastDate: txFullDate,
            phone: tx.customers?.phone || 'N/A'
          };
        }

        if (tx.payment_type === 'COLLECTION') {
          if (txDate === todayStr) t_coll += amt;
          if (isBooking) {
            book_adv += amt;
          } else {
            reg_due -= amt;
            if (customerMap[custId]) customerMap[custId].balance -= amt;
          }
          if (monthlyMap[txMonth]) monthlyMap[txMonth].collection += amt;
        } else if (tx.payment_type === 'DUE') {
          if (txDate === todayStr) t_sales += amt;
          reg_due += amt;
          if (customerMap[custId]) customerMap[custId].balance += amt;
          if (monthlyMap[txMonth]) monthlyMap[txMonth].sales += amt;
        }

        if (customerMap[custId] && txFullDate > customerMap[custId].lastDate) {
          customerMap[custId].lastDate = txFullDate;
        }

        if (txDate === todayStr) recent.push({ name: tx.customers?.name || 'Unknown', amount: amt, date: tx.created_at, type: tx.payment_type === 'COLLECTION' ? 'C' : 'S' });
      });

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const overdue = Object.values(customerMap)
        .filter(c => c.balance > 100 && c.lastDate < thirtyDaysAgo)
        .sort((a, b) => b.balance - a.balance);

      setOverdueCustomers(overdue);

      const sValue = prodRes.data?.reduce((acc, p) => acc + (Number(p.tp) * Number(p.stock)), 0) || 0;
      setStats({ todaySales: t_sales, todayCollection: t_coll, regularDue: reg_due, bookingAdvance: book_adv, stockValue: sValue, monthSales: 0 });
      setRecentActivity(recent.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10));
      setMonthlyData(Object.values(monthlyMap));
    } finally { setLoading(false); }
  };

  const downloadOverduePDF = () => {
    const doc = new jsPDF();
    doc.text(`${company} - Overdue Report`, 14, 20);
    const tableData = overdueCustomers.map(c => [c.name, c.balance.toLocaleString(), new Date(c.lastDate).toLocaleDateString()]);
    (doc as any).autoTable({
      head: [['Customer', 'Balance', 'Last Activity']],
      body: tableData,
      startY: 30,
    });
    doc.save(`Report_${company}.pdf`);
  };

  const brandTheme = useMemo(() => {
    switch (company) {
      case 'Transtec': return { gradient: 'from-amber-400 to-orange-600', icon: '⚡' };
      case 'SQ Light': return { gradient: 'from-cyan-400 to-blue-600', icon: '💡' };
      case 'SQ Cables': return { gradient: 'from-rose-500 to-red-700', icon: '🔌' };
      default: return { gradient: 'from-slate-800 to-slate-900', icon: '📊' };
    }
  }, [company]);

  return (
    <div className="p-4 space-y-6 pb-40 text-slate-900">
      
      {/* Hero Banner */}
      <div className={`p-6 rounded-[2rem] bg-gradient-to-br ${brandTheme.gradient} text-white shadow-lg relative overflow-hidden`}>
         <h2 className="text-2xl font-black italic lowercase tracking-tighter">ifza.{company.toLowerCase().replace(' ', '')}</h2>
         <p className="text-[8px] font-bold uppercase tracking-widest opacity-60">Enterprise ERP Portal</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'আজকের বিক্রি', val: stats.todaySales, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'আজকের আদায়', val: stats.todayCollection, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'মালের বকেয়া', val: stats.regularDue, color: 'text-rose-600', bg: 'bg-rose-50' },
          { label: 'স্টক ভ্যালু', val: stats.stockValue, color: 'text-slate-900', bg: 'bg-slate-100' }
        ].map((card, i) => (
          <div key={i} className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden">
             <p className="text-[8px] font-black text-slate-400 uppercase mb-1">{card.label}</p>
             <p className={`text-sm font-black italic ${card.color}`}>{formatCurrency(card.val)}</p>
          </div>
        ))}
      </div>

      {/* ⚠️ Critical Overdue (এটিই আপনার নতুন এড করা সেকশন) */}
      <div className="bg-white rounded-[2rem] shadow-xl border border-rose-100 overflow-hidden">
        <div className="p-4 bg-rose-50 flex justify-between items-center border-b border-rose-100">
           <h3 className="text-[10px] font-black uppercase text-rose-600 italic">Critical Overdue</h3>
           <button onClick={downloadOverduePDF} className="bg-rose-600 text-white px-3 py-1 rounded-lg text-[8px] font-bold uppercase">PDF ↓</button>
        </div>
        <div className="p-4 space-y-3">
           {overdueCustomers.length > 0 ? overdueCustomers.map((cust, i) => (
              <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-2xl border border-rose-50">
                 <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase text-slate-800 truncate">{cust.name}</p>
                    <p className="text-[7px] font-bold text-slate-400 uppercase">শেষ: {new Date(cust.lastDate).toLocaleDateString('bn-BD')}</p>
                 </div>
                 <p className="text-xs font-black text-rose-600 italic">{cust.balance.toLocaleString()}৳</p>
              </div>
           )) : (
              <p className="text-[10px] text-center py-4 font-bold text-slate-400 italic">বর্তমানে কোন দীর্ঘমেয়াদী বকেয়া নেই। ✨</p>
           )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-slate-900 rounded-[2rem] p-5 shadow-2xl">
         <h3 className="text-[9px] font-black uppercase text-indigo-400 mb-4 tracking-widest">Live Activity</h3>
         <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scroll pr-1">
            {recentActivity.map((act, i) => (
              <div key={i} className="p-3 bg-white/5 rounded-2xl flex items-center justify-between border border-white/5">
                 <div className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white font-black text-[8px] ${act.type === 'C' ? 'bg-emerald-500' : 'bg-indigo-500'}`}>{act.type}</div>
                    <div className="min-w-0 text-left">
                       <p className="text-[9px] font-black uppercase italic text-white truncate leading-none">{act.name}</p>
                       <p className="text-[7px] font-bold text-slate-500 uppercase mt-1">{new Date(act.date).toLocaleTimeString('bn-BD')}</p>
                    </div>
                 </div>
                 <p className="text-[11px] font-black italic text-white">{act.amount.toLocaleString()}৳</p>
              </div>
            ))}
         </div>
      </div>

    </div>
  );
};

export default Dashboard;
