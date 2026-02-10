
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
      <p className="font-semibold text-[12px] text-black uppercase tracking-[0.5em] italic">Syncing Hub Control...</p>
    </div>
  );

  return (
    <div className="space-y-6 md:space-y-10 pb-32 animate-reveal text-black">
      
      {/* Brand Header */}
      <div className={`relative p-10 md:p-14 rounded-[2.5rem] md:rounded-[4rem] bg-gradient-to-br ${brandTheme.gradient} text-white shadow-2xl overflow-hidden group`}>
        <div className="absolute right-[-40px] top-[-40px] text-[150px] md:text-[250px] opacity-10 font-semibold italic select-none animate-pulse group-hover:scale-110 transition-transform duration-1000">
          {brandTheme.icon}
        </div>
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-10 text-center md:text-left">
            <div className="w-20 h-20 md:w-32 md:h-32 bg-white/20 backdrop-blur-2xl rounded-[2rem] md:rounded-[3.5rem] flex items-center justify-center text-4xl md:text-6xl border border-white/20 shadow-2xl animate-float group-hover:rotate-12 transition-all text-white">
              {brandTheme.icon}
            </div>
            <div>
              <h2 className="text-4xl md:text-7xl font-bold italic tracking-tighter leading-none lowercase text-white">
                ifza<span className="text-white/40">.</span>{company.toLowerCase().replace(' ', '')}
              </h2>
              <p className="text-[10px] md:text-[12px] font-semibold uppercase tracking-[0.6em] text-white mt-5 italic flex items-center gap-3 justify-center md:justify-start">
                 <span className="w-2 h-2 bg-white rounded-full animate-ping"></span>
                 Satellite Node Active
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 md:gap-8">
        {[
          { label: 'আজকের বিক্রি', val: stats.todaySales, color: 'text-blue-600', icon: '📝', bg: 'bg-blue-50' },
          { label: 'নগদ আদায়', val: stats.todayCollection, color: 'text-emerald-600', icon: '💰', bg: 'bg-emerald-50' },
          { label: 'মার্কেট বাকি', val: stats.totalDue, color: 'text-rose-600', icon: '📉', bg: 'bg-rose-50' },
          { label: 'স্টক ভ্যালু', val: stats.stockValue, color: 'text-black', icon: '📦', bg: 'bg-slate-50' },
          { label: 'মাসের বিক্রি', val: stats.monthSales, color: 'text-indigo-600', icon: '📊', bg: 'bg-indigo-50' }
        ].map((card, idx) => (
          <div key={idx} className="bg-white p-8 md:p-10 rounded-[2.5rem] md:rounded-[3.5rem] border border-slate-200 shadow-sm flex flex-col items-center text-center group hover:shadow-2xl hover:-translate-y-2 transition-all duration-700 animate-reveal" style={{ animationDelay: `${idx * 0.1}s` }}>
            <div className={`w-14 h-14 md:w-16 md:h-16 ${card.bg} rounded-3xl flex items-center justify-center text-2xl md:text-3xl mb-6 shadow-sm group-hover:scale-125 group-hover:rotate-6 transition-all duration-500`}>
               {card.icon}
            </div>
            <p className="text-[9px] md:text-[10px] font-semibold text-black uppercase tracking-widest italic mb-3">{card.label}</p>
            <p className={`text-xl md:text-2xl font-bold italic tracking-tighter ${card.color}`}>
              {formatCurrency(card.val)}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 md:gap-12">
        
        {/* Performance Table */}
        <div className="lg:col-span-2 bg-white rounded-[3rem] md:rounded-[4rem] shadow-sm border border-slate-200 overflow-hidden flex flex-col animate-reveal" style={{ animationDelay: '0.6s' }}>
          <div className="p-8 md:p-10 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <h3 className="text-[10px] md:text-xs font-bold uppercase italic tracking-[0.3em] text-black flex items-center gap-4">
               <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
               বাৎসরিক পারফরম্যান্স রিপোর্ট
            </h3>
          </div>
          <div className="overflow-x-auto custom-scroll">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white border-b border-slate-100 text-[9px] md:text-[11px] font-semibold text-black uppercase tracking-widest">
                  <th className="p-6 md:p-8 pl-10 md:pl-14">মাস (Month)</th>
                  <th className="p-6 md:p-8 text-center">বিক্রি (Sales)</th>
                  <th className="p-6 md:p-8 text-right pr-10 md:pr-14">কালেকশন (Collection)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {monthlyData.map((data, idx) => (
                  <tr key={idx} className="hover:bg-blue-50 group transition-all duration-300">
                    <td className="p-6 md:p-8 pl-10 md:pl-14 text-[13px] md:text-[15px] font-semibold text-black italic group-hover:translate-x-2 transition-transform">{data.month}</td>
                    <td className="p-6 md:p-8 text-center text-[13px] md:text-[16px] font-bold text-black italic group-hover:scale-110 transition-transform">{data.sales.toLocaleString()}৳</td>
                    <td className="p-6 md:p-8 pr-10 md:pr-14 text-right text-[13px] md:text-[16px] font-bold text-emerald-600 italic">+{data.collection.toLocaleString()}৳</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Activity Feed */}
        <div className="bg-white rounded-[3rem] md:rounded-[4rem] shadow-sm border border-slate-200 p-8 md:p-10 flex flex-col h-fit animate-reveal" style={{ animationDelay: '0.8s' }}>
          <div className="flex items-center justify-between mb-8 md:mb-10">
            <h3 className="text-[10px] md:text-xs font-bold uppercase italic tracking-[0.3em] text-black">সাম্প্রতিক আপডেট</h3>
            <span className="px-4 py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-[8px] font-semibold uppercase italic">Live Feed</span>
          </div>
          <div className="space-y-6 max-h-[600px] overflow-y-auto custom-scroll pr-2">
            {recentActivity.map((act, i) => (
              <div key={i} className="flex gap-4 md:gap-6 items-start p-5 hover:bg-slate-50 rounded-[2rem] border border-transparent hover:border-slate-100 transition-all group">
                <div className={`mt-1 w-10 h-10 md:w-14 md:h-14 rounded-2xl md:rounded-[1.5rem] flex items-center justify-center text-[11px] md:text-xl font-bold shadow-lg shrink-0 group-hover:scale-110 group-hover:rotate-6 transition-all ${act.type === 'C' ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'}`}>
                  {act.type}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-3">
                    <p className="text-[12px] md:text-[14px] font-bold text-black uppercase italic truncate leading-none group-hover:text-blue-600 transition-colors">{act.name}</p>
                    <p className="text-[12px] md:text-[14px] font-bold italic text-black whitespace-nowrap">{act.amount.toLocaleString()}৳</p>
                  </div>
                  <p className="text-[8px] md:text-[9px] font-medium text-black uppercase mt-3 tracking-widest italic flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                    {new Date(act.date).toLocaleTimeString('bn-BD', {hour:'2-digit', minute:'2-digit'})} • {act.type === 'C' ? 'টাকা জমা' : 'মালের মেমো'}
                  </p>
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
