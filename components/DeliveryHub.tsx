import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Company, User, formatCurrency } from '../types';

interface DeliveryHubProps {
  company: Company;
  user: User;
}

const DeliveryHub: React.FC<DeliveryHubProps> = ({ company, user }) => {
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'PENDING' | 'MY_DELIVERIES' | 'COMPLETED'>('PENDING');
  const [depositAmount, setDepositAmount] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const isAdmin = user.role === 'ADMIN' || user.role === 'STAFF';

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [company]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('delivery_tasks')
        .select(`
          *,
          customers (name, address)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAllTasks(data || []);
    } catch (error: any) {
      console.error("Error fetching tasks:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeliveryComplete = async (task: any) => {
    const amount = parseFloat(depositAmount[task.id] || "0");
    
    if (amount <= 0) {
      alert("দয়া করে সংগৃহীত টাকার পরিমাণ সঠিকভাবে লিখুন।");
      return;
    }

    try {
      setIsSaving(true);

      // ১. কালেকশন টেবিলে পেন্ডিং হিসেবে ডাটা পাঠানো
      const { error: collError } = await supabase
        .from('customer_collections')
        .insert([{
          customer_id: task.customer_id,
          amount: amount,
          company: task.company,
          collection_type: 'REGULAR',
          submitted_by: user.name,
          status: 'PENDING', // অ্যাডমিন অ্যাপ্রুভ করলে তবেই ব্যালেন্স আপডেট হবে
          payment_method: 'CASH',
          note: `ডেলিভারি কালেকশন - মেমো: ${task.order_id || 'N/A'}`
        }]);

      if (collError) throw collError;

      // ২. ডেলিভারি টাস্ক স্ট্যাটাস আপডেট করা
      const { error: taskError } = await supabase
        .from('delivery_tasks')
        .update({ 
          status: 'COMPLETED',
          collected_amount: amount,
          completed_at: new Date().toISOString()
        })
        .eq('id', task.id);

      if (taskError) throw taskError;

      alert("টাকা কালেকশনে পাঠানো হয়েছে এবং ডেলিভারি সফল হয়েছে!");
      setDepositAmount(prev => ({ ...prev, [task.id]: "" }));
      fetchData();
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const pendingTasks = allTasks.filter(t => t.status === 'PENDING');
  const myTasks = allTasks.filter(t => t.status === 'PENDING' && t.delivery_man_id === user.id);
  const completedTasks = allTasks.filter(t => t.status === 'COMPLETED');

  const currentTasks = activeTab === 'PENDING' ? pendingTasks : 
                       activeTab === 'MY_DELIVERIES' ? myTasks : completedTasks;

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      {/* Header */}
      <div className="bg-white p-6 sticky top-0 z-30 border-b border-slate-100">
        <h2 className="text-2xl font-black text-slate-800 uppercase italic tracking-tighter">Delivery Hub</h2>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">Logistic Management System</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-4 overflow-x-auto">
        {(['PENDING', 'MY_DELIVERIES', 'COMPLETED'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase italic transition-all whitespace-nowrap ${
              activeTab === tab ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-100'
            }`}
          >
            {tab === 'PENDING' ? 'সব অর্ডার' : tab === 'MY_DELIVERIES' ? 'আমার ডেলিভারি' : 'সফল ডেলিভারি'}
          </button>
        ))}
      </div>

      {/* Task List */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {currentTasks.map((task) => (
          <div key={task.id} className={`p-6 rounded-[2.5rem] border-2 transition-all ${
            task.status === 'COMPLETED' ? 'bg-emerald-50/30 border-emerald-100' : 'bg-white border-slate-100 shadow-sm'
          }`}>
            <div className="flex justify-between items-start mb-4">
              <span className={`px-4 py-1.5 rounded-full text-[10px] font-black italic uppercase ${
                task.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-50 text-blue-600'
              }`}>
                মেমো নং: {task.order_id || 'N/A'}
              </span>
              {task.status === 'COMPLETED' && <span className="text-[10px] font-black text-emerald-500 italic">✅ সফল</span>}
            </div>

            <h3 className={`text-xl font-black uppercase italic leading-tight ${task.status === 'COMPLETED' ? 'text-slate-400' : 'text-slate-800'}`}>
              {task.customers?.name || 'অজানা কাস্টমার'}
            </h3>
            <p className="text-[11px] font-bold text-slate-400 uppercase mb-6 italic">📍 {task.customers?.address || 'ঠিকানা নেই'}</p>

            {task.status === 'PENDING' ? (
              <div className="space-y-3 pt-4 border-t border-slate-50">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 font-black">৳</span>
                  <input
                    type="number"
                    placeholder="সংগৃহীত টাকা"
                    className="w-full pl-8 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-lg text-emerald-600 focus:border-emerald-400 outline-none transition-all"
                    value={depositAmount[task.id] || ""}
                    onChange={(e) => setDepositAmount({ ...depositAmount, [task.id]: e.target.value })}
                  />
                </div>
                <button
                  onClick={() => handleDeliveryComplete(task)}
                  disabled={isSaving}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase italic tracking-widest shadow-lg shadow-blue-100 active:scale-95 transition-all"
                >
                  {isSaving ? "প্রসেসিং..." : "টাকা জমা দিন ও সফল করুন"}
                </button>
              </div>
            ) : (
              <div className="mt-4 p-4 bg-white/60 rounded-2xl border border-emerald-100">
                <div className="flex justify-between items-center">
                   <span className="text-[9px] font-black text-slate-400 uppercase italic">সংগৃহীত টাকা:</span>
                   <span className="text-lg font-black text-emerald-600 italic">৳{task.collected_amount}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {loading && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-sm z-50 flex items-center justify-center font-black uppercase italic text-blue-600 tracking-widest">
          Loading Tasks...
        </div>
      )}
    </div>
  );
};

export default DeliveryHub;
