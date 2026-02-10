
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
      case 'Transtec': return { gradient: 'from-amber-400 to-orange-600', icon: '⚡' };
      case 'SQ Light': return { gradient: 'from-cyan-400 to-blue-600', icon: '💡' };
      case 'SQ Cables': return { gradient: 'from-rose-500 to-red-700', icon: '🔌' };
      default: return { gradient: 'from-blue-400 to-indigo-600', icon: '📊' };
    }
  }, [company]);

  if (loading) return (
    <div className="py-40 text-center flex flex-col items-center">
      <div className="w-16 h-16 border-[6px] border-blue-600/10 border-t-blue-600 rounded-full animate-spin mb-6"></div>
      <p className="font-black text-[12px] text-black uppercase tracking-[0.5em] italic">Syncing Control Hub...</p>
    </div>
  );

  return (
    <div className="space-y-6 md:space-y-10 pb-32 animate-reveal text-black">
      
      <div className={`relative p-10 md:p-16 rounded-[3rem] md:rounded-[4.5rem] bg-gradient-to-br ${brandTheme.gradient} text-white shadow-2xl overflow-hidden group border-b-[10px] border-black/10`}>
        <div className="absolute right-[-40px] top-[-40px] text-[150px] md:text-[250px] opacity-10 font-semibold italic select-none animate-float-slow group-hover:scale-110 transition-transform duration-1000">
          {brandTheme.icon}
        </div>
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-8 md:gap-12 text-center md:text-left">
            <div className="w-24 h-24 md:w-36 md:h-36 bg-white/20 backdrop-blur-3xl rounded-[2.5rem] md:rounded-[3.8rem] flex items-center justify-center text-5xl md:text-7xl border border-white/20 shadow-2xl group-hover:rotate-6 transition-all text-white animate-glow">
              {brandTheme.icon}
            </div>
            <div>
              <h2 className="text-5xl md:text-8xl font-black italic tracking-tighter leading-none lowercase text-white">
                ifza<span className="text-white/30">.</span>{company.toLowerCase().replace(' ', '')}
              </h2>
              <div className="mt-6 flex flex-wrap gap-4 justify-center md:justify-start">
                 <p className="px-6 py-2 bg-white/10 backdrop-blur-md rounded-full text-[9px] md:text-[11px] font-black uppercase tracking-widest text-white italic border border-white/10 flex items-center gap-3">
                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_#4ade80]"></span>
                    Satellite Link Active
                 </p>
                 <p className="px-6 py-2 bg-black/20 backdrop-blur-md rounded-full text-[9px] md:text-[11px] font-black uppercase tracking-widest text-white/70 italic border border-white/5">
                    Terminal v4.6.8
                 </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 md:gap-8">
        {[
          { label: 'আজকের বিক্রি', val: stats.todaySales, color: 'text-blue-600', icon: '📝', bg: 'bg-blue-50' },
          { label: 'নগদ আদায়', val: stats.todayCollection, color: 'text-emerald-600', icon: '💰', bg: 'bg-emerald-50' },
          { label: 'মার্কেট বাকি', val: stats.totalDue, color: 'text-rose-600', icon: '📉', bg: 'bg-rose-50' },
          { label: 'স্টক ভ্যালু', val: stats.stockValue, color: 'text-slate-900', icon: '📦', bg: 'bg-slate-50' },
          { label: 'মাসের বিক্রি', val: stats.monthSales, color: 'text-indigo-600', icon: '📊', bg: 'bg-indigo-50' }
        ].map((card, idx) => (
          <div key={idx} className="bg-white p-8 md:p-12 rounded-[2.5rem] md:rounded-[3.8rem] border border-slate-200 shadow-sm flex flex-col items-center text-center group hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 animate-reveal" style={{ animationDelay: `${idx * 0.15}s` }}>
            <div className={`w-16 h-16 md:w-20 md:h-20 ${card.bg} rounded-[1.8rem] md:rounded-[2.2rem] flex items-center justify-center text-3xl md:text-4xl mb-6 shadow-inner group-hover:scale-110 group-hover:rotate-6 transition-all duration-500`}>
               {card.icon}
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic mb-3 leading-none">{card.label}</p>
            <p className={`text-2xl md:text-3xl font-black italic tracking-tighter ${card.color}`}>
              {formatCurrency(card.val)}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 md:gap-12">
        <div className="lg:col-span-2 bg-white rounded-[3.5rem] md:rounded-[4.5rem] shadow-sm border border-slate-200 overflow-hidden flex flex-col animate-reveal" style={{ animationDelay: '0.8s' }}>
          <div className="p-10 md:p-12 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h3 className="text-xs font-black uppercase italic tracking-[0.4em] text-slate-900 flex items-center gap-5">
               <span className="w-3 h-3 bg-blue-600 rounded-full shadow-[0_0_10px_#2563eb]"></span>
               বাৎসরিক পারফরম্যান্স ট্র্যাকার
            </h3>
            <span className="text-[9px] font-black text-slate-400 uppercase italic">Year: 2025</span>
          </div>
          <div className="overflow-x-auto custom-scroll">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white border-b border-slate-100 text-[10px] md:text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] italic">
                  <th className="p-8 md:p-10 pl-14 md:pl-20">মাস (Month)</th>
                  <th className="p-8 md:p-10 text-center">বিক্রি (Sales)</th>
                  <th className="p-8 md:p-10 text-right pr-14 md:pr-20">আদায় (Cash)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {monthlyData.map((data, idx) => (
                  <tr key={idx} className="hover:bg-blue-50/50 group transition-all duration-300">
                    <td className="p-8 md:p-10 pl-14 md:pl-20 text-[15px] md:text-[17px] font-black text-slate-800 italic group-hover:translate-x-4 transition-transform leading-none">{data.month}</td>
                    <td className="p-8 md:p-10 text-center text-[15px] md:text-[18px] font-black text-slate-900 italic leading-none group-hover:scale-110 transition-transform">{data.sales.toLocaleString()}৳</td>
                    <td className="p-8 md:p-10 pr-14 md:pr-20 text-right text-[15px] md:text-[18px] font-black text-emerald-600 italic leading-none">+{data.collection.toLocaleString()}৳</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-[3.5rem] md:rounded-[4.5rem] shadow-sm border border-slate-200 p-10 md:p-12 flex flex-col h-fit animate-reveal" style={{ animationDelay: '1s' }}>
          <div className="flex items-center justify-between mb-10 md:mb-12">
            <h3 className="text-xs font-black uppercase italic tracking-[0.4em] text-slate-900">রিয়েল-টাইম আপডেট</h3>
            <div className="flex items-center gap-3">
               <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
               <span className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-black uppercase italic border border-emerald-100">Live</span>
            </div>
          </div>
          <div className="space-y-6 max-h-[650px] overflow-y-auto custom-scroll pr-3">
            {recentActivity.length === 0 ? (
               <div className="py-20 text-center opacity-10 font-black uppercase italic tracking-widest">No activity today</div>
            ) : recentActivity.map((act, i) => (
              <div key={i} className="flex gap-6 items-center p-6 bg-slate-50 hover:bg-white rounded-[2.5rem] border border-transparent hover:border-slate-200 transition-all duration-500 group shadow-sm">
                <div className={`w-14 h-14 rounded-2xl md:rounded-[1.8rem] flex items-center justify-center text-xl font-black shadow-xl shrink-0 group-hover:rotate-6 transition-all ${act.type === 'C' ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'}`}>
                  {act.type}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-4 mb-2">
                    <p className="text-[14px] md:text-[15px] font-black text-slate-800 uppercase italic truncate leading-none group-hover:text-blue-600 transition-colors">{act.name}</p>
                    <p className="text-[14px] md:text-[15px] font-black italic text-slate-950 whitespace-nowrap leading-none tracking-tighter">{act.amount.toLocaleString()}৳</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest italic">{new Date(act.date).toLocaleTimeString('bn-BD', {hour:'2-digit', minute:'2-digit'})}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                    <span className={`text-[8px] md:text-[9px] font-black uppercase italic tracking-widest ${act.type === 'C' ? 'text-emerald-500' : 'text-blue-500'}`}>
                       {act.type === 'C' ? 'পেমেন্ট জমা' : 'মালের ইনভয়েস'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
