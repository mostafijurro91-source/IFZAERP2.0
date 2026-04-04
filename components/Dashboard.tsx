
import React, { useState, useEffect, useMemo } from 'react';
import { Company, UserRole, formatCurrency } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';

interface DashboardProps {
  company: Company;
  role: UserRole;
}

const Dashboard: React.FC<DashboardProps> = ({ company, role }) => {
  const [stats, setStats] = useState({
    todaySales: 0, todayCollection: 0, regularDue: 0, bookingAdvance: 0, stockValue: 0, currentMonthSales: 0, avgMonthSales: 0, avgMonthCollection: 0,
    currentMonthTP: 0, currentMonthMemo: 0, currentMonthOffer: 0, currentMonthGift: 0
  });
  const [loading, setLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [inactiveDefaulters, setInactiveDefaulters] = useState<any[]>([]);

  useEffect(() => { fetchDashboardData(); }, [company]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const dbCompany = mapToDbCompany(company);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(today.getDate() - 30);

      const [txRes, prodRes] = await Promise.all([
        supabase.from('transactions').select('customer_id, amount, payment_type, created_at, meta, items, customers(name, phone, address)').eq('company', dbCompany),
        supabase.from('products').select('tp, stock').eq('company', dbCompany)
      ]);

      let t_sales = 0, t_coll = 0, reg_due = 0, book_adv = 0;
      let dueTxCount = 0; // For temporary debugging

      const recent: any[] = [];
      const monthlyMap: Record<string, { month: string, sales: number, tpSales: number, collection: number, returns: number }> = {};
      const monthNames = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
      monthNames.forEach((name, idx) => {
        const key = `${today.getFullYear()}-${(idx + 1).toString().padStart(2, '0')}`;
        monthlyMap[key] = { month: name, sales: 0, tpSales: 0, collection: 0, returns: 0 };
      });

      const customerStatsMap: Record<string, { name: string, phone: string, address: string, due: number, lastTxDate: Date }> = {};

      txRes.data?.forEach(tx => {
        const amt = Number(tx.amount) || 0;
        const txDateStr = tx.created_at.split('T')[0];
        const txMonth = tx.created_at.slice(0, 7);
        const txDate = new Date(tx.created_at);
        const isBooking = tx.meta?.is_booking === true || tx.items?.[0]?.note?.includes('বুকিং');
        const cid = tx.customer_id;

        const returnItem = tx.items?.find((it: any) => it.action === 'RETURN');
        const returnAmount = returnItem ? Math.abs(tx.items.reduce((s: number, it: any) => it.action === 'RETURN' ? s + (Number(it.total) || 0) : s, 0)) : 0;

        if (returnAmount > 0 && monthlyMap[txMonth]) {
          monthlyMap[txMonth].returns += returnAmount;
        }

        if (cid) {
          if (!customerStatsMap[cid]) {
            const cust = Array.isArray(tx.customers) ? tx.customers[0] : tx.customers;
            customerStatsMap[cid] = {
              name: cust?.name || 'Unknown',
              phone: cust?.phone || '',
              address: cust?.address || '',
              due: 0,
              lastTxDate: new Date(0)
            };
          }
          if (txDate > customerStatsMap[cid].lastTxDate) {
            customerStatsMap[cid].lastTxDate = txDate;
          }
        }

        if (tx.payment_type === 'COLLECTION') {
          if (txDateStr === todayStr) t_coll += amt;
          if (isBooking) {
            book_adv += amt;
          } else {
            reg_due -= amt;
            if (cid) customerStatsMap[cid].due -= amt;
          }
          if (monthlyMap[txMonth]) monthlyMap[txMonth].collection += amt;
        } else if (tx.payment_type === 'DUE') {
          if (txDateStr === todayStr) t_sales += amt;
          reg_due += amt;
          if (cid) customerStatsMap[cid].due += amt;
          if (monthlyMap[txMonth]) {
            monthlyMap[txMonth].sales += amt;
            const comm = Number(tx.meta?.total_commission) || 0;
            monthlyMap[txMonth].tpSales += (amt + comm);
          }
        }
        if (txDateStr === todayStr) {
          const cust = Array.isArray(tx.customers) ? tx.customers[0] : tx.customers;
          recent.push({ name: cust?.name || 'Unknown', amount: amt, date: tx.created_at, type: tx.payment_type === 'COLLECTION' ? 'C' : 'S' });
        }
      });

      const defaulters = Object.values(customerStatsMap)
        .filter(c => c.due > 0 && c.lastTxDate < thirtyDaysAgo)
        .sort((a, b) => b.due - a.due);

      let currSales = 0;
      let totalSales = 0;
      let totalCollection = 0;
      let activeMonths = 0;
      
      let currMonthTP = 0, currMonthMemo = 0, currMonthOffer = 0, currMonthGift = 0;

      const currentMonthKey = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}`;
      
      txRes.data?.forEach(tx => {
        const txMonth = tx.created_at.slice(0, 7);
        if (txMonth === currentMonthKey && tx.payment_type === 'DUE') {
          const amt = Number(tx.amount) || 0;
          const comm = Number(tx.meta?.total_commission) || 0;
          const gift = Number(tx.meta?.total_gift) || 0;
          currMonthMemo += amt;
          currMonthOffer += comm;
          currMonthGift += gift;
          currMonthTP += (amt + comm);
        }
      });

      if (monthlyMap[currentMonthKey]) currSales = monthlyMap[currentMonthKey].sales;

      Object.values(monthlyMap).forEach(m => {
        if (m.sales > 0 || m.collection > 0 || m.returns > 0) activeMonths++;
        totalSales += m.sales;
        totalCollection += m.collection;
      });

      const avgSales = activeMonths > 0 ? totalSales / activeMonths : 0;
      const avgCollection = activeMonths > 0 ? totalCollection / activeMonths : 0;

      const sValue = prodRes.data?.reduce((acc, p) => acc + (Number(p.tp) * Number(p.stock)), 0) || 0;
      setStats({
        todaySales: t_sales,
        todayCollection: t_coll,
        regularDue: reg_due,
        bookingAdvance: book_adv,
        stockValue: sValue,
        currentMonthSales: currSales,
        avgMonthSales: avgSales,
        avgMonthCollection: avgCollection,
        currentMonthTP: currMonthTP,
        currentMonthMemo: currMonthMemo,
        currentMonthOffer: currMonthOffer,
        currentMonthGift: currMonthGift
      });
      setRecentActivity(recent.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10));
      setMonthlyData(Object.values(monthlyMap));
      setInactiveDefaulters(defaulters);
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
    <div className="space-y-6 pb-40 animate-reveal text-slate-900">

      {/* 🎭 Cinematic Hero Banner */}
      <div className={`p-8 md:p-12 rounded-[2.5rem] bg-gradient-to-br ${brandTheme.gradient} text-white shadow-xl relative overflow-hidden group`}>
        <div className="absolute right-[-20px] top-[-20px] text-[160px] opacity-10 font-bold italic group-hover:scale-110 group-hover:rotate-12 transition-all duration-[3000ms] animate-float">{brandTheme.icon}</div>
        <div className="relative z-10">
          <p className="text-[9px] font-black uppercase tracking-[0.6em] text-white/50 mb-3 italic">Enterprise Resource Planning</p>
          <h2 className="text-3xl md:text-5xl font-black italic tracking-tighter lowercase leading-tight">ifza<span className="text-white/30">.</span>{company.toLowerCase().replace(' ', '')}</h2>
          <div className="flex gap-3 mt-6">
            <span className="bg-white/10 backdrop-blur-xl px-6 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest italic border border-white/10 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span> Live Cloud Sync
            </span>
          </div>
        </div>
      </div>

      {/* 📊 Stat Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {[
          { label: 'আজকের বিক্রি', val: stats.todaySales, color: 'text-blue-600', icon: '🛒', bg: 'bg-blue-50' },
          { label: 'আজকের আদায়', val: stats.todayCollection, color: 'text-emerald-600', icon: '💰', bg: 'bg-emerald-50' },
          { label: 'মালের বকেয়া', val: stats.regularDue, color: 'text-rose-600', icon: '⏳', bg: 'bg-rose-50' },
          { label: 'বুকিং জমা', val: stats.bookingAdvance, color: 'text-indigo-600', icon: '📅', bg: 'bg-indigo-50' },
          { label: 'স্টক ভ্যালু', val: stats.stockValue, color: 'text-slate-900', icon: '📦', bg: 'bg-slate-100' },
          { label: 'চলতি মাসের সেল', val: stats.currentMonthSales, color: 'text-fuchsia-600', icon: '📈', bg: 'bg-fuchsia-50' },
          { label: 'গড় মাসিক সেল', val: stats.avgMonthSales, color: 'text-violet-600', icon: '📊', bg: 'bg-violet-50' },
          { label: 'গড় মাসিক আদায়', val: stats.avgMonthCollection, color: 'text-teal-600', icon: '💸', bg: 'bg-teal-50' },
          { label: 'চলতি মাসের টিপিরেট', val: stats.currentMonthTP, color: 'text-blue-700', icon: '📉', bg: 'bg-blue-100' },
          { label: 'চলতি মাসের ম্যামো', val: stats.currentMonthMemo, color: 'text-amber-600', icon: '📝', bg: 'bg-amber-50' },
          { label: 'চলতি মাসের কমিশন', val: stats.currentMonthOffer, color: 'text-emerald-500', icon: '🏷️', bg: 'bg-emerald-100' },
          { label: 'চলতি মাসের মোট গিফট', val: stats.currentMonthGift, color: 'text-pink-500', icon: '🎁', bg: 'bg-pink-50' }
        ].map((card, i) => (
          <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-md hover:shadow-2xl transition-all duration-700 hover:-translate-y-1 animate-reveal relative overflow-hidden group" style={{ animationDelay: `${i * 0.1}s` }}>
            <div className={`absolute top-0 right-0 w-24 h-24 ${card.bg} rounded-bl-[4rem] -z-0 opacity-40 group-hover:scale-125 transition-transform`}></div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 italic relative z-10 leading-none">{card.label}</p>
            <p className={`text-xl md:text-2xl font-black italic tracking-tighter ${card.color} leading-none relative z-10`}>{formatCurrency(card.val)}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Graph Table */}
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] shadow-lg border border-slate-100 overflow-hidden animate-reveal stagger-2">
          <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
            <h3 className="text-[9px] font-black uppercase italic tracking-[0.2em] text-slate-400">Monthly Ledger Flow</h3>
            <span className="bg-indigo-50 text-indigo-600 px-4 py-1 rounded-full text-[8px] font-black uppercase italic animate-pulse">Synced ✓</span>
          </div>
          <div className="overflow-x-auto custom-scroll">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[8px] font-black text-slate-300 uppercase tracking-widest border-b border-slate-50">
                  <th className="px-6 py-4">মাস (Month Index)</th>
                  <th className="px-6 py-4 text-center">টিপিরেট (TP)</th>
                  <th className="px-6 py-4 text-center">ম্যামো (Memo)</th>
                  <th className="px-6 py-4 text-center">কমিশন (Comm)</th>
                  <th className="px-6 py-4 text-center">রিটার্ন</th>
                  <th className="px-6 py-4 text-right">আদায়</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-[11px] font-bold uppercase italic">
                {monthlyData.map((d, i) => (
                  <tr key={i} className="hover:bg-indigo-50/20 transition-all group">
                    <td className="px-6 py-4 text-slate-700 font-black">{d.month}</td>
                    <td className="px-6 py-4 text-center text-blue-600 font-black">{Math.round(d.tpSales).toLocaleString()}৳</td>
                    <td className="px-6 py-4 text-center text-slate-900">{Math.round(d.sales).toLocaleString()}৳</td>
                    <td className="px-6 py-4 text-center text-emerald-500">{Math.round(d.tpSales - d.sales).toLocaleString()}৳</td>
                    <td className="px-6 py-4 text-center text-rose-500">{d.returns > 0 ? `-${Math.round(d.returns).toLocaleString()}৳` : '-'}</td>
                    <td className="px-6 py-4 text-right text-emerald-600 font-black">+{Math.round(d.collection).toLocaleString()}৳</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Stream */}
        <div className="bg-slate-900 rounded-[2.5rem] shadow-2xl p-6 flex flex-col animate-reveal stagger-3 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/10 blur-[50px] rounded-full"></div>
          <div className="flex justify-between items-center mb-8 relative z-10">
            <h3 className="text-[9px] font-black uppercase italic tracking-[0.2em] text-indigo-400">Live Activity</h3>
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></div>
          </div>
          <div className="space-y-4 overflow-y-auto custom-scroll max-h-[500px] pr-2 relative z-10">
            {recentActivity.map((act, i) => (
              <div key={i} className="p-4 bg-white/5 rounded-[1.5rem] flex items-center justify-between border border-white/5 group hover:bg-white/10 transition-all animate-reveal">
                <div className="flex items-center gap-4">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-black italic shadow-xl transition-transform group-hover:scale-110 text-[10px] ${act.type === 'C' ? 'bg-emerald-500' : 'bg-indigo-500'}`}>{act.type}</div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase italic text-white truncate leading-none mb-1.5">{act.name}</p>
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{new Date(act.date).toLocaleTimeString('bn-BD')}</p>
                  </div>
                </div>
                <p className="text-sm font-black italic text-white leading-none tracking-tight group-hover:text-indigo-400 transition-colors">{act.amount.toLocaleString()}৳</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 🔴 Inactive Customers with Pending Dues */}
      {inactiveDefaulters.length > 0 && (
        <div className="bg-rose-50/50 rounded-[2.5rem] shadow-lg border border-rose-100 overflow-hidden animate-reveal stagger-4 mt-6 relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/5 blur-[80px] rounded-full pointer-events-none"></div>
          <div className="p-8 border-b border-rose-100/50 flex justify-between items-center bg-white/50 backdrop-blur-sm relative z-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex justify-center items-center text-2xl shadow-sm">⚠️</div>
              <div>
                <h3 className="text-xl font-black uppercase italic tracking-tighter text-rose-900">দীর্ঘদিনের বকেয়া (Long Pending Dues)</h3>
                <p className="text-[10px] text-rose-500 font-bold uppercase tracking-widest mt-1">১ মাসের বেশি সময় ধরে কোনো লেনদেন হয়নি</p>
              </div>
            </div>
            <span className="bg-rose-600 text-white px-5 py-2 rounded-full text-[11px] font-black uppercase shadow-lg shadow-rose-600/20">{inactiveDefaulters.length} Shops</span>
          </div>

          <div className="overflow-x-auto custom-scroll relative z-10">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-rose-50/50 text-[10px] font-black text-rose-400 uppercase tracking-widest border-b border-rose-100/50">
                  <th className="px-8 py-5">দোকানের নাম ও ঠিকানা</th>
                  <th className="px-8 py-5">যোগাযোগ</th>
                  <th className="px-8 py-5 text-right">শেষ লেনদেন</th>
                  <th className="px-8 py-5 text-right">মোট বকেয়া</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-100/30 text-[12px] font-bold">
                {inactiveDefaulters.map((c, i) => {
                  const daysInactive = Math.floor((new Date().getTime() - c.lastTxDate.getTime()) / (1000 * 3600 * 24));
                  return (
                    <tr key={i} className="hover:bg-white/80 transition-all">
                      <td className="px-8 py-5">
                        <p className="font-black text-slate-900 uppercase italic text-[14px] leading-tight mb-1">{c.name}</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1">📍 {c.address}</p>
                      </td>
                      <td className="px-8 py-5 text-slate-600 font-black italic text-[11px]">📱 {c.phone}</td>
                      <td className="px-8 py-5 text-right">
                        <p className="font-black text-slate-700 italic">{c.lastTxDate.toLocaleDateString('bn-BD')}</p>
                        <p className="text-[9px] text-rose-500 uppercase tracking-widest mt-1">[{daysInactive} days ago]</p>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <span className="font-black text-rose-600 italic text-xl tracking-tighter bg-rose-50 px-4 py-2 rounded-xl inline-block">{Math.round(c.due).toLocaleString()}৳</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};

export default Dashboard;
