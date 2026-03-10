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
  
  // তারিখ নির্বাচনের জন্য স্টেট (Default আজকের তারিখ)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchMemosByDate();
  }, [company, selectedDate]); // তারিখ পরিবর্তন করলে অটোমেটিক লোড হবে

  const fetchMemosByDate = async () => {
    try {
      setLoading(true);
      
      // নির্বাচিত তারিখের শুরু এবং শেষ সময় নির্ধারণ
      const startOfDay = `${selectedDate}T00:00:00.000Z`;
      const endOfDay = `${selectedDate}T23:59:59.999Z`;

      // ১. Transactions টেবিল থেকে মেমো আনা (যেমনটা রিপোর্টে হয়)
      const { data, error } = await supabase
        .from('transactions')
        .select(`*, customers(name, address)`)
        .eq('company', company)
        .eq('type', 'SALE') 
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // ২. ডেলিভারি সম্পন্ন হয়েছে কি না তা চেক করা
      const { data: deliveryTasks } = await supabase
        .from('delivery_tasks')
        .select('*');

      const merged = data?.map(tx => {
        const statusData = deliveryTasks?.find(d => d.order_id === tx.id.toString());
        return { 
          ...tx, 
          status: statusData?.status || 'PENDING', 
          collected: statusData?.collected_amount || 0 
        };
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
      
      // কালেকশন পেজে পাঠানো (PENDING স্ট্যাটাসে)
      await supabase.from('customer_collections').insert([{
        customer_id: memo.customer_id,
        amount: amount,
        company: memo.company,
        status: 'PENDING',
        submitted_by: user.name,
        note: `মেমো নং: ${memo.id} (ডেলিভারি হাব)`
      }]);

      // ডেলিভারি হাবে সম্পন্ন দেখানো
      await supabase.from('delivery_tasks').upsert([{
        order_id: memo.id.toString(),
        customer_id: memo.customer_id,
        status: 'COMPLETED',
        collected_amount: amount,
        company: memo.company
      }]);

      alert("সফলভাবে কালেকশনে পাঠানো হয়েছে!");
      fetchMemosByDate();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header with Date Picker */}
      <div className="bg-white p-6 border-b sticky top-0 z-20 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black italic text-slate-800 uppercase">Delivery Feed</h2>
            <p className="text-[9px] font-bold text-blue-600 uppercase tracking-widest">Transaction Based Delivery Hub</p>
          </div>
          
          {/* তারিখ বদলানোর ইনপুট */}
          <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-2xl border border-slate-200">
            <span className="text-[10px] font-black uppercase text-slate-500 ml-2">তারিখ:</span>
            <input 
              type="date" 
              className="bg-transparent font-black text-slate-700 outline-none text-sm cursor-pointer"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {loading ? (
          <div className="text-center py-20 font-black text-blue-600 animate-pulse uppercase italic">মেমো খোঁজা হচ্ছে...</div>
        ) : tasks.length > 0 ? (
          tasks.map((memo) => (
            <div key={memo.id} className={`p-5 rounded-[2.5rem] border-2 transition-all ${
              memo.status === 'COMPLETED' ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-white shadow-sm'
            }`}>
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-black bg-blue-100 text-blue-600 px-3 py-1 rounded-full uppercase">
                  মেমো: #{memo.id}
                </span>
                {memo.status === 'COMPLETED' && <span className="text-[10px] font-black text-emerald-500 italic">✅ সম্পন্ন</span>}
              </div>

              <h3 className={`text-lg font-black uppercase italic ${memo.status === 'COMPLETED' ? 'text-slate-400' : 'text-slate-800'}`}>
                {memo.customers?.name}
              </h3>
              <p className="text-[10px] font-bold text-slate-400 mb-4 truncate">📍 {memo.customers?.address}</p>
              
              <div className="flex justify-between text-[11px] font-black mb-4 px-2 bg-slate-50 py-3 rounded-xl">
                <span className="text-slate-400 uppercase">মোট বিল:</span>
                <span className="text-slate-800">৳{memo.amount.toLocaleString()}</span>
              </div>

              {memo.status === 'PENDING' ? (
                <div className="flex gap-2">
                  <input 
                    type="number" 
                    placeholder="টাকা এন্ট্রি" 
                    className="flex-1 p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-emerald-600 outline-none focus:border-emerald-300"
                    value={depositAmount[memo.id] || ""}
                    onChange={(e) => setDepositAmount({...depositAmount, [memo.id]: e.target.value})}
                  />
                  <button 
                    onClick={() => handleSubmitToCollection(memo)}
                    disabled={isSaving}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-8 rounded-2xl font-black uppercase italic text-[10px] shadow-lg shadow-blue-100 transition-all active:scale-95"
                  >
                    {isSaving ? "..." : "জমা"}
                  </button>
                </div>
              ) : (
                <div className="p-4 bg-white/60 rounded-2xl border border-emerald-100 flex justify-between items-center">
                  <span className="text-[9px] font-black text-slate-400 uppercase">সংগৃহীত টাকা:</span>
                  <span className="text-lg font-black text-emerald-600 italic">৳{memo.collected.toLocaleString()}</span>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-20 bg-white rounded-[2.5rem] border-2 border-dashed border-slate-200">
            <p className="text-slate-300 font-black uppercase italic tracking-tighter text-lg">এই তারিখে কোনো মেমো পাওয়া যায়নি</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase mt-2">অন্য তারিখ সিলেক্ট করে দেখুন</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeliveryHub;
