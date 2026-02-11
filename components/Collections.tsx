
import React, { useState, useEffect, useMemo } from 'react';
import { Company, User, formatCurrency } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';
import { sendWhatsApp } from '../lib/sms'; // Import WhatsApp helper

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
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedRoute, setSelectedRoute] = useState<string>("");
  const [uniqueRoutes, setUniqueRoutes] = useState<string[]>([]);
  const [showCustList, setShowCustList] = useState(false);
  const [selectedCust, setSelectedCust] = useState<any>(null);
  const [amount, setAmount] = useState<number | "">("");
  const [targetCompany, setTargetCompany] = useState<Company>(company);

  const isAdmin = user.role.toUpperCase() === 'ADMIN';

  useEffect(() => {
    setTargetCompany(company);
    fetchData();
  }, [company]);

  const fetchData = async () => {
    try {
      setLoading(true);
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

      setTodayStats({ 
        total: t_total, 
        transtec: t_transtec, 
        sqLight: t_sqlight, 
        sqCables: t_sqcables, 
        pendingTotal: pendRes.data?.reduce((a, r) => a + (Number(r.amount) || 0), 0) || 0 
      });
      setCustomers(custRes.data || []);
      setAllCompanyDues(dues);
      setPendingRequests(pendRes.data || []);
      setUniqueRoutes(Array.from(new Set((custRes.data || []).map(c => c.address?.trim()).filter(Boolean))).sort() as string[]);
    } catch (err) {
      console.error(err);
    } finally { setLoading(false); }
  };

  const handleApprove = async (req: any) => {
    if (!isAdmin || processingId) return;
    setProcessingId(req.id);
    
    try {
      const dbCo = mapToDbCompany(req.company);
      const { error: txErr } = await supabase.from('transactions').insert([{
        customer_id: req.customer_id, 
        company: dbCo, 
        amount: Number(req.amount),
        payment_type: 'COLLECTION', 
        items: [{ note: `নগদ আদায় অনুমোদন: ${req.amount} টাকা` }], 
        submitted_by: req.submitted_by
      }]);

      if (txErr) throw txErr;

      const { error: delErr } = await supabase.from('collection_requests').delete().match({ id: req.id });

      if (delErr) {
         throw new Error("Error clearing request card.");
      }

      setPendingRequests(prev => prev.filter(r => r.id !== req.id));

      // WhatsApp Integration After Approval
      if (confirm("কালেকশন সফলভাবে এপ্রুভ হয়েছে! কাস্টমারকে WhatsApp-এ কনফার্মেশন মেসেজ পাঠাতে চান?")) {
        const dues = allCompanyDues[req.customer_id] || { 'Transtec': 0, 'SQ Light': 0, 'SQ Cables': 0 };
        const currentBalance = (dues[req.company] || 0) - Number(req.amount);
        const msg = `IFZA: ${req.customers?.name}, ৳${Number(req.amount).toLocaleString()} received successfully. Current balance (${req.company}): ৳${Math.round(currentBalance).toLocaleString()}. Thank you!`;
        sendWhatsApp(req.customers?.phone, msg);
      }

      fetchData(); 
    } catch (err: any) { 
      alert("ত্রুটি: " + err.message); 
    } finally { 
      setProcessingId(null); 
    }
  };

  const handleDeleteRequest = async (id: string) => {
    if (!isAdmin || processingId) return;
    if (!confirm("আপনি কি নিশ্চিত এই কার্ডটি ডিলিট করতে চান?")) return;
    
    setProcessingId(id);
    try {
      setPendingRequests(prev => prev.filter(r => r.id !== id));
      const { error } = await supabase.from('collection_requests').delete().match({ id: id });
      if (error) throw error;
      alert("সাফল্যের সাথে মুছে ফেলা হয়েছে।");
    } catch (err: any) {
      alert("এরর: " + err.message);
      fetchData();
    } finally {
      setProcessingId(null);
    }
  };

  const filteredCustomers = useMemo(() => {
    const q = search.toLowerCase().trim();
    return customers.filter(c => 
      (!q || c.name.toLowerCase().includes(q) || c.phone.includes(q)) && 
      (!selectedRoute || c.address?.trim() === selectedRoute)
    );
  }, [customers, search, selectedRoute]);

  return (
    <div className="space-y-6 pb-24 text-slate-900 animate-reveal">
      {/* Minimal Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
         {[
           { label: 'আজকের মোট', val: todayStats.total, color: 'text-slate-900', bg: 'bg-white' },
           { label: 'Transtec', val: todayStats.transtec, color: 'text-amber-600', bg: 'bg-white' },
           { label: 'SQ Light', val: todayStats.sqLight, color: 'text-cyan-600', bg: 'bg-white' },
           { label: 'SQ Cables', val: todayStats.sqCables, color: 'text-rose-600', bg: 'bg-white' },
           { label: 'পেন্ডিং রিকোয়েস্ট', val: todayStats.pendingTotal, color: 'text-orange-600', bg: 'bg-white' }
         ].map((s, i) => (
           <div key={i} className={`${s.bg} p-4 rounded-2xl border shadow-sm text-center`}>
              <p className="text-[8px] font-black uppercase text-slate-400 mb-1">{s.label}</p>
              <p className={`text-sm font-black italic ${s.color}`}>{s.val.toLocaleString()}৳</p>
           </div>
         ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
         {/* Entry Card */}
         <div className="bg-white p-8 md:p-10 rounded-[2.5rem] border shadow-sm space-y-8">
            <h3 className="text-lg font-black uppercase italic tracking-tighter flex items-center gap-3">
               <span className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center text-white text-xs">C</span>
               কালেকশন এন্ট্রি
            </h3>

            <div className="space-y-4">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <select className="p-4 bg-slate-50 border rounded-2xl font-bold text-[10px] uppercase outline-none" value={selectedRoute} onChange={e => { setSelectedRoute(e.target.value); setSelectedCust(null); }}>
                    <option value="">সকল এরিয়া</option>
                    {uniqueRoutes.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button onClick={() => setShowCustList(true)} className="p-4 bg-slate-50 border rounded-2xl text-[10px] font-bold uppercase text-left truncate italic text-slate-500">
                    {selectedCust ? selectedCust.name : "দোকান বাছাই করুন..."}
                  </button>
               </div>
            </div>

            {selectedCust && (
              <div className="bg-blue-50 p-4 rounded-2xl grid grid-cols-3 gap-2">
                 {['Transtec', 'SQ Light', 'SQ Cables'].map(co => (
                   <div key={co} className="bg-white p-3 rounded-xl border text-center">
                      <p className="text-[7px] font-black text-slate-400 uppercase mb-1">{co}</p>
                      <p className="text-[10px] font-black italic">৳{(allCompanyDues[selectedCust.id]?.[co] || 0).toLocaleString()}</p>
                   </div>
                 ))}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
               {(['Transtec', 'SQ Light', 'SQ Cables'] as Company[]).map(co => (
                  <button key={co} onClick={() => setTargetCompany(co)} className={`py-4 rounded-xl text-[9px] font-black uppercase transition-all ${targetCompany === co ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>{co}</button>
               ))}
            </div>

            <div className="space-y-2">
               <label className="text-[9px] font-black text-slate-400 uppercase ml-4 italic block">কালেকশন অ্যামাউন্ট (৳)</label>
               <input type="number" className="w-full p-8 bg-slate-50 border rounded-3xl text-4xl font-black italic text-center outline-none" value={amount || ""} onChange={e => setAmount(e.target.value === "" ? "" : Number(e.target.value))} placeholder="0.00" />
            </div>

            <button disabled={isSaving || !selectedCust || !amount} onClick={async () => {
              setIsSaving(true);
              try {
                const { error } = await supabase.from('collection_requests').insert([{ 
                    customer_id: selectedCust.id, 
                    amount: Number(amount), 
                    company: targetCompany, 
                    submitted_by: user.name, 
                    status: 'PENDING' 
                }]);
                if (error) throw error;
                setAmount(""); setSelectedCust(null); 
                await fetchData();
                alert("কালেকশন রিকোয়েস্ট পাঠানো হয়েছে!");
              } catch (err: any) { alert(err.message); } finally { setIsSaving(false); }
            }} className="w-full bg-slate-900 text-white py-6 rounded-3xl font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all">সাবমিট করুন ➔</button>
         </div>

         {/* Pending List Card */}
         {isAdmin && (
           <div className="bg-slate-100/50 p-8 rounded-[2.5rem] border-2 border-dashed space-y-6">
              <h4 className="text-[10px] font-black uppercase italic tracking-widest text-slate-400">{pendingRequests.length}টি অপেক্ষমাণ অনুমোদন</h4>
              <div className="space-y-3 max-h-[600px] overflow-y-auto custom-scroll pr-2">
                 {pendingRequests.length === 0 ? (
                   <div className="py-20 text-center opacity-10 font-black uppercase italic">No Pending Data</div>
                 ) : pendingRequests.map(req => (
                   <div key={req.id} className={`bg-white p-6 rounded-2xl border shadow-sm transition-all ${processingId === req.id ? 'opacity-30 pointer-events-none' : ''}`}>
                      <div className="flex justify-between items-start mb-4">
                         <div className="min-w-0 pr-4">
                            <h5 className="font-black text-slate-800 uppercase italic text-sm truncate">{req.customers?.name}</h5>
                            <span className="text-[8px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded uppercase mt-2 inline-block">{req.company}</span>
                         </div>
                         <p className="text-lg font-black italic tracking-tighter">৳{Number(req.amount).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                         <p className="text-[8px] font-bold text-slate-300 uppercase italic">কালেক্টর: {req.submitted_by}</p>
                         <div className="flex gap-2">
                            <button disabled={!!processingId} onClick={() => handleApprove(req)} className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-[9px] font-black uppercase shadow-lg hover:bg-emerald-600">APPROVE</button>
                            <button disabled={!!processingId} onClick={() => handleDeleteRequest(req.id)} className="text-red-500 hover:text-red-700 font-bold text-xl px-2">×</button>
                         </div>
                      </div>
                   </div>
                 ))}
              </div>
           </div>
         )}
      </div>

      {/* Customer Selector Modal */}
      {showCustList && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm" onClick={() => setShowCustList(false)}>
           <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col h-[60vh] animate-reveal" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b">
                 <input autoFocus placeholder="দোকান সার্চ করুন..." className="w-full p-4 bg-slate-50 border rounded-xl outline-none font-bold italic" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="overflow-y-auto flex-1 custom-scroll p-4 space-y-1">
                {filteredCustomers.map(c => (
                  <div key={c.id} onClick={() => { setSelectedCust(c); setShowCustList(false); }} className="p-4 hover:bg-blue-600 hover:text-white rounded-xl cursor-pointer transition-all">
                    <p className="font-bold text-xs uppercase">{c.name}</p>
                    <p className="text-[8px] opacity-60 uppercase mt-0.5">📍 {c.address}</p>
                  </div>
                ))}
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Collections;
