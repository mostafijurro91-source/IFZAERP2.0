import React, { useState, useEffect, useMemo } from 'react';
import { supabase, mapToDbCompany } from '../lib/supabase';
import { Company, User } from '../types';

interface DeliveryHubProps {
  company: Company;
  user: User;
}

const DeliveryHub: React.FC<DeliveryHubProps> = ({ company, user }) => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [depositAmount, setDepositAmount] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedCompany, setSelectedCompany] = useState<string>('ALL');

  useEffect(() => {
    fetchReportStyleData();
  }, [company, selectedDate, selectedCompany]);

  const fetchReportStyleData = async () => {
    try {
      setLoading(true);
      
      const startOfDay = `${selectedDate}T00:00:00.000Z`;
      const endOfDay = `${selectedDate}T23:59:59.999Z`;

      let query = supabase
        .from('transactions')
        .select(`
          *,
          customers!inner (*)
        `)
        .eq('payment_type', 'DUE') 
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .order('created_at', { ascending: true });

      if (selectedCompany !== 'ALL') {
        query = query.eq('company', mapToDbCompany(selectedCompany));
      }

      const { data, error } = await query;
      if (error) throw error;

      // আজকের ডেলিভারি টাস্ক এবং কালকেশন রিকোয়েস্ট ফিল্টার করে আনা (limit সমস্যা এড়াতে)
      const [{ data: deliveryLog }, { data: collectionRequests }] = await Promise.all([
        supabase.from('delivery_tasks').select('*').gte('created_at', startOfDay).lte('created_at', endOfDay),
        supabase.from('collection_requests').select('*').eq('status', 'PENDING').gte('created_at', startOfDay).lte('created_at', endOfDay)
      ]);

      const mergedData = data?.map(memo => {
        const memoIdStr = String(memo.id);
        const dLog = deliveryLog?.find(d => String(d.order_id) === memoIdStr);
        const hasPending = collectionRequests?.some(r => r.note?.includes(`[DH-MEMO-${memoIdStr}]`));
        
        return {
          ...memo,
          status: dLog?.status || (hasPending ? 'PENDING_APPROVAL' : 'PENDING'),
          collected: dLog?.collected_amount || 0
        };
      });

      setTasks(mergedData || []);
    } catch (err: any) {
      console.error("Data fetch failed:", err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeposit = async (memo: any) => {
    const amount = parseFloat(depositAmount[memo.id] || "0");
    if (amount <= 0) { alert("সঠিক টাকা লিখুন"); return; }

    try {
      setIsSaving(true);
      const dbCo = mapToDbCompany(memo.company);

      // ১. কালেকশন রিকোয়েস্টে পাঠানো (DH-MEMO ট্যাগ সহ)
      const { error } = await supabase.from('collection_requests').insert([{
        customer_id: memo.customer_id,
        amount: amount,
        company: dbCo,
        status: 'PENDING',
        submitted_by: user.name || 'Unknown Staff',
        note: `মেমো নং: ${memo.id} [DH-MEMO-${memo.id}] (ডেলিভারি হাব)`
      }]);

      if (error) throw error;

      alert("কালেকশন রিকোয়েস্ট পাঠানো হয়েছে! অ্যাডমিন এটি আপলোড করলে সাকসেসফুল হবে। ✅");
      setDepositAmount(prev => ({ ...prev, [memo.id]: "" }));
      fetchReportStyleData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const stats = useMemo(() => {
    const total = tasks.reduce((sum, t) => sum + (t.status === 'COMPLETED' ? Number(t.collected) : 0), 0);
    const coStats = {
      'Transtec': tasks.filter(t => mapToDbCompany(t.company) === 'Transtec' && t.status === 'COMPLETED').reduce((s, t) => s + Number(t.collected), 0),
      'SQ Light': tasks.filter(t => mapToDbCompany(t.company) === 'SQ Light' && t.status === 'COMPLETED').reduce((s, t) => s + Number(t.collected), 0),
      'SQ Cables': tasks.filter(t => mapToDbCompany(t.company) === 'SQ Cables' && t.status === 'COMPLETED').reduce((s, t) => s + Number(t.collected), 0)
    };
    const completed = tasks.filter(t => t.status === 'COMPLETED').length;
    const progress = tasks.length > 0 ? (completed / tasks.length) * 100 : 0;
    
    return { total, coStats, completed, totalCount: tasks.length, progress };
  }, [tasks]);

  return (
    <div className="min-h-screen bg-white pb-20 font-sans text-black">
      {/* তারিখ ও কোম্পানি ফিল্টার বার */}
      <div className="bg-slate-900 p-6 border-b border-white/10 sticky top-0 z-20 flex justify-between items-center shadow-xl flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black italic shadow-lg">DH</div>
          <div>
            <h2 className="text-xl font-black italic uppercase text-white tracking-tight">Delivery Hub</h2>
            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">{selectedCompany === 'ALL' ? 'Multi-Company Network' : selectedCompany}</p>
          </div>
        </div>
        
        <div className="flex gap-4 items-center flex-wrap">
          <select 
            className="p-3 bg-white/10 border border-white/20 rounded-xl font-black text-xs text-white outline-none focus:border-blue-500 transition-all cursor-pointer"
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
          >
            <option value="ALL" className="text-black">সবগুলো কোম্পানি (All)</option>
            <option value="Transtec" className="text-black">Transtec</option>
            <option value="SQ Light" className="text-black">SQ Light</option>
            <option value="SQ Cables" className="text-black">SQ Cables</option>
          </select>
          
          <input 
            type="date" 
            className="p-3 bg-white/10 border border-white/20 rounded-xl font-black text-xs text-white outline-none focus:border-blue-500 transition-all cursor-pointer"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
          <button 
            onClick={() => fetchReportStyleData()}
            className="p-3 bg-white text-black rounded-xl font-black text-[10px] uppercase hover:bg-blue-500 hover:text-white transition-all shadow-lg active:scale-95"
          >
            রিফ্রেশ (↻)
          </button>
        </div>
      </div>

      <div className="p-4 md:p-8 space-y-8">
        {/* 📊 COLLECTION SUMMARY CARD */}
        {!loading && tasks.length > 0 && (
          <div className="bg-slate-900 rounded-[3rem] p-8 text-white shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-blue-600/20 transition-all duration-700"></div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative z-10">
              <div className="space-y-2 border-r border-white/10">
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest italic">আজকের মোট কালেকশন</p>
                <p className="text-4xl font-black italic tracking-tighter">৳{stats.total.toLocaleString()}</p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{ width: `${stats.progress}%` }}></div>
                  </div>
                  <span className="text-[10px] font-black text-slate-400">{Math.round(stats.progress)}%</span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 gap-4 lg:col-span-3">
                 <div className="flex flex-wrap gap-8 items-center bg-white/5 p-4 rounded-3xl border border-white/5">
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-slate-400 uppercase">Transtec</p>
                      <p className="text-lg font-black italic">৳{stats.coStats['Transtec'].toLocaleString()}</p>
                    </div>
                    <div className="w-px h-10 bg-white/10"></div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-slate-400 uppercase">SQ Light</p>
                      <p className="text-lg font-black italic">৳{stats.coStats['SQ Light'].toLocaleString()}</p>
                    </div>
                    <div className="w-px h-10 bg-white/10"></div>
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-slate-400 uppercase">SQ Cables</p>
                      <p className="text-lg font-black italic">৳{stats.coStats['SQ Cables'].toLocaleString()}</p>
                    </div>
                    <div className="ml-auto flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-[9px] font-black text-slate-400 uppercase">Delivery Progress</p>
                        <p className="text-base font-black italic text-emerald-400">{stats.completed}/{stats.totalCount} <span className="text-[10px] text-slate-500">Memos</span></p>
                      </div>
                      <div className="w-12 h-12 rounded-full border-4 border-emerald-500/20 flex items-center justify-center relative">
                        <svg className="w-full h-full transform -rotate-90">
                          <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-white/5" />
                          <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-emerald-500" strokeDasharray={126} strokeDashoffset={126 - (126 * stats.progress) / 100} />
                        </svg>
                        <span className="absolute text-[8px] font-black">✔</span>
                      </div>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="font-black text-slate-400 uppercase italic tracking-[0.3em] text-[10px]">Synchronizing Delivery Hub Nodes...</p>
          </div>
        ) : (
          <div className="bg-white rounded-[2rem] shadow-2xl overflow-hidden border-2 border-slate-100 italic transition-all">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-[10px] font-black uppercase italic tracking-widest">
                    <th className="p-5 text-center w-16 border-r border-white/10">Sl</th>
                    <th className="p-5 text-left border-r border-white/10">দোকান ও ঠিকানা (Customer Details)</th>
                    <th className="p-5 text-center w-32 border-r border-white/10">কোম্পানি</th>
                    <th className="p-5 text-right w-40 border-r border-white/10">মেমো বিল</th>
                    <th className="p-5 text-center w-64">সংগ্রহ (Collection Status)</th>
                  </tr>
                </thead>
                <tbody className="text-[12px] font-bold italic">
                  {tasks.length > 0 ? (
                    tasks.map((memo, idx) => (
                      <tr key={memo.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-all ${memo.status === 'COMPLETED' ? 'bg-emerald-50/30' : ''}`}>
                        <td className="p-5 text-center font-black border-r border-slate-100">
                          {(idx + 1).toString().padStart(2, '0')}
                        </td>
                        <td className="p-5 border-r border-slate-100">
                          <div className="flex flex-col">
                            <span className={`text-base font-black uppercase italic ${memo.status === 'COMPLETED' ? 'text-slate-400' : 'text-slate-800'}`}>
                              {memo.customers?.name}
                            </span>
                            <span className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-tight italic">
                              📍 {memo.customers?.address}
                            </span>
                          </div>
                        </td>
                        <td className="p-5 text-center border-r border-slate-100">
                           <span className={`px-4 py-1.5 rounded-full font-black text-[9px] uppercase italic tracking-tighter ${
                             mapToDbCompany(memo.company) === 'Transtec' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                             mapToDbCompany(memo.company) === 'SQ Light' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                             'bg-emerald-50 text-emerald-600 border border-emerald-100'
                           }`}>
                             {memo.company}
                           </span>
                        </td>
                        <td className="p-5 text-right border-r border-slate-100 font-black italic text-lg decoration-slate-400">
                          ৳{Number(memo.amount).toLocaleString()}
                        </td>
                        <td className="p-5">
                          {memo.status === 'PENDING' ? (
                            <div className="flex gap-2 bg-slate-100 p-2 rounded-2xl border-2 border-slate-200">
                              <input 
                                type="number" 
                                placeholder="টাকা লিখুন" 
                                className="w-full p-3 bg-white border border-slate-300 rounded-xl font-black text-sm text-emerald-600 outline-none focus:border-emerald-500 shadow-inner"
                                value={depositAmount[memo.id] || ""}
                                onChange={(e) => setDepositAmount({...depositAmount, [memo.id]: e.target.value})}
                              />
                              <button 
                                onClick={() => handleDeposit(memo)}
                                disabled={isSaving}
                                className="bg-slate-900 hover:bg-blue-600 text-white px-6 rounded-xl font-black uppercase text-[10px] italic shadow-lg active:scale-95 transition-all whitespace-nowrap"
                              >
                                {isSaving ? '...' : 'জমা দিন'}
                              </button>
                            </div>
                          ) : memo.status === 'PENDING_APPROVAL' ? (
                            <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-100 rounded-2xl">
                              <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest italic animate-pulse">Pending Approval</span>
                              <span className="w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center text-amber-700 animate-spin-slow">⏳</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-2xl ring-4 ring-emerald-50">
                              <div className="flex flex-col">
                                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest italic leading-none">Successful (সাকসেস)</span>
                                <span className="text-[8px] font-bold text-slate-400 uppercase mt-1">Uploaded & Confirmed</span>
                              </div>
                              <span className="text-lg font-black text-emerald-700 italic">
                                ৳{(memo.collected || 0).toLocaleString()}
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-32 text-center">
                        <div className="flex flex-col items-center space-y-4 opacity-20">
                          <span className="text-6xl grayscale">🚚</span>
                          <p className="text-xl font-black uppercase italic tracking-widest text-slate-800">No Data Synchronized</p>
                          <p className="text-[10px] font-bold text-slate-500 uppercase">অন্য তারিখ বা কোম্পানি পরিবর্তন করে দেখুন</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      
      {/* Footer Info */}
      <div className="max-w-6xl mx-auto mt-12 px-8 flex justify-between items-center opacity-30 group hover:opacity-100 transition-all border-t border-slate-100 pt-8">
        <div className="text-[8px] font-black uppercase italic space-y-1">
          <p>Global Network: {selectedCompany}</p>
          <p>Last Data Sync: {new Date().toLocaleTimeString('bn-BD')}</p>
          <p>Operator: {user.name} ({user.role})</p>
        </div>
        <div className="text-right">
           <p className="text-[8px] font-black uppercase tracking-[0.5em] text-blue-600">IFZA ERP CORE ENGINE v5.0.0</p>
           <p className="text-[7px] font-bold text-slate-400 mt-1 uppercase tracking-widest">© 2026 IFZA ELECTRONICS GR • ALL RIGHTS RESERVED</p>
        </div>
      </div>
    </div>
  );
};

export default DeliveryHub;
