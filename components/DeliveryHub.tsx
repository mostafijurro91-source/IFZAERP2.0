
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
      const dbCo = company; // Or mapToDbCompany if needed, but OrderManagement uses the string
      const [taskRes, orderRes, staffRes] = await Promise.all([
        supabase.from('delivery_tasks').select('*, customers(*), users(name)').order('created_at', { ascending: false }),
        supabase.from('market_orders').select('*, customers(*)').eq('company', dbCo).neq('status', 'COMPLETED').order('created_at', { ascending: false }),
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

  const handleAssignFromOrder = async (orderId: string, staffId: string, customerId: string, orderCompany: string) => {
    try {
      // 1. Create delivery task
      const { error: taskError } = await supabase
        .from('delivery_tasks')
        .insert([{
          customer_id: customerId,
          assigned_to: staffId,
          status: 'ASSIGNED',
          company: orderCompany,
          order_id: orderId
        }]);

      if (taskError) throw taskError;

      // 2. Update order status
      await supabase.from('market_orders').update({ status: 'ASSIGNED' }).eq('id', orderId);
      
      fetchData();
    } catch (err: any) {
      alert("অ্যাসাইনমেন্টে ত্রুটি: " + err.message);
    }
  };

  const handleUpdateTaskStaff = async (taskId: string, staffId: string) => {
    try {
      const { error } = await supabase
        .from('delivery_tasks')
        .update({ assigned_to: staffId, status: 'ASSIGNED' })
        .eq('id', taskId);
      
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      alert("ত্রুটি: " + err.message);
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

      // 3. Update order if linked
      if (task.order_id) {
        await supabase.from('market_orders').update({ status: 'COMPLETED' }).eq('id', task.order_id);
      }

      alert("কালেকশন এন্ট্রি সফল হয়েছে!");
      setDepositAmount(prev => ({ ...prev, [task.id]: "" }));
      fetchData();
    } catch (err: any) {
      alert("ত্রুটি: " + err.message);
    }
  };

  const pendingOrders = allOrders.filter(o => o.status === 'PENDING');
  const myDeliveries = allTasks.filter(t => t.assigned_to === user.id && t.status === 'ASSIGNED');
  const completedTasks = allTasks.filter(t => t.status === 'COMPLETED');
  const pendingTasks = allTasks.filter(t => t.status === 'PENDING');

  return (
    <div className="space-y-8 animate-reveal pb-20">
      <div className="bg-slate-900 p-10 md:p-14 rounded-[4rem] text-white shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 blur-[120px] rounded-full"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
          <div>
            <h3 className="text-3xl md:text-5xl font-black uppercase italic tracking-tighter leading-none">লজিস্টিকস টার্মিনাল</h3>
            <p className="text-[10px] text-blue-400 font-black uppercase mt-4 tracking-[0.4em] italic leading-none">Smart Delivery & Collection Hub</p>
            <p className="text-[12px] text-white/60 font-black mt-6 uppercase tracking-widest bg-white/10 inline-block px-5 py-2.5 rounded-2xl border border-white/5 shadow-inner">📅 আজকের তারিখ: {new Date().toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
          <div className="flex bg-white/5 backdrop-blur-xl p-2 rounded-[2rem] border border-white/10">
             <button onClick={() => setActiveTab('PENDING')} className={`px-8 py-4 rounded-[1.5rem] text-[10px] font-black uppercase transition-all ${activeTab === 'PENDING' ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-400 hover:text-white'}`}>পেন্ডিং মেমো ({pendingOrders.length + pendingTasks.length})</button>
             <button onClick={() => setActiveTab('MY_DELIVERIES')} className={`px-8 py-4 rounded-[1.5rem] text-[10px] font-black uppercase transition-all ${activeTab === 'MY_DELIVERIES' ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-400 hover:text-white'}`}>আমার ডেলিভারি ({myDeliveries.length})</button>
             <button onClick={() => setActiveTab('COMPLETED')} className={`px-8 py-4 rounded-[1.5rem] text-[10px] font-black uppercase transition-all ${activeTab === 'COMPLETED' ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-400 hover:text-white'}`}>সফল ডেলিভারি</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-40 text-center animate-pulse text-slate-300 font-black uppercase tracking-widest italic text-xl">ডাটা লোড হচ্ছে...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {activeTab === 'PENDING' && (
             <>
               {pendingOrders.map(order => (
                  <div key={order.id} className="bg-white p-8 rounded-[3.5rem] border-2 border-blue-100 shadow-lg relative ring-4 ring-blue-500/5 transition-all hover:-translate-y-1">
                     <div className="flex justify-between items-start mb-6">
                       <div className="px-5 py-2 bg-blue-600 text-white rounded-2xl text-[8px] font-black uppercase tracking-widest shadow-lg">{order.company}</div>
                       <div className="text-[9px] font-black text-blue-500 italic animate-pulse">নতুন মেমো</div>
                     </div>
                     <h4 className="text-xl font-black text-slate-900 uppercase italic leading-tight">{order.customers?.name || 'অজানা দোকান'}</h4>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">📍 {order.customers?.address || 'ঠিকানা নেই'}</p>
                     <div className="mt-8 p-6 bg-blue-50 rounded-[2.5rem] flex justify-between items-center border border-blue-100/50">
                       <p className="text-[9px] font-black text-slate-400 uppercase">মেমো টাকা</p>
                       <p className="text-lg font-black text-blue-600 italic">{formatCurrency(order.total_amount)}</p>
                     </div>
                     {isAdmin && (
                        <div className="mt-6 pt-6 border-t border-slate-100 space-y-3">
                           <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest text-center">ডেলিভারি মেম্বার অ্যাসাইন করুন:</p>
                           <select 
                             className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-[10px] font-black uppercase outline-none"
                             onChange={(e) => handleAssignFromOrder(order.id, e.target.value, order.customer_id, order.company)}
                             defaultValue=""
                           >
                             <option value="" disabled>সিলেক্ট করুন...</option>
                             {deliveryStaff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                           </select>
                        </div>
                     )}
                  </div>
               ))}
               {pendingTasks.map(task => (
                  <div key={task.id} className="bg-white p-8 rounded-[3.5rem] border border-slate-100 shadow-sm transition-all hover:shadow-xl">
                     <div className="flex justify-between items-start mb-6">
                       <div className="px-5 py-2 bg-slate-100 text-slate-500 rounded-2xl text-[8px] font-black uppercase tracking-widest">{task.company}</div>
                       <div className="text-[9px] font-black text-slate-300 italic">অ্যাসাইন করা হয়নি</div>
                     </div>
                     <h4 className="text-xl font-black text-slate-900 uppercase italic leading-tight">{task.customers?.name || 'অজানা দোকান'}</h4>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">📍 {task.customers?.address || 'ঠিকানা নেই'}</p>
                     {isAdmin && (
                        <div className="mt-6 pt-6 border-t border-slate-100 space-y-3">
                           <select 
                             className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-[10px] font-black uppercase outline-none"
                             onChange={(e) => handleUpdateTaskStaff(task.id, e.target.value)}
                             defaultValue=""
                           >
                             <option value="" disabled>অ্যাসাইন করুন...</option>
                             {deliveryStaff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                           </select>
                        </div>
                     )}
                  </div>
               ))}
               {pendingOrders.length === 0 && pendingTasks.length === 0 && (
                  <div className="col-span-full py-20 text-center text-slate-300 font-black uppercase italic tracking-widest">কোনো পেন্ডিং মেমো নেই</div>
               )}
             </>
          )}

          {activeTab === 'MY_DELIVERIES' && (
             <>
               {myDeliveries.map(task => (
                  <div key={task.id} className="bg-white p-8 rounded-[3.5rem] border border-emerald-100 shadow-xl relative overflow-hidden">
                     <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-50 rounded-full"></div>
                     <div className="flex justify-between items-start mb-6">
                       <div className="px-5 py-2 bg-emerald-600 text-white rounded-2xl text-[8px] font-black uppercase tracking-widest shadow-lg">{task.company}</div>
                       <div className="text-[9px] font-black text-emerald-500 italic">চলমান ডেলিভারি</div>
                     </div>
                     <h4 className="text-xl font-black text-slate-900 uppercase italic leading-tight">{task.customers?.name || 'অজানা দোকান'}</h4>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-4">📍 {task.customers?.address || 'ঠিকানা নেই'}</p>
                     
                     <div className="space-y-5 p-6 bg-slate-50 rounded-[2.5rem] border border-slate-100">
                        <div>
                           <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 text-center">কত টাকা পাইলেন?</p>
                           <input 
                             type="number" 
                             className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-center text-lg font-black outline-none focus:ring-4 focus:ring-emerald-500/10"
                             value={depositAmount[task.id] || ""}
                             onChange={(e) => setDepositAmount(prev => ({ ...prev, [task.id]: e.target.value }))}
                             placeholder="টাকার পরিমাণ..."
                           />
                        </div>
                        <button 
                          onClick={() => handleSubmitCollection(task)}
                          className="w-full py-5 bg-slate-900 text-white rounded-[2rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:bg-emerald-600 transition-all font-black"
                        >
                          কালেকশন এন্ট্রি দিন
                        </button>
                     </div>
                  </div>
               ))}
               {myDeliveries.length === 0 && (
                  <div className="col-span-full py-20 text-center text-slate-300 font-black uppercase italic tracking-widest">আপনার জন্য কোনো কাজ নেই</div>
               )}
             </>
          )}

          {activeTab === 'COMPLETED' && (
             <>
               {completedTasks.map(task => (
                  <div key={task.id} className="bg-white p-8 rounded-[3.5rem] border border-slate-100 shadow-sm opacity-80">
                     <div className="flex justify-between items-start mb-6">
                       <div className="px-5 py-2 bg-slate-100 text-slate-400 rounded-2xl text-[8px] font-black uppercase tracking-widest">{task.company}</div>
                       <div className="text-[9px] font-black text-emerald-500 italic">✅ সফল</div>
                     </div>
                     <h4 className="text-xl font-black text-slate-400 uppercase italic leading-tight line-clamp-1">{task.customers?.name || 'অজানা দোকান'}</h4>
                     <p className="text-[10px] font-bold text-slate-300 uppercase tracking-tight truncate">📍 {task.customers?.address || 'ঠিকানা নেই'}</p>
                     <div className="mt-8 p-6 bg-emerald-50/50 rounded-[2.5rem] border border-emerald-100/50 flex flex-col items-center">
                        <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mb-1 italic">ডেলিভারি সম্পন্ন হয়েছে</p>
                        <p className="text-[9px] font-black text-slate-400 uppercase">{new Date(task.created_at).toLocaleDateString('bn-BD')}</p>
                     </div>
                  </div>
               ))}
               {completedTasks.length === 0 && (
                  <div className="col-span-full py-20 text-center text-slate-300 font-black uppercase italic tracking-widest">কোনো সফল ডেলিভারি নেই</div>
               )}
             </>
          )}
        </div>
      )}
    </div>
  );
};

export default DeliveryHub;
