
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Company, User, formatCurrency } from '../types';

interface DeliveryHubProps {
  company: Company;
  user: User;
}

const DeliveryHub: React.FC<DeliveryHubProps> = ({ company, user }) => {
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [deliveryStaff, setDeliveryStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'PENDING' | 'MY_DELIVERIES' | 'COMPLETED'>('PENDING');
  const [depositAmount, setDepositAmount] = useState<Record<string, string>>({});

  const isAdmin = user.role === 'ADMIN' || user.role === 'STAFF';

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [company]);

  const fetchData = async () => {
    try {
      const today = new Date();
      today.setHours(0,0,0,0);
      const startOfDay = today.toISOString();
      const endOfDay = new Date(today.getTime() + 86400000).toISOString();

      const [taskRes, orderRes, staffRes] = await Promise.all([
        supabase.from('delivery_tasks').select('*, customers(*), users(name)').order('created_at', { ascending: false }),
        supabase.from('market_orders').select('*, customers(*)').gte('created_at', startOfDay).lt('created_at', endOfDay),
        supabase.from('users').select('*').in('role', ['DELIVERY', 'STAFF'])
      ]);

      setAllTasks(taskRes.data || []);
      setAllOrders(orderRes.data || []);
      setDeliveryStaff(staffRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignStaff = async (taskId: string, staffId: string) => {
    try {
      const { error } = await supabase
        .from('delivery_tasks')
        .update({ assigned_to: staffId, status: 'ASSIGNED' })
        .eq('id', taskId);
      
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert("অ্যাসাইনমেন্টে ত্রুটি: " + err.message);
    }
  };

  const handleSubmitCollection = async (task: any) => {
    const amount = parseFloat(depositAmount[task.id] || "0");
    if (amount <= 0) {
      alert("সঠিক জমার পরিমাণ লিখুন");
      return;
    }

    try {
      // 1. Create collection request
      const { error: collError } = await supabase.from('collection_requests').insert([{
        customer_id: task.customer_id,
        amount: amount,
        company: task.company || company,
        status: 'PENDING',
        collected_by: user.id
      }]);

      if (collError) throw collError;

      // 2. Mark task as completed
      const { error: taskError } = await supabase
        .from('delivery_tasks')
        .update({ status: 'COMPLETED' })
        .eq('id', task.id);

      if (taskError) throw taskError;

      alert("কালেকশন এন্ট্রি সফল হয়েছে!");
      setDepositAmount(prev => ({ ...prev, [task.id]: "" }));
      fetchData();
    } catch (err: any) {
      alert("ত্রুটি: " + err.message);
    }
  };

  const filteredTasks = allTasks.filter(t => {
    if (activeTab === 'PENDING') return t.status === 'PENDING';
    if (activeTab === 'MY_DELIVERIES') return t.assigned_to === user.id && t.status === 'ASSIGNED';
    if (activeTab === 'COMPLETED') return t.status === 'COMPLETED';
    return false;
  });

  return (
    <div className="space-y-8 animate-reveal pb-20">
      {/* Header Section */}
      <div className="bg-slate-900 p-10 md:p-14 rounded-[4rem] text-white shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 blur-[120px] rounded-full"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
          <div>
            <h3 className="text-3xl md:text-5xl font-black uppercase italic tracking-tighter leading-none">লজিস্টিকস টার্মিনাল</h3>
            <p className="text-[10px] text-blue-400 font-black uppercase mt-4 tracking-[0.4em] italic leading-none">Smart Delivery & Collection Hub</p>
          </div>
          <div className="flex bg-white/5 backdrop-blur-xl p-2 rounded-[2rem] border border-white/10">
             <button onClick={() => setActiveTab('PENDING')} className={`px-8 py-4 rounded-[1.5rem] text-[10px] font-black uppercase transition-all ${activeTab === 'PENDING' ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-400 hover:text-white'}`}>পেন্ডিং মেমো</button>
             <button onClick={() => setActiveTab('MY_DELIVERIES')} className={`px-8 py-4 rounded-[1.5rem] text-[10px] font-black uppercase transition-all ${activeTab === 'MY_DELIVERIES' ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-400 hover:text-white'}`}>আমার ডেলিভারি</button>
             <button onClick={() => setActiveTab('COMPLETED')} className={`px-8 py-4 rounded-[1.5rem] text-[10px] font-black uppercase transition-all ${activeTab === 'COMPLETED' ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-400 hover:text-white'}`}>সফল ডেলিভারি</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-40 text-center animate-pulse text-slate-300 font-black uppercase tracking-widest italic text-xl">ডাটা লোড হচ্ছে...</div>
      ) : filteredTasks.length === 0 ? (
        <div className="py-40 text-center bg-white rounded-[4rem] border-2 border-dashed border-slate-100 italic font-black text-slate-300 uppercase tracking-widest">এইলিস্টে কোনো ডাটা নেই</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredTasks.map(task => {
             // Find matching memo amount from market_orders
             const order = allOrders.find(o => o.customer_id === task.customer_id);
             const memoAmount = order?.total_amount || 0;
             const shop = task.customers || {};

             return (
               <div key={task.id} className="bg-white p-8 rounded-[3.5rem] border border-slate-100 shadow-sm hover:shadow-2xl transition-all group relative flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-6">
                    <div className="px-5 py-2 bg-blue-50 text-blue-600 rounded-2xl text-[8px] font-black uppercase tracking-widest border border-blue-100 shadow-sm">{task.company || company}</div>
                    <div className="text-[9px] font-black text-slate-300 italic">{new Date(task.created_at).toLocaleDateString('bn-BD')}</div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xl font-black text-slate-900 uppercase italic leading-tight group-hover:text-blue-600 transition-colors line-clamp-2">{shop.name || 'অজানা দোকান'}</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight line-clamp-1">📍 {shop.address || 'ঠিকানা নেই'}</p>
                  </div>

                  <div className="mt-8 p-6 bg-slate-50 rounded-[2.5rem] border border-slate-100 space-y-4">
                     <div className="flex justify-between items-center">
                        <p className="text-[9px] font-black text-slate-400 uppercase">আজকের মেমো</p>
                        <p className="text-lg font-black text-slate-900 italic">{formatCurrency(memoAmount)}</p>
                     </div>
                     
                     {task.status === 'COMPLETED' ? (
                        <div className="pt-4 border-t border-slate-200">
                           <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest text-center">✅ ডেলিভারি সম্পন্ন</p>
                        </div>
                     ) : isAdmin && task.status === 'PENDING' ? (
                        <div className="pt-4 border-t border-slate-200 space-y-4">
                           <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 text-center">ডেলিভারি মেম্বার সিলেক্ট করুন:</p>
                           <select 
                             className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase outline-none focus:ring-4 focus:ring-blue-500/10 shadow-sm"
                             onChange={(e) => handleAssignStaff(task.id, e.target.value)}
                             defaultValue=""
                           >
                             <option value="" disabled>সিলেক্ট করুন...</option>
                             {deliveryStaff.map(s => (
                               <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                             ))}
                           </select>
                        </div>
                     ) : activeTab === 'MY_DELIVERIES' ? (
                        <div className="pt-4 border-t border-slate-200 space-y-5">
                           <div>
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 text-center">কত টাকা পাইলেন?</p>
                              <input 
                                type="number" 
                                placeholder="টাকার পরিমাণ..." 
                                className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-center text-lg font-black outline-none focus:ring-4 focus:ring-blue-600/10 shadow-inner"
                                value={depositAmount[task.id] || ""}
                                onChange={(e) => setDepositAmount(prev => ({ ...prev, [task.id]: e.target.value }))}
                              />
                           </div>
                           <button 
                             onClick={() => handleSubmitCollection(task)}
                             className="w-full py-5 bg-slate-900 text-white rounded-[2rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-blue-600 active:scale-95 transition-all"
                           >
                             কালেকশন এন্ট্রি দিন
                           </button>
                        </div>
                     ) : (
                        <div className="pt-4 border-t border-slate-200">
                           <p className="text-[8px] font-black text-blue-600 uppercase tracking-widest text-center">অ্যাসাইন করা হয়েছে: {task.users?.name || 'অজানা'}</p>
                        </div>
                     )}
                  </div>
               </div>
             );
          })}
        </div>
      )}
    </div>
  );
};

export default DeliveryHub;
