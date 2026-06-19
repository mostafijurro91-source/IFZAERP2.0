import React, { useState, useEffect, useMemo } from 'react';
import { Company, UserRole, formatCurrency } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';
import { parseAmount } from '../lib/utils';
import { 
  ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend, Line 
} from 'recharts';
import { 
  ShoppingCart, Coins, Clock, CalendarClock, Package, 
  TrendingUp, BarChart3, Wallet, LineChart, FileText, 
  Tag, Gift, AlertTriangle, ChevronRight, Activity
} from 'lucide-react';
interface DashboardProps {
  company: Company;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        rollingMonths.push(key);
        monthlyMap[key] = {
          month: `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
          month: `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`,
          sales: 0,
          tpSales: 0,
          collection: 0,
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
      {/* 📊 Stat Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {/* 📊 Primary Stats (Hero Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
          { label: 'আজকের বিক্রি', val: stats.todaySales, icon: <ShoppingCart size={24} />, color: 'text-blue-600', bg: 'bg-blue-50', iconBg: 'bg-blue-100' },
          { label: 'আজকের আদায়', val: stats.todayCollection, icon: <Wallet size={24} />, color: 'text-emerald-600', bg: 'bg-emerald-50', iconBg: 'bg-emerald-100' },
          { label: 'মোট বকেয়া', val: stats.regularDue, icon: <Clock size={24} />, color: 'text-rose-600', bg: 'bg-rose-50', iconBg: 'bg-rose-100' },
          { label: 'বুকিং / অ্যাডভান্স', val: stats.bookingAdvance, icon: <CalendarClock size={24} />, color: 'text-indigo-600', bg: 'bg-indigo-50', iconBg: 'bg-indigo-100' }
        ].map((card, i) => (
          <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-md hover:shadow-2xl transition-all duration-700 hover:-translate-y-1 animate-reveal relative overflow-hidden group" style={{ animationDelay: `${i * 0.1}s` }}>
            <div className={`absolute top-0 right-0 w-24 h-24 ${card.bg} rounded-bl-[4rem] -z-0 opacity-40 group-hover:scale-125 transition-transform`}></div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 italic relative z-10 leading-none">{card.label}</p>
            <p className={`text-xl md:text-2xl font-black italic tracking-tighter ${card.color} leading-none relative z-10`}>{formatCurrency(card.val)}</p>
          <div key={i} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group relative overflow-hidden">
            <div className={`absolute top-0 right-0 w-32 h-32 ${card.bg} rounded-bl-[4rem] -z-0 opacity-40 group-hover:scale-125 transition-transform duration-500`}></div>
            <div className="relative z-10 flex flex-col gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${card.color} ${card.iconBg} shadow-sm group-hover:rotate-6 transition-transform`}>
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
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] shadow-lg border border-slate-100 overflow-hidden animate-reveal stagger-2">
          <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
            <h3 className="text-[9px] font-black uppercase italic tracking-[0.2em] text-slate-400">Monthly Ledger Flow</h3>
            <span className="bg-indigo-50 text-indigo-600 px-4 py-1 rounded-full text-[8px] font-black uppercase italic animate-pulse">Synced ✓</span>
        {/* 📈 Beautiful Recharts Area */}
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden relative">
          <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
            <div>
              <h3 className="text-lg font-black tracking-tight text-slate-800 flex items-center gap-2">
                <BarChart3 className="text-indigo-500" size={20} />
                মাসিক লেনদেন প্রবাহ
              </h3>
              <p className="text-xs text-slate-400 font-medium mt-1">বিগত ১২ মাসের টিপি, সেলস এবং কালেকশন</p>
            </div>
          </div>
          <div className="overflow-x-auto custom-scroll">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[8px] font-black text-slate-300 uppercase tracking-widest border-b border-slate-50">
                  <th className="px-6 py-4">মাস (Month Index)</th>
                  <th className="px-6 py-4 text-center">টিপিরেট (TP)</th>
                  <th className="px-6 py-4 text-center">ম্যামো (Memo)</th>
                  <th className="px-6 py-4 text-center">কমিশন (Comm)</th>
                  <th className="px-6 py-4 text-center">গিফট</th>
                  <th className="px-6 py-4 text-center">রিটার্ন</th>
                  <th className="px-6 py-4 text-right">আদায়</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-[11px] font-bold uppercase italic">
                {monthlyData.map((d, i) => (
                  <tr key={i} className="hover:bg-indigo-50/20 transition-all group">
                    <td className="px-6 py-4 text-slate-700 font-black">{d.month}</td>
                    <td className="px-6 py-4 text-center text-blue-600 font-black">{Math.round(d.tpSales).toLocaleString()}৳</td>
                    <td className="px-6 py-4 text-center text-slate-900">{Math.round(d.sales).toLocaleString()}৳</td>
                    <td className="px-6 py-4 text-center text-emerald-500">{Math.round(d.commission).toLocaleString()}৳</td>
                    <td className="px-6 py-4 text-center text-pink-500">{Math.round(d.gift).toLocaleString()}৳</td>
                    <td className="px-6 py-4 text-center text-rose-500">{d.returns > 0 ? `-${Math.round(d.returns).toLocaleString()}৳` : '-'}</td>
                    <td className="px-6 py-4 text-right text-emerald-600 font-black">+{Math.round(d.collection).toLocaleString()}৳</td>
                  </tr>
                ))}
              </tbody>
            </table>
          <div className="p-6 h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#fbbf24" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{fill: '#64748b', fontSize: 10, fontWeight: 600}} axisLine={false} tickLine={false} dy={10} />
                <YAxis tickFormatter={(val) => `৳${(val/1000)}k`} tick={{fill: '#64748b', fontSize: 10, fontWeight: 600}} axisLine={false} tickLine={false} dx={-10} />
                <RechartsTooltip 
                  formatter={(value: number) => `৳${value.toLocaleString()}`}
                  contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)', padding: '12px 16px', fontWeight: 'bold' }}
                  itemStyle={{ fontWeight: 800 }}
                  labelStyle={{ color: '#94a3b8', fontSize: '12px', marginBottom: '8px', textTransform: 'uppercase' }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 700 }} iconType="circle" />
                <Area type="monotone" dataKey="tpSales" name="টিপি (TP)" fill="url(#colorTp)" stroke="#6366f1" strokeWidth={3} />
                <Area type="monotone" dataKey="sales" name="ম্যামো (Sales)" fill="url(#colorSales)" stroke="#f59e0b" strokeWidth={3} />
                <Bar dataKey="collection" name="আদায় (Collection)" barSize={16} fill="#10b981" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="returns" name="রিটার্ন (Returns)" stroke="#ef4444" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
              </ComposedChart>
            </ResponsiveContainer>
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
        {/* ⚡ Secondary Metrics Matrix */}
        <div className="flex flex-col gap-4">
          {[
            { label: 'চলতি মাসের সেল', val: stats.currentMonthSales, icon: <TrendingUp size={20}/>, color: 'text-fuchsia-600', bg: 'bg-fuchsia-50' },
            { label: 'চলতি মাসের ম্যামো', val: stats.currentMonthMemo, icon: <FileText size={20}/>, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'চলতি মাসের টিপি', val: stats.currentMonthTP, icon: <LineChart size={20}/>, color: 'text-blue-700', bg: 'bg-blue-50' },
            { label: 'কমিশন / অফার', val: stats.currentMonthOffer, icon: <Tag size={20}/>, color: 'text-emerald-500', bg: 'bg-emerald-50' },
            { label: 'মাসিক মোট গিফট', val: stats.currentMonthGift, icon: <Gift size={20}/>, color: 'text-pink-500', bg: 'bg-pink-50' },
            { label: 'বর্তমান স্টক ভ্যালু', val: stats.stockValue, icon: <Package size={20}/>, color: 'text-slate-700', bg: 'bg-slate-100' }
          ].map((item, i) => (
            <div key={i} className={`p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-all ${item.bg}`}>
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-sm ${item.color} group-hover:scale-110 transition-transform`}>
                  {item.icon}
                </div>
                <p className="text-sm font-black italic text-white leading-none tracking-tight group-hover:text-indigo-400 transition-colors">{act.amount.toLocaleString()}৳</p>
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">{item.label}</p>
              </div>
            ))}
          </div>
              <p className={`text-lg font-black tracking-tight ${item.color}`}>{formatCurrency(item.val)}</p>
            </div>
          ))}
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 🔴 Inactive Customers Alert */}
        {inactiveDefaulters.length > 0 && (
          <div className="lg:col-span-2 bg-white rounded-[2.5rem] shadow-xl border border-rose-100 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-rose-100 to-transparent opacity-50 rounded-bl-full pointer-events-none"></div>
            <div className="p-6 border-b border-rose-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex justify-center items-center shadow-sm">
                  <AlertTriangle size={24} />
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
            <span className="bg-rose-600 text-white px-5 py-2 rounded-full text-[11px] font-black uppercase shadow-lg shadow-rose-600/20">{inactiveDefaulters.length} Shops</span>
            <div className="overflow-x-auto custom-scroll relative z-10">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-rose-50/30 text-[10px] font-black text-rose-400 uppercase tracking-widest border-b border-rose-50">
                    <th className="px-6 py-4">দোকানের নাম</th>
                    <th className="px-6 py-4">শেষ লেনদেন</th>
                    <th className="px-6 py-4 text-right">বকেয়া পরিমাণ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-sm font-bold">
                  {inactiveDefaulters.slice(0, 5).map((c, i) => {
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
            {inactiveDefaulters.length > 5 && (
              <div className="p-3 bg-rose-50/50 text-center border-t border-rose-50">
                <p className="text-xs font-bold text-rose-600 hover:text-rose-700 cursor-pointer flex items-center justify-center gap-1">
                  আরও {inactiveDefaulters.length - 5} টি দেখুন <ChevronRight size={14}/>
                </p>
              </div>
            )}
          </div>
        )}
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
        {/* 🔄 Live Activity Stream */}
        <div className={`${inactiveDefaulters.length === 0 ? 'lg:col-span-3 lg:w-1/3' : ''} bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden relative flex flex-col`}>
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-900/20 to-transparent pointer-events-none"></div>
          <div className="p-6 border-b border-white/5 flex justify-between items-center relative z-10">
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <Activity className="text-indigo-400" size={18} />
              লাইভ অ্যাক্টিভিটি
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
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-inner ${act.type === 'C' ? 'bg-emerald-500' : 'bg-indigo-500'}`}>
                    {act.type === 'C' ? <Wallet size={16}/> : <ShoppingCart size={16}/>}
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
                <Clock size={32} className="text-slate-400" />
                <p className="text-xs font-bold text-white uppercase tracking-widest">আজকের কোনো আপডেট নেই</p>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
export default Dashboard;

