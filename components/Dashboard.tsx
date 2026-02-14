
import React, { useState, useEffect, useMemo } from 'react';
import { Company, UserRole, formatCurrency } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';

interface DashboardProps {
  company: Company;
  role: UserRole;
}

const Dashboard: React.FC<DashboardProps> = ({ company, role }) => {
  const [stats, setStats] = useState({
    todaySales: 0, todayCollection: 0, totalDue: 0, stockValue: 0, monthSales: 0, monthDeliveryExpense: 0
  });
  const [loading, setLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);

  useEffect(() => { fetchDashboardData(); }, [company]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const dbCompany = mapToDbCompany(company);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];
      const startOfYear = new Date(today.getFullYear(), 0, 1).toISOString();

      const [txRes, prodRes] = await Promise.all([
        supabase.from('transactions').select('*, customers(name)').eq('company', dbCompany).gte('created_at', startOfYear),
        supabase.from('products').select('tp, stock').eq('company', dbCompany)
      ]);

      let t_sales = 0, t_coll = 0, m_sales = 0, total_due = 0, m_exp = 0;
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
        if (tx.payment_type === 'COLLECTION') {
          if (txDate === todayStr) t_coll += amt;
          total_due -= amt;
          if (monthlyMap[txMonth]) monthlyMap[txMonth].collection += amt;
        } else if (tx.payment_type === 'DUE') {
          if (txDate === todayStr) t_sales += amt;
          total_due += amt;
          if (monthlyMap[txMonth]) monthlyMap[txMonth].sales += amt;
        }
        if (txDate === todayStr) recent.push({ name: tx.customers?.name || 'Unknown', amount: amt, date: tx.created_at, type: tx.payment_type === 'COLLECTION' ? 'C' : 'S' });
      });

      const sValue = prodRes.data?.reduce((acc, p) => acc + (Number(p.tp) * Number(p.stock)), 0) || 0;
      setStats({ todaySales: t_sales, todayCollection: t_coll, totalDue: total_due, stockValue: sValue, monthSales: m_sales, monthDeliveryExpense: m_exp });
      setRecentActivity(recent.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10));
      setMonthlyData(Object.values(monthlyMap));
    } finally { setLoading(false); }
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
    <div className="space-y-10 pb-40 animate-reveal text-slate-900">
      
      {/* 🎭 Cinematic Hero Banner */}
      <div className={`p-14 md:p-20 rounded-[4rem] bg-gradient-to-br ${brandTheme.gradient} text-white shadow-2xl relative overflow-hidden group`}>
         <div className="absolute right-[-40px] top-[-40px] text-[240px] opacity-10 font-bold italic group-hover:scale-110 group-hover:rotate-12 transition-all duration-[3000ms] animate-float">{brandTheme.icon}</div>
         <div className="relative z-10">
            <p className="text-[11px] font-black uppercase tracking-[0.8em] text-white/50 mb-6 italic">Enterprise Resource Planning</p>
            <h2 className="text-6xl md:text-8xl font-black italic tracking-tighter lowercase leading-none">ifza<span className="text-white/30">.</span>{company.toLowerCase().replace(' ', '')}</h2>
            <div className="flex gap-4 mt-10">
               <span className="bg-white/10 backdrop-blur-xl px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest italic border border-white/10 flex items-center gap-3">
                 <span className="w-2 h-2 bg-emerald-400 rounded-full animate-ping"></span> Live Cloud Sync
               </span>
            </div>
         </div>
      </div>

      {/* 📊 Premium Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'আজকের বিক্রি', val: stats.todaySales, color: 'text-blue-600', icon: '🛒', bg: 'bg-blue-50' },
          { label: 'আজকের আদায়', val: stats.todayCollection, color: 'text-emerald-600', icon: '💰', bg: 'bg-emerald-50' },
          { label: 'মার্কেট বাকি', val: stats.totalDue, color: 'text-rose-600', icon: '⏳', bg: 'bg-rose-50' },
          { label: 'স্টক ভ্যালু', val: stats.stockValue, color: 'text-slate-900', icon: '📦', bg: 'bg-slate-100' }
        ].map((card, i) => (
          <div key={i} className="bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-lg hover:shadow-2xl transition-all duration-700 hover:-translate-y-2 animate-reveal relative overflow-hidden group" style={{ animationDelay: `${i*0.1}s` }}>
             <div className={`absolute top-0 right-0 w-24 h-24 ${card.bg} rounded-bl-[4rem] -z-0 opacity-40 group-hover:scale-125 transition-transform`}></div>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 italic relative z-10 leading-none">{card.label}</p>
             <p className={`text-2xl md:text-4xl font-black italic tracking-tighter ${card.color} leading-none relative z-10`}>{formatCurrency(card.val)}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
         {/* Monthly Graph Table */}
         <div className="lg:col-span-2 bg-white rounded-[4rem] shadow-xl border border-slate-100 overflow-hidden animate-reveal stagger-2">
            <div className="p-10 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
               <h3 className="text-[11px] font-black uppercase italic tracking-[0.3em] text-slate-400">Monthly Ledger Flow</h3>
               <span className="bg-indigo-50 text-indigo-600 px-5 py-1.5 rounded-full text-[9px] font-black uppercase italic animate-pulse">Synced ✓</span>
            </div>
            <div className="overflow-x-auto custom-scroll">
               <table className="w-full text-left">
                  <thead>
                     <tr className="text-[9px] font-black text-slate-300 uppercase tracking-widest border-b border-slate-50">
                        <th className="p-10">Month Index</th>
                        <th className="p-10 text-center">Sales Vol.</th>
                        <th className="p-10 text-right">Collection</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-[13px] font-bold uppercase italic">
                     {monthlyData.map((d, i) => (
                        <tr key={i} className="hover:bg-indigo-50/20 transition-all group">
                           <td className="p-10 text-slate-700 font-black">{d.month}</td>
                           <td className="p-10 text-center text-slate-900">{d.sales.toLocaleString()}৳</td>
                           <td className="p-10 text-right text-emerald-600 font-black">+{d.collection.toLocaleString()}৳</td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
         </div>

         {/* Recent Stream */}
         <div className="bg-slate-900 rounded-[4rem] shadow-2xl p-10 flex flex-col animate-reveal stagger-3 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-600/10 blur-[60px] rounded-full"></div>
            <div className="flex justify-between items-center mb-12 relative z-10">
               <h3 className="text-[11px] font-black uppercase italic tracking-[0.3em] text-indigo-400">Live Activity</h3>
               <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping"></div>
            </div>
            <div className="space-y-6 overflow-y-auto custom-scroll max-h-[600px] pr-2 relative z-10">
               {recentActivity.map((act, i) => (
                 <div key={i} className="p-6 bg-white/5 rounded-[2rem] flex items-center justify-between border border-white/5 group hover:bg-white/10 transition-all animate-reveal">
                    <div className="flex items-center gap-5">
                       <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black italic shadow-2xl transition-transform group-hover:scale-110 ${act.type === 'C' ? 'bg-emerald-500' : 'bg-indigo-500'}`}>{act.type}</div>
                       <div className="min-w-0">
                          <p className="text-[13px] font-black uppercase italic text-white truncate leading-none mb-2">{act.name}</p>
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{new Date(act.date).toLocaleTimeString('bn-BD')}</p>
                       </div>
                    </div>
                    <p className="text-xl font-black italic text-white leading-none tracking-tighter group-hover:text-indigo-400 transition-colors">{act.amount.toLocaleString()}৳</p>
                 </div>
               ))}
            </div>
         </div>
      </div>
    </div>
  );
};

export default Dashboard;
