
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const DatabaseExplorer: React.FC = () => {
   const [tables, setTables] = useState<any[]>([]);
   const [selectedTable, setSelectedTable] = useState<string | null>(null);
   const [tableData, setTableData] = useState<any[]>([]);
   const [loading, setLoading] = useState(true);
   const [fetchingData, setFetchingData] = useState(false);

   // আনুমানিক ডেটা ওজন (Bytes per row)
   const tableWeights: Record<string, number> = {
      'advertisements': 51200,      // ৫০ কেবি (ছবির জন্য)
      'bookings': 1500,             // ১.৫ কেবি (আইটেম লিস্টের জন্য)
      'collection_requests': 800,   // ০.৮ কেবি
      'company_ledger': 1200,       // ১.২ কেবি
      'customers': 500,             // ০.৫ কেবি
      'delivery_tasks': 400,        // ০.৪ কেবি
      'market_orders': 2000,        // ২ কেবি (জেসন আইটেম সহ)
      'products': 600,              // ০.৬ কেবি
      'replacements': 700,          // ০.৭ কেবি
      'transactions': 2500,         // ২.৫ কেবি (মেমো আইটেম অনেক থাকে)
      'users': 300                  // ০.৩ কেবি
   };

   const tableList = [
      { name: 'advertisements', icon: '📢', desc: 'ক্যাটালগ ও বিজ্ঞাপন' },
      { name: 'bookings', icon: '📅', desc: 'বুকিং অর্ডারসমূহ' },
      { name: 'collection_requests', icon: '💰', desc: 'টাকা জমার রিকোয়েস্ট' },
      { name: 'company_ledger', icon: '📒', desc: 'কোম্পানি পারচেজ ও খরচ' },
      { name: 'customers', icon: '👥', desc: 'দোকান ও কাস্টমার প্রোফাইল' },
      { name: 'delivery_tasks', icon: '🚚', desc: 'ডেলিভারি ও ট্র্যাকিং জব' },
      { name: 'market_orders', icon: '🛍️', desc: 'কাস্টমারদের মার্কেট অর্ডার' },
      { name: 'products', icon: '📦', desc: 'ইনভেন্টরি পণ্য তালিকা' },
      { name: 'replacements', icon: '🔄', desc: 'রিপ্লেসমেন্ট ক্লেইম' },
      { name: 'transactions', icon: '📄', desc: 'লেনদেন ও সেলস মেমো' },
      { name: 'users', icon: '🛡️', desc: 'সিস্টেম ইউজার ও স্টাফ' }
   ];

   useEffect(() => {
      fetchCounts();
   }, []);

   const fetchCounts = async () => {
      setLoading(true);
      try {
         const counts = await Promise.all(tableList.map(async (t) => {
            const { count } = await supabase.from(t.name).select('*', { count: 'exact', head: true });
            const rowCount = count || 0;
            const weight = tableWeights[t.name] || 500;
            const estimatedSizeKB = (rowCount * weight) / 1024;
            return { ...t, count: rowCount, sizeKB: estimatedSizeKB };
         }));
         setTables(counts);
      } catch (err) {
         console.error(err);
      } finally {
         setLoading(false);
      }
   };

   const totalUsageMB = useMemo(() => {
      const kb = tables.reduce((acc, t) => acc + t.sizeKB, 0);
      return (kb / 1024).toFixed(2);
   }, [tables]);

   const exploreTable = async (tableName: string) => {
      setSelectedTable(tableName);
      setFetchingData(true);
      try {
         const { data } = await supabase.from(tableName).select('*').order('created_at', { ascending: false }).limit(20);
         setTableData(data || []);
      } catch (err) {
         setTableData([]);
      } finally {
         setFetchingData(false);
      }
   };

   const formatSize = (kb: number) => {
      if (kb >= 1024) return (kb / 1024).toFixed(2) + ' MB';
      return kb.toFixed(1) + ' KB';
   };

   return (
      <div className="space-y-8 animate-reveal pb-40">

         {/* 🚀 STORAGE HUD */}
         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-slate-900 p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden flex flex-col justify-between min-h-[220px]">
               <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 blur-[100px] rounded-full"></div>
               <div className="relative z-10 flex justify-between items-start">
                  <div>
                     <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none mb-2">স্টোরেজ মনিটর</h3>
                     <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest italic">Live Cloud Consumption Index</p>
                  </div>
                  <div className="text-right">
                     <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 italic">Total Estimated Usage</p>
                     <p className="text-4xl font-black italic text-emerald-400 tracking-tighter">{totalUsageMB} <span className="text-base font-normal">MB</span></p>
                  </div>
               </div>

               <div className="relative z-10 mt-8">
                  <div className="flex justify-between text-[9px] font-black uppercase mb-3 text-slate-400">
                     <span>Database Load</span>
                     <span>{Math.min(100, (Number(totalUsageMB) / 50) * 100).toFixed(1)}% of Soft Limit (50MB)</span>
                  </div>
                  <div className="h-4 bg-white/5 rounded-full overflow-hidden p-1 border border-white/10">
                     <div
                        className="h-full bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-500 rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(37,99,235,0.4)]"
                        style={{ width: `${Math.min(100, (Number(totalUsageMB) / 50) * 100)}%` }}
                     ></div>
                  </div>
               </div>
            </div>

            <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl flex flex-col justify-between">
               <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Synchronization</p>
                  <h4 className="text-xl font-black italic text-slate-900">Active Node Link</h4>
               </div>
               <div className="space-y-4">
                  <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border">
                     <span className="text-[10px] font-black uppercase text-slate-400">Sync Status</span>
                     <span className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
                        <span className="text-[10px] font-black uppercase text-emerald-600">Online</span>
                     </span>
                  </div>
                  <button onClick={fetchCounts} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all">রিফ্রেশ হিসাব 🔄</button>
               </div>
            </div>
         </div>

         {!selectedTable ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               {loading ? (
                  <div className="col-span-full py-40 text-center animate-pulse text-slate-300 font-black uppercase italic">সার্ভার অ্যানালাইসিস চলছে...</div>
               ) : tables.map((t, idx) => (
                  <div key={t.name} onClick={() => exploreTable(t.name)} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-2xl transition-all cursor-pointer group animate-reveal" style={{ animationDelay: `${idx * 0.05}s` }}>
                     <div className="flex justify-between items-start mb-6">
                        <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">{t.icon}</div>
                        <div className="text-right">
                           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Data Weight</p>
                           <p className="text-xl font-black italic text-slate-900 group-hover:text-blue-600 transition-colors">{formatSize(t.sizeKB || 0)}</p>
                        </div>
                     </div>
                     <div className="flex justify-between items-end">
                        <div>
                           <h4 className="text-lg font-black uppercase italic text-slate-800 leading-none">{t.name}</h4>
                           <p className="text-[10px] font-bold text-slate-400 uppercase mt-3 tracking-widest leading-relaxed">{t.desc}</p>
                        </div>
                        <div className="bg-indigo-50 px-3 py-1 rounded-lg">
                           <p className="text-[10px] font-black text-indigo-600 italic">{t.count} Rows</p>
                        </div>
                     </div>
                  </div>
               ))}
            </div>
         ) : (
            <div className="bg-white rounded-[4rem] border shadow-2xl overflow-hidden animate-reveal">
               <div className="p-8 md:p-12 border-b flex justify-between items-center bg-slate-50/50">
                  <button onClick={() => setSelectedTable(null)} className="text-blue-600 font-black uppercase text-[10px] flex items-center gap-3 active:scale-90 transition-all">
                     <span className="text-xl">←</span> ফিরে যান
                  </button>
                  <div className="text-center">
                     <h4 className="text-xl font-black uppercase italic text-slate-800 leading-none">{selectedTable}</h4>
                     <p className="text-[9px] font-bold text-slate-400 uppercase mt-2 italic">Showing latest 20 records from cloud storage</p>
                  </div>
                  <button onClick={() => exploreTable(selectedTable)} className="w-12 h-12 bg-white rounded-2xl border shadow-sm flex items-center justify-center text-slate-400 hover:text-blue-600 transition-all active:rotate-180 duration-500">🔄</button>
               </div>

               <div className="overflow-x-auto custom-scroll">
                  {fetchingData ? (
                     <div className="py-40 text-center animate-pulse text-slate-300 font-black italic uppercase tracking-[0.3em]">Downloading Table Segment...</div>
                  ) : tableData.length === 0 ? (
                     <div className="py-40 text-center text-slate-300 font-black italic uppercase">কোনো ডেটা পাওয়া যায়নি</div>
                  ) : (
                     <table className="w-full text-left">
                        <thead className="bg-slate-900 text-white/40 text-[9px] font-black uppercase italic tracking-widest border-b border-white/10">
                           <tr>
                              <th className="px-8 py-6">Record ID</th>
                              {tableData[0] ? Object.keys(tableData[0]).filter(k => k !== 'id').map(key => (
                                 <th key={key} className="px-8 py-6">{key}</th>
                              )) : null}
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-[11px] font-bold">
                           {tableData.map((row, i) => (
                              <tr key={i} className="hover:bg-blue-50/50 transition-colors">
                                 <td className="px-8 py-6 font-black text-blue-600">#{row?.id ? String(row.id).slice(-6).toUpperCase() : 'N/A'}</td>
                                 {row ? Object.entries(row).filter(([k]) => k !== 'id').map(([key, val]: any) => (
                                    <td key={key} className="px-8 py-6 text-slate-700 truncate max-w-[200px]">
                                       {val && typeof val === 'object' ? JSON.stringify(val).slice(0, 50) + '...' : String(val ?? '')}
                                    </td>
                                 )) : null}
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  )}
               </div>
            </div>
         )}
      </div>
   );
};

export default DatabaseExplorer;
