
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const DatabaseExplorer: React.FC = () => {
  const [tables, setTables] = useState<any[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingData, setFetchingData] = useState(false);

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
        return { ...t, count: count || 0 };
      }));
      setTables(counts);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <div className="space-y-8 animate-reveal pb-40">
      <div className="bg-slate-900 p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
         <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 blur-[100px] rounded-full"></div>
         <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-6">
               <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center text-3xl font-black italic shadow-xl">DB</div>
               <div>
                  <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none">ডেটাবেজ এক্সপ্লোরার</h3>
                  <p className="text-[10px] text-blue-400 font-bold uppercase mt-2 tracking-widest">Real-time Cloud Node Synchronization</p>
               </div>
            </div>
            <button onClick={fetchCounts} className="bg-white/10 hover:bg-white/20 text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all">রিফ্রেশ সিনক্রোনাইজেশন 🔄</button>
         </div>
      </div>

      {!selectedTable ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
           {loading ? (
             <div className="col-span-full py-40 text-center animate-pulse text-slate-300 font-black uppercase italic">টেবিল কানেকশন চেক করা হচ্ছে...</div>
           ) : tables.map((t, idx) => (
             <div key={t.name} onClick={() => exploreTable(t.name)} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-2xl transition-all cursor-pointer group animate-reveal" style={{ animationDelay: `${idx * 0.05}s` }}>
                <div className="flex justify-between items-start mb-6">
                   <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">{t.icon}</div>
                   <div className="text-right">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Total Rows</p>
                      <p className="text-3xl font-black italic text-slate-900 group-hover:text-blue-600 transition-colors">{t.count}</p>
                   </div>
                </div>
                <h4 className="text-lg font-black uppercase italic text-slate-800 leading-none">{t.name}</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-3 tracking-widest leading-relaxed">{t.desc}</p>
             </div>
           ))}
        </div>
      ) : (
        <div className="bg-white rounded-[4rem] border shadow-2xl overflow-hidden animate-reveal">
           <div className="p-8 md:p-12 border-b flex justify-between items-center bg-slate-50/50">
              <button onClick={() => setSelectedTable(null)} className="text-blue-600 font-black uppercase text-[10px] flex items-center gap-3">
                 <span className="text-xl">←</span> ফিরে যান
              </button>
              <div className="text-center">
                 <h4 className="text-xl font-black uppercase italic text-slate-800 leading-none">{selectedTable}</h4>
                 <p className="text-[9px] font-bold text-slate-400 uppercase mt-2 italic">Showing latest 20 records from cloud storage</p>
              </div>
              <button onClick={() => exploreTable(selectedTable)} className="w-12 h-12 bg-white rounded-2xl border shadow-sm flex items-center justify-center text-slate-400 hover:text-blue-600 transition-all">🔄</button>
           </div>
           
           <div className="overflow-x-auto custom-scroll">
              {fetchingData ? (
                <div className="py-40 text-center animate-pulse text-slate-300 font-black italic">লোড হচ্ছে...</div>
              ) : tableData.length === 0 ? (
                <div className="py-40 text-center text-slate-300 font-black italic uppercase">কোনো ডেটা পাওয়া যায়নি</div>
              ) : (
                <table className="w-full text-left">
                   <thead className="bg-slate-900 text-white/40 text-[9px] font-black uppercase italic tracking-widest border-b border-white/10">
                      <tr>
                         <th className="px-8 py-6">Record ID</th>
                         {Object.keys(tableData[0]).filter(k => k !== 'id').map(key => (
                            <th key={key} className="px-8 py-6">{key}</th>
                         ))}
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100 text-[11px] font-bold">
                      {tableData.map((row, i) => (
                        <tr key={i} className="hover:bg-blue-50/50 transition-colors">
                           <td className="px-8 py-6 font-black text-blue-600">#{row.id?.slice(-6).toUpperCase() || 'N/A'}</td>
                           {Object.entries(row).filter(([k]) => k !== 'id').map(([key, val]: any) => (
                              <td key={key} className="px-8 py-6 text-slate-700">
                                 {typeof val === 'object' ? JSON.stringify(val).slice(0, 50) + '...' : String(val)}
                              </td>
                           ))}
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
