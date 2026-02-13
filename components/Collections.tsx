
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
  
  // Entry Form State
  const [selectedArea, setSelectedArea] = useState("");
  const [selectedCust, setSelectedCust] = useState<any>(null);
  const [targetCompany, setTargetCompany] = useState<Company>('SQ Cables');
  const [amount, setAmount] = useState<string>("");
  const [deliveryExpense, setDeliveryExpense] = useState<string>("");

  // Stats for the selected customer
  const [custBalances, setCustBalances] = useState({
    transtec: 0,
    sqLight: 0,
    sqCables: 0
  });

  // Global Stats
  const [globalStats, setGlobalStats] = useState({
    todayTotal: 0,
    transtec: 0,
    sqLight: 0,
    sqCables: 0,
    pendingTotal: 0
  });

  const isAdmin = user.role === 'ADMIN';

  useEffect(() => {
    fetchData();
  }, []);

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
      setPendingRequests(reqRes.data || []);
      
      const confirmed = (txRes.data || []).filter(tx => tx.payment_type === 'COLLECTION');
      setConfirmedToday(confirmed);

      let t_tot = 0, t_tr = 0, t_sl = 0, t_sc = 0;
      txRes.data?.forEach(tx => {
        const amt = Number(tx.amount) || 0;
        const co = mapToDbCompany(tx.company);
        
        if (tx.payment_type === 'COLLECTION') {
          t_tot += amt;
          if (co === 'Transtec') t_tr += amt;
          if (co === 'SQ Light') t_sl += amt;
          if (co === 'SQ Cables') t_sc += amt;
        } else if (tx.payment_type === 'EXPENSE' && tx.meta?.type === 'DELIVERY') {
          t_tot -= amt;
          if (co === 'Transtec') t_tr -= amt;
          if (co === 'SQ Light') t_sl -= amt;
          if (co === 'SQ Cables') t_sc -= amt;
        }
      });

      setGlobalStats({
        todayTotal: t_tot,
        transtec: t_tr,
        sqLight: t_sl,
        sqCables: t_sc,
        pendingTotal: (reqRes.data || []).reduce((sum: number, r: any) => sum + Number(r.amount), 0)
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
        if (dbCo === 'SQ Light') t_sl += factor;
        if (dbCo === 'SQ Cables') t_sc += factor;
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
      alert("কালেকশন রিকোয়েস্ট সাবমিট হয়েছে!");
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

      // 🔔 Trigger Notification to Customer
      await supabase.from('notifications').insert([{
        customer_id: req.customer_id,
        title: `কালেকশন জমা রিসিট #${txIdShort}`,
        message: `আপনার প্রদানকৃত ৳${Number(req.amount).toLocaleString()} জমা হিসেবে গ্রহণ করা হয়েছে। (${req.company}) রিসিট আইডি: #${txIdShort}`,
        type: 'PAYMENT'
      }]);

      const expAmt = Number(req.meta?.delivery_expense || 0);
      if (expAmt > 0) {
        await supabase.from('transactions').insert([{
          customer_id: req.customer_id,
          company: req.company,
          amount: expAmt,
          payment_type: 'EXPENSE',
          items: [{ note: `ডেলিভারি/যাতায়াত খরচ` }],
          submitted_by: req.submitted_by,
          meta: { type: 'DELIVERY' }
        }]);
      }

      await supabase.from('collection_requests').delete().eq('id', req.id);
      fetchData();
      if (selectedCust?.id === req.customer_id) fetchCustomerBalances(req.customer_id);
    } catch (err: any) { 
      alert(err.message); 
    } finally { 
      setIsSaving(false); 
    }
  };

  const handleDeleteConfirmed = async (tx: any) => {
    if (!isAdmin || !confirm("আপনি কি নিশ্চিত এই আদায়টি চিরতরে মুছে ফেলতে চান? এটি কাস্টমার ইনবক্স থেকেও মুছে যাবে।")) return;
    try {
      const txIdShort = String(tx.id).slice(-6).toUpperCase();

      // 1. 🔔 Delete associated notification from customer inbox
      await supabase
        .from('notifications')
        .delete()
        .eq('customer_id', tx.customer_id)
        .ilike('message', `%#${txIdShort}%`);

      // 2. Delete transaction
      const { error } = await supabase.from('transactions').delete().eq('id', tx.id);
      if (error) throw error;
      
      alert("আদায়ের এন্ট্রি এবং সংশ্লিষ্ট নোটিফিকেশন মুছে ফেলা হয়েছে!");
      fetchData();
    } catch (err: any) { alert(err.message); }
  };

  const uniqueAreas = useMemo(() => Array.from(new Set(customers.map(c => c.address?.trim()).filter(Boolean))).sort(), [customers]);
  const filteredCustomers = customers.filter(c => !selectedArea || c.address === selectedArea);

  const currentSelectedBalance = useMemo(() => {
    if (targetCompany === 'Transtec') return custBalances.transtec;
    if (targetCompany === 'SQ Light') return custBalances.sqLight;
    return custBalances.sqCables;
  }, [targetCompany, custBalances]);

  return (
    <div className="space-y-10 pb-40 animate-reveal text-slate-800 font-sans">
      
      {/* 📊 Top Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
         <div className="bg-white p-5 rounded-[1.8rem] border border-slate-100 shadow-sm text-center">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">আজকের নিট আদায়</p>
            <p className="text-xl font-black text-slate-900 leading-none italic">{globalStats.todayTotal.toLocaleString()} ৳</p>
         </div>
         <div className="bg-white p-5 rounded-[1.8rem] border border-slate-100 shadow-sm text-center">
            <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-1 italic">TRANSTEC</p>
            <p className="text-xl font-black text-amber-600 leading-none italic">{globalStats.transtec.toLocaleString()} ৳</p>
         </div>
         <div className="bg-white p-5 rounded-[1.8rem] border border-slate-100 shadow-sm text-center">
            <p className="text-[9px] font-black text-cyan-500 uppercase tracking-widest mb-1 italic">SQ LIGHT</p>
            <p className="text-xl font-black text-cyan-600 leading-none italic">{globalStats.sqLight.toLocaleString()} ৳</p>
         </div>
         <div className="bg-white p-5 rounded-[1.8rem] border border-slate-100 shadow-sm text-center">
            <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-1 italic">SQ CABLES</p>
            <p className="text-xl font-black text-rose-600 leading-none italic">{globalStats.sqCables.toLocaleString()} ৳</p>
         </div>
         <div className="bg-white p-5 rounded-[1.8rem] border border-slate-100 shadow-sm text-center col-span-2 md:col-span-1">
            <p className="text-[9px] font-black text-orange-400 uppercase tracking-widest mb-1 italic">পেন্ডিং রিকোয়েস্ট</p>
            <p className="text-xl font-black text-orange-600 leading-none italic">{globalStats.pendingTotal.toLocaleString()} ৳</p>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
         {/* 📝 Entry Form */}
         <div className="bg-white p-8 md:p-12 rounded-[3.5rem] border border-slate-100 shadow-2xl space-y-10">
            <div className="flex items-center gap-5">
               <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white text-lg font-black shadow-lg">C</div>
               <h3 className="text-2xl font-black text-slate-900 italic tracking-tight uppercase">কালেকশন এন্ট্রি</h3>
            </div>
            <div className="space-y-5">
               <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[1.8rem] outline-none font-bold appearance-none shadow-sm" value={selectedArea} onChange={e => { setSelectedArea(e.target.value); setSelectedCust(null); }}>
                  <option value="">সকল এরিয়া</option>
                  {uniqueAreas.map(a => <option key={String(a)} value={String(a)}>{a}</option>)}
               </select>
               <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[1.8rem] outline-none font-bold appearance-none shadow-sm" value={selectedCust?.id || ""} onChange={e => setSelectedCust(customers.find(c => c.id === e.target.value))}>
                  <option value="">দোকান বাছাই করুন...</option>
                  {filteredCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
               </select>
               <div className="bg-blue-50/50 p-6 rounded-[2.5rem] border border-blue-100/50">
                  <div className="bg-white p-6 rounded-2xl shadow-md text-center">
                     <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] mb-2 italic">{targetCompany.toUpperCase()} DUE</p>
                     <p className={`text-2xl font-black italic ${currentSelectedBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>৳{Math.round(currentSelectedBalance).toLocaleString()}</p>
                  </div>
               </div>
               <div className="flex gap-2">
                  {['Transtec', 'SQ Light', 'SQ Cables'].map(co => (
                    <button key={co} onClick={() => setTargetCompany(co as Company)} className={`flex-1 py-4 rounded-2xl font-black uppercase text-[9px] transition-all ${targetCompany === co ? 'bg-blue-600 text-white shadow-xl scale-105' : 'bg-slate-50 text-slate-400'}`}>{co}</button>
                  ))}
               </div>
               <div className="grid grid-cols-3 gap-4 pt-4">
                  <div className="col-span-2"><input type="number" className="w-full p-6 bg-slate-50 border rounded-3xl text-center text-4xl font-black italic" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} /></div>
                  <div><input type="number" className="w-full p-6 bg-orange-50 border border-orange-100 rounded-3xl text-center text-xl font-black italic text-orange-600" placeholder="Exp" value={deliveryExpense} onChange={e => setDeliveryExpense(e.target.value)} /></div>
               </div>
               <button disabled={isSaving || !amount || !selectedCust} onClick={handleManualSubmit} className="w-full bg-[#0f172a] text-white py-8 rounded-[2.2rem] font-black uppercase text-xs tracking-widest shadow-2xl active:scale-95 transition-all disabled:opacity-50">কালেকশন সাবমিট ➔</button>
            </div>
         </div>

         {/* ⏳ Pending & Recent History */}
         <div className="space-y-10">
            {/* Pending Approvals */}
            <div className="space-y-4">
               <p className="text-[11px] font-black text-slate-400 uppercase italic tracking-widest ml-4">{pendingRequests.length} টি অপেক্ষমাণ অনুমোদন</p>
               <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scroll pr-2">
                  {pendingRequests.map(req => (
                    <div key={req.id} className="bg-white p-6 rounded-[2.5rem] border shadow-md flex justify-between items-center animate-reveal group">
                       <div className="flex-1">
                          <h4 className="font-black text-slate-800 uppercase italic">{req.customers?.name}</h4>
                          <span className="text-[8px] font-black text-slate-400 uppercase">{req.company} • By {req.submitted_by}</span>
                       </div>
                       <div className="text-right flex items-center gap-4">
                          <p className="text-xl font-black italic">৳{Number(req.amount).toLocaleString()}</p>
                          {isAdmin && <button onClick={() => handleApprove(req)} className="bg-emerald-600 text-white px-5 py-2 rounded-xl font-black text-[9px] uppercase shadow-lg">APPROVE</button>}
                          <button onClick={async () => { if(confirm("ডিলিট?")) { await supabase.from('collection_requests').delete().eq('id', req.id); fetchData(); } }} className="text-red-300 hover:text-red-600 text-xl font-black px-2">×</button>
                       </div>
                    </div>
                  ))}
               </div>
            </div>

            {/* Today's Confirmed Transactions */}
            <div className="space-y-4 pt-4 border-t border-slate-200">
               <p className="text-[11px] font-black text-emerald-600 uppercase italic tracking-widest ml-4">আজকের সম্পন্ন আদায় (Confirmed)</p>
               <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scroll pr-2">
                  {confirmedToday.length === 0 ? (
                    <div className="py-20 text-center opacity-10 font-black uppercase text-xs italic">আজকে কোনো কালেকশন হয়নি</div>
                  ) : confirmedToday.map(tx => (
                    <div key={tx.id} className="bg-emerald-50/50 p-5 rounded-[2rem] border border-emerald-100 flex justify-between items-center group transition-all">
                       <div className="flex-1">
                          <h4 className="font-black text-slate-700 uppercase text-xs truncate italic">{tx.customers?.name}</h4>
                          <p className="text-[8px] font-bold text-slate-400 uppercase">{tx.company} • {new Date(tx.created_at).toLocaleTimeString('bn-BD', {hour:'2-digit', minute:'2-digit'})}</p>
                       </div>
                       <div className="flex items-center gap-4">
                          <p className="text-lg font-black italic text-emerald-700">৳{Number(tx.amount).toLocaleString()}</p>
                          {isAdmin && (
                            <button onClick={() => handleDeleteConfirmed(tx)} className="w-8 h-8 bg-white text-red-500 rounded-lg flex items-center justify-center border shadow-sm hover:bg-red-500 hover:text-white transition-all">🗑️</button>
                          )}
                       </div>
                    </div>
                  ))}
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};

export default Collections;
