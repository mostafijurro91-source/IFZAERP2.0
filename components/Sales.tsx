
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Company, UserRole, Product, formatCurrency, User } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';
import { jsPDF } from 'jspdf';
import * as html2canvasModule from 'html2canvas';

const html2canvas = (html2canvasModule as any).default || html2canvasModule;

interface CartItem {
  cartId: string;
  product: Product;
  qty: number;
  customPrice: number; 
  originalPrice: number;
  mrp: number;
  itemDiscountPercent: number; 
  type: 'SALE' | 'RETURN' | 'REPLACE';
}

const Sales: React.FC<{ company: Company; role: UserRole; user: User }> = ({ company, role, user }) => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [productList, setProductList] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [companyDues, setCompanyDues] = useState<Record<string, number>>({});
  const [uniqueAreas, setUniqueAreas] = useState<string[]>([]);
  const [selectedArea, setSelectedArea] = useState<string>("");
  const [search, setSearch] = useState("");
  const [custSearch, setCustSearch] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  const [universalDiscountPercent, setUniversalDiscountPercent] = useState<number>(0);
  const [universalDiscountAmount, setUniversalDiscountAmount] = useState<number>(0);
  
  const [tempInvoiceId, setTempInvoiceId] = useState("");
  const [recentMemos, setRecentMemos] = useState<any[]>([]);
  const [lastPayment, setLastPayment] = useState<{amount: number, date: string} | null>(null);
  
  const invoiceRef = useRef<HTMLDivElement>(null);
  const dbCo = mapToDbCompany(company);

  useEffect(() => { loadData(); }, [company]);

  const loadData = async () => {
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const [prods, custs, txs, recent] = await Promise.all([
      supabase.from('products').select('*').eq('company', dbCo).order('name'),
      supabase.from('customers').select('*').order('name'),
      supabase.from('transactions').select('customer_id, amount, payment_type, company').eq('company', dbCo),
      supabase.from('transactions')
        .select('*, customers(name, address, phone)')
        .eq('company', dbCo)
        .eq('payment_type', 'DUE')
        .gte('created_at', today.toISOString())
        .order('created_at', { ascending: false })
    ]);
    
    const dues: Record<string, number> = {};
    txs.data?.forEach(t => {
      const a = Number(t.amount) || 0;
      dues[t.customer_id] = (dues[t.customer_id] || 0) + (t.payment_type === 'COLLECTION' ? -a : a);
    });

    setProductList(prods.data || []);
    setCustomers(custs.data || []);
    setUniqueAreas(Array.from(new Set(custs.data?.map(c => c.address?.trim()).filter(Boolean) || [])).sort() as string[]);
    setCompanyDues(dues);
    setRecentMemos(recent.data || []);
  };

  const fetchLastPayment = async (cid: string) => {
    const { data } = await supabase
      .from('transactions')
      .select('amount, created_at')
      .eq('customer_id', cid)
      .eq('payment_type', 'COLLECTION')
      .eq('company', dbCo)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (data && data.length > 0) {
      setLastPayment({ amount: Number(data[0].amount), date: new Date(data[0].created_at).toLocaleDateString('bn-BD') });
    } else {
      setLastPayment(null);
    }
  };

  const addToCart = (p: Product) => {
    const cartId = `${p.id}-${Date.now()}`;
    setCart([...cart, { 
      cartId, product: p, qty: 1, customPrice: p.tp, originalPrice: p.tp, mrp: p.mrp, itemDiscountPercent: 0, type: 'SALE' 
    }]);
  };

  const updateCartItem = (cartId: string, updates: Partial<CartItem>) => {
    setCart(cart.map(i => i.cartId === cartId ? { ...i, ...updates } : i));
  };

  const removeFromCart = (cartId: string) => setCart(cart.filter(i => i.cartId !== cartId));

  const calculateSubtotal = () => cart.reduce((acc, i) => {
    if (i.type === 'REPLACE') return acc;
    const priceAfterItemDiscount = i.customPrice * (1 - (i.itemDiscountPercent || 0) / 100);
    const itemTotal = priceAfterItemDiscount * i.qty;
    return acc + (i.type === 'SALE' ? itemTotal : -itemTotal);
  }, 0);

  const calculateNetTotal = () => {
    const sub = calculateSubtotal();
    const afterGlobalPercent = sub * (1 - (universalDiscountPercent || 0) / 100);
    return Math.max(0, afterGlobalPercent - (universalDiscountAmount || 0));
  };

  const handleSaveInvoice = async () => {
    if (!selectedCustomer || cart.length === 0) return alert("দোকান এবং পণ্য নির্বাচন করুন!");
    setIsSaving(true);
    try {
      const netTotal = Math.round(calculateNetTotal());
      // Save product_id in items for robust stock reversal
      const itemsToSave = cart.map(i => ({ 
        product_id: i.product.id,
        name: i.product.name, 
        qty: i.qty, 
        price: i.type === 'REPLACE' ? 0 : i.customPrice, 
        item_discount: i.itemDiscountPercent,
        mrp: i.product.mrp,
        type: i.type 
      }));

      const { error } = await supabase.from('transactions').insert([{
        customer_id: selectedCustomer.id,
        company: dbCo,
        amount: netTotal,
        payment_type: 'DUE',
        items: itemsToSave,
        submitted_by: user.name
      }]);

      if (error) throw error;
      
      // Stock Updates based on item type
      for (const item of cart) {
        let amt = 0;
        if (item.type === 'SALE' || item.type === 'REPLACE') amt = -item.qty; // Deduct
        if (item.type === 'RETURN') amt = item.qty; // Add back
        await supabase.rpc('increment_stock', { row_id: item.product.id, amt });
      }

      alert("মেমো সফলভাবে সেভ হয়েছে এবং স্টক আপডেট হয়েছে!");
      setShowPreview(false);
      setCart([]);
      setSelectedCustomer(null);
      setUniversalDiscountPercent(0);
      setUniversalDiscountAmount(0);
      loadData(); 
    } catch (e: any) { alert(e.message); } finally { setIsSaving(false); }
  };

  const handleDeleteMemo = async (memo: any) => {
    if (user.role !== 'ADMIN') return alert("শুধুমাত্র অ্যাডমিন ডিলিট করতে পারবেন!");
    if (!confirm("আপনি কি নিশ্চিত এই মেমোটি ডিলিট করতে চান? ডিলিট করলে স্টক স্বয়ংক্রিয়ভাবে আগের অবস্থায় ফিরে আসবে।")) return;
    
    try {
      const items = memo.items || [];
      for (const item of items) {
        // Use stored product_id if available, fallback to name search
        const pid = item.product_id;
        if (pid) {
          let amt = 0;
          if (item.type === 'SALE' || item.type === 'REPLACE') amt = Number(item.qty); // Return to stock
          if (item.type === 'RETURN') amt = -Number(item.qty); // Remove from stock
          await supabase.rpc('increment_stock', { row_id: pid, amt });
        } else {
           const { data: p } = await supabase.from('products').select('id').eq('name', item.name).eq('company', dbCo).maybeSingle();
           if (p) {
             let amt = 0;
             if (item.type === 'SALE' || item.type === 'REPLACE') amt = Number(item.qty);
             if (item.type === 'RETURN') amt = -Number(item.qty);
             await supabase.rpc('increment_stock', { row_id: p.id, amt });
           }
        }
      }
      const { error } = await supabase.from('transactions').delete().eq('id', memo.id);
      if (error) throw error;
      
      alert("মেমো ডিলিট হয়েছে এবং স্টক রোলব্যাক হয়েছে!");
      loadData();
    } catch (e: any) { alert("ডিলিট করতে সমস্যা হয়েছে।"); }
  };

  const handleDownloadPDF = async () => {
    if (!invoiceRef.current || isDownloading) return;
    setIsDownloading(true);
    try {
      const canvas = await html2canvas(invoiceRef.current, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      const pdf = new jsPDF('p', 'mm', 'a5');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, imgHeight);
      pdf.save(`Memo_${selectedCustomer?.name || 'IFZA'}_${new Date().getTime()}.pdf`);
    } catch (e) { alert("PDF Error"); } finally { setIsDownloading(false); }
  };

  const prevDue = selectedCustomer ? (companyDues[selectedCustomer.id] || 0) : 0;
  const itemNet = calculateNetTotal();

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => 
      (!selectedArea || c.address === selectedArea) && 
      (!custSearch || c.name.toLowerCase().includes(custSearch.toLowerCase()) || c.phone.includes(custSearch))
    );
  }, [customers, selectedArea, custSearch]);

  const openPreview = () => {
    if (!selectedCustomer) return alert("প্রথমে দোকান সিলেক্ট করুন!");
    if (cart.length === 0) return alert("কার্ট খালি!");
    setTempInvoiceId(Math.floor(100000 + Math.random() * 900000).toString());
    fetchLastPayment(selectedCustomer.id);
    setShowPreview(true);
  };

  return (
    <div className="flex flex-col gap-8 pb-40 animate-reveal text-black">
      <div className="flex flex-col lg:flex-row gap-8 h-[calc(100vh-160px)] overflow-hidden">
        {/* Left Side: Product Picker */}
        <div className="flex-1 flex flex-col gap-6 overflow-hidden">
          <div className="bg-white p-6 rounded-[2.5rem] border shadow-sm flex flex-col md:flex-row gap-4 shrink-0">
            <div className="flex-1 flex gap-2 items-center bg-slate-100 p-1.5 rounded-[1.8rem] shadow-inner border border-slate-200">
               <select className="p-3 bg-white rounded-2xl shadow-sm font-bold text-[10px] uppercase outline-none min-w-[120px]" value={selectedArea} onChange={e => setSelectedArea(e.target.value)}>
                  <option value="">সকল এরিয়া</option>
                  {uniqueAreas.map(a => <option key={a} value={a}>{a}</option>)}
               </select>
               <div onClick={() => { setIsDropdownOpen(true); setCustSearch(""); }} className="flex-1 p-3 bg-white rounded-2xl shadow-sm cursor-pointer font-bold text-[11px] uppercase italic text-slate-900 border border-slate-100 truncate flex justify-between items-center group hover:border-blue-300">
                  <span>{selectedCustomer ? selectedCustomer.name : "দোকান বাছাই করুন..."}</span>
                  <span className="text-slate-300">▼</span>
               </div>
               <input className="flex-1 p-3 bg-transparent border-none text-[12px] font-medium uppercase outline-none text-black" placeholder="পণ্য খুঁজুন..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            {isDropdownOpen && (
              <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md" onClick={() => setIsDropdownOpen(false)}>
                 <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl p-6 flex flex-col h-[80vh] animate-reveal" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-between items-center mb-4 px-2">
                       <h3 className="font-black uppercase italic text-sm text-slate-400">Shop Finder</h3>
                       <button onClick={() => setIsDropdownOpen(false)} className="text-2xl text-slate-300 font-black">×</button>
                    </div>
                    <div className="relative mb-4">
                      <input autoFocus placeholder="দোকানের নাম বা মোবাইল লিখুন..." className="w-full p-6 bg-slate-50 border-2 border-slate-100 outline-none font-black text-base uppercase rounded-3xl focus:border-blue-600 transition-all" value={custSearch} onChange={e => setCustSearch(e.target.value)} />
                      <span className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300">🔍</span>
                    </div>
                    <div className="overflow-y-auto flex-1 custom-scroll pr-2">
                      {filteredCustomers.map(c => (
                        <div key={c.id} onClick={() => { setSelectedCustomer(c); setIsDropdownOpen(false); }} className="p-5 hover:bg-blue-600 hover:text-white rounded-[2rem] cursor-pointer border-b border-slate-50 flex justify-between items-center transition-all group text-black">
                           <div>
                             <p className="font-black text-[14px] uppercase italic leading-none mb-1 group-hover:text-white">{c.name}</p>
                             <p className="text-[9px] font-bold text-slate-400 uppercase group-hover:text-white/70">📍 {c.address} • 📱 {c.phone}</p>
                           </div>
                           <div className="text-right">
                              <p className="text-[14px] font-black group-hover:text-white">৳{(companyDues[c.id] || 0).toLocaleString()}</p>
                           </div>
                        </div>
                      ))}
                    </div>
                 </div>
              </div>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto grid grid-cols-3 md:grid-cols-5 gap-3 pr-2 custom-scroll">
            {productList.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map(p => (
              <div key={p.id} onClick={() => p.stock > 0 && addToCart(p)} className={`bg-white p-3 rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg transition-all cursor-pointer flex flex-col justify-between group ${p.stock <= 0 ? 'opacity-30 pointer-events-none' : 'active:scale-95'}`}>
                 <h4 className="text-[10px] font-bold uppercase italic text-slate-500 mb-1.5 leading-tight truncate">{p.name}</h4>
                 <div className="flex justify-between items-center">
                    <p className="font-black text-lg text-slate-800 italic tracking-tighter leading-none">৳{p.tp}</p>
                    <span className={`text-[7px] font-black px-1.5 py-0.5 rounded ${p.stock < 10 ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>S: {p.stock}</span>
                 </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Cart Hub */}
        <div className="w-full lg:w-[480px] bg-slate-50 rounded-[4rem] border shadow-2xl overflow-hidden flex flex-col">
          <div className="p-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
             <h3 className="text-lg font-black italic uppercase tracking-tighter">মেমো কার্ট ({cart.length})</h3>
             <span className="bg-blue-600 px-6 py-2 rounded-2xl text-[14px] font-black italic shadow-lg">৳{Math.round(calculateNetTotal()).toLocaleString()}</span>
          </div>

          <div className="p-4 bg-slate-800 flex gap-2 shrink-0">
             <div className="flex-1 bg-slate-700/50 p-3 rounded-2xl border border-white/5">
                <p className="text-[7px] font-black uppercase opacity-40 mb-1">Global Discount %</p>
                <input type="number" className="bg-transparent w-full font-black text-xs outline-none text-blue-400" value={universalDiscountPercent || ""} onChange={e => setUniversalDiscountPercent(Number(e.target.value))} />
             </div>
             <div className="flex-1 bg-slate-700/50 p-3 rounded-2xl border border-white/5">
                <p className="text-[7px] font-black uppercase opacity-40 mb-1">Flat Discount ৳</p>
                <input type="number" className="bg-transparent w-full font-black text-xs outline-none text-emerald-400" value={universalDiscountAmount || ""} onChange={e => setUniversalDiscountAmount(Number(e.target.value))} />
             </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scroll">
            {cart.length === 0 ? (
               <div className="py-20 text-center opacity-10 font-black uppercase italic">কার্ট সম্পূর্ণ খালি</div>
            ) : cart.map((item) => (
              <div key={item.cartId} className={`bg-white p-8 rounded-[3rem] border shadow-sm relative group animate-reveal ${item.type === 'RETURN' ? 'border-red-100' : item.type === 'REPLACE' ? 'border-purple-100' : 'border-slate-50'}`}>
                 <button onClick={() => removeFromCart(item.cartId)} className="absolute top-6 right-8 text-slate-200 hover:text-red-500 text-2xl font-bold transition-all">✕</button>
                 
                 <h4 className="text-[13px] font-black uppercase italic text-slate-800 leading-tight mb-6 pr-10">{item.product.name}</h4>

                 <div className="grid grid-cols-3 gap-2 mb-6">
                    <button onClick={() => updateCartItem(item.cartId, { type: 'SALE' })} className={`py-3 rounded-2xl text-[10px] font-black uppercase transition-all ${item.type === 'SALE' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>বিক্রি</button>
                    <button onClick={() => updateCartItem(item.cartId, { type: 'RETURN' })} className={`py-3 rounded-2xl text-[10px] font-black uppercase transition-all ${item.type === 'RETURN' ? 'bg-red-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>ফেরত</button>
                    <button onClick={() => updateCartItem(item.cartId, { type: 'REPLACE' })} className={`py-3 rounded-2xl text-[10px] font-black uppercase transition-all ${item.type === 'REPLACE' ? 'bg-purple-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>রিপ্লেস</button>
                 </div>

                 <div className="grid grid-cols-12 gap-3 items-end">
                    <div className="col-span-4">
                       <p className="text-[7px] font-black text-slate-300 uppercase ml-2 mb-2 italic">Rate (TP)</p>
                       <input disabled={item.type === 'REPLACE'} type="number" className="w-full p-4 bg-slate-50 rounded-2xl text-[13px] font-black outline-none shadow-inner disabled:opacity-20" value={item.customPrice} onChange={e => updateCartItem(item.cartId, { customPrice: Number(e.target.value) })} />
                    </div>
                    <div className="col-span-3">
                       <p className="text-[7px] font-black text-blue-400 uppercase ml-2 mb-2 italic">Item %</p>
                       <input disabled={item.type === 'REPLACE'} type="number" className="w-full p-4 bg-blue-50 border border-blue-100 rounded-2xl text-[13px] font-black outline-none shadow-inner text-blue-600" value={item.itemDiscountPercent || ""} onChange={e => updateCartItem(item.cartId, { itemDiscountPercent: Number(e.target.value) })} />
                    </div>
                    <div className="col-span-5">
                       <p className="text-[7px] font-black text-slate-300 uppercase ml-2 mb-2 italic">Qty</p>
                       <div className="flex items-center bg-slate-50 rounded-2xl p-1 shadow-inner border border-slate-100">
                          <button onClick={() => updateCartItem(item.cartId, { qty: Math.max(1, item.qty - 1) })} className="flex-1 py-3 font-black text-xl text-slate-300 hover:text-black">−</button>
                          <input type="number" className="w-8 bg-transparent text-center font-black text-sm outline-none" value={item.qty} onChange={e => updateCartItem(item.cartId, { qty: Number(e.target.value) })} />
                          <button onClick={() => updateCartItem(item.cartId, { qty: item.qty + 1 })} className="flex-1 py-3 font-black text-xl text-slate-300 hover:text-black">+</button>
                       </div>
                    </div>
                 </div>
              </div>
            ))}
          </div>

          <div className="p-8 bg-white shrink-0 border-t">
             <button disabled={cart.length === 0 || !selectedCustomer} onClick={openPreview} className="w-full bg-blue-600 text-white py-8 rounded-[2.5rem] font-black uppercase text-[12px] tracking-[0.2em] shadow-2xl active:scale-95 transition-all disabled:opacity-20">
                মেমো প্রিভিউ ও প্রিন্ট
             </button>
          </div>
        </div>
      </div>

      <div className="space-y-6">
         <div className="flex items-center gap-4 px-6">
            <h3 className="text-2xl font-black uppercase italic tracking-tighter text-slate-900">আজকের মেমো হিস্টোরি</h3>
            <div className="flex-1 h-px bg-slate-100"></div>
         </div>
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recentMemos.map(memo => (
              <div key={memo.id} className="bg-white p-8 rounded-[3.5rem] border border-slate-100 shadow-sm relative group overflow-hidden">
                 <div className="flex justify-between items-start mb-6">
                    <div>
                       <p className="text-[9px] font-black text-slate-400 uppercase italic mb-1">দোকান:</p>
                       <h4 className="text-xl font-black uppercase italic text-slate-900 leading-none truncate max-w-[200px]">{memo.customers?.name}</h4>
                    </div>
                    {user.role === 'ADMIN' && (
                       <button onClick={() => handleDeleteMemo(memo)} className="w-11 h-11 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all shadow-sm">🗑️</button>
                    )}
                 </div>
                 <div className="flex justify-between items-end border-t pt-6">
                    <div><p className="text-[10px] font-bold text-slate-400 italic mb-1 uppercase">Net Bill</p><p className="text-2xl font-black italic text-blue-600">৳{memo.amount.toLocaleString()}</p></div>
                    <div className="text-right">
                       <p className="text-[8px] font-bold text-slate-300 uppercase italic">ID: #{memo.id.slice(-6).toUpperCase()}</p>
                       {user.role === 'ADMIN' && <p onClick={() => handleDeleteMemo(memo)} className="text-[8px] text-rose-400 font-black uppercase underline mt-2 cursor-pointer">ডিলিট করুন</p>}
                    </div>
                 </div>
              </div>
            ))}
         </div>
      </div>

      {showPreview && selectedCustomer && (
        <div className="fixed inset-0 bg-[#020617]/98 backdrop-blur-3xl z-[2000] flex flex-col items-center p-4 overflow-y-auto no-print">
           <div className="w-full max-w-[148mm] flex justify-between gap-6 mb-8 sticky top-0 z-[2001] bg-slate-900/90 p-6 rounded-3xl border border-white/10 shadow-2xl items-center">
              <button onClick={() => setShowPreview(false)} className="text-white font-black uppercase text-[10px] px-6 hover:underline">← Edit Contents</button>
              <div className="flex gap-4">
                 <button disabled={isDownloading} onClick={handleDownloadPDF} className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-black text-[10px] uppercase shadow-lg hover:bg-emerald-700 transition-all">
                    {isDownloading ? "Generating..." : "Download PDF ⬇"}
                 </button>
                 <button disabled={isSaving} onClick={handleSaveInvoice} className="bg-blue-600 text-white px-10 py-3 rounded-xl font-black text-[10px] uppercase shadow-xl animate-pulse active:scale-95 transition-all">
                    {isSaving ? "Saving..." : "কনফার্ম ও সেভ করুন ➔"}
                 </button>
              </div>
           </div>

           <div ref={invoiceRef} className="bg-white w-[148mm] min-h-[210mm] p-10 flex flex-col font-sans text-black shadow-2xl relative border-[3px] border-black">
              <div className="text-center mb-10 border-b-4 border-black pb-6">
                 <h1 className="text-[48px] font-black uppercase italic tracking-tighter leading-none mb-1 text-black">IFZA ELECTRONICS</h1>
                 <p className="text-2xl font-black uppercase italic text-black">{company} DIVISION</p>
                 <p className="text-[10px] font-black uppercase tracking-[0.4em] mt-4 opacity-70 inline-block px-8 py-1.5 bg-black text-white rounded-full">OFFICIAL INVOICE (A5)</p>
              </div>

              <div className="flex justify-between items-start mb-10 text-[12px] font-bold">
                 <div className="space-y-1.5">
                    <p className="text-[10px] font-black border-b border-black w-fit mb-2 uppercase italic tracking-widest opacity-60">ক্রেতার তথ্য:</p>
                    <p className="text-3xl font-black uppercase italic leading-none">{selectedCustomer.name}</p>
                    <p className="text-[13px] font-bold mt-2 italic">ঠিকানা: {selectedCustomer.address}</p>
                    <p className="text-[13px] font-bold italic">মোবাইল: {selectedCustomer.phone}</p>
                 </div>
                 <div className="text-right space-y-1.5">
                    <p className="text-[10px] font-black border-b border-black w-fit ml-auto mb-2 uppercase italic tracking-widest opacity-60">মেমো তথ্য:</p>
                    <p className="text-[14px] font-black">ইনভয়েস নং: <span className="font-black">#{tempInvoiceId}</span></p>
                    <p className="text-[14px] font-black">তারিখ: {new Date().toLocaleDateString('bn-BD')}</p>
                    <p className="text-[11px] font-bold italic mt-1 opacity-70">বিক্রয় প্রতিনিধি: {user.name}</p>
                 </div>
              </div>

              <div className="flex-1">
                 <table className="w-full border-collapse border-2 border-black">
                    <thead>
                       <tr className="bg-black text-white text-[10px] font-black uppercase italic">
                          <th className="p-3 text-left border border-black">বিবরণ (Products)</th>
                          <th className="p-3 text-center border border-black w-16">MRP</th>
                          <th className="p-3 text-center border border-black w-16">রেট</th>
                          <th className="p-3 text-center border border-black w-14">ছাড় %</th>
                          <th className="p-3 text-center border border-black w-12">QTY</th>
                          <th className="p-3 text-right border border-black w-24">বিল</th>
                       </tr>
                    </thead>
                    <tbody>
                       {cart.map((it, idx) => {
                          const baseTotal = (it.type === 'REPLACE' ? 0 : it.customPrice) * it.qty;
                          const afterItemDisc = baseTotal * (1 - (it.itemDiscountPercent || 0) / 100);
                          return (
                             <tr key={idx} className="border-b border-black text-[11px] font-black italic">
                                <td className="p-3 uppercase leading-tight border-r border-black">
                                   {it.product.name}
                                   {it.type !== 'SALE' && <span className="ml-2 px-1.5 bg-black text-white text-[8px] rounded uppercase font-black tracking-widest">({it.type})</span>}
                                </td>
                                <td className="p-3 text-center border-r border-black">৳{it.product.mrp}</td>
                                <td className="p-3 text-center border-r border-black">৳{it.type === 'REPLACE' ? 0 : it.customPrice}</td>
                                <td className="p-3 text-center border-r border-black">{it.itemDiscountPercent > 0 ? `${it.itemDiscountPercent}%` : '—'}</td>
                                <td className="p-3 text-center border-r border-black">{it.qty}</td>
                                <td className="p-3 text-right">
                                   {it.type === 'RETURN' ? '-' : ''}৳{Math.round(afterItemDisc).toLocaleString()}
                                </td>
                             </tr>
                          );
                       })}
                    </tbody>
                 </table>
              </div>

              <div className="flex justify-between items-start mt-10">
                 <div className="w-[55%] space-y-6">
                    <div className="bg-slate-50 border-2 border-black rounded-2xl p-6 min-h-24">
                       <p className="text-[10px] font-black border-b border-black w-fit mb-3 uppercase italic opacity-60">সর্বশেষ পেমেন্ট:</p>
                       {lastPayment ? (
                          <div className="text-black space-y-0.5">
                             <p className="text-lg font-black italic">৳{lastPayment.amount.toLocaleString()}</p>
                             <p className="text-[10px] font-bold italic">📅 {lastPayment.date}</p>
                          </div>
                       ) : <p className="text-[11px] font-black italic">কোনো রেকর্ড নেই</p>}
                    </div>
                    <div className="text-[9px] font-black italic opacity-60 space-y-1 leading-tight">
                       {universalDiscountPercent > 0 && <p>• মেমো ডিসকাউন্ট ({universalDiscountPercent}%): -৳{Math.round(calculateSubtotal() * (universalDiscountPercent / 100)).toLocaleString()}</p>}
                       {universalDiscountAmount > 0 && <p>• স্পেশাল নগদ ছাড়: -৳{universalDiscountAmount.toLocaleString()}</p>}
                       <p>• "RETURN" মালের টাকা বিল থেকে কর্তন করা হয়েছে।</p>
                       <p>• সকল পণ্য "IFZA" এর বিক্রয় নীতি অনুযায়ী প্রযোজ্য।</p>
                    </div>
                 </div>

                 <div className="w-[40%] space-y-2">
                    <div className="flex justify-between items-center text-[13px] font-black italic px-4">
                       <span className="uppercase opacity-60">PREV. DUE:</span>
                       <span>৳{prevDue.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-[13px] font-black italic px-4 pb-2 border-b-2 border-black">
                       <span className="uppercase opacity-60">ITEM NET:</span>
                       <span>৳{Math.round(itemNet).toLocaleString()}</span>
                    </div>
                    <div className="bg-black text-white p-5 rounded-xl flex justify-between items-center mt-4">
                       <span className="text-[14px] font-black uppercase italic">TOTAL:</span>
                       <span className="text-3xl font-black italic">৳{(prevDue + Math.round(itemNet)).toLocaleString()}</span>
                    </div>
                 </div>
              </div>

              <div className="mt-20 flex justify-between items-end px-4 mb-4">
                 <div className="text-center w-48 border-t-2 border-black pt-2 font-black italic text-[14px]">ক্রেতার স্বাক্ষর</div>
                 <div className="text-center w-60 border-t-2 border-black pt-2 text-right">
                    <p className="text-[10px] font-black italic opacity-50 uppercase leading-none">SM MOSTAFIZUR RAHMAN</p>
                    <p className="text-[10px] font-black italic opacity-50 uppercase mt-1 mb-2">PROPRIETOR, IFZA ELECTRONICS</p>
                    <p className="text-[18px] font-black uppercase italic tracking-tighter">কর্তৃপক্ষের স্বাক্ষর</p>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Sales;
