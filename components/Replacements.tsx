
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
      const { error } = await supabase
        .from('replacements')
        .update({ 
          qty: actualQty,
          status: 'RECEIVED',
          verified_at: new Date().toISOString()
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
    <div className="space-y-10 animate-reveal pb-40 text-slate-900">
      
      {/* 🚀 Premium Header */}
      <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-8">
        <div className="flex items-center gap-6">
           <div className="w-16 h-16 bg-indigo-600 rounded-[1.8rem] flex items-center justify-center text-white text-3xl font-black italic shadow-2xl animate-float">R</div>
           <div>
              <h3 className="text-3xl font-black uppercase italic tracking-tighter text-slate-800 leading-none">Replacement Hub</h3>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.3em] mt-2">Manage Customer Returns & Company Claims</p>
           </div>
        </div>
        <div className="flex items-center gap-4 w-full md:w-auto">
           <button onClick={() => setShowAddModal(true)} className="flex-1 md:flex-none bg-indigo-600 text-white px-10 py-5 rounded-3xl font-black uppercase text-[11px] tracking-widest shadow-xl active:scale-95 transition-all hover:bg-indigo-700">
             + নতুন ক্লেম যোগ করুন
           </button>
           <button onClick={fetchData} className="w-14 h-14 bg-slate-50 border rounded-2xl flex items-center justify-center text-xl hover:bg-white transition-all shadow-sm">🔄</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        
        {/* AREA 1: From Shops */}
        <div className="space-y-6">
           <div className="flex items-center justify-between px-6">
              <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 italic">১. কাস্টমার থেকে সংগ্রহ ({pendingClaims.length})</h4>
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping"></div>
           </div>
           <div className="grid grid-cols-1 gap-6">
              {pendingClaims.map(rp => (
                <div key={rp.id} className="bg-white p-8 rounded-[3rem] shadow-lg border border-slate-100 hover:shadow-2xl transition-all duration-500 group relative overflow-hidden">
                   <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-bl-[4rem] -z-0 opacity-50 group-hover:scale-110 transition-transform"></div>
                   <div className="relative z-10">
                      <div className="flex justify-between items-start mb-6">
                         <div className="min-w-0 pr-6">
                            <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-1">Product Identity</p>
                            <h4 className="text-lg font-black uppercase italic text-slate-800 leading-tight truncate">{rp.product_name}</h4>
                            <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase">📍 {rp.customers?.name} • {rp.customers?.address}</p>
                         </div>
                         <div className="text-right">
                            <p className="text-3xl font-black italic text-slate-900 leading-none">{rp.qty}</p>
                            <p className="text-[8px] font-black text-slate-400 uppercase mt-1">Claimed Pcs</p>
                         </div>
                      </div>
                      
                      <div className="flex gap-3 pt-6 border-t border-slate-50">
                         {rp.status === 'RECEIVED' ? (
                           <button onClick={() => updateStatus(rp.id, 'SENT_TO_COMPANY')} className="flex-1 bg-emerald-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase shadow-lg active:scale-95 transition-all">কোম্পানিতে পাঠান ➔</button>
                         ) : (
                           <button onClick={() => { setSelectedRp(rp); setActualQty(rp.qty); setShowVerifyModal(true); }} className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase shadow-lg active:scale-95 transition-all">বুঝে পেলাম (Receive) ✅</button>
                         )}
                         <button onClick={async () => { if(confirm("ডিলিট করতে চান?")) { await supabase.from('replacements').delete().eq('id', rp.id); fetchData(); } }} className="bg-rose-50 text-rose-500 px-6 rounded-2xl font-black text-sm hover:bg-rose-500 hover:text-white transition-all">×</button>
                      </div>
                   </div>
                </div>
              ))}
              {pendingClaims.length === 0 && <div className="py-20 text-center opacity-10 font-black uppercase text-xs italic bg-white rounded-[3rem] border border-dashed">No Pending Claims</div>}
           </div>
        </div>

        {/* AREA 2: With Company */}
        <div className="space-y-6">
           <div className="flex items-center justify-between px-6">
              <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 italic">২. কোম্পানির নিকট প্রেরিত ({sentClaims.length})</h4>
              <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
           </div>
           <div className="grid grid-cols-1 gap-6">
              {sentClaims.map(rp => (
                <div key={rp.id} className="bg-slate-900 p-8 rounded-[3rem] shadow-2xl text-white hover:scale-[1.02] transition-all duration-500 relative overflow-hidden group">
                   <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-emerald-500/10 blur-[60px] rounded-full"></div>
                   <div className="relative z-10">
                      <div className="flex justify-between items-start mb-6">
                         <div className="min-w-0 pr-6">
                            <span className="px-3 py-1 bg-emerald-500 text-white text-[8px] font-black rounded-lg uppercase tracking-widest italic">With Company</span>
                            <h4 className="text-lg font-black uppercase italic mt-4 leading-tight truncate">{rp.product_name}</h4>
                            <p className="text-[9px] text-slate-500 font-bold uppercase mt-2">Shop: {rp.customers?.name}</p>
                         </div>
                         <p className="text-3xl font-black italic text-emerald-400 leading-none">{rp.qty}</p>
                      </div>
                      <div className="flex gap-3 mt-6 pt-6 border-t border-white/5">
                         <button 
                           disabled={isSaving}
                           onClick={() => handleReturnToInventory(rp)} 
                           className="flex-1 bg-white text-slate-900 py-4 rounded-2xl font-black text-[10px] uppercase shadow-xl active:scale-95 transition-all hover:bg-emerald-400"
                         >
                            বুঝে পেলাম (Add to Stock) 📦
                         </button>
                         <button onClick={async () => { if(confirm("ডিলিট?")) { await supabase.from('replacements').delete().eq('id', rp.id); fetchData(); } }} className="bg-white/10 text-white px-6 rounded-2xl font-black text-sm">×</button>
                      </div>
                   </div>
                </div>
              ))}
              {sentClaims.length === 0 && <div className="py-20 text-center opacity-10 font-black uppercase text-xs italic bg-white rounded-[3rem] border border-dashed">No Assets With Company</div>}
           </div>
        </div>
      </div>

      {/* ➕ Add New Claim Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-2xl z-[4000] flex items-center justify-center p-4">
           <div className="bg-white rounded-[4rem] w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl animate-reveal overflow-hidden">
              <div className="p-8 md:p-10 bg-indigo-600 text-white flex justify-between items-center shrink-0">
                 <div className="flex items-center gap-6">
                    <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-xl font-black italic shadow-inner">+</div>
                    <div>
                       <h3 className="text-2xl font-black uppercase italic tracking-tighter">Add Replacement Claim</h3>
                       <p className="text-[10px] text-indigo-200 font-bold uppercase tracking-widest mt-1">Register customer return items</p>
                    </div>
                 </div>
                 <button onClick={() => { setShowAddModal(false); setClaimStep(1); }} className="text-4xl text-white/50 hover:text-white font-black transition-colors">✕</button>
              </div>

              {claimStep === 1 ? (
                <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
                   <div className="p-10 space-y-6">
                      <p className="text-[11px] font-black text-slate-400 uppercase italic tracking-[0.2em] ml-2">Step 1: Select Customer Shop</p>
                      <div className="relative">
                         <input 
                           className="w-full p-6 bg-white border-2 border-slate-100 rounded-[2.5rem] font-black text-sm uppercase italic shadow-sm outline-none focus:border-indigo-500 transition-all pl-16"
                           placeholder="সার্চ দোকান আইডি বা নাম..."
                           value={custSearch}
                           onChange={e => setCustSearch(e.target.value)}
                         />
                         <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl opacity-20">🔍</span>
                      </div>
                   </div>
                   <div className="flex-1 overflow-y-auto custom-scroll px-10 pb-10 space-y-3">
                      {filteredCustomers.map(c => (
                        <div key={c.id} onClick={() => { setSelectedCust(c); setClaimStep(2); }} className="p-6 bg-white rounded-3xl border-2 border-transparent shadow-sm hover:border-indigo-500 hover:shadow-xl transition-all cursor-pointer flex justify-between items-center group">
                           <div>
                              <h4 className="font-black text-slate-800 uppercase italic text-sm group-hover:text-indigo-600 leading-none">{c.name}</h4>
                              <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest leading-none">📍 {c.address} | 📱 {c.phone}</p>
                           </div>
                           <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all">➔</div>
                        </div>
                      ))}
                   </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                   <div className="w-full lg:w-1/2 p-10 border-r flex flex-col gap-6 bg-slate-50">
                      <div className="flex justify-between items-center px-2">
                        <p className="text-[11px] font-black text-slate-400 uppercase italic tracking-[0.2em]">Step 2: Select Product</p>
                        <button onClick={() => setClaimStep(1)} className="text-[9px] font-black text-indigo-600 uppercase underline">↩ Change Customer</button>
                      </div>
                      <div className="relative">
                        <input 
                           className="w-full p-5 bg-white border-2 border-slate-100 rounded-[2rem] font-black text-xs uppercase italic shadow-sm outline-none focus:border-indigo-500 transition-all pl-14"
                           placeholder="মডেল সার্চ করুন..."
                           value={prodSearch}
                           onChange={e => setProdSearch(e.target.value)}
                        />
                        <span className="absolute left-6 top-1/2 -translate-y-1/2 text-xl opacity-20">🔍</span>
                      </div>
                      <div className="flex-1 overflow-y-auto custom-scroll space-y-2 pr-2">
                         {filteredProducts.map(p => (
                           <div key={p.id} onClick={() => handleAddClaim(p)} className="p-5 bg-white rounded-[2rem] border border-slate-100 hover:border-indigo-400 hover:shadow-lg transition-all cursor-pointer group flex justify-between items-center">
                              <p className="text-[11px] font-black uppercase italic text-slate-800 pr-4">{p.name}</p>
                              <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-indigo-600 font-black">+</div>
                           </div>
                         ))}
                      </div>
                   </div>
                   <div className="w-full lg:w-1/2 p-10 bg-white flex flex-col justify-center items-center text-center">
                      <div className="w-32 h-32 bg-indigo-50 rounded-[3rem] flex items-center justify-center text-5xl mb-8 shadow-inner animate-float">🔢</div>
                      <h4 className="text-xl font-black uppercase italic text-slate-900 mb-2">Claim Quantity</h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-10">Set how many units are being returned</p>
                      
                      <div className="flex items-center gap-8 bg-slate-50 p-6 rounded-[3rem] border border-slate-100 shadow-inner mb-12 scale-125">
                         <button onClick={() => setClaimQty(Math.max(1, claimQty - 1))} className="w-12 h-12 rounded-full bg-white shadow-md text-3xl font-black text-slate-400 hover:text-rose-500 transition-colors">×</button>
                         <input type="number" className="w-20 text-center bg-transparent text-5xl font-black italic outline-none" value={claimQty} onChange={e => setClaimQty(Math.max(1, Number(e.target.value)))} />
                         <button onClick={() => setClaimQty(claimQty + 1)} className="w-12 h-12 rounded-full bg-white shadow-md text-2xl font-black text-slate-400 hover:text-indigo-600 transition-colors">+</button>
                      </div>

                      <div className="w-full p-8 bg-indigo-50 rounded-[2.5rem] border border-indigo-100 text-left">
                         <p className="text-[9px] font-black text-indigo-400 uppercase italic mb-2">Selected Customer:</p>
                         <p className="font-black text-slate-800 uppercase italic">{selectedCust?.name}</p>
                      </div>
                   </div>
                </div>
              )}
           </div>
        </div>
      )}

      {/* 🛠️ Verify Modal */}
      {showVerifyModal && selectedRp && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[4000] flex items-center justify-center p-4">
           <div className="bg-white p-10 md:p-14 rounded-[4rem] w-full max-w-lg shadow-2xl animate-reveal text-black">
              <div className="flex justify-between items-center mb-10 border-b pb-8">
                 <div>
                    <h3 className="text-xl font-black uppercase italic leading-none">মাল যাচাইকরণ</h3>
                    <p className="text-[9px] text-slate-400 font-black uppercase mt-2 tracking-widest">Verification for {selectedRp.customers?.name}</p>
                 </div>
                 <button onClick={() => setShowVerifyModal(false)} className="text-4xl text-slate-300 font-black hover:text-slate-900 transition-colors">✕</button>
              </div>

              <div className="space-y-8">
                 <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase italic mb-2 tracking-widest">Product Name:</p>
                    <p className="font-black text-slate-800 uppercase italic text-sm">{selectedRp.product_name}</p>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100 text-center">
                       <p className="text-[9px] font-black text-indigo-400 uppercase mb-2">ক্লেম (Claim)</p>
                       <p className="text-4xl font-black italic text-indigo-600">{selectedRp.qty}</p>
                    </div>
                    <div className="bg-slate-900 p-6 rounded-3xl text-center text-white shadow-xl">
                       <p className="text-[9px] font-black text-slate-500 uppercase mb-2">প্রাপ্ত (Received)</p>
                       <input 
                         autoFocus
                         type="number" 
                         className="w-full bg-transparent text-4xl font-black italic text-center outline-none border-b border-white/20 pb-2" 
                         value={actualQty} 
                         onChange={e => setActualQty(Math.min(selectedRp.qty, Number(e.target.value)))} 
                       />
                    </div>
                 </div>

                 <button 
                  disabled={isSaving || actualQty <= 0} 
                  onClick={handleVerifyReceipt}
                  className="w-full bg-indigo-600 text-white py-6 rounded-[2.2rem] font-black uppercase text-xs tracking-[0.3em] shadow-2xl active:scale-95 transition-all"
                 >
                   {isSaving ? "সংরক্ষণ হচ্ছে..." : "কনফার্ম প্রাপ্তি এন্ট্রি ➔"}
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Replacements;
