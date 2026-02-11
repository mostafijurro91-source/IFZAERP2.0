
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Company, UserRole, Product, formatCurrency, User } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';
import { sendSMS } from '../lib/sms';
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

  const companyPhones: Record<string, string> = {
    'Transtec': '01701551690',
    'SQ Light': '01774105970',
    'SQ Cables': '01709643451'
  };

  useEffect(() => { loadData(); }, [company]);

  const loadData = async () => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const todayIso = today.toISOString();
    
    const [prods, custs, txs, recent] = await Promise.all([
      supabase.from('products').select('*').eq('company', dbCo).order('name'),
      supabase.from('customers').select('*').order('name'),
      supabase.from('transactions').select('customer_id, amount, payment_type, company').eq('company', dbCo),
      supabase.from('transactions')
        .select('*, customers(name, address, phone)')
        .eq('company', dbCo)
        .eq('payment_type', 'DUE')
        .gte('created_at', todayIso)
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

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const q = custSearch.toLowerCase().trim();
      const matchesSearch = !q || c.name.toLowerCase().includes(q) || c.phone.includes(q);
      const matchesArea = !selectedArea || c.address?.trim() === selectedArea.trim();
      return matchesSearch && matchesArea;
    });
  }, [customers, custSearch, selectedArea]);

  const handleDownloadPDF = async () => {
    if (!invoiceRef.current || isDownloading) return;
    setIsDownloading(true);
    try {
      const element = invoiceRef.current;
      const canvas = await html2canvas(element, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      const pdf = new jsPDF('p', 'mm', 'a5');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;
      let pdfHeight = pdf.internal.pageSize.getHeight();

      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save(`IFZA_Invoice_${tempInvoiceId}.pdf`);
    } catch (err) {
      alert("পিডিএফ জেনারেট করা যায়নি। সরাসরি প্রিন্ট ব্যবহার করুন।");
    } finally {
      setIsDownloading(false);
    }
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
      
      for (const item of cart) {
        let amt = (item.type === 'SALE' || item.type === 'REPLACE') ? -item.qty : (item.type === 'RETURN' ? item.qty : 0);
        if (amt !== 0) await supabase.rpc('increment_stock', { row_id: item.product.id, amt });
      }

      alert("সফলভাবে সেভ হয়েছে!");
      setShowPreview(false);
      setCart([]);
      setSelectedCustomer(null);
      loadData(); 
    } catch (e: any) { alert(e.message); } finally { setIsSaving(false); }
  };

  const handleDeleteMemo = async (memo: any) => {
    if (user.role !== 'ADMIN') return alert("শুধুমাত্র এডমিন ডিলিট করতে পারবেন!");
    if (!confirm("নিশ্চিত ডিলিট করতে চান? স্টক স্বয়ংক্রিয়ভাবে ফিরে আসবে।")) return;
    setIsSaving(true);
    try {
      for (const item of (memo.items || [])) {
        let rb = (item.type === 'SALE' || item.type === 'REPLACE') ? Number(item.qty) : (item.type === 'RETURN' ? -Number(item.qty) : 0);
        if (rb !== 0 && item.product_id) await supabase.rpc('increment_stock', { row_id: item.product_id, amt: rb });
      }
      const { error } = await supabase.from('transactions').delete().eq('id', memo.id);
      if (error) throw error;
      alert("মেমো ডিলিট হয়েছে!");
      loadData();
    } catch (e) { alert("সমস্যা হয়েছে।"); } finally { setIsSaving(false); }
  };

  const openPreview = () => {
    if (!selectedCustomer || cart.length === 0) return;
    setTempInvoiceId(Math.floor(100000 + Math.random() * 900000).toString());
    fetchLastPayment(selectedCustomer.id);
    setShowPreview(true);
  };

  const prevDue = selectedCustomer ? (companyDues[selectedCustomer.id] || 0) : 0;
  const itemNet = calculateNetTotal();

  return (
    <div className="flex flex-col gap-8 pb-40 animate-reveal text-black">
      <div className="flex flex-col lg:flex-row gap-8 h-fit lg:h-[calc(100vh-160px)] overflow-hidden no-print">
        {/* Product Picker */}
        <div className="flex-1 flex flex-col gap-6 overflow-hidden">
          <div className="bg-white p-6 rounded-[2.5rem] border shadow-sm flex flex-col md:flex-row gap-4 shrink-0">
            <div className="flex-1 flex gap-2 items-center bg-slate-100 p-1.5 rounded-[1.8rem] shadow-inner border border-slate-200">
               <select className="p-3 bg-white rounded-2xl shadow-sm font-bold text-[10px] uppercase outline-none min-w-[120px]" value={selectedArea} onChange={e => setSelectedArea(e.target.value)}>
                  <option value="">সকল এরিয়া</option>
                  {uniqueAreas.map(a => <option key={a} value={a}>{a}</option>)}
               </select>
               <div onClick={() => { setIsDropdownOpen(true); setCustSearch(""); }} className="flex-1 p-3 bg-white rounded-2xl shadow-sm cursor-pointer font-bold text-[11px] uppercase italic text-slate-900 border border-slate-100 truncate flex justify-between items-center hover:border-blue-300">
                  <span>{selectedCustomer ? selectedCustomer.name : "দোকান বাছাই করুন..."}</span>
                  <span className="text-slate-300">▼</span>
               </div>
               <input className="flex-1 p-3 bg-transparent border-none text-[12px] font-medium uppercase outline-none text-black" placeholder="পণ্য খুঁজুন..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 pr-2 custom-scroll">
            {productList.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map(p => (
              <div key={p.id} onClick={() => p.stock > 0 && addToCart(p)} className={`bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all cursor-pointer flex flex-col justify-between h-full ${p.stock <= 0 ? 'opacity-30 pointer-events-none grayscale' : 'active:scale-95'}`}>
                 <div><h4 className="text-[13px] font-black uppercase text-slate-900 leading-tight line-clamp-2">{p.name}</h4></div>
                 <div className="flex justify-between items-end border-t pt-3 border-slate-50 mt-2">
                    <p className="font-medium text-base text-slate-800 tracking-tighter">৳{p.tp}</p>
                    <span className={`text-[8px] font-medium px-2 py-1 rounded-lg italic ${p.stock < 10 ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>Stock: {p.stock}</span>
                 </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cart Hub */}
        <div className="w-full lg:w-[480px] bg-white rounded-[4rem] border shadow-2xl overflow-hidden flex flex-col shrink-0 h-fit lg:h-full">
          <div className="p-6 bg-slate-900 text-white flex flex-col gap-4 shrink-0">
             <div className="flex justify-between items-center"><h3 className="text-sm font-black italic uppercase">মেমো কার্ট ({cart.length})</h3>
                <div className="bg-white/10 px-3 py-1 rounded-lg border flex items-center gap-2"><span className="text-[7px] font-black uppercase opacity-60">Disc %</span><input type="number" className="bg-transparent w-8 font-black text-[11px] outline-none text-blue-400 text-center" value={universalDiscountPercent || ""} onChange={e => setUniversalDiscountPercent(Number(e.target.value))} /></div>
             </div>
             <div className="flex justify-between items-baseline pt-2 border-t border-white/5"><span className="text-[10px] font-black uppercase opacity-40 italic">নিট বিল:</span><span className="text-3xl font-black italic text-blue-400 tracking-tighter">৳{Math.round(calculateNetTotal()).toLocaleString()}</span></div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scroll min-h-[300px]">
            {cart.map((item) => (
              <div key={item.cartId} className={`bg-slate-50 p-6 rounded-[3rem] border relative group animate-reveal ${item.type === 'RETURN' ? 'border-red-100 bg-red-50/10' : item.type === 'REPLACE' ? 'border-purple-100 bg-purple-50/10' : 'border-slate-100'}`}>
                 <button onClick={() => removeFromCart(item.cartId)} className="absolute top-6 right-8 text-slate-300 hover:text-red-500 text-xl font-bold">✕</button>
                 <h4 className="text-[12px] font-black uppercase italic text-slate-800 leading-tight mb-6 pr-10">{item.product.name}</h4>
                 <div className="grid grid-cols-3 gap-2 mb-6">
                    <button onClick={() => updateCartItem(item.cartId, { type: 'SALE' })} className={`py-2 rounded-xl text-[9px] font-black uppercase ${item.type === 'SALE' ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-400 border'}`}>বিক্রি</button>
                    <button onClick={() => updateCartItem(item.cartId, { type: 'RETURN' })} className={`py-2 rounded-xl text-[9px] font-black uppercase ${item.type === 'RETURN' ? 'bg-red-600 text-white shadow-md' : 'bg-white text-slate-400 border'}`}>ফেরত</button>
                    <button onClick={() => updateCartItem(item.cartId, { type: 'REPLACE' })} className={`py-2 rounded-xl text-[9px] font-black uppercase ${item.type === 'REPLACE' ? 'bg-purple-600 text-white shadow-md' : 'bg-white text-slate-400 border'}`}>রিপ্লেস</button>
                 </div>
                 <div className="grid grid-cols-12 gap-3 items-end">
                    <div className="col-span-4"><p className="text-[7px] font-black text-slate-300 uppercase italic">Rate (TP)</p><input disabled={item.type === 'REPLACE'} type="number" className="w-full p-3 bg-white border rounded-xl text-[12px] font-black outline-none" value={item.customPrice} onChange={e => updateCartItem(item.cartId, { customPrice: Number(e.target.value) })} /></div>
                    <div className="col-span-3"><p className="text-[7px] font-black text-blue-400 uppercase italic">Item %</p><input disabled={item.type === 'REPLACE'} type="number" className="w-full p-3 bg-blue-50 border border-blue-100 rounded-xl text-[12px] font-black outline-none text-blue-600" value={item.itemDiscountPercent || ""} onChange={e => updateCartItem(item.cartId, { itemDiscountPercent: Number(e.target.value) })} /></div>
                    <div className="col-span-5"><p className="text-[7px] font-black text-slate-300 uppercase italic text-center">Qty</p>
                       <div className="flex items-center bg-white border rounded-xl p-1 shadow-sm">
                          <button onClick={() => updateCartItem(item.cartId, { qty: Math.max(1, item.qty - 1) })} className="flex-1 py-2 font-black text-xl text-slate-300 hover:text-black">−</button>
                          <input type="number" className="w-8 bg-transparent text-center font-black text-xs outline-none" value={item.qty} onChange={e => updateCartItem(item.cartId, { qty: Number(e.target.value) })} />
                          <button onClick={() => updateCartItem(item.cartId, { qty: item.qty + 1 })} className="flex-1 py-2 font-black text-xl text-slate-300 hover:text-black">+</button>
                       </div>
                    </div>
                 </div>
              </div>
            ))}
          </div>
          <div className="p-8 bg-white shrink-0 border-t"><button disabled={cart.length === 0 || !selectedCustomer} onClick={openPreview} className="w-full bg-blue-600 text-white py-6 rounded-[2rem] font-black uppercase text-[12px] tracking-[0.2em] shadow-xl active:scale-95 transition-all">মেমো প্রিভিউ ও প্রিন্ট</button></div>
        </div>
      </div>

      {/* Invoice Preview Modal */}
      {showPreview && selectedCustomer && (
        <div className="fixed inset-0 bg-slate-900/98 backdrop-blur-xl z-[2000] flex flex-col items-center p-4 overflow-y-auto custom-scroll">
           <div className="w-full max-w-[148mm] flex justify-between gap-4 mb-6 sticky top-0 z-[2001] bg-slate-800 p-4 rounded-[2.5rem] shadow-2xl items-center no-print">
              <button onClick={() => setShowPreview(false)} className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase shadow-lg">← ফিরে যান</button>
              <div className="flex gap-2">
                 <button disabled={isDownloading} onClick={handleDownloadPDF} className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase shadow-lg">ডাউনলোড PDF ⬇</button>
                 <button onClick={() => window.print()} className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase shadow-lg">প্রিন্ট ⎙</button>
                 <button disabled={isSaving} onClick={handleSaveInvoice} className="bg-blue-700 text-white px-8 py-2.5 rounded-xl font-black text-[10px] uppercase shadow-xl active:scale-95">সেভ করুন ➔</button>
              </div>
           </div>

           {/* 📄 HIGH CONTRAST INK-EFFICIENT MEMO (A5) */}
           <div ref={invoiceRef} className="printable-content bg-white w-[148mm] min-h-[210mm] p-8 flex flex-col font-sans text-black shadow-none relative border border-black/20">
              {/* Header */}
              <div className="text-center mb-4 border-b border-black pb-2">
                 <h1 className="text-[26px] font-black uppercase italic leading-none mb-1 text-black">IFZA ELECTRONICS</h1>
                 <p className="text-[10px] font-black uppercase italic tracking-widest text-black">{company} DIVISION</p>
                 <p className="text-[8px] font-bold mt-1 uppercase text-black italic">☎ Hotline: {companyPhones[company] || '01701551690'}</p>
              </div>

              {/* Info Section */}
              <div className="flex justify-between items-start mb-4 text-black border-b border-black pb-3">
                 <div className="space-y-0.5">
                    <p className="text-[7px] font-black uppercase italic opacity-60">ক্রেতা (Customer):</p>
                    <p className="text-[15px] font-black uppercase italic leading-none">{selectedCustomer.name}</p>
                    <p className="text-[9px] font-bold opacity-100">📍 {selectedCustomer.address} | 📱 {selectedCustomer.phone}</p>
                 </div>
                 <div className="text-right space-y-0.5">
                    <p className="text-[7px] font-black uppercase italic opacity-60">ইনভয়েস তথ্য:</p>
                    <p className="text-[10px] font-black">Memo ID: #{tempInvoiceId}</p>
                    <p className="text-[10px] font-black">Date: {new Date().toLocaleDateString('bn-BD')}</p>
                    <p className="text-[7px] font-bold">User: {user.name}</p>
                 </div>
              </div>

              {/* Table */}
              <div className="flex-1">
                 <table className="w-full border-collapse">
                    <thead>
                       <tr className="border-y border-black text-[9px] font-black uppercase italic text-black">
                          <th className="py-2 text-left w-6">#</th>
                          <th className="py-2 text-left">বিবরণ (Products)</th>
                          <th className="py-2 text-center w-12">MRP</th>
                          <th className="py-2 text-center w-12">রেট</th>
                          <th className="py-2 text-center w-10">ছাড়%</th>
                          <th className="py-2 text-center w-8">QTY</th>
                          <th className="py-2 text-right w-20">বিল</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-black/20">
                       {cart.map((it, idx) => {
                          const baseTotal = (it.type === 'REPLACE' ? 0 : it.customPrice) * it.qty;
                          const afterItemDisc = baseTotal * (1 - (it.itemDiscountPercent || 0) / 100);
                          return (
                             <tr key={idx} className="text-[11px] font-bold italic text-black">
                                <td className="py-1.5 opacity-60">{idx + 1}</td>
                                <td className="py-1.5 uppercase leading-tight pr-2">
                                   {it.product.name}
                                   {it.type !== 'SALE' && <span className="ml-1 text-[7px] font-black border border-black px-1">[{it.type}]</span>}
                                </td>
                                <td className="py-1.5 text-center">৳{it.mrp}</td>
                                <td className="py-1.5 text-center">৳{it.type === 'REPLACE' ? 0 : it.customPrice}</td>
                                <td className="py-1.5 text-center">{it.itemDiscountPercent > 0 ? `${it.itemDiscountPercent}%` : '—'}</td>
                                <td className="py-1.5 text-center">{it.qty}</td>
                                <td className="py-1.5 text-right font-black">
                                   {it.type === 'RETURN' ? '-' : ''}৳{Math.round(afterItemDisc).toLocaleString()}
                                </td>
                             </tr>
                          );
                       })}
                    </tbody>
                 </table>
              </div>

              {/* Summary */}
              <div className="mt-4 pt-3 border-t border-black">
                 <div className="flex justify-between items-start">
                    <div className="w-[55%] space-y-4">
                       <div className="border border-black p-2 bg-transparent rounded-lg">
                          <p className="text-[7px] font-black uppercase opacity-60 mb-1 border-b border-black/20 pb-0.5 italic">সর্বশেষ পেমেন্ট (Last Receipt):</p>
                          {lastPayment ? (
                             <div className="text-black">
                               <p className="text-[10px] font-black italic">৳{lastPayment.amount.toLocaleString()}</p>
                               <p className="text-[7px] font-bold italic opacity-70">তারিখ: {lastPayment.date}</p>
                             </div>
                          ) : <p className="text-[8px] italic opacity-50 font-bold">কোনো রেকর্ড নেই</p>}
                       </div>
                       <p className="text-[7px] italic font-bold opacity-80 leading-tight">* "RETURN" মালের বিল কর্তন করা হয়েছে। মাল বুঝে স্বাক্ষর করুন।</p>
                    </div>

                    <div className="w-[40%] space-y-1">
                       <div className="flex justify-between text-[9px] font-bold italic border-b border-black/10 pb-0.5">
                          <span className="opacity-70 uppercase">PREV. DUE:</span>
                          <span className="text-black font-black">৳{prevDue.toLocaleString()}</span>
                       </div>
                       <div className="flex justify-between text-[9px] font-bold italic border-b border-black/10 pb-0.5">
                          <span className="opacity-70 uppercase">ITEM NET:</span>
                          <span className="text-black font-black">৳{Math.round(itemNet).toLocaleString()}</span>
                       </div>
                       <div className="flex justify-between items-center pt-2 mt-1">
                          <span className="text-[10px] font-black uppercase italic">GRAND TOTAL:</span>
                          <span className="text-[20px] font-black italic tracking-tight text-black border-b-2 border-black">৳{(prevDue + Math.round(itemNet)).toLocaleString()}</span>
                       </div>
                    </div>
                 </div>
              </div>

              {/* Signature Area with Seal Effect */}
              <div className="mt-16 flex justify-between items-end mb-6">
                 <div className="text-center w-32 border-t border-black pt-1 font-bold italic text-[10px] opacity-100">ক্রেতার স্বাক্ষর</div>
                 
                 {/* Proprietor Seal Style */}
                 <div className="flex flex-col items-center">
                    <div className="border-[1.5px] border-black px-4 py-1.5 rounded-[1rem] mb-1">
                       <p className="text-[8px] font-black uppercase italic tracking-tighter leading-none mb-0.5">Proprietor</p>
                       <p className="text-[10px] font-black uppercase italic leading-none">S.M. Mostafizur Rahman</p>
                    </div>
                    <div className="w-48 border-t border-black pt-1 text-center">
                       <p className="text-[10px] font-black uppercase italic leading-none">Authority / IFZA HUB</p>
                    </div>
                 </div>
              </div>
              
              {/* Massive Branding Footer */}
              <div className="text-center mt-auto">
                 <div className="border-t border-black pt-2 opacity-100">
                    <h2 className="text-[18px] font-black uppercase italic tracking-[0.2em] text-black">IFZA ELECTRONICS</h2>
                    <p className="text-[7px] font-black tracking-widest uppercase italic opacity-60">Enterprise Cloud Terminal • IFZAERP.COM</p>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Recent Memos */}
      <div className="mt-8 bg-white p-6 md:p-10 rounded-[3.5rem] border shadow-sm no-print animate-reveal">
         <div className="flex justify-between items-center mb-6 border-b pb-4">
            <h3 className="text-lg font-black uppercase italic tracking-tighter">আজকের ইনভয়েসসমূহ</h3>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{recentMemos.length}টি মেমো</span>
         </div>
         <div className="overflow-x-auto custom-scroll">
            <table className="w-full text-left">
               <thead>
                  <tr className="text-[9px] font-black text-slate-400 uppercase border-b">
                     <th className="p-4">দোকানের নাম</th>
                     <th className="p-4 text-right">নিট বিল</th>
                     <th className="p-4 text-right">অ্যাকশন</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                  {recentMemos.map((memo) => (
                    <tr key={memo.id} className="hover:bg-slate-50 transition-colors text-[12px]">
                       <td className="p-4 font-black uppercase italic text-slate-800">{memo.customers?.name}</td>
                       <td className="p-4 text-right font-black italic">৳{Number(memo.amount).toLocaleString()}</td>
                       <td className="p-4 text-right">
                          {user.role === 'ADMIN' && <button onClick={() => handleDeleteMemo(memo)} className="bg-red-50 text-red-500 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase">মুছুন</button>}
                       </td>
                    </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>

      {/* Dropdown Modal for Customer Select */}
      {isDropdownOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md no-print" onClick={() => setIsDropdownOpen(false)}>
           <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl p-6 flex flex-col h-[70vh] animate-reveal" onClick={e => e.stopPropagation()}>
              <div className="relative mb-4">
                <input autoFocus placeholder="দোকানের নাম বা মোবাইল..." className="w-full p-5 bg-slate-50 border rounded-2xl outline-none font-black text-sm uppercase" value={custSearch} onChange={e => setCustSearch(e.target.value)} />
              </div>
              <div className="overflow-y-auto flex-1 custom-scroll pr-2">
                {filteredCustomers.map(c => (
                  <div key={c.id} onClick={() => { setSelectedCustomer(c); setIsDropdownOpen(false); }} className="p-4 hover:bg-blue-600 hover:text-white rounded-2xl cursor-pointer border-b border-slate-50 flex justify-between items-center transition-all group text-black">
                     <div>
                       <p className="font-black text-xs uppercase italic leading-none mb-1 group-hover:text-white">{c.name}</p>
                       <p className="text-[8px] font-bold text-slate-400 uppercase group-hover:text-white/70">📍 {c.address}</p>
                     </div>
                     <p className="text-[12px] font-black group-hover:text-white">৳{(companyDues[c.id] || 0).toLocaleString()}</p>
                  </div>
                ))}
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Sales;
