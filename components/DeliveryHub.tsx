import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
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
  
  // আপনার রিপোর্টের মতো তারিখ ফরম্যাট
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchMemos();
  }, [company, selectedDate]);

  const fetchMemos = async () => {
    try {
      setLoading(true);
      
      // রিপোর্টের লজিক অনুযায়ী তারিখের শুরু ও শেষ (UTC Adjustments)
      const startOfDay = `${selectedDate}T00:00:00.000Z`;
      const endOfDay = `${selectedDate}T23:59:59.999Z`;

      // ১. ট্রানজেকশন টেবিল থেকে ডেটা আনা (যেখানে SALE টাইপ মেমো থাকে)
      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .select(`*, customers(*)`)
        .eq('company', company)
        .eq('type', 'SALE')
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .order('created_at', { ascending: false });

      if (txError) throw txError;

      // ২. ডেলিভারি সম্পন্ন হয়েছে কি না তা চেক করার জন্য ডেলিভারি টাস্ক আনা
      const { data: deliveryData } = await supabase
        .from('delivery_tasks')
        .select('*');

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
    if (amount <= 0) { alert("সঠিক টাকার পরিমাণ দিন"); return; }

    try {
      setIsSaving(true);

      // ১. কালেকশন পেজে 'PENDING' হিসেবে ডেটা পাঠানো (আপনার চাহিদা মতো)
      await supabase.from('customer_collections').insert([{
        customer_id: task.customer_id,
        amount: amount,
        company: task.company,
        status: 'PENDING',
        submitted_by: user.name,
        note: `মেমো কালেকশন: ${task.id}`
      }]);

      // ২. ডেলিভারি হাবে সম্পন্ন (সবুজ) করার জন্য টাস্ক আপডেট
      await supabase.from('delivery_tasks').upsert([{
        order_id: task.id.toString(),
        customer_id: task.customer_id,
        status: 'COMPLETED',
        collected_amount: amount,
        company: task.company
      }]);

      alert("সফলভাবে কালেকশনে পাঠানো হয়েছে!");
      fetchMemos();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20 font-sans">
      {/* তারিখ সিলেকশন বার */}
      <div className="bg-white p-5 border-b sticky top-0 z-20 flex justify-between items-center shadow-sm">
        <h2 className="text-lg font-black italic uppercase text-slate-800">Delivery Hub</h2>
        <input 
          type="date" 
          className="p-2 bg-slate-100 rounded-xl font-bold text-sm outline-none border border-slate-200"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
      </div>

      <div className="p-4 space-y-4">
        {loading ? (
          <div className="text-center py-10 font-black text-blue-500 animate-pulse">মেমো লোড হচ্ছে...</div>
        ) : tasks.length > 0 ? (
          tasks.map((memo) => (
            <div key={memo.id} className={`p-6 rounded-[2.5rem] border-2 transition-all shadow-sm ${
              memo.status === 'COMPLETED' ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-white'
            }`}>
              <div className="flex justify-between mb-2">
                <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full uppercase">মেমো: #{memo.id}</span>
                {memo.status === 'COMPLETED' && <span className="text-[10px] font-black text-emerald-500 italic">✅ সম্পন্ন</span>}
              </div>

              <h3 className={`text-lg font-black uppercase italic ${memo.status === 'COMPLETED' ? 'text-slate-400' : 'text-slate-800'}`}>
                {memo.customers?.name}
              </h3>
              <p className="text-[10px] font-bold text-slate-400 mb-4">📍 {memo.customers?.address}</p>
              
              <div className="bg-slate-50 p-4 rounded-2xl flex justify-between items-center mb-4">
                <span className="text-[10px] font-black text-slate-400 uppercase">মোট বিল:</span>
                <span className="text-lg font-black text-slate-800">৳{memo.amount}</span>
              </div>

              {memo.status === 'PENDING' ? (
                <div className="flex gap-2">
                  <input 
                    type="number" 
                    placeholder="টাকা লিখুন" 
                    className="flex-1 p-4 bg-white border-2 border-slate-100 rounded-2xl font-black text-emerald-600 outline-none"
                    value={depositAmount[memo.id] || ""}
                    onChange={(e) => setDepositAmount({...depositAmount, [memo.id]: e.target.value})}
                  />
                  <button onClick={() => handleAction(memo)} disabled={isSaving} className="bg-blue-600 text-white px-6 rounded-2xl font-black uppercase italic text-[10px]">জমা</button>
                </div>
              ) : (
                <div className="flex justify-between items-center text-emerald-600 font-black italic text-sm">
                  <span>সংগৃহীত: ৳{memo.collected}</span>
                  <span className="text-[10px] uppercase">কালেকশনে পাঠানো হয়েছে</span>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-20 text-slate-300 font-black uppercase italic">এই তারিখে কোনো মেমো নেই</div>
        )}
      </div>
    </div>
  );
};

export default DeliveryHub;
