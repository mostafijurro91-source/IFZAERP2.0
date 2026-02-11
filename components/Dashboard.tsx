
import React, { useState, useEffect, useMemo } from 'react';
import { Company, UserRole, formatCurrency } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';

interface DashboardProps {
  company: Company;
  role: UserRole;
}

const Dashboard: React.FC<DashboardProps> = ({ company, role }) => {
  const [stats, setStats] = useState({
    todaySales: 0,
    todayCollection: 0,
    totalDue: 0,
    stockValue: 0,
    monthSales: 0
  });

  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, [company]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const dbCompany = mapToDbCompany(company);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];
      const monthStr = today.toISOString().slice(0, 7);
      const startOfYear = new Date(today.getFullYear(), 0, 1).toISOString();

      const [txRes, prodRes] = await Promise.all([
        supabase.from('transactions')
          .select('*, customers(name)')
          .eq('company', dbCompany)
          .gte('created_at', startOfYear),
        supabase.from('products')
          .select('tp, stock')
          .eq('company', dbCompany)
      ]);

      if (txRes.error) throw txRes.error;

      let t_sales = 0, t_coll = 0, m_sales = 0, total_due = 0;
      const recent: any[] = [];
      const monthlyMap: Record<string, { month: string, sales: number, collection: number }> = {};
      
      const monthNames = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
      monthNames.forEach((name, idx) => {
        const key = `${today.getFullYear()}-${(idx + 1).toString().padStart(2, '0')}`;
        monthlyMap[key] = { month: name, sales: 0, collection: 0 };
      });

      txRes.data?.forEach(tx => {
        const amt = Number(tx.amount) || 0;
        const txDate = tx.created_at.split('T')[0];
        const txMonth = tx.created_at.slice(0, 7);
        const isColl = tx.payment_type === 'COLLECTION';

        if (isColl) {
          if (txDate === todayStr) t_coll += amt;
          total_due -= amt;
          if (monthlyMap[txMonth]) monthlyMap[txMonth].collection += amt;
        } else {
          if (txDate === todayStr) t_sales += amt;
          if (txMonth === monthStr) m_sales += amt;
          total_due += amt;
          if (monthlyMap[txMonth]) monthlyMap[txMonth].sales += amt;
        }
        
        if (txDate === todayStr) {
           recent.push({ name: tx.customers?.name || 'Unknown', amount: amt, date: tx.created_at, type: isColl ? 'C' : 'S' });
        }
      });

      const sValue = prodRes.data?.reduce((acc, p) => acc + (Number(p.tp) * Number(p.stock)), 0) || 0;

      setStats({ todaySales: t_sales, todayCollection: t_coll, totalDue: total_due, stockValue: sValue, monthSales: m_sales });
      setMonthlyData(Object.values(monthlyMap));
      setRecentActivity(recent.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10));
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const brandTheme = useMemo(() => {
    switch (company) {
      case 'Transtec': return { gradient: 'from-amber-500 to-orange-600', icon: '⚡' };
      case 'SQ Light': return { gradient: 'from-cyan-500 to-blue-600', icon: '💡' };
      case 'SQ Cables': return { gradient: 'from-rose-600 to-red-700', icon: '🔌' };
      default: return { gradient: 'from-slate-800 to-slate-900', icon: '📊' };
    }
  }, [company]);

  if (loading) return (
    <div className="py-40 text-center animate-pulse text-slate-300 font-black uppercase italic tracking-widest text-xs">Syncing Terminal...</div>
  );

  return (
    <div className="space-y-6 pb-24 text-slate-900 animate-reveal">
      {/* Visual Header */}
      <div className={`p-8 md:p-12 rounded-[2.5rem] bg-gradient-to-br ${brandTheme.gradient} text-white shadow-xl relative overflow-hidden`}>
         <div className="absolute right-0 top-0 text-[180px] opacity-10 font-bold italic translate-x-12 -translate-y-12">{brandTheme.icon}</div>
         <div className="relative z-10">
            <h2 className="text-4xl md:text-6xl font-black italic tracking-tighter lowercase leading-none">ifza<span className="text-white/40">.</span>{company.toLowerCase().replace(' ', '')}</h2>
            <div className="flex gap-4 mt-6">
               <span className="bg-white/10 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest italic border border-white/5">• Live Sync Active</span>
               <span className="bg-black/20 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest italic">• Node v4.6.8</span>
            </div>
         </div>
      </div>

      {/* Statistics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'আজকের বিক্রি', val: stats.todaySales, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'নগদ আদায়', val: stats.todayCollection, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'মার্কেট বাকি', val: stats.totalDue, color: 'text-rose-600', bg: 'bg-rose-50' },
          { label: 'স্টক ভ্যালু', val: stats.stockValue, color: 'text-slate-900', bg: 'bg-slate-100' },
          { label: 'মাসের বিক্রি', val: stats.monthSales, color: 'text-indigo-600', bg: 'bg-indigo-50' }
        ].map((card, i) => (
          <div key={i} className="bg-white p-6 rounded-[2rem] border shadow-sm flex flex-col justify-between group hover:shadow-lg transition-all animate-reveal" style={{ animationDelay: `${i*0.1}s` }}>
             <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic mb-4">{card.label}</p>
             <p className={`text-xl md:text-2xl font-black italic tracking-tighter ${card.color}`}>{formatCurrency(card.val)}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {/* Monthly Tracker */}
         <div className="lg:col-span-2 bg-white rounded-[2.5rem] shadow-sm border overflow-hidden">
            <div className="p-6 border-b bg-slate-50 flex justify-between items-center">
               <h3 className="text-[10px] font-black uppercase italic tracking-widest text-slate-400">Monthly Performance Tracker</h3>
               <span className="text-[8px] font-bold text-slate-300 uppercase">2025 Ledger</span>
            </div>
            <div className="overflow-x-auto">
               <table className="w-full text-left">
                  <thead>
                     <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b">
                        <th className="p-6">মাস</th>
                        <th className="p-6 text-center">বিক্রি</th>
                        <th className="p-6 text-right">আদায়</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y text-xs font-bold uppercase italic">
                     {monthlyData.map((d, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                           <td className="p-6 text-slate-600">{d.month}</td>
                           <td className="p-6 text-center text-slate-900">{d.sales.toLocaleString()}৳</td>
                           <td className="p-6 text-right text-emerald-600">+{d.collection.toLocaleString()}৳</td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
         </div>

         {/* Activity Log */}
         <div className="bg-white rounded-[2.5rem] shadow-sm border p-6 flex flex-col">
            <h3 className="text-[10px] font-black uppercase italic tracking-widest text-slate-400 mb-6">Real-time Activity</h3>
            <div className="space-y-4 overflow-y-auto custom-scroll max-h-[500px] pr-2">
               {recentActivity.length === 0 ? (
                 <div className="py-20 text-center opacity-10 font-black uppercase italic">No activity</div>
               ) : recentActivity.map((act, i) => (
                 <div key={i} className="p-4 bg-slate-50 rounded-2xl flex items-center justify-between group transition-all">
                    <div className="flex items-center gap-3">
                       <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-black italic shadow-lg ${act.type === 'C' ? 'bg-emerald-500' : 'bg-blue-500'}`}>{act.type}</div>
                       <div className="min-w-0">
                          <p className="text-[11px] font-black uppercase italic text-slate-800 truncate leading-none mb-1">{act.name}</p>
                          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{new Date(act.date).toLocaleTimeString('bn-BD', {hour:'2-digit', minute:'2-digit'})}</p>
                       </div>
                    </div>
                    <p className="text-[13px] font-black italic text-slate-900 leading-none">{act.amount.toLocaleString()}৳</p>
                 </div>
               ))}
            </div>
         </div>
      </div>
    </div>
  );
};

export default Dashboard;
