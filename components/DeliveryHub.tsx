import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../types';

const DeliveryHub: React.FC<{ user: any }> = ({ user }) => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [collectionAmounts, setCollectionAmounts] = useState<{ [key: string]: string }>({});
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    fetchTasks();
    const watchId = navigator.geolocation.watchPosition(handleLocationTracking);
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const fetchTasks = async () => {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('delivery_tasks')
      .select('*, customers(*)')
      .eq('user_id', user.id)
      .eq('delivery_date', today)
      .order('status', { ascending: false }); // PENDING গুলো আগে দেখাবে
    setTasks(data || []);
  };

  const handleLocationTracking = async (pos: any) => {
    const { latitude, longitude } = pos.coords;
    const now = Date.now();
    // ১০ মিনিট পর পর লোকেশন আপডেট (এডমিন প্যানেলে দেখার জন্য)
    if (now - lastUpdateRef.current > 600000) {
      await supabase.from('users').update({
        last_lat: latitude,
        last_lng: longitude,
        last_seen: new Date().toISOString(),
        live_status: "ডেলিভারি রুটে আছে"
      }).eq('id', user.id);
      lastUpdateRef.current = now;
    }
  };

  const handleConfirmDelivery = async (task: any) => {
    const typedAmount = collectionAmounts[task.id];
    
    if (!typedAmount || Number(typedAmount) < 0) {
      alert("সঠিক জমার পরিমাণ লিখুন!");
      return;
    }

    setIsSaving(task.id);
    try {
      // ১. কালেকশন রিকোয়েস্ট পাঠানো (আপনার Collections.tsx এ যা পেন্ডিং দেখাবে)
      const { error: reqError } = await supabase.from('collection_requests').insert([{
        customer_id: task.customer_id,
        company: task.company || 'Transtec', // মেমোর কোম্পানি অনুযায়ী
        amount: Number(typedAmount),
        submitted_by: user.name, // ডেলিভারি ম্যানের নাম
        status: 'PENDING'
      }]);

      if (reqError) throw reqError;

      // ২. মেমো স্ট্যাটাস আপডেট করা (এটি সফল বা COMPLETED হবে)
      const { error: taskError } = await supabase.from('delivery_tasks').update({
        status: 'COMPLETED',
        received_amount: Number(typedAmount),
        completed_at: new Date().toISOString()
      }).eq('id', task.id);

      if (taskError) throw taskError;

      // ৩. ইনভেন্টরি কমানো (RPC Call)
      if (task.items && Array.isArray(task.items)) {
        for (const item of task.items) {
          await supabase.rpc('increment_stock', { row_id: item.id, amt: -item.qty });
        }
      }

      alert("ডেলিভারি সফল ও কালেকশন রিকোয়েস্ট পাঠানো হয়েছে! ✅");
      setCollectionAmounts({ ...collectionAmounts, [task.id]: '' });
      fetchTasks();
    } catch (err: any) {
      alert("ত্রুটি: " + err.message);
    } finally {
      setIsSaving(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24 font-sans animate-reveal">
      {/* হেডার কার্ড */}
      <div className="bg-slate-900 p-8 rounded-[3rem] text-white shadow-2xl mb-8 relative overflow-hidden">
        <h2 className="text-2xl font-black italic uppercase tracking-tighter">Delivery Hub</h2>
        <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mt-1 italic">লাইভ ট্র্যাকিং সক্রিয় (১০ মিনিট পর পর)</p>
        <div className="absolute right-[-10px] bottom-[-10px] text-8xl opacity-5">🛵</div>
      </div>

      <div className="space-y-6">
        {tasks.map(task => (
          <div key={task.id} className={`bg-white p-6 rounded-[3rem] border-2 transition-all ${task.status === 'COMPLETED' ? 'border-emerald-100 bg-emerald-50/20 grayscale' : 'border-white shadow-xl shadow-blue-900/5'}`}>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-lg font-black uppercase italic text-slate-900 leading-none">{task.customers?.name}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 italic">📍 {task.customers?.address}</p>
              </div>
              {task.status === 'COMPLETED' && <span className="bg-emerald-600 text-white px-3 py-1 rounded-full font-black text-[8px] uppercase tracking-widest">SUCCESS</span>}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
               <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                  <p className="text-[8px] font-black text-slate-400 uppercase mb-1">মেমো বিল</p>
                  <p className="font-black text-slate-900 italic">৳{formatCurrency(task.amount)}</p>
               </div>
               <div className="bg-blue-50/50 p-4 rounded-3xl border border-blue-100">
                  <p className="text-[8px] font-black text-blue-400 uppercase mb-1">কোম্পানি</p>
                  <p className="font-black text-blue-600 italic uppercase text-[10px]">{task.company || 'General'}</p>
               </div>
            </div>

            {task.status === 'PENDING' ? (
              <div className="space-y-4">
                <div className="relative">
                   <input 
                     type="number" 
                     placeholder="জমার পরিমাণ..." 
                     className="w-full p-6 bg-slate-900 rounded-[2rem] text-white font-black text-2xl outline-none placeholder:text-slate-600 shadow-inner"
                     value={collectionAmounts[task.id] || ''}
                     onChange={(e) => setCollectionAmounts({ ...collectionAmounts, [task.id]: e.target.value })}
                   />
                   <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-600 font-black">৳</div>
                </div>
                <button 
                  disabled={isSaving === task.id}
                  onClick={() => handleConfirmDelivery(task)}
                  className="w-full bg-blue-600 text-white py-6 rounded-[2.5rem] font-black uppercase italic text-xs tracking-[0.3em] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3"
                >
                  {isSaving === task.id ? 'SYNCING...' : 'Confirm & Submit ➔'}
                </button>
              </div>
            ) : (
               <div className="text-center p-4 border-t border-emerald-100 mt-2">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">কালেকশন রিকোয়েস্ট পাঠানো হয়েছে</p>
               </div>
            )}
          </div>
        ))}
        {tasks.length === 0 && <div className="text-center py-20 opacity-20 font-black italic uppercase tracking-widest">আজ কোনো মেমো নেই</div>}
      </div>
    </div>
  );
};

export default DeliveryHub;
