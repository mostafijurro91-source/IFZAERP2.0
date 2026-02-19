
import React, { useState, useEffect, useMemo } from 'react';
import { Company, UserRole, Product, formatCurrency } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';

interface LedgerProps {
  company: Company;
  role: UserRole;
}

const CompanyLedger: React.FC<LedgerProps> = ({ company, role }) => {
  const [ledgerData, setLedgerData] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'GENERAL' | 'BANK'>('GENERAL');
  
  // Modals
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showBankModal, setShowBankModal] = useState(false);
  
  const [bulkCart, setBulkCart] = useState<any[]>([]);
  const [searchProd, setSearchProd] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);

  const [paymentForm, setPaymentForm] = useState({ amount: '', type: 'PAYMENT', note: '', date: new Date().toISOString().split('T')[0] });
  
  // Bank Form
  const [bankForm, setBankForm] = useState({ 
    amount: '', 
    bank_name: '', 
    ref_no: '', 
    date: new Date().toISOString().split('T')[0],
    note: ''
  });

  const isAdmin = role === 'ADMIN';

  useEffect(() => {
    fetchData();
  }, [company]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const dbCo = mapToDbCompany(company);
      const [ledgerRes, prodRes] = await Promise.all([
        supabase.from('company_ledger').select('*').eq('company', dbCo).order('date', { ascending: false }),
        supabase.from('products').select('*').eq('company', dbCo).order('name')
      ]);
      setLedgerData(ledgerRes.data || []);
      setProducts(prodRes.data || []);
    } finally { setLoading(false); }
  };

  const stats = useMemo(() => {
    let pur = 0, pay = 0, exp = 0, bank = 0;
    ledgerData.forEach(d => {
      const amt = Number(d.amount) || 0;
      if (d.type === 'PURCHASE') pur += amt;
      else if (d.type === 'PAYMENT') pay += amt;
      else if (d.type === 'EXPENSE') exp += amt;
      else if (d.type === 'BANK_TRANSFER') bank += amt;
    });
    return { purchase: pur, paid: pay, expense: exp, bank_sent: bank, balance: pur - (pay + bank) };
  }, [ledgerData]);

  const filteredHistory = useMemo(() => {
    if (activeTab === 'BANK') return ledgerData.filter(d => d.type === 'BANK_TRANSFER');
    return ledgerData.filter(d => d.type !== 'BANK_TRANSFER');
  }, [ledgerData, activeTab]);

  const handleSaveBankDeposit = async () => {
    if (!bankForm.amount || !bankForm.bank_name || isSaving) return;
    setIsSaving(true);
    try {
      const note = `কোম্পানি ব্যাংক জমা: ${bankForm.bank_name} (Ref: ${bankForm.ref_no}) ${bankForm.note ? '- ' + bankForm.note : ''}`;
      const { error } = await supabase.from('company_ledger').insert([{
        company: mapToDbCompany(company),
        type: 'BANK_TRANSFER',
        amount: Number(bankForm.amount),
        note: note,
        date: bankForm.date,
        meta: { bank: bankForm.bank_name, ref: bankForm.ref_no }
      }]);
      if (error) throw error;
      alert("কোম্পানি ব্যাংক ডিপোজিট সফলভাবে রেকর্ড করা হয়েছে!");
      setShowBankModal(false);
      setBankForm({ amount: '', bank_name: '', ref_no: '', date: new Date().toISOString().split('T')[0], note: '' });
      fetchData();
    } catch (err: any) { alert(err.message); } finally { setIsSaving(false); }
  };

  const handleSaveBulkPurchase = async () => {
    if (bulkCart.length === 0 || isSaving) return;
    setIsSaving(true);
    try {
      const dbCo = mapToDbCompany(company);
      const total = bulkCart.reduce((sum, i) => sum + (i.qty * i.tp), 0);
      const note = "পারচেজ: " + bulkCart.map(i => `${i.qty}X ${i.name}`).join(", ");
      const { error: ledgerErr } = await supabase.from('company_ledger').insert([{
        company: dbCo, type: 'PURCHASE', amount: total, note: note, date: purchaseDate, items_json: bulkCart
      }]);
      if (ledgerErr) throw ledgerErr;
      for (const item of bulkCart) { await supabase.rpc('increment_stock', { row_id: item.id, amt: item.qty }); }
      alert("বাল্ক পারচেজ সফল!"); setShowBulkModal(false); setBulkCart([]); fetchData();
    } catch (err: any) { alert(err.message); } finally { setIsSaving(false); }
  };

  const handleSavePayment = async () => {
    if (!paymentForm.amount || isSaving) return;
    setIsSaving(true);
    try {
      await supabase.from('company_ledger').insert([{
        company: mapToDbCompany(company), type: paymentForm.type,
        amount: Number(paymentForm.amount), note: paymentForm.note || `${paymentForm.type} Entry`,
        date: paymentForm.date
      }]);
      setShowPaymentModal(false);
      setPaymentForm({ amount: '', type: 'PAYMENT', note: '', date: new Date().toISOString().split('T')[0] });
      fetchData();
    } finally { setIsSaving(false); }
  };

  return (
    <div className="space-y-6 pb-32 animate-reveal font-sans">
      
      {/* 💳 TOP STATS PANEL */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
           <p className="text-[10px] font-black uppercase text-slate-400 mb-2 italic">মোট পারচেজ</p>
           <p className="text-xl font-black italic text-slate-900">{formatCurrency(stats.purchase)}</p>
        </div>
        <div className="bg-emerald-50 p-6 rounded-[2.5rem] border border-emerald-100">
           <p className="text-[10px] font-black uppercase text-emerald-600 mb-2 italic">মোট পেমেন্ট (Cash)</p>
           <p className="text-xl font-black italic text-emerald-700">{formatCurrency(stats.paid)}</p>
        </div>
        <div className="bg-indigo-600 p-6 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden group">
           <div className="absolute -right-2 -bottom-2 text-6xl opacity-10 group-hover:scale-110 transition-transform">🏦</div>
           <p className="text-[10px] font-black uppercase text-indigo-100 mb-2 italic relative z-10">কোম্পানি ব্যাংক জমা</p>
           <p className="text-xl font-black italic tracking-tighter relative z-10">{formatCurrency(stats.bank_sent)}</p>
        </div>
        <div className="bg-orange-50 p-6 rounded-[2.5rem] border border-orange-100">
           <p className="text-[10px] font-black uppercase text-orange-600 mb-2 italic">অফিস খরচ</p>
           <p className="text-xl font-black italic text-orange-700">{formatCurrency(stats.expense)}</p>
        </div>
        <div className="bg-rose-50 p-6 rounded-[2.5rem] border border-rose-100">
           <p className="text-[10px] font-black uppercase text-rose-600 mb-2 italic">নিট বকেয়া</p>
           <p className="text-xl font-black italic text-rose-700">{formatCurrency(stats.balance)}</p>
        </div>
      </div>

      {/* 🚀 ACTION TERMINAL */}
      <div className="bg-slate-900 p-8 rounded-[3.5rem] shadow-2xl flex flex-col md:flex-row justify-between items-center gap-6 relative overflow-hidden">
         <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 blur-[100px] rounded-full"></div>
         <div className="flex items-center gap-6 relative z-10">
            <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center text-white text-3xl font-black italic shadow-xl">L</div>
            <div>
               <h3 className="text-white text-xl font-black uppercase italic tracking-tighter leading-none">কোম্পানি লেজার ও ব্যাংক পোর্টাল</h3>
               <p className="text-[10px] text-blue-400 font-black uppercase mt-2 tracking-widest">{company} Division Headquarters</p>
            </div>
         </div>
         <div className="flex gap-2 w-full md:w-auto relative z-10">
            <button onClick={() => setShowBankModal(true)} className="flex-1 md:flex-none bg-emerald-600 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase shadow-xl hover:bg-emerald-700 transition-all animate-pulse">🏦 ব্যাংক ডিপোজিট</button>
            <button onClick={() => setShowBulkModal(true)} className="flex-1 md:flex-none bg-blue-600 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase shadow-xl hover:bg-blue-700">📦 বাল্ক পারচেজ</button>
            <button onClick={() => setShowPaymentModal(true)} className="flex-1 md:flex-none bg-white text-slate-900 px-8 py-4 rounded-2xl text-[10px] font-black uppercase shadow-xl hover:bg-slate-100">💰 নগদ খরচ</button>
         </div>
      </div>

      {/* 📑 LEDGER TABS */}
      <div className="bg-white rounded-[4rem] border shadow-sm overflow-hidden flex flex-col min-h-[60vh]">
         <div className="flex bg-slate-50 p-2 gap-2 shrink-0">
            <button onClick={() => setActiveTab('GENERAL')} className={`flex-1 py-4 rounded-[1.8rem] font-black uppercase text-[10px] tracking-widest transition-all ${activeTab === 'GENERAL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>📄 সাধারণ লেজার (Purchase & Cash)</button>
            <button onClick={() => setActiveTab('BANK')} className={`flex-1 py-4 rounded-[1.8rem] font-black uppercase text-[10px] tracking-widest transition-all ${activeTab === 'BANK' ? 'bg-indigo-600 text-white shadow-xl scale-[1.02]' : 'text-slate-400'}`}>🏦 কোম্পানি ব্যাংক স্টেটমেন্ট</button>
         </div>

         <div className="flex-1 overflow-x-auto custom-scroll">
            <table className="w-full text-left">
               <thead>
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] border-b sticky top-0 bg-white z-10">
                     <th className="px-10 py-6">তারিখ</th>
                     <th className="px-10 py-6">বিস্তারিত বিবরণ</th>
                     <th className="px-10 py-6 text-center">ধরণ (Type)</th>
                     <th className="px-10 py-6 text-right">অ্যামাউন্ট</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-50 text-[11px] font-bold">
                  {filteredHistory.length === 0 ? (
                    <tr><td colSpan={4} className="py-40 text-center opacity-20 font-black uppercase italic">কোনো রেকর্ড পাওয়া যায়নি</td></tr>
                  ) : filteredHistory.map((log, idx) => (
                    <tr key={log.id} className="hover:bg-blue-50/30 transition-colors group animate-reveal">
                       <td className="px-10 py-6 text-slate-400 font-black">{new Date(log.date).toLocaleDateString('bn-BD')}</td>
                       <td className="px-10 py-6 uppercase italic text-slate-800 font-black max-w-lg">
                          <p>{log.note}</p>
                          {log.meta?.bank && <p className="text-[8px] text-blue-600 mt-1">Bank: {log.meta.bank} | Ref: {log.meta.ref}</p>}
                       </td>
                       <td className="px-10 py-6 text-center">
                          <span className={`px-4 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest ${
                            log.type === 'BANK_TRANSFER' ? 'bg-indigo-100 text-indigo-600' :
                            log.type === 'PURCHASE' ? 'bg-blue-50 text-blue-600' : 
                            'bg-orange-50 text-orange-600'
                          }`}>{log.type.replace('_', ' ')}</span>
                       </td>
                       <td className={`px-10 py-6 text-right font-black italic text-base ${log.type === 'PURCHASE' ? 'text-slate-900' : 'text-emerald-600'}`}>
                          {log.type === 'PURCHASE' ? '' : '—'}৳{log.amount.toLocaleString()}
                       </td>
                    </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>

      {/* 🏦 COMPANY BANK DEPOSIT MODAL */}
      {showBankModal && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[4000] flex items-center justify-center p-4">
           <div className="bg-white rounded-[4rem] w-full max-w-md shadow-2xl overflow-hidden animate-reveal text-slate-900">
              <div className="p-8 bg-indigo-600 text-white flex justify-between items-center">
                 <h3 className="text-xl font-black uppercase italic tracking-tighter">কোম্পানি ব্যাংক ডিপোজিট</h3>
                 <button onClick={() => setShowBankModal(false)} className="text-3xl font-black opacity-50 hover:opacity-100">✕</button>
              </div>
              <div className="p-10 space-y-6">
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-4 italic">জমার তারিখ</label>
                    <input type="date" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold" value={bankForm.date} onChange={e => setBankForm({...bankForm, date: e.target.value})} />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                       <label className="text-[9px] font-black text-slate-400 uppercase ml-4 italic">ব্যাংকের নাম</label>
                       <input className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold uppercase text-[11px]" placeholder="যেমন: DBBL, IBBL" value={bankForm.bank_name} onChange={e => setBankForm({...bankForm, bank_name: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                       <label className="text-[9px] font-black text-slate-400 uppercase ml-4 italic">ট্রানজেকশন আইডি / Ref</label>
                       <input className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold uppercase text-[11px]" placeholder="Ref No" value={bankForm.ref_no} onChange={e => setBankForm({...bankForm, ref_no: e.target.value})} />
                    </div>
                 </div>
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase text-center block italic mb-2">জমার পরিমাণ (টাকা)</label>
                    <input type="number" className="w-full p-8 bg-indigo-50 border-none rounded-[2.5rem] text-center text-5xl font-black italic text-indigo-600 outline-none shadow-inner" placeholder="0.00" value={bankForm.amount} onChange={e => setBankForm({...bankForm, amount: e.target.value})} />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-4 italic">অতিরিক্ত নোট (ঐচ্ছিক)</label>
                    <textarea className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold italic h-20" placeholder="বিস্তারিত লিখুন..." value={bankForm.note} onChange={e => setBankForm({...bankForm, note: e.target.value})} />
                 </div>
                 <button disabled={isSaving || !bankForm.amount} onClick={handleSaveBankDeposit} className="w-full bg-indigo-600 text-white py-6 rounded-[2.5rem] font-black uppercase text-xs tracking-[0.3em] shadow-xl active:scale-95 transition-all">কনফার্ম ব্যাংক জমা ➔</button>
              </div>
           </div>
        </div>
      )}

      {/* Existing Modals Re-styled to match */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[3000] flex items-center justify-center p-4">
           <div className="bg-white rounded-[4rem] w-full max-w-6xl h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-reveal text-slate-900">
              <div className="p-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <h3 className="text-2xl font-black uppercase italic tracking-tighter">বাল্ক মাল পারচেজ (Stock In)</h3>
                 <div className="flex gap-4">
                    <input type="date" className="p-4 bg-white/10 border border-white/20 rounded-2xl text-[10px] font-black" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
                    <button onClick={() => setShowBulkModal(false)} className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-xl">✕</button>
                 </div>
              </div>
              <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-slate-50">
                 <div className="w-full lg:w-1/2 p-10 border-r flex flex-col gap-6">
                    <input className="w-full p-6 bg-white border border-slate-200 rounded-[2.5rem] font-black text-xs uppercase" placeholder="মডেল সার্চ করুন..." value={searchProd} onChange={e => setSearchProd(e.target.value)} />
                    <div className="flex-1 overflow-y-auto custom-scroll grid grid-cols-1 md:grid-cols-2 gap-3 pr-2">
                       {products.filter(p => p.name.toLowerCase().includes(searchProd.toLowerCase())).map(p => (
                         <div key={p.id} onClick={() => !bulkCart.some(i=>i.id===p.id) && setBulkCart([...bulkCart, {id:p.id, name:p.name, qty:1, tp:p.tp}])} className={`p-6 border-2 rounded-[2rem] transition-all cursor-pointer flex justify-between items-center ${bulkCart.some(i=>i.id===p.id)?'bg-blue-600 text-white':'bg-white hover:border-blue-200'}`}>
                           <p className="text-[10px] font-black uppercase italic truncate pr-4">{p.name}</p>
                           <span className="text-xl font-black">+</span>
                         </div>
                       ))}
                    </div>
                 </div>
                 <div className="w-full lg:w-1/2 p-10 bg-white flex flex-col">
                    <div className="flex-1 overflow-y-auto custom-scroll space-y-3 mb-8">
                       {bulkCart.map(item => (
                         <div key={item.id} className="bg-slate-50 p-6 rounded-[2.5rem] border flex items-center justify-between">
                            <p className="text-[11px] font-black uppercase italic flex-1 truncate pr-4">{item.name}</p>
                            <div className="flex items-center gap-4">
                               <div className="flex items-center bg-white rounded-2xl p-1 border shadow-inner">
                                  <button onClick={() => setBulkCart(bulkCart.map(i=>i.id===item.id?{...i, qty:Math.max(0,i.qty-1)}:i).filter(i=>i.qty>0))} className="w-10 h-10 font-black text-xl text-slate-300">-</button>
                                  <input type="number" className="w-12 text-center font-black text-xs bg-transparent" value={item.qty} readOnly />
                                  <button onClick={() => setBulkCart(bulkCart.map(i=>i.id===item.id?{...i, qty:i.qty+1}:i))} className="w-10 h-10 font-black text-xl text-slate-300">+</button>
                               </div>
                               <button onClick={() => setBulkCart(bulkCart.filter(i=>i.id!==item.id))} className="text-red-300 hover:text-red-500 font-black">✕</button>
                            </div>
                         </div>
                       ))}
                    </div>
                    <button disabled={isSaving || bulkCart.length === 0} onClick={handleSaveBulkPurchase} className="w-full bg-blue-600 text-white py-8 rounded-[3rem] font-black uppercase text-xs tracking-widest shadow-xl">কনফার্ম পারচেজ এন্ট্রি ➔</button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {showPaymentModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[2000] flex items-center justify-center p-4">
           <div className="bg-white p-10 md:p-14 rounded-[4rem] w-full max-w-md shadow-2xl text-slate-900 animate-reveal">
              <div className="flex justify-between items-center mb-10 border-b pb-6">
                 <h3 className="text-xl font-black uppercase italic tracking-tighter">পেমেন্ট/খরচ এন্ট্রি</h3>
                 <button onClick={() => setShowPaymentModal(false)} className="text-4xl text-slate-300 font-black hover:text-slate-900">✕</button>
              </div>
              <div className="space-y-6">
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-4 italic">তারিখ নির্বাচন</label>
                    <input type="date" className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold" value={paymentForm.date} onChange={e => setPaymentForm({...paymentForm, date: e.target.value})} />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-4 italic">লেনদেনের ধরণ</label>
                    <select className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-black uppercase text-[11px]" value={paymentForm.type} onChange={e => setPaymentForm({...paymentForm, type: e.target.value})}>
                       <option value="PAYMENT">পেমেন্ট (Cash Payment to Co.)</option>
                       <option value="EXPENSE">অফিস খরচ (Expense)</option>
                    </select>
                 </div>
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-4 italic text-center block mb-2">অ্যামাউন্ট (টাকা)</label>
                    <input type="number" className="w-full p-10 bg-blue-50 border-none rounded-[2.5rem] text-center text-5xl font-black italic text-blue-600 outline-none shadow-inner" placeholder="0.00" value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-4 italic">বিস্তারিত বিবরণ</label>
                    <textarea className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] outline-none font-bold italic h-24" placeholder="বিবরণ লিখুন..." value={paymentForm.note} onChange={e => setPaymentForm({...paymentForm, note: e.target.value})} />
                 </div>
                 <button disabled={isSaving || !paymentForm.amount} onClick={handleSavePayment} className="w-full bg-slate-900 text-white py-8 rounded-[2.5rem] font-black uppercase text-xs tracking-[0.3em] shadow-2xl">ডাটা সেভ করুন ➔</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default CompanyLedger;
