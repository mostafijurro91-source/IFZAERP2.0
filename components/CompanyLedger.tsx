
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
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  
  const [bulkCart, setBulkCart] = useState<any[]>([]);
  const [searchProd, setSearchProd] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);

  const [paymentForm, setPaymentForm] = useState({ amount: '', type: 'PAYMENT', note: '', date: new Date().toISOString().split('T')[0] });

  const isAdmin = role === 'ADMIN';

  useEffect(() => {
    fetchData();
  }, [company]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const dbCo = mapToDbCompany(company);
      const [ledgerRes, prodRes] = await Promise.all([
        supabase.from('company_ledger').select('*').eq('company', dbCo).order('created_at', { ascending: false }),
        supabase.from('products').select('*').eq('company', dbCo).order('name')
      ]);
      setLedgerData(ledgerRes.data || []);
      setProducts(prodRes.data || []);
    } finally { setLoading(false); }
  };

  const stats = useMemo(() => {
    let pur = 0, pay = 0, exp = 0;
    ledgerData.forEach(d => {
      const amt = Number(d.amount) || 0;
      if (d.type === 'PURCHASE') pur += amt;
      else if (d.type === 'PAYMENT') pay += amt;
      else if (d.type === 'EXPENSE') exp += amt;
    });
    return { purchase: pur, paid: pay, expense: exp, balance: pur - pay };
  }, [ledgerData]);

  const addToBulkCart = (p: Product) => {
    const existing = bulkCart.find(i => i.id === p.id);
    if (existing) return;
    setBulkCart([...bulkCart, { id: p.id, name: p.name, qty: 1, tp: p.tp }]);
  };

  const updateBulkQty = (id: string, qty: number) => {
    setBulkCart(bulkCart.map(i => i.id === id ? { ...i, qty: Math.max(0, qty) } : i).filter(i => i.qty > 0));
  };

  const calculateBulkTotal = () => bulkCart.reduce((sum, i) => sum + (i.qty * i.tp), 0);

  const handleSaveBulkPurchase = async () => {
    if (bulkCart.length === 0 || isSaving) return;
    setIsSaving(true);
    try {
      const dbCo = mapToDbCompany(company);
      const total = calculateBulkTotal();
      const note = "পারচেজ: " + bulkCart.map(i => `${i.qty}X ${i.name}`).join(", ");

      // 1. Add to Ledger
      const { error: ledgerErr } = await supabase.from('company_ledger').insert([{
        company: dbCo,
        type: 'PURCHASE',
        amount: total,
        note: note,
        date: purchaseDate,
        items_json: bulkCart
      }]);
      if (ledgerErr) throw ledgerErr;

      // 2. Update Stock
      for (const item of bulkCart) {
        await supabase.rpc('increment_stock', { row_id: item.id, amt: item.qty });
      }

      alert("বাল্ক পারচেজ সফল হয়েছে এবং স্টক আপডেট হয়েছে!");
      setShowBulkModal(false);
      setBulkCart([]);
      fetchData();
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsSaving(false);
    }
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
      
      {/* 1. Stats Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'মোট পারচেজ', val: stats.purchase, color: 'text-slate-900', icon: '📦' },
          { label: 'মোট পেমেন্ট', val: stats.paid, color: 'text-emerald-600', icon: '💸' },
          { label: 'মোট খরচ', val: stats.expense, color: 'text-orange-600', icon: '🧾' },
          { label: 'নিট বকেয়া', val: stats.balance, color: 'text-red-600', icon: '⏳' },
        ].map((s, i) => (
          <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-lg transition-all animate-reveal" style={{ animationDelay: `${i*0.1}s` }}>
            <span className="absolute -right-2 -bottom-2 text-6xl opacity-5 group-hover:scale-110 transition-transform">{s.icon}</span>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 italic">{s.label}</p>
            <p className={`text-xl font-black italic tracking-tighter ${s.color}`}>{formatCurrency(s.val)}</p>
          </div>
        ))}
      </div>

      {/* 2. Action Header */}
      <div className="bg-white p-8 rounded-[3rem] border shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
         <div className="flex items-center gap-6">
            <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center text-white text-2xl font-black italic shadow-xl">L</div>
            <div>
               <h3 className="text-xl font-black uppercase italic tracking-tighter leading-none">কোম্পানি লেজার টার্মিনাল</h3>
               <p className="text-[10px] text-slate-400 font-black uppercase mt-2 tracking-widest">{company} Division Records</p>
            </div>
         </div>
         <div className="flex gap-2 w-full md:w-auto">
            <button onClick={() => setShowBulkModal(true)} className="flex-1 md:flex-none bg-blue-600 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase shadow-xl hover:bg-blue-700 active:scale-95 transition-all">📦 মাল পারচেজ (Bulk)</button>
            <button onClick={() => setShowPaymentModal(true)} className="flex-1 md:flex-none bg-slate-900 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase shadow-xl hover:bg-black active:scale-95 transition-all">💰 পেমেন্ট/খরচ এন্ট্রি</button>
         </div>
      </div>

      {/* 3. Transaction History Table */}
      <div className="bg-white rounded-[3.5rem] border shadow-sm overflow-hidden animate-reveal">
         <div className="overflow-x-auto custom-scroll max-h-[70vh]">
            <table className="w-full text-left">
               <thead>
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b bg-slate-50 sticky top-0 z-10">
                     <th className="px-10 py-6">তারিখ</th>
                     <th className="px-10 py-6">বিবরণ (Details)</th>
                     <th className="px-10 py-6 text-center">টাইপ</th>
                     <th className="px-10 py-6 text-right">অ্যামাউন্ট</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-100 text-[12px] font-bold text-slate-900">
                  {ledgerData.map((log, idx) => (
                    <tr key={log.id} className="hover:bg-blue-50/30 transition-colors group animate-reveal" style={{ animationDelay: `${idx*0.02}s` }}>
                       <td className="px-10 py-8 font-black whitespace-nowrap">{new Date(log.date).toLocaleDateString('bn-BD')}</td>
                       <td className="px-10 py-8 uppercase italic leading-relaxed max-w-md">
                          <p className="group-hover:text-blue-600 transition-colors">{log.note}</p>
                          <p className="text-[8px] text-slate-300 mt-2 font-black uppercase tracking-widest">Entry ID: #{log.id.slice(-6).toUpperCase()}</p>
                       </td>
                       <td className="px-10 py-8 text-center">
                          <span className={`px-4 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest ${
                            log.type === 'PURCHASE' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 
                            log.type === 'PAYMENT' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 
                            'bg-orange-50 text-orange-600 border border-orange-100'
                          }`}>{log.type}</span>
                       </td>
                       <td className={`px-10 py-8 text-right font-black italic text-lg ${log.type === 'PURCHASE' ? 'text-slate-900' : 'text-emerald-600'}`}>
                          {log.type === 'PURCHASE' ? '' : '—'}৳{log.amount.toLocaleString()}
                       </td>
                    </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>

      {/* 🛠️ Bulk Purchase Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[3000] flex items-center justify-center p-4">
           <div className="bg-white rounded-[4rem] w-full max-w-6xl h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-reveal text-slate-900">
              <div className="p-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <div className="flex items-center gap-6">
                    <button onClick={() => setShowBulkModal(false)} className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-xl hover:bg-white/20">✕</button>
                    <div>
                       <h3 className="text-2xl font-black uppercase italic tracking-tighter">বাল্ক মাল পারচেজ (Stock In)</h3>
                       <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-widest">Select products and set arrival quantities</p>
                    </div>
                 </div>
                 <div className="flex items-center gap-4">
                    <input type="date" className="p-4 bg-white/10 border border-white/20 rounded-2xl text-[10px] font-black outline-none" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
                    <button disabled={isSaving || bulkCart.length === 0} onClick={handleSaveBulkPurchase} className="bg-blue-600 text-white px-10 py-4 rounded-2xl font-black uppercase text-[11px] shadow-2xl hover:bg-blue-700 disabled:opacity-20 animate-pulse">কনফার্ম পারচেজ এন্ট্রি ➔</button>
                 </div>
              </div>

              <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                 {/* Product List Sidebar */}
                 <div className="w-full lg:w-1/2 p-10 border-r overflow-hidden flex flex-col gap-6 bg-slate-50/50">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase italic ml-4 mb-2 block">পণ্য নির্বাচন করুন (Inventory SKUs)</label>
                       <div className="relative">
                          <input className="w-full p-6 bg-white border-2 border-slate-100 rounded-[2.5rem] font-black text-xs uppercase outline-none shadow-sm focus:border-blue-500 transition-all" placeholder="মডেল সার্চ করুন..." value={searchProd} onChange={e => setSearchProd(e.target.value)} />
                          <span className="absolute right-8 top-1/2 -translate-y-1/2 opacity-20">🔍</span>
                       </div>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scroll grid grid-cols-1 md:grid-cols-2 gap-3 pr-2 pb-10">
                       {products.filter(p => p.name.toLowerCase().includes(searchProd.toLowerCase())).map(p => {
                         const isInCart = bulkCart.some(i => i.id === p.id);
                         return (
                           <div key={p.id} onClick={() => addToBulkCart(p)} className={`p-6 border-2 rounded-[2.5rem] transition-all cursor-pointer flex justify-between items-center group ${isInCart ? 'bg-blue-600 border-blue-600 text-white shadow-lg scale-[1.02]' : 'bg-white border-slate-100 hover:border-blue-200'}`}>
                              <div className="min-w-0 pr-4">
                                 <p className="text-[11px] font-black uppercase italic truncate leading-none mb-3">{p.name}</p>
                                 <p className={`text-[10px] font-black italic ${isInCart ? 'text-blue-100' : 'text-slate-400'}`}>Rate: ৳{p.tp}</p>
                              </div>
                              {isInCart ? <span className="text-xl">✓</span> : <span className="text-2xl font-black text-blue-500 opacity-0 group-hover:opacity-100 transition-all">+</span>}
                           </div>
                         );
                       })}
                    </div>
                 </div>

                 {/* Purchase Cart */}
                 <div className="w-full lg:w-1/2 p-10 flex flex-col bg-white">
                    <h4 className="text-[11px] font-black text-slate-400 uppercase italic mb-8 flex justify-between items-center">
                       <span>পারচেজ কার্ট ({bulkCart.length} আইটেম)</span>
                       <button onClick={() => setBulkCart([])} className="text-red-500 hover:underline">Clear All</button>
                    </h4>
                    <div className="flex-1 overflow-y-auto custom-scroll space-y-3 pr-2 mb-8">
                       {bulkCart.map((item, idx) => (
                          <div key={item.id} className="bg-slate-50 p-6 rounded-[2.5rem] border border-slate-100 flex items-center justify-between group animate-reveal shadow-sm">
                             <div className="flex-1 min-w-0 pr-6">
                                <p className="text-[12px] font-black uppercase italic text-slate-800 truncate mb-1">{item.name}</p>
                                <p className="text-[10px] font-black text-blue-600 italic">৳{(item.tp * item.qty).toLocaleString()}</p>
                             </div>
                             <div className="flex items-center gap-4">
                                <div className="flex items-center bg-white rounded-2xl p-1 border shadow-inner">
                                   <button onClick={() => updateBulkQty(item.id, item.qty - 1)} className="w-10 h-10 font-black text-xl text-slate-300 hover:text-red-500 transition-colors">-</button>
                                   <input type="number" className="w-12 text-center font-black text-xs bg-transparent outline-none" value={item.qty} onChange={e => updateBulkQty(item.id, Number(e.target.value))} />
                                   <button onClick={() => updateBulkQty(item.id, item.qty + 1)} className="w-10 h-10 font-black text-xl text-slate-300 hover:text-blue-600 transition-colors">+</button>
                                </div>
                                <button onClick={() => updateBulkQty(item.id, 0)} className="w-10 h-10 flex items-center justify-center text-red-300 hover:text-red-600 text-xl font-black transition-colors">✕</button>
                             </div>
                          </div>
                       ))}
                       {bulkCart.length === 0 && (
                          <div className="h-full flex flex-col items-center justify-center opacity-10 py-40">
                             <span className="text-8xl mb-6">🛒</span>
                             <p className="text-sm font-black uppercase tracking-[0.4em]">কার্ট সম্পূর্ণ খালি</p>
                          </div>
                       )}
                    </div>
                    
                    <div className="p-10 bg-slate-900 rounded-[3rem] text-white flex justify-between items-center shadow-2xl relative overflow-hidden">
                       <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-[60px] rounded-full"></div>
                       <div>
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 italic">মোট পারচেজ বিল (Estimated)</p>
                          <p className="text-4xl font-black italic tracking-tighter text-blue-400">{formatCurrency(calculateBulkTotal())}</p>
                       </div>
                       <div className="text-right">
                          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-[0.2em] mb-1 italic">Inventory Sync</p>
                          <p className="text-[10px] font-black text-white/40 italic">Ready to Post ➔</p>
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* 💰 Single Entry Modal */}
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
                       <option value="PAYMENT">পেমেন্ট (Payment to Company)</option>
                       <option value="EXPENSE">অফিস খরচ (General Expense)</option>
                    </select>
                 </div>
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-4 italic text-center block mb-2">অ্যামাউন্ট (টাকা)</label>
                    <input type="number" className="w-full p-10 bg-blue-50 border-none rounded-[2.5rem] text-center text-5xl font-black italic text-blue-600 outline-none shadow-inner" placeholder="0.00" value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-4 italic">বিস্তারিত বিবরণ</label>
                    <textarea className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] outline-none font-bold italic h-24" placeholder="যেমন: ক্যাশ পেমেন্ট বা খরচ বিবরণ..." value={paymentForm.note} onChange={e => setPaymentForm({...paymentForm, note: e.target.value})} />
                 </div>
                 
                 <button disabled={isSaving || !paymentForm.amount} onClick={handleSavePayment} className="w-full bg-slate-900 text-white py-8 rounded-[2.5rem] font-black uppercase text-xs tracking-[0.3em] shadow-2xl active:scale-95 transition-all">
                    {isSaving ? "সংরক্ষণ হচ্ছে..." : "ডাটা সেভ করুন ➔"}
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default CompanyLedger;
