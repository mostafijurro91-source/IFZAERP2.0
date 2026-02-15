
import React, { useState, useEffect, useMemo } from 'react';
import { Company, User, formatCurrency } from '../types';
import { supabase, mapToDbCompany, db } from '../lib/supabase';

interface CollectionsProps {
  company: Company;
  user: User;
}

const Collections: React.FC<CollectionsProps> = ({ company, user }) => {
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [confirmedToday, setConfirmedToday] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [selectedArea, setSelectedArea] = useState("");
  const [selectedCust, setSelectedCust] = useState<any>(null);
  const [targetCompany, setTargetCompany] = useState<Company>(user.role === 'STAFF' ? user.company : 'SQ Cables');
  const [amount, setAmount] = useState<string>("");
  const [deliveryExpense, setDeliveryExpense] = useState<string>("");

  const [custBalances, setCustBalances] = useState({
    transtec: 0,
    sqLight: 0,
    sqCables: 0
  });

  const [globalStats, setGlobalStats] = useState({
    todayTotal: 0,
    transtec: 0,
    sqLight: 0,
    sqCables: 0,
    pendingTotal: 0
  });

  const isAdmin = user.role === 'ADMIN';
  const isStaff = user.role === 'STAFF';

  useEffect(() => {
    fetchData();
  }, [user.company]);

  useEffect(() => {
    if (selectedCust) {
      fetchCustomerBalances(selectedCust.id);
    } else {
      setCustBalances({ transtec: 0, sqLight: 0, sqCables: 0 });
    }
  }, [selectedCust]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const dbUserCompany = mapToDbCompany(user.company);

      const [custRes, reqRes, txRes] = await Promise.all([
        db.getCustomers(),
        supabase.from('collection_requests')
          .select('*, customers(name, address, phone)')
          .eq('status', 'PENDING')
          .order('created_at', { ascending: false }),
        supabase.from('transactions')
          .select('*, customers(name)')
          .gte('created_at', today + 'T00:00:00Z')
          .order('created_at', { ascending: false })
      ]);

      setCustomers(custRes || []);
      
      let filteredRequests = reqRes.data || [];
      if (isStaff) {
        filteredRequests = filteredRequests.filter(r => r.company === dbUserCompany);
      }
      setPendingRequests(filteredRequests);
      
      let confirmed = (txRes.data || []).filter(tx => tx.payment_type === 'COLLECTION');
      if (isStaff) {
        confirmed = confirmed.filter(tx => tx.company === dbUserCompany);
      }
      setConfirmedToday(confirmed);

      let t_tot = 0, t_tr = 0, t_sl = 0, t_sc = 0;
      txRes.data?.forEach(tx => {
        const amt = Number(tx.amount) || 0;
        const co = mapToDbCompany(tx.company);
        
        if (tx.payment_type === 'COLLECTION') {
          if (co === 'Transtec') t_tr += amt;
          else if (co === 'SQ Light') t_sl += amt;
          else if (co === 'SQ Cables') t_sc += amt;
        } else if (tx.payment_type === 'EXPENSE' && tx.meta?.type === 'DELIVERY') {
          if (co === 'Transtec') t_tr -= amt;
          else if (co === 'SQ Light') t_sl -= amt;
          else if (co === 'SQ Cables') t_sc -= amt;
        }
      });

      setGlobalStats({
        todayTotal: t_tr + t_sl + t_sc,
        transtec: t_tr,
        sqLight: t_sl,
        sqCables: t_sc,
        pendingTotal: filteredRequests.reduce((sum: number, r: any) => sum + Number(r.amount), 0)
      });
    } finally { setLoading(false); }
  };

  const fetchCustomerBalances = async (customerId: string) => {
    try {
      const { data: txs } = await supabase
        .from('transactions')
        .select('amount, company, payment_type')
        .eq('customer_id', customerId);

      let t_tr = 0, t_sl = 0, t_sc = 0;
      txs?.forEach(tx => {
        const amt = Number(tx.amount);
        const dbCo = mapToDbCompany(tx.company);
        const factor = tx.payment_type === 'COLLECTION' ? -amt : amt;

        if (dbCo === 'Transtec') t_tr += factor;
        else if (dbCo === 'SQ Light') t_sl += factor;
        else if (dbCo === 'SQ Cables') t_sc += factor;
      });

      setCustBalances({ transtec: t_tr, sqLight: t_sl, sqCables: t_sc });
    } catch (err) {}
  };

  const handleManualSubmit = async () => {
    if (!selectedCust || !amount || Number(amount) <= 0) return alert("দোকান এবং সঠিক অ্যামাউন্ট দিন!");
    setIsSaving(true);
    try {
      const { error } = await supabase.from('collection_requests').insert([{
        customer_id: selectedCust.id,
        company: mapToDbCompany(targetCompany),
        amount: Number(amount),
        submitted_by: user.name,
        status: 'PENDING',
        meta: { delivery_expense: Number(deliveryExpense) || 0 }
      }]);
      if (error) throw error;
      setAmount("");
      setDeliveryExpense("");
      alert("কালেকশন রিকোয়েস্ট পাঠানো হয়েছে! ✅");
      fetchData();
    } catch (err: any) { alert(err.message); } finally { setIsSaving(false); }
  };

  const handleApprove = async (req: any) => {
    if (!isAdmin || isSaving) return;
    setIsSaving(true);
    try {
      const { data: txData, error: txErr } = await supabase.from('transactions').insert([{
        customer_id: req.customer_id, 
        company: req.company, 
        amount: Number(req.amount),
        payment_type: 'COLLECTION', 
        items: [{ note: `নগদ আদায় অনুমোদন (${req.submitted_by} দ্বারা সংগৃহীত)` }], 
        submitted_by: user.name
      }]).select().single();
      if (txErr) throw txErr;

      const txIdShort = String(txData.id).slice(-6).toUpperCase();

      await supabase.from('notifications').insert([{
        customer_id: req.customer_id,
        title: `কালেকশন জমা রিসিট #${txIdShort}`,
        message: `আপনার প্রদানকৃত ৳${Number(req.amount).toLocaleString()} জমা হিসেবে গ্রহণ করা হয়েছে। (${req.company})`,
        type: 'PAYMENT'
      }]);

      const expAmt = Number(req.meta?.delivery_expense || 0);
      if (expAmt > 0) {
        await supabase.from('transactions').insert([{
          customer_id: req.customer_id,
          company: req.company,
          amount: expAmt,
          payment_type: 'EXPENSE',
          items: [{ note: `ডেলিভারি খরচ` }],
          submitted_by: req.submitted_by,
          meta: { type: 'DELIVERY' }
        }]);
      }

      await supabase.from('collection_requests').delete().eq('id', req.id);
      fetchData();
    } catch (err: any) { alert(err.message); } finally { setIsSaving(false); }
  };

  const safeFormat = (val: any) => Number(val || 0).toLocaleString();

  const getCompanyTodayStat = () => {
    const dbCo = mapToDbCompany(user.company);
    if (dbCo === 'Transtec') return globalStats.transtec;
    if (dbCo === 'SQ Light') return globalStats.sqLight;
    if (dbCo === 'SQ Cables') return globalStats.sqCables;
    return 0;
  };

  const currentSelectedBalance = useMemo(() => {
    const dbCo = mapToDbCompany(targetCompany);
    if (dbCo === 'Transtec') return custBalances.transtec;
    if (dbCo === 'SQ Light') return custBalances.sqLight;
    return custBalances.sqCables;
  }, [targetCompany, custBalances]);

  const uniqueAreas = useMemo(() => Array.from(new Set(customers.map(c => c.address?.trim()).filter(Boolean))).sort(), [customers]);
  const filteredCustomers = customers.filter(c => !selectedArea || c.address === selectedArea);

  return (
    <div className="space-y-6 pb-40 animate-reveal text-slate-900 font-sans">
      
      {/* 📊 Top Stats Hub */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-1">
         <div className="bg-slate-900 p-6 rounded-[2rem] text-white shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-16 h-16 bg-blue-600 opacity-20 rounded-bl-full"></div>
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1 italic relative z-10">
              {isStaff ? `${user.company.toUpperCase()} আজকের আদায়` : 'আজকের মোট আদায়'}
            </p>
            <p className="text-2xl font-black italic relative z-10">৳{safeFormat(isStaff ? getCompanyTodayStat() : globalStats.todayTotal)}</p>
         </div>
         {!isStaff && (
           <>
              <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                 <p className="text-[9px] font-black uppercase text-amber-500 tracking-widest mb-1 italic">Transtec</p>
                 <p className="text-xl font-black italic text-slate-800">৳{safeFormat(globalStats.transtec)}</p>
              </div>
              <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                 <p className="text-[9px] font-black uppercase text-cyan-500 tracking-widest mb-1 italic">SQ Light</p>
                 <p className="text-xl font-black italic text-slate-800">৳{safeFormat(globalStats.sqLight)}</p>
              </div>
           </>
         )}
         <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
            <p className="text-[9px] font-black uppercase text-orange-600 tracking-widest mb-1 italic">পেন্ডিং এন্ট্রি</p>
            <p className="text-xl font-black italic text-orange-600">৳{safeFormat(globalStats.pendingTotal)}</p>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 px-1">
         {/* 📝 Collection Entry Form */}
         <div className="bg-white p-8 md:p-12 rounded-[3.5rem] border border-slate-100 shadow-2xl space-y-10">
            <div className="flex items-center gap-5">
               <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-xl font-black italic shadow-xl">C</div>
               <div>
                  <h3 className="text-2xl font-black text-slate-900 italic tracking-tight uppercase leading-none">কালেকশন এন্ট্রি</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-2 tracking-widest">New Collection Receipt</p>
               </div>
            </div>
            
            <div className="space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[1.8rem] outline-none font-bold shadow-inner" value={selectedArea} onChange={e => { setSelectedArea(e.target.value); setSelectedCust(null); }}>
                     <option value="">সকল এরিয়া</option>
                     {uniqueAreas.map(a => <option key={String(a)} value={String(a)}>{a}</option>)}
                  </select>
                  <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[1.8rem] outline-none font-bold shadow-inner" value={selectedCust?.id || ""} onChange={e => setSelectedCust(customers.find(c => c.id === e.target.value))}>
                     <option value="">দোকান বাছাই করুন...</option>
                     {filteredCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
               </div>

               <div className="bg-blue-50/50 p-6 rounded-[2.5rem] border border-blue-100/50">
                  <div className="bg-white p-6 rounded-3xl shadow-sm text-center">
                     <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-2 italic">{targetCompany.toUpperCase()} ACTIVE DUE</p>
                     <p className={`text-4xl font-black italic tracking-tighter ${currentSelectedBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>৳{safeFormat(currentSelectedBalance)}</p>
                  </div>
               </div>

               <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
                  {['Transtec', 'SQ Light', 'SQ Cables'].map(co => (
                    <button 
                      key={co} 
                      disabled={isStaff && user.company !== co}
                      onClick={() => setTargetCompany(co as Company)} 
                      className={`flex-1 py-4 rounded-xl font-black uppercase text-[9px] transition-all ${targetCompany === co ? 'bg-white text-slate-900 shadow-md scale-[1.02]' : 'text-slate-400 opacity-60'} ${isStaff && user.company !== co ? 'hidden' : ''}`}
                    >
                      {co}
                    </button>
                  ))}
               </div>

               <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                  <div className="md:col-span-2">
                    <label className="text-[9px] font-black uppercase text-slate-400 ml-4 mb-2 block italic">কালেকশন অ্যামাউন্ট (টাকা)</label>
                    <input type="number" className="w-full p-8 bg-slate-900 border-none rounded-[2.5rem] text-center text-5xl font-black italic text-blue-400 shadow-2xl" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase text-slate-400 ml-4 mb-2 block italic">খরচ (যাতায়াত)</label>
                    <input type="number" className="w-full p-8 bg-orange-50 border border-orange-100 rounded-[2.5rem] text-center text-2xl font-black italic text-orange-600 shadow-inner" placeholder="Exp" value={deliveryExpense} onChange={e => setDeliveryExpense(e.target.value)} />
                  </div>
               </div>

               <button disabled={isSaving || !amount || !selectedCust} onClick={handleManualSubmit} className="w-full bg-blue-600 text-white py-8 rounded-[2.5rem] font-black uppercase text-xs tracking-[0.3em] shadow-xl active:scale-95 transition-all disabled:opacity-30">
                  {isSaving ? 'সংরক্ষণ হচ্ছে...' : 'কালেকশন সাবমিট করুন ➔'}
               </button>
            </div>
         </div>

         {/* ⏳ History & Pending Section */}
         <div className="space-y-8 flex flex-col h-full">
            {/* Pending Requests */}
            <div className="space-y-4">
               <h4 className="text-[11px] font-black text-slate-400 uppercase italic tracking-[0.2em] ml-4">১. অপেক্ষমাণ অনুমোদন ({pendingRequests.length})</h4>
               <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scroll pr-2">
                  {pendingRequests.map(req => (
                    <div key={req.id} className="bg-white p-6 rounded-[2.5rem] border shadow-sm flex justify-between items-center group animate-reveal">
                       <div className="min-w-0 pr-4">
                          <h4 className="font-black text-slate-800 uppercase italic truncate">{req.customers?.name}</h4>
                          <p className="text-[9px] font-black text-slate-400 uppercase mt-1">{req.company} • By {req.submitted_by}</p>
                       </div>
                       <div className="text-right flex items-center gap-4 shrink-0">
                          <p className="text-xl font-black italic text-slate-900 tracking-tighter">৳{safeFormat(req.amount)}</p>
                          {isAdmin && (
                            <button onClick={() => handleApprove(req)} className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-black text-[9px] uppercase shadow-lg active:scale-95 transition-all">APPROVE</button>
                          )}
                          {!isAdmin && req.submitted_by === user.name && (
                            <button onClick={async () => { if(confirm("ডিলিট?")) { await supabase.from('collection_requests').delete().eq('id', req.id); fetchData(); } }} className="text-rose-400 text-xl font-black px-2 hover:text-rose-600 transition-colors">✕</button>
                          )}
                       </div>
                    </div>
                  ))}
                  {pendingRequests.length === 0 && <div className="py-20 text-center bg-slate-50 rounded-[3rem] border border-dashed border-slate-200 text-slate-300 font-black uppercase text-[10px] italic">কোনো পেন্ডিং রিকোয়েস্ট নেই</div>}
               </div>
            </div>

            {/* Today's Confirmed */}
            <div className="space-y-4 flex-1">
               <h4 className="text-[11px] font-black text-emerald-600 uppercase italic tracking-[0.2em] ml-4">২. আজকের কনফার্মড আদায়</h4>
               <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scroll pr-2">
                  {confirmedToday.map(tx => (
                    <div key={tx.id} className="bg-emerald-50/50 p-6 rounded-[2.5rem] border border-emerald-100 flex justify-between items-center animate-reveal">
                       <div className="min-w-0 pr-4">
                          <h4 className="font-black text-slate-700 uppercase italic text-sm truncate">{tx.customers?.name}</h4>
                          <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">{tx.company} • {new Date(tx.created_at).toLocaleTimeString('bn-BD', {hour:'2-digit', minute:'2-digit'})}</p>
                       </div>
                       <p className="text-2xl font-black italic text-emerald-700 tracking-tighter shrink-0">৳{safeFormat(tx.amount)}</p>
                    </div>
                  ))}
                  {confirmedToday.length === 0 && <div className="py-20 text-center opacity-10 font-black uppercase text-xs italic">আজকে কোনো এন্ট্রি নেই</div>}
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};

export default Collections;
