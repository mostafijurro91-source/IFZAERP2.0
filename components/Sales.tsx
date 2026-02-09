
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
  discountPercent: number;
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
  const [lastPayment, setLastPayment] = useState<{amount: number, date: string} | null>(null);
  const [search, setSearch] = useState("");
  const [custSearch, setCustSearch] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [universalDiscount, setUniversalDiscount] = useState<number>(0);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [tempInvoiceId, setTempInvoiceId] = useState("");
  
  const invoiceRef = useRef<HTMLDivElement>(null);
  const dbCo = mapToDbCompany(company);

  useEffect(() => { loadData(); }, [company]);

  useEffect(() => {
    if (selectedCustomer) {
      fetchLastPayment(selectedCustomer.id);
    }
  }, [selectedCustomer, company]);

  const loadData = async () => {
    const dbCo = mapToDbCompany(company);
    const [prods, custs, txs] = await Promise.all([
      supabase.from('products').select('*').eq('company', dbCo).order('name'),
      supabase.from('customers').select('*').order('name'),
      supabase.from('transactions').select('customer_id, amount, payment_type').eq('company', dbCo)
    ]);
    
    const dues: Record<string, number> = {};
    txs.data?.forEach(t => {
      const a = Number(t.amount) || 0;
      dues[t.customer_id] = (dues[t.customer_id] || 0) + (t.payment_type === 'COLLECTION' ? -a : a);
    });

    const areas = Array.from(new Set(custs.data?.map((c: any) => c.address?.trim()).filter(Boolean) || [])) as string[];
    
    setProductList(prods.data || []);
    setCustomers(custs.data || []);
    setCompanyDues(dues);
    setUniqueAreas(areas.sort());
  };

  const fetchLastPayment = async (cid: string) => {
    try {
      const { data } = await supabase
        .from('transactions')
        .select('amount, created_at')
        .eq('customer_id', cid)
        .eq('payment_type', 'COLLECTION')
        .eq('company', dbCo)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (data && data.length > 0) {
        setLastPayment({ 
          amount: Number(data[0].amount), 
          date: new Date(data[0].created_at).toLocaleDateString('bn-BD') 
        });
      } else {
        setLastPayment(null);
      }
    } catch (e) { console.error(e); }
  };

  const addToCart = (p: Product) => {
    const existing = cart.find(i => i.product.id === p.id && i.type === 'SALE');
    if (existing) {
      updateCartItem(existing.cartId, { qty: existing.qty + 1 });
    } else {
      const initialPrice = p.etp > 0 ? p.etp : p.tp;
      setCart([...cart, { 
        cartId: `${p.id}-${Date.now()}`, 
        product: p, 
        qty: 1, 
        customPrice: initialPrice,
        originalPrice: initialPrice,
        mrp: p.mrp,
        discountPercent: 0, 
        type: 'SALE' 
      }]);
    }
  };

  const updateCartItem = (id: string, update: Partial<CartItem>) => {
    setCart(prev => prev.map(i => i.cartId === id ? { ...i, ...update } : i).filter(i => i.qty > 0));
  };

  const calculateLineTotal = (item: CartItem) => {
    const discountedPrice = item.customPrice * (1 - (item.discountPercent || 0) / 100);
    const total = discountedPrice * item.qty;
    if (item.type === 'RETURN') return -total;
    if (item.type === 'REPLACE') return 0;
    return total;
  };

  const calculateSubtotal = () => cart.reduce((acc, item) => acc + calculateLineTotal(item), 0);

  const calculateNetTotal = () => {
    const sub = calculateSubtotal();
    return sub * (1 - (universalDiscount || 0) / 100);
  };

  const handleSave = async () => {
    if (isSaving || !selectedCustomer || cart.length === 0) return;
    setIsSaving(true);
    try {
      const netTotal = Math.round(calculateNetTotal());

      const { error: txErr } = await supabase.from('transactions').insert([{
        customer_id: selectedCustomer.id, 
        company: dbCo, 
        amount: netTotal, 
        payment_type: 'DUE',
        items: cart.map(i => ({ 
          id: i.product.id, 
          name: i.product.name, 
          qty: i.qty, 
          price: i.customPrice, 
          discount: i.discountPercent,
          type: i.type 
        })),
        submitted_by: user.name
      }]);
      if (txErr) throw txErr;

      for (const i of cart) {
        let change = 0;
        if (i.type === 'SALE' || i.type === 'REPLACE') change = -i.qty;
        if (i.type === 'RETURN') change = i.qty;
        if (change !== 0) await supabase.rpc('increment_stock', { row_id: i.product.id, amt: change });
        
        if (i.type === 'REPLACE') {
          await supabase.from('replacements').insert([{
            customer_id: selectedCustomer.id, product_id: i.product.id,
            company: dbCo, product_name: i.product.name, qty: i.qty, status: 'PENDING'
          }]);
        }
      }

      alert("মেমো সফলভাবে সেভ হয়েছে!");
      setCart([]); setSelectedCustomer(null); setUniversalDiscount(0); setShowPreview(false); loadData();
    } catch (e: any) { alert("Error: " + e.message); } finally { setIsSaving(false); }
  };

  const handleDownloadPDF = async () => {
    if (!invoiceRef.current || isDownloading) return;
    setIsDownloading(true);
    try {
      const element = invoiceRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a5');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save(`IFZA_Invoice_${tempInvoiceId}_${selectedCustomer.name}.pdf`);
    } catch (err) {
      console.error("PDF error:", err);
      alert("পিডিএফ ডাউনলোড সম্ভব হয়নি।");
    } finally {
      setIsDownloading(false);
    }
  };

  const filteredCustomers = customers.filter(c => {
    const q = custSearch.toLowerCase().trim();
    const matchesSearch = c.name.toLowerCase().includes(q) || c.phone.includes(q);
    const matchesArea = !selectedArea || c.address === selectedArea;
    return matchesSearch && matchesArea;
  });

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)] font-sans text-black animate-reveal bg-slate-50/50">
      
      <div className="flex-1 flex flex-col gap-4 no-print overflow-hidden p-4">
        <div className="bg-white p-6 rounded-[2.5rem] border shadow-sm flex flex-col md:flex-row gap-4 shrink-0">
           <div className="flex-1 relative">
              <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block ml-2 italic">দোকান ও এরিয়া</label>
              <div className="flex gap-2">
                 <select 
                    className="p-4 bg-slate-50 border rounded-2xl text-[10px] font-black uppercase outline-none" 
                    value={selectedArea} 
                    onChange={e => setSelectedArea(e.target.value)}
                 >
                    <option value="">সকল এরিয়া</option>
                    {uniqueAreas.map(a => <option key={a} value={a}>{a}</option>)}
                 </select>
                 <button 
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)} 
                    className="flex-1 p-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase text-left flex justify-between items-center"
                 >
                    <span className="truncate">{selectedCustomer ? selectedCustomer.name : "দোকান বাছাই..."}</span>
                    <span>▼</span>
                 </button>
              </div>
              {isDropdownOpen && (
                <div className="absolute z-[500] w-full mt-2 bg-white border-2 rounded-[2rem] shadow-2xl max-h-80 overflow-y-auto p-4 space-y-2">
                   <input 
                    className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-bold text-xs mb-2" 
                    placeholder="দোকান খুঁজুন..." 
                    value={custSearch} 
                    onChange={e => setCustSearch(e.target.value)} 
                   />
                   {filteredCustomers.map(c => (
                     <div key={c.id} onClick={() => { setSelectedCustomer(c); setIsDropdownOpen(false); }} className="p-4 hover:bg-blue-600 hover:text-white rounded-xl cursor-pointer border-b text-[10px] font-black uppercase flex justify-between">
                        <span>{c.name}</span>
                        <span className="text-red-500 font-black">৳{(companyDues[c.id] || 0).toLocaleString()}</span>
                     </div>
                   ))}
                </div>
              )}
           </div>
           <div className="flex-1">
              <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block ml-2 italic">পণ্য সার্চ</label>
              <input 
                className="w-full p-4 bg-slate-50 border rounded-2xl font-black text-xs outline-none" 
                placeholder="পণ্য খুঁজুন..." 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
              />
           </div>
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-4 gap-4 pr-2 custom-scroll pb-20">
          {productList.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map(p => (
            <div key={p.id} onClick={() => p.stock > 0 && addToCart(p)} className={`bg-white p-6 rounded-[2rem] border shadow-sm hover:shadow-2xl transition-all cursor-pointer flex flex-col justify-between group ${p.stock <= 0 ? 'opacity-30 pointer-events-none' : 'hover:-translate-y-1'}`}>
               <p className="text-[11px] font-black uppercase italic leading-tight text-slate-800 line-clamp-2 h-10">{p.name}</p>
               <div className="mt-4 flex justify-between items-end">
                  <p className="text-lg font-black italic">৳{p.tp}</p>
                  <span className="text-[8px] font-black text-slate-400 uppercase">Stock: {p.stock}</span>
               </div>
            </div>
          ))}
        </div>
      </div>

      <div className="lg:w-[480px] bg-slate-50/30 flex flex-col border-l border-slate-200 no-print shadow-2xl">
        <div className="p-8 bg-[#101426] text-white flex justify-between items-center shrink-0 shadow-lg">
           <h3 className="text-[14px] font-black uppercase italic tracking-tighter">মেমো লিস্ট ({cart.length})</h3>
           <div className="flex items-center gap-4">
              <div className="bg-slate-800/80 px-4 py-1.5 rounded-xl border border-white/5 flex items-center gap-2">
                 <span className="text-[7px] font-black uppercase opacity-40">Global %</span>
                 <input 
                    type="number" 
                    className="bg-transparent w-10 text-center font-black text-xs outline-none text-blue-400" 
                    value={universalDiscount} 
                    onChange={e => setUniversalDiscount(Number(e.target.value))} 
                 />
              </div>
              <span className="bg-indigo-600 px-6 py-2 rounded-2xl text-[14px] font-black italic">৳{Math.round(calculateNetTotal()).toLocaleString()}</span>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scroll">
          {cart.map(item => {
            const lineTotal = calculateLineTotal(item);
            return (
              <div key={item.cartId} className={`bg-white p-8 rounded-[3rem] shadow-[0_15px_40_rgba(0,0,0,0.03)] border-2 relative group animate-reveal transition-all ${item.type === 'RETURN' ? 'border-red-200' : item.type === 'REPLACE' ? 'border-purple-200' : 'border-slate-100'}`}>
                 <button onClick={() => updateCartItem(item.cartId, { qty: 0 })} className="absolute top-6 right-8 text-slate-200 hover:text-red-400 text-2xl font-black transition-colors">✕</button>
                 
                 <div className="flex items-center justify-between gap-3 mb-6">
                    <p className="text-[13px] font-black uppercase italic text-slate-900 tracking-tight leading-none truncate max-w-[180px]">{item.product.name}</p>
                    <div className="text-right shrink-0">
                       <p className={`text-xs font-black italic ${lineTotal < 0 ? 'text-red-500' : lineTotal === 0 ? 'text-purple-500' : 'text-slate-900'}`}>
                          {lineTotal < 0 ? '-' : ''}৳{Math.abs(Math.round(lineTotal)).toLocaleString()}
                       </p>
                    </div>
                 </div>

                 <div className="grid grid-cols-3 gap-2 mb-8">
                    <button onClick={() => updateCartItem(item.cartId, { type: 'SALE' })} className={`py-3.5 rounded-2xl text-[10px] font-black uppercase transition-all ${item.type === 'SALE' ? 'bg-[#101426] text-white shadow-xl' : 'bg-slate-50 text-slate-400'}`}>বিক্রি</button>
                    <button onClick={() => updateCartItem(item.cartId, { type: 'RETURN' })} className={`py-3.5 rounded-2xl text-[10px] font-black uppercase transition-all ${item.type === 'RETURN' ? 'bg-red-600 text-white shadow-xl' : 'bg-slate-50 text-slate-400'}`}>ফেরত</button>
                    <button onClick={() => updateCartItem(item.cartId, { type: 'REPLACE' })} className={`py-3.5 rounded-2xl text-[10px] font-black uppercase transition-all ${item.type === 'REPLACE' ? 'bg-purple-600 text-white shadow-xl' : 'bg-slate-50 text-slate-400'}`}>রিপ্লেস</button>
                 </div>

                 <div className="grid grid-cols-12 gap-3 items-end">
                    <div className="col-span-4">
                       <label className="text-[7px] font-black text-slate-300 uppercase ml-4 mb-2 block italic tracking-[0.1em]">Unit Price</label>
                       <div className="relative">
                          {item.type === 'RETURN' && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-red-500 font-black">-</span>}
                          <input 
                            disabled={item.type === 'REPLACE'} 
                            type="number" 
                            className={`w-full p-4 bg-slate-50 text-slate-900 border-none rounded-2xl text-[13px] font-black outline-none shadow-inner disabled:opacity-30 ${item.type === 'RETURN' ? 'pl-7 text-red-600' : ''}`} 
                            value={item.customPrice} 
                            onChange={e => updateCartItem(item.cartId, { customPrice: Number(e.target.value) })} 
                          />
                       </div>
                    </div>
                    <div className="col-span-4">
                       <label className="text-[7px] font-black text-slate-300 uppercase ml-4 mb-2 block italic tracking-[0.1em]">Discount %</label>
                       <input 
                        disabled={item.type === 'REPLACE' || item.type === 'RETURN'} 
                        type="number" 
                        className="w-full p-4 bg-blue-50/50 text-blue-600 border-none rounded-2xl text-[13px] font-black outline-none shadow-inner disabled:opacity-30" 
                        placeholder="0" 
                        value={item.discountPercent || ""} 
                        onChange={e => updateCartItem(item.cartId, { discountPercent: Number(e.target.value) })} 
                       />
                    </div>
                    <div className="col-span-4">
                       <div className="flex items-center bg-slate-50 rounded-2xl overflow-hidden p-1 shadow-inner border border-slate-100">
                          <button onClick={() => updateCartItem(item.cartId, { qty: Math.max(0, item.qty - 1) })} className="flex-1 py-3 font-black text-lg text-slate-400 hover:text-slate-900">-</button>
                          <input type="number" className="w-8 bg-transparent text-slate-900 text-center text-[14px] font-black outline-none" value={item.qty} onChange={e => updateCartItem(item.cartId, { qty: Number(e.target.value) })} />
                          <button onClick={() => updateCartItem(item.cartId, { qty: item.qty + 1 })} className="flex-1 py-3 font-black text-lg text-slate-400 hover:text-slate-900">+</button>
                       </div>
                    </div>
                 </div>
              </div>
            );
          })}
          {cart.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-20 py-40">
               <div className="text-7xl mb-6">📄</div>
               <p className="text-sm font-black uppercase tracking-widest">কার্টে কোনো পণ্য নেই</p>
            </div>
          )}
        </div>

        <div className="p-10 bg-white shrink-0 border-t border-slate-100">
           <button 
              disabled={cart.length === 0 || !selectedCustomer} 
              onClick={() => { 
                setTempInvoiceId(Math.floor(100000+Math.random()*900000).toString()); 
                setShowPreview(true); 
              }} 
              className="w-full bg-[#101426] text-white py-8 rounded-[2.5rem] font-black uppercase text-[14px] tracking-tighter shadow-2xl active:scale-95 transition-all disabled:opacity-20 flex items-center justify-center gap-4"
           >
              মেমো প্রিভিউ ও প্রিন্ট
           </button>
        </div>
      </div>

      {showPreview && selectedCustomer && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-3xl z-[2000] flex flex-col items-center p-4 md:p-10 overflow-y-auto no-print">
          <div className="w-full max-w-[148mm] flex justify-between gap-6 mb-8 sticky top-0 z-[2001] bg-slate-900/90 p-6 rounded-3xl border border-white/10 shadow-2xl">
            <button onClick={() => setShowPreview(false)} className="text-white font-black uppercase text-[10px] px-6">← Edit</button>
            <div className="flex gap-4">
              <button disabled={isDownloading} onClick={handleDownloadPDF} className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-black text-[10px] uppercase shadow-lg">
                {isDownloading ? "Downloading..." : "Download PDF ⬇"}
              </button>
              <button onClick={() => window.print()} className="bg-white text-slate-900 px-10 py-3 rounded-xl font-black text-[10px] uppercase">প্রিন্ট (A5) ⎙</button>
              <button disabled={isSaving} onClick={handleSave} className="bg-blue-600 text-white px-10 py-3 rounded-xl font-black text-[10px] uppercase">সেভ করুন ➔</button>
            </div>
          </div>

          <div ref={invoiceRef} className="bg-white w-full max-w-[148mm] p-6 md:p-8 flex flex-col min-h-fit text-black font-sans printable-content shadow-2xl relative border-[3px] border-black">
            <style>{`
              @media print {
                @page { size: A5; margin: 10mm; }
                body * { visibility: hidden !important; }
                .printable-content, .printable-content * { 
                  visibility: visible !important; 
                  color: #000000 !important; 
                  border-color: #000000 !important;
                  -webkit-print-color-adjust: exact;
                }
                .printable-content { position: static !important; width: 100% !important; padding: 0 !important; border: none !important; box-shadow: none !important; display: block !important; }
                .no-print { display: none !important; }
                table { border-collapse: collapse; width: 100%; border: 1px solid #000 !important; page-break-inside: auto; }
                tr { page-break-inside: avoid; page-break-after: auto; }
                th { background-color: #000 !important; color: #fff !important; padding: 6px 2px !important; border: 1px solid #000 !important; font-size: 9px !important; }
                td { border: 1px solid #000 !important; padding: 4px 2px !important; font-size: 10px !important; color: #000 !important; }
                .footer-box { page-break-inside: avoid; }
              }
            `}</style>
            
            <div className="text-center border-b-[3px] border-black pb-3 mb-6">
               <h1 className="text-4xl font-black uppercase tracking-tighter mb-1 text-black">IFZA ELECTRONICS</h1>
               <p className="text-lg font-black uppercase tracking-[0.2em] mb-1 text-black">{company} DIVISION</p>
               <p className="text-[10px] font-bold uppercase text-black italic">Cash Memo / Invoice (A5)</p>
            </div>

            <div className="flex justify-between items-start mb-6 text-[11px] text-black">
              <div className="space-y-1">
                <p className="font-black border-b border-black w-fit mb-1 text-[9px]">ক্রেতার তথ্য:</p>
                <p className="text-xl font-black uppercase italic leading-none">{selectedCustomer.name}</p>
                <p className="font-bold">ঠিকানা: {selectedCustomer.address}</p>
                <p className="font-bold">মোবাইল: {selectedCustomer.phone}</p>
              </div>
              <div className="text-right space-y-1">
                 <p className="font-black border-b border-black w-fit ml-auto mb-1 text-[9px]">মেমো তথ্য:</p>
                 <p className="font-black text-xs">ইনভয়েস নং: #{tempInvoiceId}</p>
                 <p className="font-black">তারিখ: {new Date().toLocaleDateString('bn-BD')}</p>
                 <p className="font-black text-[9px] mt-1 text-slate-600">বিক্রয় প্রতিনিধি: {user.name}</p>
              </div>
            </div>

            <div className="flex-1">
              <table className="w-full text-left border-collapse border-[2px] border-black">
                <thead>
                  <tr className="bg-black text-white text-[9px] font-black uppercase italic">
                    <th className="px-2 py-2 border border-black text-left">বিবরণ</th>
                    <th className="px-1 py-2 border border-black text-center w-14">MRP</th>
                    <th className="px-1 py-2 border border-black text-center w-14">রেট (TP)</th>
                    <th className="px-1 py-2 border border-black text-center w-10">Qty</th>
                    <th className="px-2 py-2 border border-black text-right w-20">বিল</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item, idx) => {
                    let lineTotal = calculateLineTotal(item);
                    return (
                      <tr key={idx} className="font-bold text-[11px] text-black border-b border-black">
                        <td className="px-2 py-1.5 border border-black uppercase italic text-[9px]">
                           {item.product.name} 
                           {item.type !== 'SALE' && <span className={`ml-2 px-1 rounded text-[7px] font-black uppercase border border-black`}>{item.type}</span>}
                        </td>
                        <td className="px-1 py-1.5 border border-black text-center italic text-[9px]">
                          ৳{item.product.mrp.toLocaleString()}
                        </td>
                        <td className="px-1 py-1.5 border border-black text-center italic text-[9px]">
                          ৳{(item.type === 'REPLACE' ? 0 : item.customPrice).toLocaleString()}
                        </td>
                        <td className="px-1 py-1.5 border border-black text-center font-black">{item.qty}</td>
                        <td className={`px-2 py-1.5 border border-black text-right font-black italic ${item.type === 'RETURN' ? 'text-red-600' : ''}`}>
                           {item.type === 'RETURN' ? '-' : ''}৳{Math.abs(Math.round(lineTotal)).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="footer-box mt-6 border-t-[3px] border-black pt-4 page-break-inside-avoid">
               <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 space-y-3">
                     <div className="p-3 bg-white border-[1.5px] border-black rounded-lg">
                        <p className="text-[8px] font-black uppercase underline mb-1 text-black italic">সর্বশেষ পেমেন্ট:</p>
                        {lastPayment ? (
                           <div className="text-black space-y-0.5">
                              <p className="text-xs font-black italic">৳{lastPayment.amount.toLocaleString()}</p>
                              <p className="text-[8px] font-black italic">📅 {lastPayment.date}</p>
                           </div>
                        ) : (
                           <p className="text-[8px] font-bold text-black opacity-60">রেকর্ড নেই</p>
                        )}
                     </div>
                     <p className="text-[7px] font-black uppercase text-black italic leading-tight">
                        * "RETURN" মাল স্টকে যুক্ত হয়েছে।<br/>
                        * "REPLACE" মাল ০ টাকা মেমো।
                     </p>
                  </div>

                  <div className="w-48 space-y-2 font-black italic text-black">
                     <div className="flex justify-between text-[10px]"><span>PREV. DUE:</span><span>৳{(companyDues[selectedCustomer.id] || 0).toLocaleString()}</span></div>
                     <div className="flex justify-between text-[10px]"><span>ITEM NET:</span><span>৳{Math.round(calculateSubtotal()).toLocaleString()}</span></div>
                     <div className="flex justify-between text-2xl font-black tracking-tighter border-[2px] border-black p-2 bg-white">
                        <span className="text-[10px] self-center">TOTAL:</span>
                        <span>৳{Math.round((companyDues[selectedCustomer.id] || 0) + calculateNetTotal()).toLocaleString()}</span>
                     </div>
                  </div>
               </div>

               <div className="flex justify-between items-end mt-16 text-[10px] font-black uppercase italic text-black pb-4">
                  <div className="text-center w-32 border-t-[1.5px] border-black pt-1.5">ক্রেতার স্বাক্ষর</div>
                  <div className="text-center w-48 border-t-[1.5px] border-black pt-1.5">
                     <p className="text-[8px] font-bold">SM MOSTAFIZUR RAHMAN</p>
                     <p className="text-[7px] font-bold">PROPRIETOR, IFZA ELECTRONICS</p>
                     <p className="mt-1 text-xs">কর্তৃপক্ষের স্বাক্ষর</p>
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sales;
