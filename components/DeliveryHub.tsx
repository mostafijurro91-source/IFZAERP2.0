import React, { useState, useEffect } from 'react';
import { supabase, mapToDbCompany } from '../lib/supabase'; // mapToDbCompany যোগ করা হয়েছে
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

  useEffect(() => {
    fetchData();
  }, [company, selectedDate]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // ১. কোম্পানির নাম ডাটাবেস ফরম্যাটে রূপান্তর (রিপোর্টের মতো)
      const dbCo = mapToDbCompany(company);

      // ২. তারিখের রেঞ্জ ঠিক করা
      const startOfDay = `${selectedDate}T00:00:00.000Z`;
      const endOfDay = `${selectedDate}T23:59:59.999Z`;

      // ৩. সরাসরি Transactions টেবিল থেকে মেমো আনা
      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .select(`*, customers(*)`)
        .eq('company', dbCo) // এখানে এখন সঠিক কোম্পানি নাম যাবে
        .eq('type', 'SALE')
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .order('created_at', { ascending: false });

      if (txError) throw txError;

      // ৪. ডেলিভারি সম্পন্ন হওয়া ডাটা চেক করা
      const { data: deliveryData } = await supabase.from('delivery_tasks').select('*');

      const merged = txData?.map(tx => {
        const dTask = deliveryData?.find(d => d.order_id === tx.id.toString());
        return {
          ...tx,
          status: dTask?.status || 'PENDING',
          collected: dTask?.collected_amount || 0
        };
      });

      setTasks(merged || []);
    } catch (err: any) {
      console.error("Fetch error:", err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (task: any) => {
    const amount = parseFloat(depositAmount[task.id] || "0");
    if (amount <= 0) { alert("টাকা লিখুন"); return; }

    try {
      setIsSaving(true);
      const dbCo = mapToDbCompany(company);

      // ১. কালেকশন পেজে পেন্ডিং পাঠানো
      await supabase.from('customer_collections').insert([{
        customer_id: task.customer_id,
        amount: amount,
        company: dbCo,
        status: 'PENDING',
        submitted_by: user.name,
        note: `মেমো: ${task.id} (ডেলিভারি হাব)`
      }]);

      // ২. ডেলিভারি হাব আপডেট
      await supabase.from('delivery_tasks').upsert([{
        order_id: task.id.toString(),
        customer_id: task.customer_id,
        status: 'COMPLETED',
        collected_amount: amount,
        company: dbCo
      }]);

      alert("সফল!");
      fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      {/* Header with Date Picker */}
      <div className="bg-white p-6 sticky top-0 z-30 border-b border-slate-100 flex justify-between items-center shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-800 uppercase italic">Delivery Feed</h2>
          <p className="text-[9px] font-bold text-blue-600 uppercase tracking-widest">{company}</p>
        </div>
        <input 
          type="date" 
          className="p-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-xs outline-none focus:border-blue-400"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
      </div>

      <div className="p-4 space-y-4">
        {loading ? (
          <div className="text-center py-20 font-black text-blue-500 animate-pulse tracking-widest">লোড হচ্ছে...</div>
        ) : tasks.length > 0 ? (
          tasks.map((memo) => (
            <div key={memo.id} className={`p-6 rounded-[2.5rem] border-2 transition-all ${
              memo.status === 'COMPLETED' ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-white shadow-md shadow-slate-200/50'
            }`}>
              <div className="flex justify-between items-center mb-4">
                <span className="px-4 py-1.5 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black italic uppercase">মেমো: #{memo.id}</span>
                {memo.status === 'COMPLETED' && <span className="text-[10px] font-black text-emerald-500 italic">✅ সম্পন্ন</span>}
              </div>

              <h3 className={`text-xl font-black uppercase italic leading-tight mb-1 ${memo.status === 'COMPLETED' ? 'text-slate-400' : 'text-slate-800'}`}>
                {memo.customers?.name}
              </h3>
              <p className="text-[10px] font-bold text-slate-400 mb-6 uppercase tracking-tighter italic">📍 {memo.customers?.address}</p>
              
              <div className="flex justify-between items-center bg-slate-50/80 p-5 rounded-3xl mb-6">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">মেমো বিল:</span>
                <span className="text-xl font-black text-slate-800 italic">৳{memo.amount.toLocaleString()}</span>
              </div>

              {memo.status === 'PENDING' ? (
                <div className="flex gap-3">
                  <input 
                    type="number" 
                    placeholder="টাকা লিখুন" 
                    className="flex-1 p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-lg text-emerald-600 focus:border-emerald-400 outline-none transition-all"
                    value={depositAmount[memo.id] || ""}
                    onChange={(e) => setDepositAmount({...depositAmount, [memo.id]: e.target.value})}
                  />
                  <button 
                    onClick={() => handleAction(memo)}
                    disabled={isSaving}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-8 rounded-2xl font-black uppercase italic text-xs shadow-lg shadow-blue-100 active:scale-95 transition-all"
                  >
                    জমা
                  </button>
                </div>
              ) : (
                <div className="flex justify-between items-center px-4 text-emerald-600">
                  <span className="text-[10px] font-black uppercase italic">সংগৃহীত:</span>
                  <span className="text-xl font-black italic">৳{memo.collected.toLocaleString()}</span>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-20 bg-white rounded-[2.5rem] border-2 border-dashed border-slate-200">
            <p className="text-slate-300 font-black uppercase italic text-lg">এই তারিখে কোনো মেমো নেই</p>
            <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase">রিপোর্টের সাথে তারিখ মিলিয়ে দেখুন</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeliveryHub;
