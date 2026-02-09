
import React, { useState, useEffect, useMemo } from 'react';
import { Company, User, formatCurrency } from '../types';
// Fixed error: Removed unused 'db' from import
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
    // Fix: Renamed sqCables to sqCareport
    sqCareport: 0,
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
        
        // Fix: Changed 'SQ Cables' to 'SQ careport'
        if (!dues[cid]) dues[cid] = { 'Transtec': 0, 'SQ Light': 0, 'SQ careport': 0 };
        if (dues[cid][txCo] !== undefined) {
           dues[cid][txCo] += (tx.payment_type === 'COLLECTION' ? -amt : amt);
        }
      });

      // Fix: Changed t_sqcables to t_sqcareport
      let t_total = 0, t_transtec = 0, t_sqlight = 0, t_sqcareport = 0;
      todayTxRes.data?.forEach(tx => {
        const amt = Number(tx.amount) || 0;
        const txCo = mapToDbCompany(tx.company);
        t_total += amt;
        if (txCo === 'Transtec') t_transtec += amt;
        if (txCo === 'SQ Light') t_sqlight += amt;
        // Fix: Changed check to 'SQ careport'
        if (txCo === 'SQ careport') t_sqcareport += amt;
      });

      const p_total = pendRes.data?.reduce((acc, r) => acc + (Number(r.amount) || 0), 0) || 0;

      setTodayStats({ 
        total: t_total, 
        transtec: t_transtec, 
        sqLight: t_sqlight, 
        // Fix: Changed property to sqCareport
        sqCareport: t_sqcareport,
        pendingTotal: p_total
      });

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
      
      const currentBalance = (allCompanyDues[req.customer_id]?.[req.company] || 0) - Number(req.amount);
      const smsMsg = `IFZA Electronics: ${req.customers?.name}, আপনার ${Number(req.amount).toLocaleString()} টাকা পেমেন্ট গৃহীত হয়েছে। বর্তমান বকেয়া: ${Math.round(currentBalance).toLocaleString()} টাকা। ধন্যবাদ।`;
      await sendSMS(req.customers?.phone, smsMsg, req.customer_id);

      alert("কালেকশন এপ্রুভ হয়েছে এবং কাস্টমারকে এসএমএস পাঠানো হয়েছে!");
      await fetchData();
    } catch (err: any) { alert(err.message); } finally { setIsSaving(false); }
  };

  const filteredCustomers = useMemo(() => {
    const q = search.toLowerCase().trim();
    return customers.filter(c => (!q || c.name.toLowerCase().includes(q)) && (!selectedRoute || c.address?.trim() === selectedRoute));
  }, [customers, search, selectedRoute]);

  return (
    <div className="space-y-8 pb-24 font-sans text-slate-900 animate-reveal">
      
      {/* Today's Total Collection Summary */}
      <div className="bg-slate-950 p-10 md:p-14 rounded-[4rem] shadow-2xl border border-white/5 no-print relative overflow-hidden group">
         <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[100px] rounded-full"></div>
         
         <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-10">
            <div className="text-center md:text-left">
               <h3 className="text-[11px] font-black uppercase italic tracking-[0.4em] text-emerald-500 mb-4">আজকের মোট আদায় (Total Cash In)</h3>
               <p className="text-5xl md:text-8xl font-black italic tracking-tighter text-white animate-in slide-in-from-bottom-2 duration-700">
                  {todayStats.total.toLocaleString()}<span className="text-2xl text-emerald-500 ml-2">৳</span>
               </p>
               <p className="text-[10px] font-bold text-slate-500 uppercase mt-4 tracking-widest italic">সম্মিলিত ব্র্যান্ড ট্র্যাকার</p>
            </div>
            
            <div className="grid grid-cols-3 gap-3 w-full md:w-auto">
               {[
                 { label: 'Transtec', val: todayStats.transtec, color: 'text-amber-500', bg: 'bg-amber-500/10' },
                 { label: 'SQ Light', val: todayStats.sqLight, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
                 // Fix: Changed label to 'SQ careport' and value reference to sqCareport
                 { label: 'SQ careport', val: todayStats.sqCareport, color: 'text-rose-500', bg: 'bg-rose-500/10' }
               ].map(co => (
                 <div key={co.label} className={`${co.bg} p-6 rounded-[2.5rem] border border-white/5 min-w-[130px] text-center`}>
                    <p className="text-[8px] font-black text-slate-500 uppercase mb-2">{co.label}</p>
                    <p className={`text-sm font-black italic ${co.color}`}>{co.val.toLocaleString()}৳</p>
                 </div>
               ))}
            </div>
         </div>
         
         {todayStats.pendingTotal > 0 && (
           <div className="mt-8 pt-8 border-t border-white/5 flex items-center justify-center md:justify-start gap-4">
              <div className="w-2 h-2 bg-orange-500 rounded-full animate-ping"></div>
              <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest italic">অপেক্ষমাণ কালেকশন (Pending): {todayStats.pendingTotal.toLocaleString()}৳</p>
           </div>
         )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
         <div className="bg-white p-10 md:p-14 rounded-[4rem] border shadow-2xl space-y-10">
            <div className="flex items-center gap-6">
               <div className="w-16 h-16 bg-[#0d1222] rounded-3xl flex items-center justify-center text-white text-3xl shadow-xl italic font-black transition-transform hover:rotate-3">C</div>
               <div>
                  <h3 className="text-3xl font-black uppercase italic leading-none text-slate-800">কালেকশন এন্ট্রি</h3>
                  <p className="text-[10px] text-slate-400 font-black uppercase mt-2 tracking-[0.3em]">{user.name} | {targetCompany} ডিভিশন</p>
               </div>
            </div>

            <div className="space-y-4">
               <label className="text-[12px] font-black text-slate-400 uppercase ml-4 italic">১. কাস্টমার বাছাই করুন</label>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <select className="p-6 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] font-black text-[11px] uppercase outline-none" value={selectedRoute} onChange={e => setSelectedRoute(e.target.value)}>
                    <option value="">সকল এরিয়া</option>
                    {uniqueRoutes.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <div className="relative">
                    <div onClick={() => setShowCustList(!showCustList)} className="p-6 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] cursor-pointer flex justify-between items-center shadow-sm">
                       <span className={selectedCust ? "font-black text-slate-800 uppercase italic text-xs truncate" : "text-slate-300 italic text-xs"}>{selectedCust ? selectedCust.name : "দোকান সিলেক্ট করুন..."}</span>
                       <span className="opacity-40 text-xs">▼</span>
                    </div>
                    {showCustList && (
                      <div className="absolute z-[600] w-full mt-3 bg-white border-2 border-slate-100 rounded-[3rem] shadow-2xl max-h-80 overflow-hidden flex flex-col p-5 animate-in zoom-in-95">
                         <input autoFocus placeholder="খুঁজুন..." className="w-full p-4 border-b outline-none font-black text-xs uppercase mb-3" value={search} onChange={e => setSearch(e.target.value)} />
                         <div className="overflow-y-auto flex-1 custom-scroll space-y-1">
                           {filteredCustomers.map(c => (
                             <div key={c.id} onClick={() => { setSelectedCust(c); setShowCustList(false); }} className="p-4 hover:bg-blue-600 hover:text-white rounded-2xl cursor-pointer border-b border-slate-50 flex justify-between items-center transition-all group/item">
                                <div className="min-w-0 pr-4"><p className="font-black text-[11px] uppercase truncate">{c.name}</p></div>
                                <div className="text-right shrink-0">
                                   <p className="text-[10px] font-black italic">৳{(allCompanyDues[c.id]?.[targetCompany] || 0).toLocaleString()}</p>
                                </div>
                             </div>
                           ))}
                         </div>
                      </div>
                    )}
                  </div>
               </div>
            </div>

            <div className="space-y-4">
               <label className="text-[12px] font-black text-slate-400 uppercase ml-4 italic">২. কোম্পানি বাছাই</label>
               {canSwitchCompany ? (
                 <div className="grid grid-cols-3 gap-4">
                    {/* Fix: Changed 'SQ Cables' to 'SQ careport' */}
                    {(['Transtec', 'SQ Light', 'SQ careport'] as Company[]).map(co => (
                      <button key={co} onClick={() => setTargetCompany(co)} className={`py-6 rounded-[2rem] text-[10px] font-black uppercase transition-all ${targetCompany === co ? 'bg-blue-600 text-white shadow-xl scale-[1.05]' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>{co}</button>
                    ))}
                 </div>
               ) : (
                 <div className="p-6 bg-blue-600/10 border border-blue-600/30 rounded-[2rem] flex items-center gap-4">
                    <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse shadow-[0_0_10px_#2563eb]"></div>
                    <span className="text-[13px] font-black text-blue-700 uppercase tracking-widest">{targetCompany} Division Only</span>
                 </div>
               )}
            </div>

            <div className="space-y-4">
               <label className="text-[12px] font-black text-slate-400 uppercase ml-4 italic">৩. কালেকশন অ্যামাউন্ট (৳)</label>
               <input type="number" className="w-full p-10 bg-slate-50 border-2 border-slate-100 rounded-[3.5rem] text-5xl font-black italic text-slate-800 text-center outline-none shadow-inner" value={amount || ""} onChange={e => setAmount(e.target.value === "" ? "" : Number(e.target.value))} placeholder="0.00" />
            </div>

            <button disabled={isSaving || !selectedCust || !amount} onClick={async () => {
              setIsSaving(true);
              try {
                await supabase.from('collection_requests').insert([{ 
                    customer_id: selectedCust.id, 
                    amount: Number(amount), 
                    company: targetCompany, 
                    submitted_by: user.name, 
                    status: 'PENDING' 
                }]);
                setAmount(""); setSelectedCust(null); fetchData();
                alert("কালেকশন রিকোয়েস্ট পাঠানো হয়েছে!");
              } catch (err: any) { alert(err.message); } finally { setIsSaving(false); }
            }} className="w-full bg-[#2563eb] text-white py-8 rounded-[3.5rem] font-black uppercase text-sm tracking-[0.3em] shadow-xl active:scale-95 transition-all">কালেকশন পোস্টিং পাঠান ➔</button>
         </div>

         {isAdmin && (
           <div className="bg-slate-100/50 p-10 rounded-[4rem] border-2 border-dashed border-slate-200 space-y-8">
              <div className="flex justify-between items-center px-4">
                <h4 className="text-[11px] font-black uppercase italic tracking-widest text-slate-400 flex items-center gap-4">অ্যাপ্রুভাল ওয়েটিং লিস্ট</h4>
                <span className="bg-white px-5 py-2 rounded-full text-[10px] font-black text-slate-500 border border-slate-200 shadow-sm">{pendingRequests.length}টি পেন্ডিং</span>
              </div>
              <div className="space-y-6 max-h-[850px] overflow-y-auto custom-scroll pr-3">
                 {pendingRequests.map(req => (
                   <div key={req.id} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-lg group transition-all border-l-[12px] border-l-blue-600 hover:-translate-y-1">
                      <div className="flex justify-between items-start mb-6">
                         <div className="flex-1 min-w-0 pr-6">
                            <h5 className="font-black text-slate-800 uppercase italic text-lg truncate leading-none">{req.customers?.name}</h5>
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-xl uppercase italic mt-4 inline-block">{req.company}</span>
                         </div>
                         <p className="text-3xl font-black italic text-slate-900 leading-none shrink-0 tracking-tighter">৳{Number(req.amount).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center justify-between pt-8 border-t border-slate-50">
                         <p className="text-[10px] font-black text-slate-400 uppercase italic leading-none">কালেক্টর: {req.submitted_by}</p>
                         <div className="flex gap-3">
                            <button disabled={isSaving} onClick={() => handleApprove(req)} className="bg-slate-900 text-white px-10 py-4 rounded-2xl text-[11px] font-black uppercase shadow-xl active:scale-95 transition-all hover:bg-emerald-600">Approve ✅</button>
                            <button onClick={async () => { if(confirm("ডিলিট করবেন?")) { await supabase.from('collection_requests').delete().eq('id', req.id); fetchData(); } }} className="text-red-400 hover:text-red-600 font-black text-2xl px-4 transition-colors">×</button>
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
