
import React, { useState, useEffect, useMemo } from 'react';
import { Company, UserRole, Product, User } from '../types';
import { supabase, mapToDbCompany, db } from '../lib/supabase';

interface ReplacementsProps {
  company: Company;
  role: UserRole;
  user: User;
}

const Replacements: React.FC<ReplacementsProps> = ({ company, role, user }) => {
  const [replacements, setReplacements] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [selectedRp, setSelectedRp] = useState<any>(null);
  const [actualQty, setActualQty] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);

  // Claim Form State
  const [claimStep, setClaimStep] = useState(1);
  const [selectedCust, setSelectedCust] = useState<any>(null);
  const [custSearch, setCustSearch] = useState("");
  const [prodSearch, setProdSearch] = useState("");
  const [claimQty, setClaimQty] = useState<number>(1);

  useEffect(() => { fetchData(); }, [company]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const dbCo = mapToDbCompany(company);
      const [replRes, custRes, prodRes] = await Promise.all([
        supabase.from('replacements').select('*, customers(name, address)').eq('company', dbCo).order('created_at', { ascending: false }),
        db.getCustomers(),
        supabase.from('products').select('*').eq('company', dbCo).order('name')
      ]);
      
      setReplacements(replRes.data || []);
      setCustomers(custRes || []);
      setProducts(prodRes.data || []);
    } finally { setLoading(false); }
  };

  const handleAddClaim = async (product: Product) => {
    if (!selectedCust || isSaving) return;
    setIsSaving(true);
    try {
      const dbCo = mapToDbCompany(company);
      const { error } = await supabase.from('replacements').insert([{
        customer_id: selectedCust.id,
        company: dbCo,
        product_name: product.name,
        product_id: product.id,
        qty: claimQty,
        status: 'PENDING'
      }]);

      if (error) throw error;
      alert("রিপ্লেসমেন্ট ক্লেম সফলভাবে যোগ করা হয়েছে!");
      setShowAddModal(false);
      setClaimStep(1);
      setSelectedCust(null);
      setClaimQty(1);
      fetchData();
    } catch (err: any) {
      alert("ত্রুটি: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleVerifyReceipt = async () => {
    if (!selectedRp || isSaving) return;
    setIsSaving(true);
    try {
      // CRITICAL FIX: Ensure 'verified_at' is NOT in the payload as it's missing from DB schema
      const { error } = await supabase
        .from('replacements')
        .update({ 
          qty: actualQty,
          status: 'RECEIVED'
        })
        .eq('id', selectedRp.id);

      if (error) throw error;
      alert("ভেরিফিকেশন সফল হয়েছে!");
      setShowVerifyModal(false);
      fetchData();
    } catch (err: any) {
      alert("ত্রুটি: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReturnToInventory = async (rp: any) => {
    if (!confirm(`আপনি কি নিশ্চিত এই ${rp.qty} পিস মাল ইনভেন্টরিতে যোগ করতে চান?`)) return;
    setIsSaving(true);
    try {
      const { error: rpcError } = await supabase.rpc('increment_stock', { row_id: rp.product_id, amt: rp.qty });
      if (rpcError) throw rpcError;
      await supabase.from('replacements').delete().eq('id', rp.id);
      alert("মাল ইনভেন্টরিতে যোগ করা হয়েছে!");
      fetchData();
    } catch (err: any) {
      alert("ত্রুটি: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      if(!confirm("এটি কোম্পানিতে পাঠাতে চান?")) return;
      const { error } = await supabase.from('replacements').update({ status: newStatus }).eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err) { console.error(err); }
  };

  const filteredCustomers = customers.filter(c => c.name.toLowerCase().includes(custSearch.toLowerCase()) || c.phone.includes(custSearch));
  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(prodSearch.toLowerCase()));
  const pendingClaims = replacements.filter(r => r.status === 'PENDING' || r.status === 'RECEIVED');
  const sentClaims = replacements.filter(r => r.status === 'SENT_TO_COMPANY');

  return (
    <div className="space-y-4 animate-reveal pb-20 text-slate-900 px-1">
      
      {/* 🚀 Compact Header */}
      <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex justify-between items-center gap-4">
        <div className="flex items-center gap-3">
           <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white text-lg font-black italic shadow-lg">R</div>
           <div>
              <h3 className="text-base font-black uppercase italic tracking-tighter leading-none">Replacement Hub</h3>
              <p className="text-[7px] text-slate-400 font-bold uppercase mt-1">Manage Returns</p>
           </div>
        </div>
        <div className="flex items-center gap-2">
           <button onClick={() => setShowAddModal(true)} className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-black uppercase text-[9px] tracking-widest shadow-md active:scale-95 transition-all">+ নিউ ক্লেম</button>
           <button onClick={fetchData} className="w-9 h-9 bg-slate-50 border rounded-lg flex items-center justify-center hover:bg-white transition-all shadow-sm">🔄</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* AREA 1: From Shops */}
        <div className="space-y-3">
           <div className="flex items-center justify-between px-2">
              <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-400 italic">১. কাস্টমার থেকে সংগ্রহ ({pendingClaims.length})</h4>
              <div className="w-1 h-1 bg-indigo-500 rounded-full animate-ping"></div>
           </div>
           <div className="grid grid-cols-1 gap-3">
              {pendingClaims.map(rp => (
                <div key={rp.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all group relative overflow-hidden">
                   <div className="relative z-10">
                      <div className="flex justify-between items-start mb-3">
                         <div className="min-w-0 pr-3">
                            <h4 className="text-[11px] font-black uppercase italic text-slate-800 leading-tight truncate">{rp.product_name}</h4>
                            <p className="text-[8px] font-bold text-slate-400 mt-0.5 uppercase">📍 {rp.customers?.name}</p>
                         </div>
                         <div className="text-right">
                            <p className="text-lg font-black italic text-slate-900">{rp.qty} <span className="text-[7px] font-bold text-slate-400 uppercase ml-0.5">Pcs</span></p>
                         </div>
                      </div>
                      
                      <div className="flex gap-2 pt-3 border-t border-slate-50">
                         {rp.status === 'RECEIVED' ? (
                           <button onClick={() => updateStatus(rp.id, 'SENT_TO_COMPANY')} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-black text-[8px] uppercase shadow-md active:scale-95 transition-all">কোম্পানিতে পাঠান ➔</button>
                         ) : (
                           <button onClick={() => { setSelectedRp(rp); setActualQty(rp.qty); setShowVerifyModal(true); }} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-black text-[8px] uppercase shadow-md active:scale-95 transition-all">বুঝে পেলাম ✅</button>
                         )}
                         <button onClick={async () => { if(confirm("ডিলিট?")) { await supabase.from('replacements').delete().eq('id', rp.id); fetchData(); } }} className="bg-rose-50 text-rose-500 px-3 rounded-lg font-black text-[10px] hover:bg-rose-500 hover:text-white transition-all">×</button>
                      </div>
                   </div>
                </div>
              ))}
              {pendingClaims.length === 0 && <div className="py-8 text-center opacity-10 font-black uppercase text-[9px] italic bg-white rounded-2xl border border-dashed">No Pending Claims</div>}
           </div>
        </div>

        {/* AREA 2: With Company */}
        <div className="space-y-3">
           <div className="flex items-center justify-between px-2">
              <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-400 italic">২. কোম্পানির নিকট প্রেরিত ({sentClaims.length})</h4>
              <div className="w-1 h-1 bg-emerald-500 rounded-full"></div>
           </div>
           <div className="grid grid-cols-1 gap-3">
              {sentClaims.map(rp => (
                <div key={rp.id} className="bg-slate-900 p-4 rounded-2xl shadow-md text-white relative overflow-hidden group">
                   <div className="relative z-10">
                      <div className="flex justify-between items-start mb-3">
                         <div className="min-w-0 pr-3">
                            <span className="px-2 py-0.5 bg-emerald-500 text-white text-[7px] font-black rounded-md uppercase italic">With Company</span>
                            <h4 className="text-[11px] font-black uppercase italic mt-2 leading-tight truncate">{rp.product_name}</h4>
                            <p className="text-[7px] text-slate-500 font-bold uppercase mt-0.5">Shop: {rp.customers?.name}</p>
                         </div>
                         <p className="text-lg font-black italic text-emerald-400">{rp.qty}</p>
                      </div>
                      <div className="flex gap-2 mt-3 pt-3 border-t border-white/5">
                         <button 
                           disabled={isSaving}
                           onClick={() => handleReturnToInventory(rp)} 
                           className="flex-1 bg-white text-slate-900 py-2 rounded-lg font-black text-[8px] uppercase shadow-md active:scale-95 transition-all"
                         >
                            Add to Stock 📦
                         </button>
                         <button onClick={async () => { if(confirm("ডিলিট?")) { await supabase.from('replacements').delete().eq('id', rp.id); fetchData(); } }} className="bg-white/10 text-white px-3 rounded-lg font-black text-[10px]">×</button>
                      </div>
                   </div>
                </div>
              ))}
              {sentClaims.length === 0 && <div className="py-8 text-center opacity-10 font-black uppercase text-[9px] italic bg-white rounded-2xl border border-dashed">No Assets With Company</div>}
           </div>
        </div>
      </div>

      {/* ➕ Add New Claim Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[4000] flex items-center justify-center p-3">
           <div className="bg-white rounded-3xl w-full max-w-lg h-[70vh] flex flex-col shadow-2xl animate-reveal overflow-hidden">
              <div className="p-4 bg-indigo-600 text-white flex justify-between items-center shrink-0">
                 <h3 className="text-sm font-black uppercase italic">Add Claim</h3>
                 <button onClick={() => { setShowAddModal(false); setClaimStep(1); }} className="text-xl text-white/50 hover:text-white font-black">✕</button>
              </div>

              {claimStep === 1 ? (
                <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
                   <div className="p-4 space-y-3">
                      <p className="text-[9px] font-black text-slate-400 uppercase italic tracking-widest ml-1">Step 1: Select Shop</p>
                      <input 
                        className="w-full p-3 bg-white border border-slate-200 rounded-xl font-black text-[11px] uppercase outline-none focus:border-indigo-500 transition-all"
                        placeholder="সার্চ দোকান..."
                        value={custSearch}
                        onChange={e => setCustSearch(e.target.value)}
                      />
                   </div>
                   <div className="flex-1 overflow-y-auto custom-scroll px-4 pb-4 space-y-2">
                      {filteredCustomers.map(c => (
                        <div key={c.id} onClick={() => { setSelectedCust(c); setClaimStep(2); }} className="p-3 bg-white rounded-xl border border-slate-100 hover:border-indigo-500 transition-all cursor-pointer flex justify-between items-center group">
                           <div>
                              <h4 className="font-black text-slate-800 uppercase italic text-[11px]">{c.name}</h4>
                              <p className="text-[7px] font-bold text-slate-400 uppercase">📍 {c.address}</p>
                           </div>
                           <div className="text-indigo-600 text-base">➔</div>
                        </div>
                      ))}
                   </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                   <div className="w-full md:w-1/2 p-4 border-r flex flex-col gap-3 bg-slate-50">
                      <div className="flex justify-between items-center">
                        <p className="text-[9px] font-black text-slate-400 uppercase italic">Step 2: Select Item</p>
                        <button onClick={() => setClaimStep(1)} className="text-[7px] font-black text-indigo-600 uppercase underline">Change Shop</button>
                      </div>
                      <input 
                        className="w-full p-3 bg-white border border-slate-200 rounded-xl font-black text-[11px] outline-none"
                        placeholder="মডেল সার্চ..."
                        value={prodSearch}
                        onChange={e => setProdSearch(e.target.value)}
                      />
                      <div className="flex-1 overflow-y-auto custom-scroll space-y-2">
                         {filteredProducts.map(p => (
                           <div key={p.id} onClick={() => handleAddClaim(p)} className="p-3 bg-white rounded-xl border border-slate-100 hover:border-indigo-400 cursor-pointer flex justify-between items-center">
                              <p className="text-[9px] font-black uppercase italic text-slate-800 truncate pr-3">{p.name}</p>
                              <div className="text-indigo-600 font-black">+</div>
                           </div>
                         ))}
                      </div>
                   </div>
                   <div className="w-full md:w-1/2 p-6 bg-white flex flex-col justify-center items-center text-center">
                      <h4 className="text-[11px] font-black uppercase italic text-slate-900 mb-4">Quantity</h4>
                      <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-100 mb-6">
                         <button onClick={() => setClaimQty(Math.max(1, claimQty - 1))} className="w-8 h-8 rounded-full bg-white shadow text-lg font-black text-slate-300">-</button>
                         <input type="number" className="w-12 text-center bg-transparent text-2xl font-black italic outline-none" value={claimQty} onChange={e => setClaimQty(Math.max(1, Number(e.target.value)))} />
                         <button onClick={() => setClaimQty(claimQty + 1)} className="w-8 h-8 rounded-full bg-white shadow text-lg font-black text-slate-300">+</button>
                      </div>
                      <div className="w-full p-4 bg-indigo-50 rounded-xl text-left">
                         <p className="text-[7px] font-black text-indigo-400 uppercase italic mb-0.5">Customer:</p>
                         <p className="font-black text-slate-800 uppercase italic text-[10px] truncate">{selectedCust?.name}</p>
                      </div>
                   </div>
                </div>
              )}
           </div>
        </div>
      )}

      {/* 🛠️ Verify Modal - Made more compact */}
      {showVerifyModal && selectedRp && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[4000] flex items-center justify-center p-3">
           <div className="bg-white p-6 rounded-3xl w-full max-w-xs shadow-2xl animate-reveal text-black border border-white/20">
              <div className="flex justify-between items-center mb-4 border-b pb-3">
                 <h3 className="text-sm font-black uppercase italic">মাল যাচাইকরণ</h3>
                 <button onClick={() => setShowVerifyModal(false)} className="text-xl text-slate-300">✕</button>
              </div>
              
              <div className="space-y-4">
                 <div className="text-center p-4 bg-slate-50 rounded-2xl">
                    <p className="text-[8px] font-black uppercase text-slate-400 mb-1">Product Name</p>
                    <p className="text-[12px] font-black uppercase italic leading-tight">{selectedRp.product_name}</p>
                 </div>

                 <div className="space-y-2">
                    <label className="text-[8px] font-black uppercase text-slate-400 ml-1 italic text-center block">প্রাপ্ত পরিমাণ (Qty Received)</label>
                    <div className="flex items-center gap-4 justify-center bg-indigo-50 p-2 rounded-2xl border border-indigo-100">
                       <button onClick={() => setActualQty(Math.max(0, actualQty - 1))} className="w-8 h-8 bg-white rounded-full shadow font-black text-lg text-slate-300">-</button>
                       <input type="number" className="w-12 text-center bg-transparent text-2xl font-black italic text-indigo-600 outline-none" value={actualQty} onChange={e => setActualQty(Number(e.target.value))} />
                       <button onClick={() => setActualQty(actualQty + 1)} className="w-8 h-8 bg-white rounded-full shadow font-black text-lg text-slate-300">+</button>
                    </div>
                 </div>

                 <button 
                   disabled={isSaving}
                   onClick={handleVerifyReceipt}
                   className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all mt-4"
                 >
                    {isSaving ? "সংরক্ষণ হচ্ছে..." : "কনফার্ম প্রাপ্তি ✅"}
                 </button>
              </div>
           </div>
        </div>
      )}

      {loading && <div className="fixed inset-0 bg-white/30 backdrop-blur-sm z-[9999] flex items-center justify-center font-black uppercase italic text-blue-600 animate-pulse text-[10px] tracking-widest">Updating Returns...</div>}
    </div>
  );
};

export default Replacements;
