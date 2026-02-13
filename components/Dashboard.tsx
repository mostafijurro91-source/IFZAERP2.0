
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
    monthSales: 0,
    monthDeliveryExpense: 0
  });

  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const isAdmin = role === 'ADMIN';

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
        
        if (tx.payment_type === 'EXPENSE' && tx.meta?.type === 'DELIVERY') {
           if (txMonth === monthStr) m_exp += amt;
           return;
        }

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
           recent.push({ 
             id: tx.id,
             name: tx.customers?.name || 'Unknown', 
             amount: amt, 
             date: tx.created_at, 
             type: isColl ? 'C' : 'S',
             full_tx: tx
           });
        }
      });

      const sValue = prodRes.data?.reduce((acc, p) => acc + (Number(p.tp) * Number(p.stock)), 0) || 0;

      setStats({ 
        todaySales: t_sales, 
        todayCollection: t_coll, 
        totalDue: total_due, 
        stockValue: sValue, 
        monthSales: m_sales,
        monthDeliveryExpense: m_exp
      });
      setMonthlyData(Object.values(monthlyMap));
      setRecentActivity(recent.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 15));
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleDeleteTx = async (tx: any) => {
    if (!isAdmin || isDeleting) return;
    const typeLabel = tx.payment_type === 'COLLECTION' ? 'আদায়' : 'মেমো';
    if (!confirm(`আপনি কি নিশ্চিত এই ${typeLabel} এন্ট্রিটি ডিলিট করতে চান? এটি ডিলিট করলে হিসাব এবং স্টক আপডেট হবে।`)) return;

    setIsDeleting(true);
    try {
      if (tx.payment_type === 'DUE' && Array.isArray(tx.items)) {
        for (const item of tx.items) {
          if (item.id && item.qty) {
            await supabase.rpc('increment_stock', { row_id: item.id, amt: item.qty });
          }
        }
      }
      const { error } = await supabase.from('transactions').delete().eq('id', tx.id);
      if (error) throw error;
      alert("সফলভাবে ডিলিট করা হয়েছে!");
      fetchDashboardData();
    } catch (err: any) {
      alert("ত্রুটি: " + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const brandTheme = useMemo(() => {
    switch (company) {
      case 'Transtec': return { gradient: 'from-amber-500 to-orange-600', icon: '⚡' };
      case 'SQ Light': return { gradient: 'from-cyan-500 to-blue-600', icon: '💡' };
      case 'SQ Cables': return { gradient: 'from-rose-600 to-red-700', icon: '🔌' };
      default: return { gradient: 'from-slate-800 to-slate-900', icon: '📊' };
    }
  }, [company]);

  if (loading && !isDeleting) return (
    <div className="py-40 text-center animate-pulse text-slate-300 font-black uppercase italic tracking-widest text-xs">Connecting to Node...</div>
  );

  return (
    <div className="space-y-8 pb-24 text-slate-900 animate-reveal">
      {/* Header with Floating Icon */}
      <div className={`p-10 md:p-14 rounded-[3.5rem] bg-gradient-to-br ${brandTheme.gradient} text-white shadow-2xl relative overflow-hidden group`}>
         <div className="absolute right-[-20px] top-[-20px] text-[180px] opacity-10 font-bold italic group-hover:scale-110 group-hover:rotate-12 transition-transform duration-[2000ms] animate-float">{brandTheme.icon}</div>
         <div className="relative z-10">
            <h2 className="text-5xl md:text-7xl font-black italic tracking-tighter lowercase leading-none mb-4">ifza<span className="text-white/40">.</span>{company.toLowerCase().replace(' ', '')}</h2>
            <div className="flex gap-4 mt-8">
               <span className="bg-white/15 px-6 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest italic border border-white/10 flex items-center gap-2">
                 <span className="w-2 h-2 bg-emerald-400 rounded-full active-pulse"></span>
                 Live Sync Active
               </span>
               <span className="bg-black/25 px-6 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest italic border border-white/5 opacity-60">
                 Node v4.7.2
               </span>
            </div>
         </div>
      </div>

      {/* Stats with Staggered Entrance */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {[
          { label: 'আজকের বিক্রি', val: stats.todaySales, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'নগদ আদায়', val: stats.todayCollection, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'মার্কেট বাকি', val: stats.totalDue, color: 'text-rose-600', bg: 'bg-rose-50' },
          { label: 'মাসের খরচ', val: stats.monthDeliveryExpense, color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'স্টক ভ্যালু', val: stats.stockValue, color: 'text-slate-900', bg: 'bg-slate-100' },
          { label: 'মাসের বিক্রি', val: stats.monthSales, color: 'text-indigo-600', bg: 'bg-indigo-50' }
        ].map((card, i) => (
          <div key={i} className={`bg-white p-8 rounded-[2.5rem] border shadow-sm flex flex-col justify-between group hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 animate-reveal stagger-${(i%4)+1}`}>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic mb-6 leading-none">{card.label}</p>
             <p className={`text-2xl md:text-3xl font-black italic tracking-tighter ${card.color} leading-none`}>{formatCurrency(card.val)}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         <div className="lg:col-span-2 bg-white rounded-[3.5rem] shadow-sm border overflow-hidden animate-reveal stagger-2">
            <div className="p-8 border-b bg-slate-50/50 flex justify-between items-center">
               <h3 className="text-[11px] font-black uppercase italic tracking-widest text-slate-400">Monthly Performance Graph</h3>
               <span className="px-4 py-1.5 bg-blue-50 text-blue-600 rounded-full text-[8px] font-black uppercase italic active-pulse">Live Ledger</span>
            </div>
            <div className="overflow-x-auto custom-scroll">
               <table className="w-full text-left">
                  <thead>
                     <tr className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] border-b">
                        <th className="p-8">মাসিক হিসাব</th>
                        <th className="p-8 text-center">মোট বিক্রি</th>
                        <th className="p-8 text-right">সংগৃহীত আদায়</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y text-xs font-bold uppercase italic">
                     {monthlyData.map((d, i) => (
                        <tr key={i} className="hover:bg-blue-50/30 transition-all group">
                           <td className="p-8 text-slate-700 font-black">{d.month}</td>
                           <td className="p-8 text-center text-slate-900">{d.sales.toLocaleString()}৳</td>
                           <td className="p-8 text-right text-emerald-600 font-black">+{d.collection.toLocaleString()}৳</td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
         </div>

         <div className="bg-white rounded-[3.5rem] shadow-sm border p-8 flex flex-col animate-reveal stagger-3">
            <div className="flex justify-between items-center mb-10">
               <h3 className="text-[11px] font-black uppercase italic tracking-widest text-slate-400">Recent Stream</h3>
               <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping"></span>
            </div>
            <div className="space-y-5 overflow-y-auto custom-scroll max-h-[550px] pr-2">
               {recentActivity.length === 0 ? (
                 <div className="py-24 text-center opacity-10 font-black uppercase italic text-sm tracking-[0.3em]">No Stream Data</div>
               ) : recentActivity.map((act, i) => (
                 <div key={i} className="p-5 bg-slate-50/50 rounded-3xl flex items-center justify-between group transition-all hover:bg-white hover:shadow-xl border border-transparent hover:border-slate-100 animate-reveal">
                    <div className="flex items-center gap-4">
                       <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black italic shadow-xl transition-transform group-hover:scale-110 ${act.type === 'C' ? 'bg-emerald-500' : 'bg-blue-500'}`}>{act.type}</div>
                       <div className="min-w-0">
                          <p className="text-[12px] font-black uppercase italic text-slate-800 truncate leading-none mb-2">{act.name}</p>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{new Date(act.date).toLocaleTimeString('bn-BD', {hour:'2-digit', minute:'2-digit'})}</p>
                       </div>
                    </div>
                    <div className="flex items-center gap-4">
                       <p className="text-lg font-black italic text-slate-900 leading-none tracking-tighter">{act.amount.toLocaleString()}৳</p>
                       {isAdmin && (
                         <button 
                           onClick={() => handleDeleteTx(act.full_tx)}
                           className="opacity-0 group-hover:opacity-100 w-10 h-10 bg-red-50 text-red-500 rounded-xl flex items-center justify-center hover:bg-red-600 hover:text-white transition-all shadow-sm"
                         >
                           🗑️
                         </button>
                       )}
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
