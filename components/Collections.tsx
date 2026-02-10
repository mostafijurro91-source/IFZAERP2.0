
import React, { useState, useEffect, useMemo } from 'react';
import { Company, User, formatCurrency } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';
import { sendSMS } from '../lib/sms';

interface CollectionsProps {
  company: Company;
  user: User;
}

const Collections: React.FC<CollectionsProps> = ({ company, user }) => {
  const [customers, setCustomers] = useState<any[]>([]);
  const [allCompanyDues, setAllCompanyDues] = useState<Record<string, Record<string, number>>>({});
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [todayStats, setTodayStats] = useState({
    total: 0,
    transtec: 0,
    sqLight: 0,
    sqCables: 0,
    pendingTotal: 0
  });
  
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedRoute, setSelectedRoute] = useState<string>("");
  const [uniqueRoutes, setUniqueRoutes] = useState<string[]>([]);
  const [showCustList, setShowCustList] = useState(false);
  const [selectedCust, setSelectedCust] = useState<any>(null);
  const [amount, setAmount] = useState<number | "">("");
  const [targetCompany, setTargetCompany] = useState<Company>(company);

  const isAdmin = user.role === 'ADMIN';
  const isDelivery = user.role === 'DELIVERY';
  const canSwitchCompany = isAdmin || isDelivery;

  useEffect(() => {
    setTargetCompany(company);
    setSearch("");
    setSelectedCust(null);
    fetchData();
  }, [company]);

  const fetchData = async () => {
    try {
      const today = new Date();
      today.setHours(0,0,0,0);
      const todayIso = today.toISOString();

      const [custRes, txRes, pendRes, todayTxRes] = await Promise.all([
        supabase.from('customers').select('*').order('name'),
        supabase.from('transactions').select('customer_id, amount, payment_type, company'),
        supabase.from('collection_requests').select('*, customers(name, address, phone)').eq('status', 'PENDING').order('created_at', { ascending: false }),
        supabase.from('transactions').select('amount, company').eq('payment_type', 'COLLECTION').gte('created_at', todayIso)
      ]);

      const dues: Record<string, Record<string, number>> = {};
      txRes.data?.forEach(tx => {
        const cid = tx.customer_id;
        const amt = Number(tx.amount) || 0;
        const txCo = mapToDbCompany(tx.company);
        if (!dues[cid]) dues[cid] = { 'Transtec': 0, 'SQ Light': 0, 'SQ Cables': 0 };
        if (dues[cid][txCo] !== undefined) {
           dues[cid][txCo] += (tx.payment_type === 'COLLECTION' ? -amt : amt);
        }
      });

      let t_total = 0, t_transtec = 0, t_sqlight = 0, t_sqcables = 0;
      todayTxRes.data?.forEach(tx => {
        const amt = Number(tx.amount) || 0;
        const txCo = mapToDbCompany(tx.company);
        t_total += amt;
        if (txCo === 'Transtec') t_transtec += amt;
        if (txCo === 'SQ Light') t_sqlight += amt;
        if (txCo === 'SQ Cables') t_sqcables += amt;
      });

      const p_total = pendRes.data?.reduce((acc, r) => acc + (Number(r.amount) || 0), 0) || 0;
      setTodayStats({ total: t_total, transtec: t_transtec, sqLight: t_sqlight, sqCables: t_sqcables, pendingTotal: p_total });
      setCustomers(custRes.data || []);
      setAllCompanyDues(dues);
      setPendingRequests(pendRes.data || []);
      setUniqueRoutes(Array.from(new Set((custRes.data || []).map(c => c.address?.trim()).filter(Boolean))).sort() as string[]);
    } finally { setLoading(false); }
  };

  const handleApprove = async (req: any) => {
    if (!isAdmin || isSaving) return;
    setIsSaving(true);
    try {
      const dbCo = mapToDbCompany(req.company);
      const { error: txErr } = await supabase.from('transactions').insert([{
        customer_id: req.customer_id, 
        company: dbCo, 
        amount: Number(req.amount),
        payment_type: 'COLLECTION', 
        items: [{ note: `Approved collection by ${user.name}` }], 
        submitted_by: req.submitted_by
      }]);
      if (txErr) throw txErr;
      await supabase.from('collection_requests').update({ status: 'APPROVED' }).eq('id', req.id);
      
      const dues = allCompanyDues[req.customer_id] || { 'Transtec': 0, 'SQ Light': 0, 'SQ Cables': 0 };
      const currentBalance = dues[req.company] - Number(req.amount);
      
      const smsMsg = `IFZA Electronics: ${req.customers?.name}, আপনার ${Number(req.amount).toLocaleString()} টাকা পেমেন্ট গৃহীত হয়েছে। বর্তমান বকেয়া (${req.company}): ${Math.round(currentBalance).toLocaleString()} টাকা। ধন্যবাদ।`;
      await sendSMS(req.customers?.phone, smsMsg, req.customer_id);
      alert("কালেকশন এপ্রুভ হয়েছে এবং কাস্টমারকে এসএমএস পাঠানো হয়েছে!");
      await fetchData();
    } catch (err: any) { alert(err.message); } finally { setIsSaving(false); }
  };

  const filteredCustomers = useMemo(() => {
    const q = search.toLowerCase().trim();
    return customers.filter(c => 
      (!q || c.name.toLowerCase().includes(q) || c.phone.includes(q)) && 
      (!selectedRoute || c.address?.trim() === selectedRoute)
    );
  }, [customers, search, selectedRoute]);

  return (
    <div className="space-y-8 pb-24 text-slate-900 animate-reveal">
      <div className="bg-white p-10 md:p-14 rounded-[4rem] shadow-xl border border-slate-100 no-print relative overflow-hidden group">
         <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[100px] rounded-full"></div>
         <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-10">
            <div className="text-center md:text-left">
               <h3 className="text-[11px] font-bold uppercase italic tracking-[0.4em] text-emerald-600 mb-4">আজকের মোট আদায় (Total Cash In)</h3>
               <p className="text-5xl md:text-8xl font-black italic tracking-tighter text-slate-950 animate-in slide-in-from-bottom-2 duration-700">
                  {todayStats.total.toLocaleString()}<span className="text-2xl text-emerald-500 ml-2">৳</span>
               </p>
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-4 italic">সম্মিলিত ব্র্যান্ড ট্র্যাকার</p>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full md:w-auto">
               {[
                 { label: 'Transtec', val: todayStats.transtec, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
                 { label: 'SQ Light', val: todayStats.sqLight, color: 'text-cyan-600', bg: 'bg-cyan-50', border: 'border-cyan-100' },
                 { label: 'SQ Cables', val: todayStats.sqCables, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100' },
                 { label: 'Pending (অপেক্ষমাণ)', val: todayStats.pendingTotal, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' }
               ].map(co => (
                 <div key={co.label} className={`${co.bg} p-6 rounded-[2.5rem] border ${co.border} min-w-[120px] text-center shadow-sm group-hover:-translate-y-1 transition-transform`}>
                    <p className="text-[8px] font-bold text-slate-500 uppercase mb-2">{co.label}</p>
                    <p className={`text-lg font-black italic ${co.color}`}>{co.val.toLocaleString()}৳</p>
                 </div>
               ))}
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
         {/* 🧾 Entry Form */}
         <div className="bg-white p-10 md:p-14 rounded-[4rem] border shadow-2xl space-y-10">
            <div className="flex items-center gap-6">
               <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center text-white text-3xl shadow-xl italic font-bold">C</div>
               <div>
                  <h3 className="text-3xl font-bold uppercase italic leading-none text-black">কালেকশন এন্ট্রি</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-2 tracking-[0.3em]">{user.name} | {targetCompany} ডিভিশন</p>
               </div>
            </div>

            <div className="space-y-4">
               <label className="text-[12px] font-bold text-slate-400 uppercase ml-4 italic">১. কাস্টমার বাছাই করুন</label>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <select className="p-6 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] font-bold text-[11px] uppercase outline-none text-black" value={selectedRoute} onChange={e => { setSelectedRoute(e.target.value); setSelectedCust(null); setSearch(""); }}>
                    <option value="">সকল এরিয়া</option>
                    {uniqueRoutes.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <div className="relative">
                    <div onClick={() => { setShowCustList(true); setSearch(""); }} className="p-6 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] cursor-pointer flex justify-between items-center shadow-sm hover:border-blue-300 transition-all">
                       <span className={selectedCust ? "font-bold text-black uppercase italic text-xs truncate" : "text-slate-300 italic text-xs"}>{selectedCust ? selectedCust.name : "সার্চ করে দোকান বাছুন..."}</span>
                       <span className="opacity-40 text-xs">▼</span>
                    </div>
                    {showCustList && (
                      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md" onClick={() => setShowCustList(false)}>
                        <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden flex flex-col h-[70vh] animate-reveal" onClick={e => e.stopPropagation()}>
                           <div className="p-6 bg-slate-900 flex justify-between items-center">
                              <h4 className="text-white font-black uppercase italic text-xs">Shop Selector</h4>
                              <button onClick={() => setShowCustList(false)} className="text-slate-400 text-3xl">×</button>
                           </div>
                           <div className="p-4 border-b">
                              <input autoFocus placeholder="দোকানের নাম বা মোবাইল লিখুন..." className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold text-lg uppercase italic focus:border-blue-600 transition-all" value={search} onChange={e => setSearch(e.target.value)} />
                           </div>
                           <div className="overflow-y-auto flex-1 custom-scroll p-4 space-y-2">
                             {filteredCustomers.map(c => {
                               const dues = allCompanyDues[c.id] || { Transtec: 0, 'SQ Light': 0, 'SQ Cables': 0 };
                               return (
                                 <div key={c.id} onClick={() => { setSelectedCust(c); setShowCustList(false); }} className="p-5 hover:bg-blue-600 hover:text-white rounded-2xl cursor-pointer border-b border-slate-50 flex flex-col gap-2 transition-all text-black group">
                                    <div className="flex justify-between items-center">
                                      <p className="font-bold text-[14px] uppercase truncate group-hover:text-white leading-none">{c.name}</p>
                                      <p className="text-[8px] font-black opacity-40 group-hover:text-white">📍 {c.address}</p>
                                    </div>
                                    <div className="flex gap-2">
                                       <span className="px-2 py-1 bg-amber-50 text-amber-600 rounded-lg text-[8px] font-bold group-hover:bg-white/10 group-hover:text-white">T: ৳{dues['Transtec'].toLocaleString()}</span>
                                       <span className="px-2 py-1 bg-cyan-50 text-cyan-600 rounded-lg text-[8px] font-bold group-hover:bg-white/10 group-hover:text-white">L: ৳{dues['SQ Light'].toLocaleString()}</span>
                                       <span className="px-2 py-1 bg-rose-50 text-rose-600 rounded-lg text-[8px] font-bold group-hover:bg-white/10 group-hover:text-white">C: ৳{dues['SQ Cables'].toLocaleString()}</span>
                                    </div>
                                 </div>
                               );
                             })}
                             {filteredCustomers.length === 0 && <div className="py-20 text-center text-slate-300 font-black uppercase italic">কোনো দোকান মেলেনি</div>}
                           </div>
                        </div>
                      </div>
                    )}
                  </div>
               </div>
            </div>

            {selectedCust && (
              <div className="bg-blue-50 p-6 rounded-[2.5rem] border-2 border-dashed border-blue-200 animate-reveal">
                 <p className="text-[10px] font-black text-blue-400 uppercase italic mb-4 text-center">৩ কোম্পানির বর্তমান বাকি (Dues Summary)</p>
                 <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'Transtec', val: allCompanyDues[selectedCust.id]?.['Transtec'] || 0, color: 'text-amber-600' },
                      { label: 'SQ Light', val: allCompanyDues[selectedCust.id]?.['SQ Light'] || 0, color: 'text-cyan-600' },
                      { label: 'SQ Cables', val: allCompanyDues[selectedCust.id]?.['SQ Cables'] || 0, color: 'text-rose-600' }
                    ].map(d => (
                      <div key={d.label} className="bg-white p-4 rounded-2xl text-center border border-blue-100 shadow-sm">
                        <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">{d.label}</p>
                        <p className={`text-sm font-black italic ${d.color}`}>৳{d.val.toLocaleString()}</p>
                      </div>
                    ))}
                 </div>
              </div>
            )}

            <div className="space-y-4">
               <label className="text-[12px] font-bold text-slate-400 uppercase ml-4 italic">২. পেমেন্ট কোম্পানি বাছাই</label>
               {canSwitchCompany ? (
                 <div className="grid grid-cols-3 gap-4">
                    {(['Transtec', 'SQ Light', 'SQ Cables'] as Company[]).map(co => (
                      <button key={co} onClick={() => setTargetCompany(co)} className={`py-6 rounded-[2rem] text-[10px] font-bold uppercase transition-all ${targetCompany === co ? 'bg-blue-600 text-white shadow-xl scale-[1.05]' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>{co}</button>
                    ))}
                 </div>
               ) : (
                 <div className="p-6 bg-blue-600/10 border border-blue-600/30 rounded-[2rem] flex items-center gap-4">
                    <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse shadow-[0_0_10px_#2563eb]"></div>
                    <span className="text-[13px] font-bold text-blue-700 uppercase tracking-widest">{targetCompany} Division Only</span>
                 </div>
               )}
            </div>

            <div className="space-y-4">
               <label className="text-[12px] font-bold text-slate-400 uppercase ml-4 italic text-center block mb-2">৩. কালেকশন অ্যামাউন্ট (৳)</label>
               <input type="number" className="w-full p-10 bg-slate-50 border-2 border-slate-100 rounded-[3.5rem] text-5xl font-bold italic text-black text-center outline-none shadow-inner" value={amount || ""} onChange={e => setAmount(e.target.value === "" ? "" : Number(e.target.value))} placeholder="0.00" />
            </div>

            <button disabled={isSaving || !selectedCust || !amount} onClick={async () => {
              setIsSaving(true);
              try {
                await supabase.from('collection_requests').insert([{ customer_id: selectedCust.id, amount: Number(amount), company: targetCompany, submitted_by: user.name, status: 'PENDING' }]);
                setAmount(""); setSelectedCust(null); fetchData();
                alert("কালেকশন রিকোয়েস্ট পাঠানো হয়েছে!");
              } catch (err: any) { alert(err.message); } finally { setIsSaving(false); }
            }} className="w-full bg-blue-600 text-white py-8 rounded-[3.5rem] font-bold uppercase text-sm tracking-[0.3em] shadow-xl active:scale-95 transition-all">কালেকশন পোস্টিং পাঠান ➔</button>
         </div>

         {/* 🔔 Approval Waiting List */}
         {isAdmin && (
           <div className="bg-slate-100/50 p-10 rounded-[4rem] border-2 border-dashed border-slate-200 space-y-8 min-h-[600px]">
              <div className="flex justify-between items-center px-4">
                <h4 className="text-[11px] font-bold uppercase italic tracking-widest text-slate-400 flex items-center gap-4">অ্যাপ্রুভাল ওয়েটিং লিস্ট</h4>
                <span className="bg-white px-5 py-2 rounded-full text-[10px] font-bold text-slate-500 border border-slate-200 shadow-sm">{pendingRequests.length}টি পেন্ডিং</span>
              </div>
              <div className="space-y-6 max-h-[850px] overflow-y-auto custom-scroll pr-3">
                 {pendingRequests.length === 0 ? (
                   <div className="py-20 text-center opacity-20 font-black uppercase italic tracking-[0.2em]">কোনো অপেক্ষমাণ ডাটা নেই</div>
                 ) : pendingRequests.map(req => (
                   <div key={req.id} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-lg group transition-all border-l-[12px] border-l-orange-500 hover:-translate-y-1">
                      <div className="flex justify-between items-start mb-6">
                         <div className="flex-1 min-w-0 pr-6">
                            <h5 className="font-bold text-black uppercase italic text-lg truncate leading-none">{req.customers?.name}</h5>
                            <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-3 py-1.5 rounded-xl uppercase italic mt-4 inline-block">{req.company}</span>
                         </div>
                         <p className="text-3xl font-bold italic text-black leading-none shrink-0 tracking-tighter">৳{Number(req.amount).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center justify-between pt-8 border-t border-slate-50">
                         <p className="text-[10px] font-bold text-slate-400 uppercase italic leading-none">কালেক্টর: {req.submitted_by}</p>
                         <div className="flex gap-3">
                            <button disabled={isSaving} onClick={() => handleApprove(req)} className="bg-blue-600 text-white px-10 py-4 rounded-2xl text-[11px] font-bold uppercase shadow-xl active:scale-95 transition-all hover:bg-emerald-600">Approve ✅</button>
                            <button onClick={async () => { if(confirm("ডিলিট করবেন?")) { await supabase.from('collection_requests').delete().eq('id', req.id); fetchData(); } }} className="text-red-600 hover:text-red-700 font-bold text-2xl px-4 transition-colors">×</button>
                         </div>
                      </div>
                   </div>
                 ))}
              </div>
           </div>
         )}
      </div>
    </div>
  );
};

export default Collections;
