
import React, { useState, useEffect } from 'react';
import { Company, User, Product, formatCurrency } from '../types';
import { supabase, db, mapToDbCompany } from '../lib/supabase';

interface OrderManagementProps {
  company: Company;
  user: User;
  setActiveTab: (tab: string) => void;
}

const OrderManagement: React.FC<OrderManagementProps> = ({ company, user, setActiveTab }) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSaving, setIsSaving] = useState(false);

  const isAdmin = user.role === 'ADMIN';

  useEffect(() => { fetchData(); }, [company, selectedDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const dbCo = mapToDbCompany(company);
      const startOfDay = `${selectedDate}T00:00:00.000Z`;
      const endOfDay = `${selectedDate}T23:59:59.999Z`;
      
      const { data, error } = await supabase
        .from('market_orders')
        .select('*, customers(name, address, phone)')
        .eq('company', dbCo)
        .or(`status.eq.PENDING,and(created_at.gte.${startOfDay},created_at.lte.${endOfDay})`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleProcessMemo = () => {
    if (!selectedOrder) return;
    
    // 🚚 Handoff data to Sales component via LocalStorage
    const pendingOrder = {
      orderId: selectedOrder.id,
      customerId: selectedOrder.customer_id,
      items: selectedOrder.items
    };
    
    localStorage.setItem('ifza_pending_market_order', JSON.stringify(pendingOrder));
    
    // Switch to Sales Tab
    setActiveTab('sales');
    setShowDetailModal(false);
  };

  const handleApproveOrder = async () => {
    if (!selectedOrder || isSaving) return;
    if (!confirm("অর্ডারটি কি সরাসরি সম্পন্ন (COMPLETED) করতে চান? এটি করলে স্টক বা লেজারে কোনো পরিবর্তন হবে না। স্টক ঠিক করতে 'মেমো তৈরি করুন' বাটন ব্যবহার করুন।")) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('market_orders').update({ status: 'COMPLETED' }).eq('id', selectedOrder.id);
      if (error) throw error;
      alert("সফল! ✅"); setShowDetailModal(false); fetchData();
    } catch (err: any) { alert("ত্রুটি: " + err.message); } finally { setIsSaving(false); }
  };

  return (
    <div className="space-y-4 pb-20 px-1 animate-reveal">
      <div className="bg-slate-900 p-4 rounded-2xl text-white shadow-lg flex flex-col md:flex-row justify-between items-center gap-3">
        <div>
           <h3 className="text-lg font-black uppercase italic tracking-tight leading-none">মার্কেট অর্ডার হাব</h3>
           <p className="text-[8px] text-blue-400 font-bold uppercase tracking-widest mt-1 italic">{company} Stream</p>
        </div>
        <div className="flex gap-2 items-center bg-white/5 p-1.5 rounded-xl border border-white/10 w-full md:w-auto">
           <input type="date" className="flex-1 p-2 bg-white rounded-lg text-slate-900 font-black text-[10px] outline-none" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
           <button onClick={fetchData} className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg active:scale-90">🔄</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {loading ? (
          <div className="col-span-full py-20 text-center animate-pulse text-slate-300 font-bold text-[10px] uppercase">লোড হচ্ছে...</div>
        ) : orders.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-white rounded-2xl border border-dashed border-slate-200">
             <p className="text-[10px] font-black uppercase text-slate-300 italic tracking-widest">কোনো অর্ডার নেই</p>
          </div>
        ) : orders.map((order) => (
          <div key={order.id} onClick={() => { setSelectedOrder(order); setShowDetailModal(true); }} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-between active:scale-[0.98] transition-all">
             <div className="flex justify-between items-start mb-3">
                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase italic ${order.status === 'PENDING' ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'}`}>{order.status}</span>
                <p className="text-[9px] font-black text-slate-300 italic">#{String(order.id).slice(-4).toUpperCase()}</p>
             </div>
             <h4 className="font-black text-slate-800 text-[13px] uppercase italic truncate leading-none mb-1">{order.customers?.name}</h4>
             <p className="text-[9px] text-slate-400 font-bold truncate italic tracking-tight">📍 {order.customers?.address}</p>
             <div className="mt-3 pt-2 border-t flex justify-between items-end">
                <p className="text-base font-black italic text-slate-900 tracking-tighter">৳{Math.round(order.total_amount).toLocaleString()}</p>
                <div className="text-[8px] font-black uppercase text-blue-600">বিস্তারিত ➔</div>
             </div>
          </div>
        ))}
      </div>

      {showDetailModal && selectedOrder && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-[5000] flex items-center justify-center p-3">
           <div className="bg-white rounded-2xl w-full max-w-md h-[80vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-5 bg-slate-900 text-white flex justify-between items-center">
                 <h3 className="text-md font-black uppercase italic">অর্ডার রিকোয়েস্ট</h3>
                 <button onClick={() => setShowDetailModal(false)} className="text-2xl text-slate-500 font-black">✕</button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                 <div className="pb-3 border-b">
                    <p className="text-sm font-black uppercase italic leading-none">{selectedOrder.customers?.name}</p>
                    <p className="text-[10px] font-bold text-blue-600 mt-1 uppercase italic tracking-widest">📍 {selectedOrder.customers?.address}</p>
                 </div>
                 <div className="space-y-1.5">
                    {selectedOrder.items?.map((item: any, idx: number) => (
                      <div key={idx} className={`p-2.5 rounded-lg flex justify-between items-center text-[10px] border ${item.action === 'RETURN' ? 'bg-red-50 border-red-100' : item.action === 'REPLACE' ? 'bg-cyan-50 border-cyan-100' : 'bg-slate-50 border-slate-100'}`}>
                         <div className="flex-1">
                            <p className="font-black uppercase italic text-slate-800">{item.name}</p>
                            <span className={`text-[7px] font-black px-1 rounded border ${item.action === 'RETURN' ? 'text-red-500 border-red-200' : item.action === 'REPLACE' ? 'text-cyan-500 border-cyan-200' : 'text-slate-400 border-slate-200'}`}>
                               {item.action || 'SALE'}
                            </span>
                         </div>
                         <div className="text-right font-black italic ml-4 text-slate-900">{item.qty} পিস</div>
                      </div>
                    ))}
                 </div>
                 <div className="pt-4 flex justify-between items-center border-t-2">
                    <p className="text-[9px] font-black uppercase text-slate-400 italic">টোটাল অর্ডার ভ্যালু (Est.)</p>
                    <p className="text-xl font-black italic text-slate-900 tracking-tighter">৳{Math.round(selectedOrder.total_amount).toLocaleString()}</p>
                 </div>
              </div>
              <div className="p-4 bg-slate-100 border-t flex flex-col gap-2">
                 {selectedOrder.status === 'PENDING' && (
                   <>
                     <button onClick={handleProcessMemo} className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase text-[11px] shadow-xl active:scale-95 transition-all">মেমো তৈরি করুন & প্রসেস ➔</button>
                     <button disabled={isSaving} onClick={handleApproveOrder} className="w-full bg-white border border-slate-200 text-slate-400 py-3 rounded-xl font-black uppercase text-[9px]">সরাসরি সম্পন্ন (Approve Only)</button>
                   </>
                 )}
                 <button onClick={() => setShowDetailModal(false)} className="w-full py-3 text-slate-400 font-black uppercase text-[9px]">বন্ধ করুন</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default OrderManagement;
