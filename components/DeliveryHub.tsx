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
      
      // ১. কোম্পানির নামকে ডাটাবেস ফরম্যাটে রূপান্তর (রিপোর্টের হুবহু লজিক)
      const dbCo = mapToDbCompany(company);

      // ২. তারিখের রেঞ্জ ঠিক করা (বাংলাদেশ সময় অনুযায়ী)
      const startOfDay = `${selectedDate}T00:00:00.000Z`;
      const endOfDay = `${selectedDate}T23:59:59.999Z`;

      // ৩. সরাসরি Transactions টেবিল থেকে মেমো আনা
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          *,
          customers!inner (*)
        `)
        .eq('company', dbCo)
        .eq('type', 'SALE') 
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // ৪. ডেলিভারি সম্পন্ন হয়েছে কি না চেক করা
      const { data: deliveryLog } = await supabase.from('delivery_tasks').select('*');

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
    <div className="min-h-screen bg-slate-50 pb-20 font-sans">
      {/* তারিখ ফিল্টার বার */}
      <div className="bg-white p-5 border-b sticky top-0 z-20 flex justify-between items-center shadow-sm">
        <div>
          <h2 className="text-lg font-black italic uppercase text-slate-800">Delivery Hub</h2>
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-tighter">{company}</p>
        </div>
        <input 
          type="date" 
          className="p-2.5 bg-slate-100 border-2 border-slate-200 rounded-2xl font-black text-xs outline-none focus:border-blue-400"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
      </div>

      <div className="p-4 space-y-4">
        {loading ? (
          <div className="text-center py-20 font-black text-blue-500 animate-pulse uppercase italic tracking-widest">
            Fetching Memo Data...
          </div>
        ) : tasks.length > 0 ? (
          tasks.map((memo) => (
            <div key={memo.id} className={`p-6 rounded-[2.5rem] border-2 transition-all shadow-sm ${
              memo.status === 'COMPLETED' ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-white'
            }`}>
              <div className="flex justify-between mb-4">
                <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-3 py-1 rounded-full uppercase">ID: #{memo.id}</span>
                {memo.status === 'COMPLETED' && <span className="text-[10px] font-black text-emerald-500 italic">✅ সাকসেস</span>}
              </div>

              <h3 className={`text-xl font-black uppercase italic leading-tight ${memo.status === 'COMPLETED' ? 'text-slate-400' : 'text-slate-800'}`}>
                {memo.customers?.name}
              </h3>
              <p className="text-[11px] font-bold text-slate-400 mb-6 italic">📍 {memo.customers?.address}</p>
              
              <div className="bg-slate-100/50 p-5 rounded-3xl flex justify-between items-center mb-6">
                <span className="text-[10px] font-black text-slate-400 uppercase italic">মেমো বিল:</span>
                <span className="text-xl font-black text-slate-800 italic">৳{memo.amount.toLocaleString()}</span>
              </div>

              {memo.status === 'PENDING' ? (
                <div className="flex gap-2">
                  <input 
                    type="number" 
                    placeholder="টাকা এন্ট্রি" 
                    className="flex-1 p-4 bg-white border-2 border-slate-100 rounded-2xl font-black text-lg text-emerald-600 outline-none focus:border-emerald-300"
                    value={depositAmount[memo.id] || ""}
                    onChange={(e) => setDepositAmount({...depositAmount, [memo.id]: e.target.value})}
                  />
                  <button 
                    onClick={() => handleDeposit(memo)}
                    disabled={isSaving}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-8 rounded-2xl font-black uppercase italic text-xs shadow-lg shadow-blue-100 active:scale-95 transition-all"
                  >
                    জমা
                  </button>
                </div>
              ) : (
                <div className="flex justify-between items-center px-4">
                  <span className="text-[10px] font-black text-emerald-600 uppercase italic">সংগৃহীত টাকা:</span>
                  <span className="text-xl font-black text-emerald-700 italic">৳{memo.collected.toLocaleString()}</span>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-20 bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
            <p className="text-slate-300 font-black uppercase italic text-lg tracking-tighter">এই তারিখে কোনো মেমো পাওয়া যায়নি</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase mt-2">অন্য তারিখ বা কোম্পানি পরিবর্তন করে দেখুন</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeliveryHub;
