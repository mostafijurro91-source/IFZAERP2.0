import React, { useState, useEffect, useMemo } from 'react';
import { Company, UserRole, formatCurrency } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';

// Inlined parseAmount to fix Vercel missing utils.ts error
const parseAmount = (v: any): number => {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(/[,\s]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

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

  // Realtime updates: refresh dashboard when transactions or related tables change
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'collection_requests' }, () => fetchDashboardData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [company]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const dbCompany = mapToDbCompany(company);
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(today.getDate() - 30);

      const [prodRes, custRes] = await Promise.all([
        supabase.from('products').select('tp, stock').eq('company', dbCompany),
        supabase.from('customers').select('id')
      ]);
      const validCustomerIds = new Set(custRes.data?.map(c => c.id) || []);

      let allTx: any[] = [];
      let page = 0;
      // UNLIMITED LOOP: Fetches all transactions without any 1000 limit
      while (true) {
        const txRes = await supabase.from('transactions')
          .select('customer_id, amount, payment_type, created_at, meta, items, customers(name, phone, address)')
          .eq('company', dbCompany)
          .order('created_at', { ascending: false })
          .range(page * 1000, (page + 1) * 1000 - 1);
        
        if (txRes.data) {
          allTx = allTx.concat(txRes.data);
        }
        if (!txRes.data || txRes.data.length < 1000) break;
        page++;
      }

      const monthNames = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
      const monthlyMap: Record<string, { month: string, sales: number, tpSales: number, collection: number, returns: number, commission: number, gift: number }> = {};
      const rollingMonths: string[] = [];
      const currentYear = today.getFullYear();
      
      // শুধুমাত্র বর্তমান বছরের ১২ মাস (জানুয়ারি - ডিসেম্বর)
      for (let i = 0; i < 12; i++) {
        const key = `${currentYear}-${String(i + 1).padStart(2, '0')}`;
        rollingMonths.push(key);
        monthlyMap[key] = {
          month: monthNames[i],
          sales: 0,
          tpSales: 0,
          collection: 0,
          returns: 0,
          commission: 0,
          gift: 0
        };
      }

      let t_sales = 0, t_coll = 0, reg_due = 0, book_adv = 0;
      const recent: any[] = [];
      const customerStatsMap: Record<string, { name: string, phone: string, address: string, due: number, lastTxDate: Date }> = {};

      allTx.forEach(tx => {
        const amt = parseAmount(tx.amount);
        const txDate = new Date(tx.created_at);
        const txDateStr = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}-${String(txDate.getDate()).padStart(2, '0')}`;
        const txMonth = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
        const isBooking = tx.meta?.is_booking === true || tx.items?.[0]?.note?.includes('বুকিং');
        const cid = tx.customer_id;
        const returnAmount = Math.abs(tx.items?.reduce((s: number, it: any) => it.action === 'RETURN' ? s + parseAmount(it.total) : s, 0) || 0);

        if (cid) {
          if (!customerStatsMap[cid]) {
            const cust = Array.isArray(tx.customers) ? tx.customers[0] : tx.customers;
            customerStatsMap[cid] = {
              name: cust?.name || 'Unknown',
              phone: cust?.phone || '',
              address: cust?.address || '',
              due: 0,
              book_adv: 0,
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
            if (cid) customerStatsMap[cid].book_adv += amt;
          } else {
            if (cid) customerStatsMap[cid].due -= amt;
          }
          if (monthlyMap[txMonth]) monthlyMap[txMonth].collection += amt;
        } else if (tx.payment_type === 'DUE') {
          if (txDateStr === todayStr) t_sales += amt;
          if (cid) customerStatsMap[cid].due += amt;
          if (monthlyMap[txMonth]) {
            const comm = parseAmount(tx.meta?.total_commission) || 0;
            const gift = parseAmount(tx.meta?.total_gift) || 0;
            monthlyMap[txMonth].sales += amt;
            monthlyMap[txMonth].tpSales += amt + comm;
            monthlyMap[txMonth].commission += comm;
            monthlyMap[txMonth].gift += gift;
            if (returnAmount > 0) monthlyMap[txMonth].returns += returnAmount;
          }
        }

        if (txDateStr === todayStr) {
          const cust = Array.isArray(tx.customers) ? tx.customers[0] : tx.customers;
          recent.push({ name: cust?.name || 'Unknown', amount: amt, date: tx.created_at, type: tx.payment_type === 'COLLECTION' ? 'C' : 'S' });
        }
      });

      // Recalculate total due and booking advance strictly for valid/active customers
      reg_due = 0;
      book_adv = 0;
      Object.keys(customerStatsMap).forEach(cid => {
        if (validCustomerIds.has(cid)) {
          reg_due += customerStatsMap[cid].due;
          book_adv += customerStatsMap[cid].book_adv;
        }
      });

      const defaulters = Object.values(customerStatsMap)
        .filter(c => c.due > 0 && c.lastTxDate < thirtyDaysAgo)
        .sort((a, b) => b.due - a.due);

      const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const currentMonth = monthlyMap[currentMonthKey];
      const activeMonths = rollingMonths.filter(key => {
        const m = monthlyMap[key];
        return m && (m.sales > 0 || m.collection > 0 || m.returns > 0 || m.commission > 0);
      });
      const totalSales = activeMonths.reduce((sum, key) => sum + monthlyMap[key].sales, 0);
      const totalCollection = activeMonths.reduce((sum, key) => sum + monthlyMap[key].collection, 0);

      const sValue = prodRes.data?.reduce((acc, p) => acc + (parseAmount(p.tp) * parseAmount(p.stock)), 0) || 0;
      setStats({
        todaySales: t_sales,
        todayCollection: t_coll,
        regularDue: reg_due,
        bookingAdvance: book_adv,
        stockValue: sValue,
        currentMonthSales: currentMonth?.sales || 0,
        avgMonthSales: activeMonths.length > 0 ? totalSales / activeMonths.length : 0,
        avgMonthCollection: activeMonths.length > 0 ? totalCollection / activeMonths.length : 0,
        currentMonthTP: currentMonth?.tpSales || 0,
        currentMonthMemo: currentMonth?.sales || 0,
        currentMonthOffer: currentMonth?.commission || 0,
        currentMonthGift: currentMonth?.gift || 0
      });
      setRecentActivity(recent.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10));
      setMonthlyData(rollingMonths.map(key => monthlyMap[key]));
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
    <div className="space-y-6 pb-40 animate-reveal text-slate-900 font-sans">
      
      {/* 🎭 Hero Section - Glassmorphism */}
      <div className={`p-8 md:p-12 rounded-[2.5rem] bg-gradient-to-br ${brandTheme.gradient} text-white shadow-2xl relative overflow-hidden group`}>
        <div className="absolute right-[-40px] top-[-40px] text-[200px] opacity-10 font-bold italic group-hover:scale-110 group-hover:rotate-12 transition-all duration-[3000ms] animate-float pointer-events-none">{brandTheme.icon}</div>
        <div className="absolute inset-0 bg-white/5 backdrop-blur-sm pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.4em] text-white/70 mb-2">Business Dashboard</p>
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter leading-tight drop-shadow-lg">
              {company} <span className="text-white/50 text-2xl md:text-4xl align-top">ERP</span>
            </h2>
          </div>
          <div className="flex gap-3">
            <span className="bg-black/20 backdrop-blur-md px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/10 flex items-center gap-2 shadow-inner">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-ping"></span> Live Sync Active
            </span>
          </div>
        </div>
      </div>

      {/* 📊 Primary Stats (Hero Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'আজকের বিক্রি', val: stats.todaySales, icon: '🛒', color: 'text-blue-600', bg: 'bg-blue-50', iconBg: 'bg-blue-100' },
          { label: 'আজকের আদায়', val: stats.todayCollection, icon: '💸', color: 'text-emerald-600', bg: 'bg-emerald-50', iconBg: 'bg-emerald-100' },
          { label: 'মোট বকেয়া', val: stats.regularDue, icon: '⏳', color: 'text-rose-600', bg: 'bg-rose-50', iconBg: 'bg-rose-100' },
          { label: 'বুকিং / অ্যাডভান্স', val: stats.bookingAdvance, icon: '📅', color: 'text-indigo-600', bg: 'bg-indigo-50', iconBg: 'bg-indigo-100' }
        ].map((card, i) => (
          <div key={i} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group relative overflow-hidden">
            <div className={`absolute top-0 right-0 w-32 h-32 ${card.bg} rounded-bl-[4rem] -z-0 opacity-40 group-hover:scale-125 transition-transform duration-500`}></div>
            <div className="relative z-10 flex flex-col gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl ${card.color} ${card.iconBg} shadow-sm group-hover:rotate-6 transition-transform`}>
                {card.icon}
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">{card.label}</p>
                <p className={`text-2xl md:text-3xl font-black tracking-tight ${card.color}`}>{formatCurrency(card.val)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Graph Table */}
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] shadow-lg border border-slate-100 overflow-hidden relative">
          <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
            <div>
              <h3 className="text-lg font-black tracking-tight text-slate-800 flex items-center gap-2">
                📊 মাসিক লেনদেন প্রবাহ
              </h3>
              <p className="text-xs text-slate-400 font-medium mt-1">বিগত ১২ মাসের টিপি, সেলস এবং কালেকশন</p>
            </div>
            <span className="bg-indigo-50 text-indigo-600 px-4 py-1 rounded-full text-[10px] font-black uppercase italic animate-pulse">Synced ✓</span>
          </div>
          <div className="overflow-x-auto custom-scroll">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-black text-slate-500 uppercase tracking-widest">
                  <th className="px-6 py-5 rounded-tl-2xl">মাস ({new Date().getFullYear()})</th>
                  <th className="px-6 py-5 text-center">টিপিরেট (TP)</th>
                  <th className="px-6 py-5 text-center">ম্যামো (Memo)</th>
                  <th className="px-6 py-5 text-center">কমিশন (Comm)</th>
                  <th className="px-6 py-5 text-center">গিফট</th>
                  <th className="px-6 py-5 text-center">রিটার্ন</th>
                  <th className="px-6 py-5 text-right rounded-tr-2xl">আদায়</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[13px] font-bold">
                {monthlyData.map((d, i) => {
                  const isActive = d.sales > 0 || d.collection > 0 || d.tpSales > 0;
                  return (
                    <tr key={i} className={`transition-all duration-300 hover:bg-slate-50/80 hover:shadow-sm ${isActive ? 'bg-white' : 'bg-slate-50/30 opacity-70'}`}>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1.5 rounded-xl text-xs font-black tracking-wide ${isActive ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                          {d.month}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-blue-700 bg-blue-50/30 font-black">{Math.round(d.tpSales).toLocaleString()} ৳</td>
                      <td className="px-6 py-4 text-center text-slate-800">{Math.round(d.sales).toLocaleString()} ৳</td>
                      <td className="px-6 py-4 text-center text-emerald-600 bg-emerald-50/30">{Math.round(d.commission).toLocaleString()} ৳</td>
                      <td className="px-6 py-4 text-center text-pink-600 bg-pink-50/30">{Math.round(d.gift).toLocaleString()} ৳</td>
                      <td className="px-6 py-4 text-center text-rose-500">{d.returns > 0 ? `-${Math.round(d.returns).toLocaleString()} ৳` : '-'}</td>
                      <td className="px-6 py-4 text-right text-emerald-600 font-black text-[14px]">
                        {d.collection > 0 ? `+${Math.round(d.collection).toLocaleString()} ৳` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ⚡ Secondary Metrics Matrix */}
        <div className="flex flex-col gap-4">
          {[
            { label: 'চলতি মাসের সেল', val: stats.currentMonthSales, icon: '📈', color: 'text-fuchsia-600', bg: 'bg-fuchsia-50' },
            { label: 'চলতি মাসের ম্যামো', val: stats.currentMonthMemo, icon: '📝', color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'চলতি মাসের টিপি', val: stats.currentMonthTP, icon: '📉', color: 'text-blue-700', bg: 'bg-blue-50' },
            { label: 'কমিশন / অফার', val: stats.currentMonthOffer, icon: '🏷️', color: 'text-emerald-500', bg: 'bg-emerald-50' },
            { label: 'মাসিক মোট গিফট', val: stats.currentMonthGift, icon: '🎁', color: 'text-pink-500', bg: 'bg-pink-50' },
            { label: 'বর্তমান স্টক ভ্যালু', val: stats.stockValue, icon: '📦', color: 'text-slate-700', bg: 'bg-slate-100' }
          ].map((item, i) => (
            <div key={i} className={`p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-all ${item.bg}`}>
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-sm text-xl ${item.color} group-hover:scale-110 transition-transform`}>
                  {item.icon}
                </div>
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">{item.label}</p>
              </div>
              <p className={`text-lg font-black tracking-tight ${item.color}`}>{formatCurrency(item.val)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 🔴 Inactive Customers Alert */}
        {inactiveDefaulters.length > 0 && (
          <div className="lg:col-span-2 bg-white rounded-[2.5rem] shadow-xl border border-rose-100 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-rose-100 to-transparent opacity-50 rounded-bl-full pointer-events-none"></div>
            <div className="p-6 border-b border-rose-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex justify-center items-center shadow-sm text-xl">
                  ⚠️
                </div>
                <div>
                  <h3 className="text-lg font-black text-rose-900 tracking-tight">দীর্ঘদিনের বকেয়া</h3>
                  <p className="text-xs text-rose-500 font-bold tracking-wide mt-0.5">১ মাসের বেশি সময় ধরে লেনদেন হয়নি</p>
                </div>
              </div>
              <span className="bg-rose-600 text-white px-4 py-1.5 rounded-full text-xs font-black shadow-lg shadow-rose-600/20">
                {inactiveDefaulters.length} টি দোকান
              </span>
            </div>

            <div className="overflow-auto custom-scroll relative z-10 max-h-[400px]">
              <table className="w-full text-left relative">
                <thead className="sticky top-0 bg-rose-50/90 backdrop-blur-md shadow-sm z-20">
                  <tr className="text-[10px] font-black text-rose-400 uppercase tracking-widest border-b border-rose-50">
                    <th className="px-6 py-4">দোকানের নাম</th>
                    <th className="px-6 py-4">শেষ লেনদেন</th>
                    <th className="px-6 py-4 text-right">বকেয়া পরিমাণ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm font-bold">
                  {inactiveDefaulters.map((c, i) => {
                    const daysInactive = Math.floor((new Date().getTime() - c.lastTxDate.getTime()) / (1000 * 3600 * 24));
                    return (
                      <tr key={i} className="hover:bg-rose-50/20 transition-colors">
                        <td className="px-6 py-4">
                          <p className="text-slate-800 font-black">{c.name}</p>
                          <p className="text-[10px] text-slate-400 font-medium tracking-wide flex items-center gap-1 mt-1">
                            {c.address} • {c.phone}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-slate-600">{c.lastTxDate.toLocaleDateString('bn-BD')}</p>
                          <span className="text-[9px] bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full uppercase tracking-wider mt-1 inline-block">
                            {daysInactive} দিন আগে
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="font-black text-rose-600 text-lg">{Math.round(c.due).toLocaleString()}৳</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 🔄 Live Activity Stream */}
        <div className={`${inactiveDefaulters.length === 0 ? 'lg:col-span-3 lg:w-1/3' : ''} bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden relative flex flex-col`}>
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-900/20 to-transparent pointer-events-none"></div>
          <div className="p-6 border-b border-white/5 flex justify-between items-center relative z-10">
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              ⚡ লাইভ অ্যাক্টিভিটি
            </h3>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>
          
          <div className="p-4 space-y-3 overflow-y-auto custom-scroll max-h-[400px] relative z-10">
            {recentActivity.map((act, i) => (
              <div key={i} className="p-4 bg-white/5 rounded-2xl flex items-center justify-between border border-white/5 hover:bg-white/10 transition-colors group">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-inner text-lg ${act.type === 'C' ? 'bg-emerald-500' : 'bg-indigo-500'}`}>
                    {act.type === 'C' ? '💰' : '🛒'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-slate-200 truncate leading-tight">{act.name}</p>
                    <p className="text-[9px] text-slate-400 tracking-wider mt-1">
                      {new Date(act.date).toLocaleTimeString('bn-BD')}
                    </p>
                  </div>
                </div>
                <p className={`text-sm font-black ${act.type === 'C' ? 'text-emerald-400' : 'text-white'}`}>
                  {act.amount.toLocaleString()}৳
                </p>
              </div>
            ))}
            {recentActivity.length === 0 && (
              <div className="py-10 text-center opacity-30 flex flex-col items-center gap-2">
                <div className="text-3xl text-slate-400">⏳</div>
                <p className="text-xs font-bold text-white uppercase tracking-widest">আজকের কোনো আপডেট নেই</p>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};

export default Dashboard;
