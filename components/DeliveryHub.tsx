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
  const [activeTab, setActiveTab] = useState<'PENDING' | 'COMPLETED'>('PENDING');

  useEffect(() => {
    fetchTransactionsAsTasks();
  }, [company]);

  // রিপোর্ট সেকশনের মতো Transactions টেবিল থেকে আজকের মেমো আনা
  const fetchTransactionsAsTasks = async () => {
    try {
      setLoading(true);
      
      // আজকের তারিখ নির্ধারণ (শুধু আজকের মেমো দেখানোর জন্য)
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('transactions')
        .select(`
          id,
          customer_id,
          amount,
          company,
          created_at,
          description,
          customers (name, address)
        `)
        .eq('company', company)
        .eq('type', 'SALE') // শুধু বিক্রয় বা মেমো গুলো আনবে
        .gte('created_at', today.toISOString()) // আজকের মেমো
        .order('created_at', { ascending: false });

      if (error) throw error;

      // ডেলিভারি স্ট্যাটাস চেক করার জন্য delivery_tasks টেবিলের সাথে মিলানো
      const { data: deliveryData } = await supabase
        .from('delivery_tasks')
        .select('*');

      const mergedTasks = data?.map(tx => {
        const deliveryStatus = deliveryData?.find(d => d.order_id === tx.id.toString() || d.order_id === tx.description);
        return {
          ...tx,
          status: deliveryStatus?.status || 'PENDING',
          collected_amount: deliveryStatus?.collected_amount || 0
        };
      });

      setTasks(mergedTasks || []);
    } catch (err: any) {
      console.error("Error:", err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (task: any) => {
    const amount = depositAmount[task.id];
    if (!amount || parseFloat(amount) <= 0) {
      alert("টাকার পরিমাণ লিখুন");
      return;
    }

    try {
      // ১. কালেকশন টেবিলে পেন্ডিং হিসেবে পাঠানো (যাতে আপনি Approve করতে পারেন)
      await supabase.from('customer_collections').insert([{
        customer_id: task.customer_id,
        amount: parseFloat(amount),
        company: task.company,
        status: 'PENDING',
        submitted_by: user.name,
        note: `মেমো কালেকশন: ${task.id}`
      }]);

      // ২. ডেলিভারি টাস্ক আপডেট (সবুজ করার জন্য)
      await supabase.from('delivery_tasks').upsert([{
        order_id: task.id.toString(),
        customer_id: task.customer_id,
        status: 'COMPLETED',
        collected_amount: parseFloat(amount),
        company: task.company
      }]);

      alert("সফলভাবে জমা হয়েছে!");
      fetchTransactionsAsTasks();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const pendingList = tasks.filter(t => t.status === 'PENDING');
  const completedList = tasks.filter(t => t.status === 'COMPLETED');

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="bg-white p-6 border-b">
        <h2 className="text-2xl font-black italic uppercase text-slate-800">Delivery Hub</h2>
        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Live Memo Feed from Transactions</p>
      </div>

      <div className="flex gap-2 p-4">
        <button onClick={() => setActiveTab('PENDING')} className={`px-6 py-2 rounded-xl font-bold text-xs ${activeTab === 'PENDING' ? 'bg-blue-600 text-white' : 'bg-white'}`}>চলতি মেমো ({pendingList.length})</button>
        <button onClick={() => setActiveTab('COMPLETED')} className={`px-6 py-2 rounded-xl font-bold text-xs ${activeTab === 'COMPLETED' ? 'bg-emerald-600 text-white' : 'bg-white'}`}>সম্পন্ন ({completedList.length})</button>
      </div>

      <div className="p-4 grid gap-4">
        {(activeTab === 'PENDING' ? pendingList : completedList).map((task) => (
          <div key={task.id} className={`p-6 rounded-[2rem] border-2 ${task.status === 'COMPLETED' ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-white shadow-sm'}`}>
            <div className="flex justify-between mb-2">
              <span className="text-[10px] font-black text-blue-500 bg-blue-50 px-3 py-1 rounded-full uppercase">মেমো আইডি: #{task.id}</span>
              <span className="text-[10px] font-bold text-slate-400">{new Date(task.created_at).toLocaleTimeString()}</span>
            </div>
            
            <h3 className="text-xl font-black text-slate-800 uppercase italic">{task.customers?.name}</h3>
            <p className="text-xs font-bold text-slate-400 mb-4">📍 {task.customers?.address}</p>
            
            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl mb-4">
               <span className="text-[10px] font-bold text-slate-500 uppercase">মেমো এমাউন্ট:</span>
               <span className="text-lg font-black text-slate-800">৳{task.amount}</span>
            </div>

            {task.status === 'PENDING' ? (
              <div className="flex gap-2">
                <input 
                  type="number" 
                  placeholder="কত টাকা পেলেন?" 
                  className="flex-1 p-4 rounded-2xl border-2 border-slate-100 outline-none focus:border-blue-400 font-bold"
                  value={depositAmount[task.id] || ""}
                  onChange={(e) => setDepositAmount({...depositAmount, [task.id]: e.target.value})}
                />
                <button 
                  onClick={() => handleAction(task)}
                  className="bg-blue-600 text-white px-6 rounded-2xl font-black uppercase italic text-[10px]"
                >
                  জমা দিন
                </button>
              </div>
            ) : (
              <div className="flex justify-between items-center text-emerald-600 font-black italic">
                <span>✅ ডেলিভারি সফল</span>
                <span>৳{task.collected_amount} জমা হয়েছে</span>
              </div>
            )}
          </div>
        ))}
      </div>
      
      {loading && <div className="text-center py-10 font-black text-slate-400 animate-pulse">মেমো লোড হচ্ছে...</div>}
    </div>
  );
};

export default DeliveryHub;
