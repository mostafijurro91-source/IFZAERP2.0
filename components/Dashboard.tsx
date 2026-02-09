
import React, { useState, useEffect, useMemo } from 'react';
import { Company, UserRole, formatCurrency } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

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
          if (txDate === todayStr) {
            t_coll += amt;
            recent.push({ name: tx.customers?.name || 'Unknown', amount: amt, date: tx.created_at, type: 'C' });
          }
          total_due -= amt;
          if (monthlyMap[txMonth]) monthlyMap[txMonth].collection += amt;
        } else {
          if (txDate === todayStr) {
            t_sales += amt;
            recent.push({ name: tx.customers?.name || 'Unknown', amount: amt, date: tx.created_at, type: 'S' });
          }
          if (txMonth === monthStr) m_sales += amt;
          total_due += amt;
          if (monthlyMap[txMonth]) monthlyMap[txMonth].sales += amt;
        }
      });

      const sValue = prodRes.data?.reduce((acc, p) => acc + (Number(p.tp) * Number(p.stock)), 0) || 0;

      setStats({ todaySales: t_sales, todayCollection: t_coll, totalDue: total_due, stockValue: sValue, monthSales: m_sales });
      setMonthlyData(Object.values(monthlyMap));
      setRecentActivity(recent.slice(0, 6));
    } catch (err) {
      console.error("Dashboard error:", err);
    } finally {
      setLoading(false);
    }
  };

  const brandTheme = useMemo(() => {
    switch (company) {
      case 'Transtec': return { color: 'text-amber-500', bg: 'bg-amber-500', gradient: 'from-amber-400 to-orange-600', icon: '⚡' };
      case 'SQ Light': return { color: 'text-cyan-500', bg: 'bg-cyan-500', gradient: 'from-cyan-400 to-blue-600', icon: '💡' };
      case 'SQ Cables': return { color: 'text-rose-600', bg: 'bg-rose-600', gradient: 'from-rose-500 to-red-700', icon: '🔌' };
      default: return { color: 'text-blue-500', bg: 'bg-blue-500', gradient: 'from-blue-400 to-indigo-600', icon: '📊' };
    }
  }, [company]);

  if (loading) return (
    <div className="py-40 text-center">
      <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-8"></div>
      <p className="font-black uppercase tracking-[0.3em] text-[12px] text-slate-400 italic">Syncing {company} Node...</p>
    </div>
  );

  return (
    <div className="space-y-8 pb-32 animate-reveal font-sans text-slate-900">
      
      <div className={`relative p-10 md:p-14 rounded-[3.5rem] bg-gradient-to-br ${brandTheme.gradient} text-white shadow-2xl overflow-hidden group`}>
        <div className="absolute right-[-10px] top-[-10px] text-[150px] opacity-10 font-black italic select-none animate-float">
          {brandTheme.icon}
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-white/20 backdrop-blur-xl rounded-3xl flex items-center justify-center text-4xl border border-white/20 shadow-inner group-hover:scale-110 transition-transform duration-500">
              {brandTheme.icon}
            </div>
            <div>
              <h2 className="text-4xl md:text-6xl font-black italic tracking-tighter leading-none lowercase">
                ifza<span className="text-white/30">.</span>{company.toLowerCase().replace(' ', '')}
              </h2>
              <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white/70 mt-3 italic">
                Division Monitor • Live Dashboard
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-5">
        {[
          { label: 'আজকের বিক্রি', val: stats.todaySales, color: 'text-blue-600', icon: '📝' },
          { label: 'নগদ আদায়', val: stats.todayCollection, color: 'text-emerald-500', icon: '💰' },
          { label: 'মার্কেট বাকি', val: stats.totalDue, color: 'text-rose-500', icon: '📉' },
          { label: 'স্টক ভ্যালু', val: stats.stockValue, color: 'text-slate-900', icon: '📦' },
          { label: 'মাসের বিক্রি', val: stats.monthSales, color: 'text-indigo-600', icon: '📊' }
        ].map((card, idx) => (
          <div key={idx} 
               style={{ animationDelay: `${idx * 0.1}s` }}
               className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col items-center text-center group hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 animate-reveal">
            <span className="text-2xl mb-4 opacity-30 group-hover:opacity-100 group-hover:scale-125 transition-all duration-500">{card.icon}</span>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic mb-2">{card.label}</p>
            <p className={`text-2xl font-black italic tracking-tighter ${card.color}`}>
              {formatCurrency(card.val)}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <div className="lg:col-span-2 bg-white rounded-[3.5rem] shadow-sm border border-slate-100 p-8 flex flex-col h-[500px]">
          <h3 className="text-sm font-black uppercase italic tracking-widest text-slate-800 mb-8 px-4">বাৎসরিক পারফরম্যান্স গ্রাফ</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData}>
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 800}} />
              <YAxis hide />
              <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 20px 50px rgba(0,0,0,0.1)', fontWeight: 800}} />
              <Bar dataKey="sales" radius={[10, 10, 0, 0]} barSize={20}>
                 {monthlyData.map((entry, index) => (
                   <Cell key={`cell-${index}`} fill={index === monthlyData.length - 1 ? '#2563eb' : '#e2e8f0'} />
                 ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-[3.5rem] shadow-sm border border-slate-100 p-8 flex flex-col animate-reveal" style={{ animationDelay: '0.8s' }}>
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-sm font-black uppercase italic tracking-widest text-slate-800">সাম্প্রতিক আপডেট</h3>
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
          </div>
          <div className="space-y-5 flex-1 overflow-y-auto custom-scroll pr-2">
            {recentActivity.map((act, i) => (
              <div key={i} className="flex gap-5 items-start group p-4 hover:bg-slate-50 rounded-[2rem] transition-all duration-300 border border-transparent hover:border-slate-100">
                <div className={`mt-1 w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shadow-sm shrink-0 transition-transform group-hover:scale-110 ${act.type === 'C' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                  {act.type}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-[13px] font-black text-slate-800 uppercase italic truncate group-hover:text-blue-600 transition-colors">{act.name}</p>
                    <p className="text-[12px] font-black italic text-slate-900">
                      {act.amount.toLocaleString()}৳
                    </p>
                  </div>
                  <p className="text-[8px] font-bold text-slate-400 uppercase mt-1 tracking-widest">
                    {new Date(act.date).toLocaleTimeString('bn-BD')} • {act.type === 'C' ? 'নগদ জমা' : 'মালের মেমো'}
                  </p>
                </div>
              </div>
            ))}
            {recentActivity.length === 0 && (
              <div className="py-20 text-center opacity-20 italic font-black uppercase text-xs">No activity recorded today</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
