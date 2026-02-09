
import React, { useState, useEffect, useMemo } from 'react';
import { Company, UserRole, formatCurrency } from '../types';
// Fixed error: Removed unused 'db' from import
import { supabase, mapToDbCompany } from '../lib/supabase';

interface ReplacementsProps {
  company: Company;
  role: UserRole;
}

const Replacements: React.FC<ReplacementsProps> = ({ company, role }) => {
  const [replacements, setReplacements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [selectedRp, setSelectedRp] = useState<any>(null);
  const [actualQty, setActualQty] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => { fetchData(); }, [company]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const dbCo = mapToDbCompany(company);
      const { data } = await supabase
        .from('replacements')
        .select('*, customers(name, address)')
        .eq('company', dbCo)
        .order('created_at', { ascending: false });
      
      setReplacements(data || []);
    } finally { setLoading(false); }
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
      alert("রিপ্লেসমেন্ট ভেরিফিকেশন সফল হয়েছে!");
      setShowVerifyModal(false);
      fetchData();
    } catch (err: any) {
      alert("ত্রুটি: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReturnToInventory = async (rp: any) => {
    if (!confirm(`আপনি কি নিশ্চিত এই ${rp.qty} পিস মাল স্টকে (Inventory) যোগ করতে চান? এটি করার পর রেকর্ডটি ডিলিট হয়ে যাবে।`)) return;
    setIsSaving(true);
    try {
      // ১. ইনভেন্টরিতে স্টক বাড়ানো
      const { error: rpcError } = await supabase.rpc('increment_stock', { 
        row_id: rp.product_id, 
        amt: rp.qty 
      });
      if (rpcError) throw rpcError;

      // ২. রিপ্লেসমেন্ট টেবিল থেকে রেকর্ড ডিলিট করা
      await supabase.from('replacements').delete().eq('id', rp.id);
      
      alert("মাল সফলভাবে স্টকে যোগ করা হয়েছে! ইনভেন্টরি চেক করুন।");
      fetchData();
    } catch (err: any) {
      alert("ত্রুটি: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const pendingClaims = replacements.filter(r => r.status === 'PENDING' || r.status === 'RECEIVED');
  const sentClaims = replacements.filter(r => r.status === 'SENT_TO_COMPANY');

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      if(!confirm("আপনি কি নিশ্চিত এটি কোম্পানিতে পাঠাতে চান?")) return;
      const { error } = await supabase.from('replacements').update({ status: newStatus }).eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (err) { console.error(err); }
  };

  return (
    <div className="space-y-10 animate-reveal pb-40">
      
      {/* Claims Hub Header */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-6">
           <div className="w-16 h-16 bg-[#4f46e5] rounded-[1.5rem] flex items-center justify-center text-white text-3xl font-black italic shadow-2xl">R</div>
           <div>
              <h3 className="text-4xl font-black uppercase italic tracking-tighter text-slate-800 leading-none">CLAIMS HUB</h3>
              <p className="text-[11px] text-slate-400 font-black uppercase tracking-widest mt-2 italic">রিপ্লেসমেন্ট ভেরিফিকেশন ও কালেকশন</p>
           </div>
        </div>
        <div className="flex items-center gap-3">
           <button onClick={fetchData} className="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center text-xl hover:bg-slate-50 transition-all">🔄</button>
           <div className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest">
              বাকি কালেকশন: {pendingClaims.length}
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        
        {/* Section 1: PENDING / RECEIVED (Shop Verification) */}
        <div className="bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden">
           <div className="p-8 bg-[#0f172a] flex justify-between items-center text-white">
              <div className="flex items-center gap-4">
                 <span className="text-2xl">🏠</span>
                 <h4 className="text-[11px] font-black uppercase italic tracking-widest">১. কাস্টমার থেকে প্রাপ্তি (Shop Collection)</h4>
              </div>
           </div>
           <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto custom-scroll">
              {pendingClaims.map(rp => (
                <div key={rp.id} className="p-8 bg-[#f8fafc] rounded-[2.5rem] border border-slate-100 flex flex-col gap-4 group hover:bg-white transition-all">
                   <div className="flex justify-between items-start">
                      <div className="space-y-1">
                         <p className="text-sm font-black text-slate-800 uppercase italic leading-none">{rp.product_name}</p>
                         <p className="text-[10px] font-bold text-slate-400 uppercase">Shop: {rp.customers?.name || 'Unknown'}</p>
                         <p className="text-[9px] font-black text-blue-500 uppercase mt-2">📍 {rp.customers?.address}</p>
                      </div>
                      <div className="text-right">
                         <p className="text-2xl font-black italic text-slate-900 leading-none">{rp.qty}</p>
                         <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Claimed Pcs</p>
                      </div>
                   </div>
                   
                   <div className="flex gap-2 pt-2 border-t border-slate-100 mt-2">
                      {rp.status === 'RECEIVED' ? (
                        <button onClick={() => updateStatus(rp.id, 'SENT_TO_COMPANY')} className="flex-1 bg-emerald-600 text-white py-4 rounded-xl font-black text-[10px] uppercase shadow-lg transition-all active:scale-95">
                           কোম্পানিতে পাঠান (Sent to Co) ➔
                        </button>
                      ) : (
                        <button onClick={() => { setSelectedRp(rp); setActualQty(rp.qty); setShowVerifyModal(true); }} className="flex-1 bg-blue-600 text-white py-4 rounded-xl font-black text-[10px] uppercase shadow-lg transition-all active:scale-95">
                           মাল বুঝে পেলাম (Receive) ✅
                        </button>
                      )}
                      <button onClick={async () => { if(confirm("এটি ডিলিট করতে চান?")) { await supabase.from('replacements').delete().eq('id', rp.id); fetchData(); } }} className="bg-red-50 text-red-500 px-6 rounded-xl font-black">×</button>
                   </div>
                </div>
              ))}
              {pendingClaims.length === 0 && (
                <div className="p-20 text-center opacity-10 font-black uppercase text-sm italic tracking-widest">কোনো পেন্ডিং ক্লেম নেই</div>
              )}
           </div>
        </div>

        {/* Section 2: SENT (Company Stock) */}
        <div className="bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden">
           <div className="p-8 bg-[#10b981] flex justify-between items-center text-white">
              <div className="flex items-center gap-4">
                 <span className="text-2xl">🚛</span>
                 <h4 className="text-[11px] font-black uppercase italic tracking-widest">২. কোম্পানিতে আছে (With Company)</h4>
              </div>
              <span className="bg-white/20 px-5 py-2 rounded-full text-[10px] font-black italic">{sentClaims.length} ITEMS</span>
           </div>
           <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto custom-scroll">
              {sentClaims.map(rp => (
                <div key={rp.id} className="p-8 bg-[#f8fafc] rounded-[2.5rem] border border-slate-100 flex flex-col gap-4 group">
                   <div className="flex justify-between items-start">
                      <div className="space-y-2">
                         <p className="text-sm font-black text-slate-800 uppercase italic leading-none">{rp.product_name}</p>
                         <p className="text-[10px] font-bold text-emerald-500 uppercase italic">With Company for Repair/Replace</p>
                         <p className="text-[9px] font-black text-slate-400">Shop: {rp.customers?.name}</p>
                      </div>
                      <div className="text-right">
                            <p className="text-2xl font-black italic text-slate-900 leading-none">{rp.qty}</p>
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Pcs</p>
                      </div>
                   </div>
                   <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
                      <button 
                        disabled={isSaving}
                        onClick={() => handleReturnToInventory(rp)} 
                        className="flex-1 bg-blue-600 text-white py-4 rounded-xl font-black text-[10px] uppercase shadow-lg active:scale-95 transition-all"
                      >
                         বুঝে পেলাম (Add to Inventory) 📦
                      </button>
                      <button onClick={async () => { if(confirm("কোম্পানি থেকে বুঝে পেয়েছেন? এটি ডিলিট হয়ে যাবে।")) { supabase.from('replacements').delete().eq('id', rp.id).then(() => fetchData()); } }} className="bg-slate-900 text-white px-6 rounded-xl font-black text-lg">×</button>
                   </div>
                </div>
              ))}
              {sentClaims.length === 0 && (
                <div className="p-20 text-center opacity-10 font-black uppercase text-sm italic tracking-widest">কোম্পানিতে কোনো মাল নেই</div>
              )}
           </div>
        </div>
      </div>

      {/* 🛠️ Verify Receipt Modal */}
      {showVerifyModal && selectedRp && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[2000] flex items-center justify-center p-4">
           <div className="bg-white p-10 md:p-14 rounded-[4rem] w-full max-w-lg shadow-2xl animate-reveal text-black">
              <div className="flex justify-between items-center mb-8 border-b pb-6">
                 <div>
                    <h3 className="text-xl font-black uppercase italic leading-none">মাল বুঝে নেওয়া</h3>
                    <p className="text-[9px] text-slate-400 font-black uppercase mt-2 tracking-widest">Verification for {selectedRp.customers?.name}</p>
                 </div>
                 <button onClick={() => setShowVerifyModal(false)} className="text-4xl text-slate-300 font-black">×</button>
              </div>

              <div className="space-y-8">
                 <div className="bg-slate-50 p-6 rounded-[2rem] border">
                    <p className="text-[10px] font-black text-slate-400 uppercase italic mb-1">প্রোডাক্টের নাম:</p>
                    <p className="font-black text-slate-800 uppercase italic text-sm">{selectedRp.product_name}</p>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-50 p-6 rounded-[2rem] border border-blue-100 text-center">
                       <p className="text-[9px] font-black text-blue-400 uppercase mb-2">কাস্টমারের ক্লেম (Claim)</p>
                       <p className="text-4xl font-black italic text-blue-600">{selectedRp.qty}</p>
                    </div>
                    <div className="bg-slate-900 p-6 rounded-[2rem] text-center text-white">
                       <p className="text-[9px] font-black text-slate-500 uppercase mb-2">আসলে পেলাম (Received)</p>
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
                  className="w-full bg-blue-600 text-white py-6 rounded-[2.5rem] font-black uppercase text-xs tracking-[0.2em] shadow-2xl active:scale-95 transition-all"
                 >
                   {isSaving ? "Syncing..." : "কনফার্ম রিসিভ করুন ➔"}
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Replacements;
