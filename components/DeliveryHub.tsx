import React, { useState, useEffect } from 'react';
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
  
  // রিপোর্টের মতো তারিখ ফরম্যাট (আজকের তারিখ ডিফল্ট)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchReportStyleData();
  }, [company, selectedDate]);

  const fetchReportStyleData = async () => {
    try {
      setLoading(true);
      
      const dbCo = mapToDbCompany(company);
      const startOfDay = `${selectedDate}T00:00:00.000Z`;
      const endOfDay = `${selectedDate}T23:59:59.999Z`;

      // Reports.tsx এর DELIVERY_LOG_A4 লজিক অনুযায়ী 'DUE' ট্রানজ্যাকশন আনা
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          *,
          customers!inner (*)
        `)
        .eq('company', dbCo)
        .eq('payment_type', 'DUE') 
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const { data: deliveryLog } = await supabase.from('delivery_tasks').select('*').eq('company', dbCo);

      const mergedData = data?.map(memo => {
        const dLog = deliveryLog?.find(d => d.order_id === memo.id.toString());
        return {
          ...memo,
          status: dLog?.status || 'PENDING',
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
      const dbCo = mapToDbCompany(company);

      // ১. কালেকশন পেজে 'PENDING' হিসেবে পাঠানো
      await supabase.from('customer_collections').insert([{
        customer_id: memo.customer_id,
        amount: amount,
        company: dbCo,
        status: 'PENDING',
        submitted_by: user.name,
        note: `মেমো নং: ${memo.id} (ডেলিভারি হাব)`
      }]);

      // ২. ডেলিভারি হাবে 'COMPLETED' (সবুজ) করা
      await supabase.from('delivery_tasks').upsert([{
        order_id: memo.id.toString(),
        customer_id: memo.customer_id,
        status: 'COMPLETED',
        collected_amount: amount,
        company: dbCo
      }]);

      alert("সফলভাবে কালেকশন রিকোয়েস্ট পাঠানো হয়েছে!");
      fetchReportStyleData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-white pb-20 font-sans text-black">
      {/* তারিখ ফিল্টার বার */}
      <div className="bg-slate-900 p-6 border-b border-white/10 sticky top-0 z-20 flex justify-between items-center shadow-xl">
        <div>
          <h2 className="text-xl font-black italic uppercase text-white tracking-tight">Delivery Hub</h2>
          <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">{company} Network</p>
        </div>
        <div className="flex gap-4 items-center">
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

      <div className="p-4 md:p-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="font-black text-slate-400 uppercase italic tracking-[0.3em] text-[10px]">Synchronizing Delivery Data...</p>
          </div>
        ) : (
          <div className="bg-white rounded-[2rem] shadow-2xl overflow-hidden border-2 border-slate-100">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-[10px] font-black uppercase italic">
                    <th className="p-5 text-center w-16 border-r border-white/10">Sl</th>
                    <th className="p-5 text-left border-r border-white/10">দোকান ও ঠিকানা (Customer Details)</th>
                    <th className="p-5 text-center w-32 border-r border-white/10">কোম্পানি</th>
                    <th className="p-5 text-right w-40 border-r border-white/10">মেমো বিল</th>
                    <th className="p-5 text-center w-64">সংগ্রহ ম্যানুয়াল (Collection)</th>
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
                        <td className="p-5 text-center border-r border-slate-100 uppercase font-black text-[10px] text-indigo-600 bg-indigo-50/30">
                          {memo.company}
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
                          ) : (
                            <div className="flex items-center justify-between px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-2xl">
                              <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest italic animate-pulse">Collected</span>
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
                          <span className="text-6xl">🚚</span>
                          <p className="text-xl font-black uppercase italic tracking-widest text-slate-800">No Memos Found Today</p>
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
      {!loading && tasks.length > 0 && (
        <div className="max-w-4xl mx-auto mt-12 px-8 flex justify-between items-center opacity-40 grayscale hover:grayscale-0 transition-all">
          <div className="text-[8px] font-black uppercase italic space-y-1">
            <p>Node: {company}</p>
            <p>Sync Time: {new Date().toLocaleTimeString('bn-BD')}</p>
          </div>
          <p className="text-[8px] font-black uppercase tracking-[0.5em]">SYSTEM v2.0 • POWERED BY IFZA ERP</p>
        </div>
      )}
    </div>
  );
};

export default DeliveryHub;
