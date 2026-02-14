
import React, { useState, useEffect, useMemo } from 'react';
import { Company, User, Product, formatCurrency } from '../types';
import { supabase, db, mapToDbCompany } from '../lib/supabase';

interface OrderManagementProps {
  company: Company;
  user: User;
}

const OrderManagement: React.FC<OrderManagementProps> = ({ company, user }) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSaving, setIsSaving] = useState(false);

  const isAdmin = user.role === 'ADMIN';
  const isStaff = user.role === 'STAFF';

  useEffect(() => { 
    fetchData(); 
  }, [company, selectedDate]);

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
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (err) { 
      console.error(err); 
    } finally { 
      setLoading(false); 
    }
  };

  const handleDeleteOrder = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!isAdmin && !isStaff) return alert("আপনার অর্ডার ডিলিট করার অনুমতি নেই।");
    if (!confirm("আপনি কি নিশ্চিত এই অর্ডারটি ডিলিট করতে চান?")) return;
    
    setLoading(true);
    try {
      const { error } = await supabase.from('market_orders').delete().eq('id', id);
      if (error) throw error;
      setShowDetailModal(false);
      fetchData();
    } catch (err: any) { 
      alert("ডিলিট করা যায়নি: " + err.message); 
    } finally {
      setLoading(false);
    }
  };

  const handleApproveOrder = async () => {
    if (!selectedOrder || isSaving) return;
    if (!confirm("অর্ডারটি কি কনফার্ম করতে চান? (এটি স্টক বা লেজারে কোনো প্রভাব ফেলবে না)")) return;
    
    setIsSaving(true);
    try {
      // Just update the status in the market_orders table
      const { error } = await supabase
        .from('market_orders')
        .update({ status: 'COMPLETED' })
        .eq('id', selectedOrder.id);

      if (error) throw error;
      
      alert("অর্ডারটি সফলভাবে অ্যাপ্রুভ করা হয়েছে! ✅"); 
      setShowDetailModal(false); 
      fetchData();
    } catch (err: any) { 
      alert("ত্রুটি: " + err.message); 
    } finally { 
      setIsSaving(false); 
    }
  };

  return (
    <div className="space-y-8 pb-32 font-sans text-slate-900 animate-reveal">
      
      {/* 🚀 Header Section with Date Picker */}
      <div className="bg-[#0f172a] p-10 md:p-14 rounded-[4rem] text-white shadow-2xl flex flex-col md:flex-row justify-between items-center gap-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 blur-[120px] rounded-full"></div>
        <div className="relative z-10 text-center md:text-left">
           <h3 className="text-3xl md:text-4xl font-black uppercase italic tracking-tighter leading-none">মার্কেট অর্ডার হাব</h3>
           <p className="text-[10px] text-blue-400 font-black uppercase mt-4 tracking-[0.4em] italic leading-none">{company} Request Stream</p>
        </div>
        
        <div className="flex gap-4 items-center bg-white/5 p-4 rounded-[2.5rem] border border-white/10 backdrop-blur-xl relative z-10">
           <div className="flex flex-col">
              <label className="text-[8px] font-black uppercase text-slate-400 ml-4 mb-1">তারিখ নির্বাচন:</label>
              <input 
                type="date" 
                className="p-4 bg-white rounded-[1.5rem] text-slate-900 font-black text-[12px] outline-none shadow-xl border-none"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
              />
           </div>
           <button onClick={fetchData} className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-transform">🔄</button>
        </div>
      </div>

      {/* 📋 Orders List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-40 text-center animate-pulse text-slate-300 font-black uppercase italic tracking-[0.4em]">অর্ডার লোড হচ্ছে...</div>
        ) : orders.length === 0 ? (
          <div className="col-span-full py-40 text-center bg-white rounded-[4rem] border-2 border-dashed border-slate-200">
             <span className="text-6xl mb-6 block grayscale opacity-20 italic">🛒</span>
             <p className="text-sm font-black uppercase text-slate-300 tracking-widest italic">এই তারিখে কোনো অর্ডার পাওয়া যায়নি</p>
          </div>
        ) : orders.map((order, idx) => (
          <div 
            key={order.id} 
            onClick={() => { setSelectedOrder(order); setShowDetailModal(true); }} 
            className="bg-white p-8 rounded-[3.5rem] border border-slate-100 shadow-sm hover:shadow-2xl transition-all cursor-pointer group animate-reveal relative overflow-hidden"
            style={{ animationDelay: `${idx * 0.05}s` }}
          >
             <div className="flex justify-between items-start mb-8">
                <span className={`px-5 py-2 rounded-2xl text-[9px] font-black uppercase tracking-widest italic shadow-sm ${
                  order.status === 'PENDING' ? 'bg-orange-50 text-orange-600 border border-orange-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                }`}>
                  {order.status === 'PENDING' ? 'নতুন অর্ডার ⏳' : 'সম্পন্ন ✓'}
                </span>
                <p className="text-[10px] font-black text-slate-300 italic">#{String(order.id).slice(-4).toUpperCase()}</p>
             </div>
             
             <h4 className="font-black text-slate-800 text-xl uppercase italic leading-tight truncate mb-2 group-hover:text-blue-600 transition-colors">{order.customers?.name}</h4>
             <p className="text-[10px] text-slate-400 font-bold uppercase truncate italic tracking-widest">📍 {order.customers?.address || 'এরিয়া বিহীন'}</p>
             
             <div className="mt-8 pt-6 border-t border-slate-50 flex justify-between items-end">
                <div>
                   <p className="text-[8px] font-black text-slate-300 uppercase mb-2">এস্টিমেটেড বিল</p>
                   <p className="text-2xl font-black italic text-slate-900 tracking-tighter leading-none">৳{Math.round(order.total_amount).toLocaleString()}</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all">➔</div>
             </div>
          </div>
        ))}
      </div>

      {/* 🔍 Details Modal */}
      {showDetailModal && selectedOrder && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-3xl z-[5000] flex items-center justify-center p-4">
           <div className="bg-white rounded-[4rem] w-full max-w-3xl h-[85vh] flex flex-col shadow-2xl animate-reveal overflow-hidden">
              <div className="p-10 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <div>
                    <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none">অর্ডার রিকোয়েস্ট শিট</h3>
                    <p className="text-[10px] text-slate-500 uppercase font-black mt-4 tracking-widest italic">Node: {selectedOrder.company} • ID: #{selectedOrder.id.slice(-6).toUpperCase()}</p>
                 </div>
                 <button onClick={() => setShowDetailModal(false)} className="text-4xl text-slate-500 hover:text-white font-black transition-colors">✕</button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scroll p-10 space-y-10 text-slate-900">
                 <div className="grid grid-cols-2 gap-10 pb-10 border-b">
                    <div className="space-y-3">
                       <p className="text-[9px] font-black text-slate-400 uppercase italic tracking-widest">কাস্টমার প্রোফাইল:</p>
                       <p className="text-2xl font-black uppercase italic leading-none">{selectedOrder.customers?.name}</p>
                       <p className="text-[11px] font-bold text-blue-600 italic">📍 {selectedOrder.customers?.address} | 📱 {selectedOrder.customers?.phone}</p>
                    </div>
                    <div className="text-right space-y-3">
                       <p className="text-[9px] font-black text-slate-400 uppercase italic tracking-widest">অর্ডার সংগ্রহকারী:</p>
                       <p className="text-lg font-black uppercase italic leading-none">{selectedOrder.created_by || 'নিজে (Portal)'}</p>
                       <p className="text-[10px] font-bold text-slate-400 italic">{new Date(selectedOrder.created_at).toLocaleString('bn-BD')}</p>
                    </div>
                 </div>

                 <div className="space-y-6">
                    <p className="text-[11px] font-black text-slate-400 uppercase italic tracking-widest">রিকোয়েস্ট করা আইটেম তালিকা:</p>
                    <div className="divide-y-2 divide-slate-100 bg-slate-50 rounded-[3rem] overflow-hidden border border-slate-200 shadow-inner">
                       {selectedOrder.items?.map((item: any, idx: number) => (
                         <div key={idx} className="p-8 flex justify-between items-center bg-white/40 hover:bg-white transition-colors group">
                            <div className="flex-1 pr-6">
                               <p className="text-[14px] font-black uppercase italic text-slate-800 leading-tight mb-2">{item.name}</p>
                               <span className="bg-slate-900 text-white px-3 py-1 rounded-lg text-[8px] font-black uppercase italic tracking-widest">Rate: ৳{item.price || item.tp}</span>
                            </div>
                            <div className="text-right">
                               <p className="text-3xl font-black italic text-slate-900 leading-none mb-1">{item.qty} <span className="text-[10px] uppercase font-bold text-slate-400 ml-1">Pcs</span></p>
                               <p className="text-[10px] font-black text-blue-600">৳{(Number(item.qty) * Number(item.price || item.tp)).toLocaleString()}</p>
                            </div>
                         </div>
                       ))}
                    </div>
                 </div>

                 <div className="pt-10 flex justify-between items-center border-t-4 border-slate-50">
                    <div>
                       <p className="text-[11px] font-black uppercase text-slate-400 italic tracking-widest mb-2">টোটাল অর্ডার ভ্যালু (Est.)</p>
                       <p className="text-5xl font-black italic tracking-tighter text-slate-900 leading-none">৳{Math.round(selectedOrder.total_amount).toLocaleString()}</p>
                    </div>
                    <div className="text-right italic">
                       <p className="text-[8px] font-black text-rose-500 uppercase tracking-widest">* আইটেম গুলো মেমো করে পাঠিয়ে দিন</p>
                    </div>
                 </div>
              </div>

              <div className="p-10 bg-slate-50 border-t flex flex-col md:flex-row gap-4 shrink-0">
                 {selectedOrder.status === 'PENDING' ? (
                   <button 
                     disabled={isSaving} 
                     onClick={handleApproveOrder} 
                     className="flex-1 bg-emerald-600 text-white py-8 rounded-[2.5rem] font-black uppercase text-sm tracking-[0.3em] shadow-xl active:scale-95 transition-all hover:bg-emerald-700"
                   >
                     অর্ডার অ্যাপ্রুভ করুন ✓
                   </button>
                 ) : (
                   <div className="flex-1 bg-slate-200 text-slate-400 py-8 rounded-[2.5rem] font-black uppercase text-sm tracking-[0.3em] text-center italic">
                     অর্ডারটি অ্যাপ্রুভ করা হয়েছে ✅
                   </div>
                 )}
                 <button onClick={() => handleDeleteOrder(selectedOrder.id)} className="bg-rose-50 text-rose-500 px-10 py-8 rounded-[2.5rem] font-black uppercase text-xs hover:bg-rose-600 hover:text-white transition-all shadow-sm active:scale-90">🗑️ ডিলিট</button>
                 <button onClick={() => setShowDetailModal(false)} className="px-12 py-8 bg-white border-2 border-slate-100 text-slate-400 rounded-[2.5rem] font-black uppercase text-xs active:scale-95">বন্ধ করুন</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default OrderManagement;
