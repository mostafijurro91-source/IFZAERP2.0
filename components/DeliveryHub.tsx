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

  useEffect(() => {
    fetchTodayMemos();
  }, [company]);

  // Delivery Sheet এর মতো Transactions টেবিল থেকে আজকের মেমো আনা
  const fetchTodayMemos = async () => {
    try {
      setLoading(true);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('transactions')
        .select(`*, customers(name, address)`)
        .eq('company', company)
        .eq('type', 'SALE') 
        .gte('created_at', today.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      // ডেলিভারি স্ট্যাটাস চেক করা (আগে সাবমিট হয়েছে কি না)
      const { data: deliveryTasks } = await supabase
        .from('delivery_tasks')
        .select('*');

      const merged = data?.map(tx => {
        const statusData = deliveryTasks?.find(d => d.order_id === tx.id.toString());
        return { ...tx, status: statusData?.status || 'PENDING', collected: statusData?.collected_amount || 0 };
      });

      setTasks(merged || []);
    } catch (err: any) {
      console.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitToCollection = async (memo: any) => {
    const amount = parseFloat(depositAmount[memo.id] || "0");
    if (amount <= 0) { alert("টাকার পরিমাণ লিখুন"); return; }

    try {
      setIsSaving(true);
      // ১. কালেকশন পেজে পেন্ডিং হিসেবে পাঠানো
      await supabase.from('customer_collections').insert([{
        customer_id: memo.customer_id,
        amount: amount,
        company: memo.company,
        status: 'PENDING',
        submitted_by: user.name,
        note: `মেমো নং: ${memo.id} (ডেলিভারি হাব)`
      }]);

      // ২. ডেলিভারি হাবের স্ট্যাটাস সবুজ করা
      await supabase.from('delivery_tasks').upsert([{
        order_id: memo.id.toString(),
        customer_id: memo.customer_id,
        status: 'COMPLETED',
        collected_amount: amount,
        company: memo.company
      }]);

      alert("কালেকশনে পাঠানো হয়েছে!");
      fetchTodayMemos();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="bg-white p-6 border-b sticky top-0 z-10">
        <h2 className="text-xl font-black italic text-slate-800 uppercase">Delivery Feed</h2>
        <p className="text-[9px] font-bold text-blue-600 uppercase">Today's Sales Transactions</p>
      </div>

      <div className="p-4 space-y-4">
        {tasks.map((memo) => (
          <div key={memo.id} className={`p-5 rounded-[2rem] border-2 transition-all ${
            memo.status === 'COMPLETED' ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-white shadow-sm'
          }`}>
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-black bg-blue-100 text-blue-600 px-3 py-1 rounded-full uppercase">
                মেমো: #{memo.id}
              </span>
              {memo.status === 'COMPLETED' && <span className="text-[10px] font-black text-emerald-500">✅ সফল</span>}
            </div>

            <h3 className={`text-lg font-black uppercase italic ${memo.status === 'COMPLETED' ? 'text-slate-400' : 'text-slate-800'}`}>
              {memo.customers?.name}
            </h3>
            <p className="text-[10px] font-bold text-slate-400 mb-4">📍 {memo.customers?.address}</p>
            
            <div className="flex justify-between text-[11px] font-black mb-4 px-2">
              <span className="text-slate-400 uppercase">বিল এমাউন্ট:</span>
              <span className="text-slate-800">৳{memo.amount}</span>
            </div>

            {memo.status === 'PENDING' ? (
              <div className="flex gap-2">
                <input 
                  type="number" 
                  placeholder="টাকা এন্ট্রি" 
                  className="flex-1 p-4 bg-slate-100 rounded-2xl font-black text-emerald-600 outline-none"
                  value={depositAmount[memo.id] || ""}
                  onChange={(e) => setDepositAmount({...depositAmount, [memo.id]: e.target.value})}
                />
                <button 
                  onClick={() => handleSubmitToCollection(memo)}
                  disabled={isSaving}
                  className="bg-blue-600 text-white px-6 rounded-2xl font-black uppercase italic text-[10px]"
                >
                  সাবমিট
                </button>
              </div>
            ) : (
              <div className="p-3 bg-white rounded-xl border border-emerald-100 flex justify-between">
                <span className="text-[9px] font-black text-slate-400 uppercase">কালেকশন পাঠানো হয়েছে:</span>
                <span className="text-[11px] font-black text-emerald-600">৳{memo.collected}</span>
              </div>
            )}
          </div>
        ))}
        {tasks.length === 0 && !loading && (
          <div className="text-center py-20 text-slate-300 font-black uppercase italic">আজ কোনো মেমো কাটা হয়নি</div>
        )}
      </div>
    </div>
  );
};

export default DeliveryHub;
