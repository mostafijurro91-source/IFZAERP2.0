
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User, Advertisement, formatCurrency, Company, Product } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';
import { jsPDF } from 'jspdf';
import * as html2canvasModule from 'html2canvas';

const html2canvas = (html2canvasModule as any).default || html2canvasModule;

interface PortalProps {
  type: 'DASHBOARD' | 'CATALOG' | 'LEDGER' | 'ORDER';
  user: User;
}

interface CompanyStats {
  balance: number;
  totalBill: number;
  totalPaid: number;
}

const CustomerPortal: React.FC<PortalProps> = ({ type, user }) => {
  const [activeCompany, setActiveCompany] = useState<Company>('Transtec');
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentAdIndex, setCurrentAdIndex] = useState(0);
  const [productSearch, setProductSearch] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSavingOrder, setIsSavingOrder] = useState(false);

  // Order Cart State
  const [orderCart, setOrderCart] = useState<any[]>([]);

  const ledgerRef = useRef<HTMLDivElement>(null);
  const sliderTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [multiStats, setMultiStats] = useState<Record<string, CompanyStats>>({
    'Transtec': { balance: 0, totalBill: 0, totalPaid: 0 },
    'SQ Light': { balance: 0, totalBill: 0, totalPaid: 0 },
    'SQ Cables': { balance: 0, totalBill: 0, totalPaid: 0 }
  });

  const companies: Company[] = ['Transtec', 'SQ Light', 'SQ Cables'];

  useEffect(() => {
    fetchAllData();
    if (type === 'DASHBOARD') fetchAds();
  }, [user.customer_id, type]);

  useEffect(() => {
    if (type === 'CATALOG' || type === 'ORDER') fetchProducts();
    if (type === 'LEDGER') fetchLedgerForCompany(activeCompany);
  }, [type, activeCompany]);

  // 🎡 Slider Timer
  useEffect(() => {
    if (ads.length > 1) {
      sliderTimerRef.current = setInterval(() => {
        setCurrentAdIndex(prev => (prev + 1) % ads.length);
      }, 5000);
    }
    return () => { if (sliderTimerRef.current) clearInterval(sliderTimerRef.current); };
  }, [ads.length]);

  const fetchAds = async () => {
    const { data } = await supabase.from('advertisements').select('*').order('created_at', { ascending: false });
    setAds(data || []);
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const dbCo = mapToDbCompany(activeCompany);
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('company', dbCo)
        .order('name');
      
      if (error) throw error;
      setProducts(data || []);
    } catch (err) {
      console.error("Product fetch error:", err);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchLedgerForCompany = async (co: Company) => {
    if (!user.customer_id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('customer_id', user.customer_id)
        .eq('company', mapToDbCompany(co))
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setLedger(data || []);
    } catch (err) {
      console.error("Ledger fetch error:", err);
      setLedger([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllData = async () => {
    if (!user.customer_id) return;
    setIsSyncing(true);
    try {
      const { data: allTxs, error } = await supabase
        .from('transactions')
        .select('amount, payment_type, company')
        .eq('customer_id', user.customer_id);
      
      if (error) throw error;

      const stats: Record<string, CompanyStats> = {
        'Transtec': { balance: 0, totalBill: 0, totalPaid: 0 },
        'SQ Light': { balance: 0, totalBill: 0, totalPaid: 0 },
        'SQ Cables': { balance: 0, totalBill: 0, totalPaid: 0 }
      };

      (allTxs || []).forEach(tx => {
        const dbCo = mapToDbCompany(tx.company);
        if (stats[dbCo]) {
          const amt = Number(tx.amount) || 0;
          if (tx.payment_type === 'COLLECTION') {
            stats[dbCo].totalPaid += amt;
            stats[dbCo].balance -= amt;
          } else {
            stats[dbCo].totalBill += amt;
            stats[dbCo].balance += amt;
          }
        }
      });
      setMultiStats(stats);
    } catch (err) {
      console.error("Stats calculation error:", err);
    } finally {
      setIsSyncing(false);
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!ledgerRef.current || isDownloading) return;
    setIsDownloading(true);
    try {
      const element = ledgerRef.current;
      const canvas = await html2canvas(element, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, imgHeight);
      pdf.save(`Statement_${user.name}_${activeCompany}_${new Date().getTime()}.pdf`);
    } catch (err) {
      alert("পিডিএফ ডাউনলোড ব্যর্থ হয়েছে।");
    } finally {
      setIsDownloading(false);
    }
  };

  const addToCart = (p: Product) => {
    const existing = orderCart.find(item => item.id === p.id);
    if (existing) {
      setOrderCart(orderCart.map(item => item.id === p.id ? { ...item, qty: item.qty + 1 } : item));
    } else {
      setOrderCart([...orderCart, { ...p, qty: 1, action: 'SALE' }]);
    }
  };

  const updateCartItem = (id: string, updates: any) => {
    setOrderCart(prev => 
      prev.map(item => item.id === id ? { ...item, ...updates } : item)
    );
  };

  const removeFromCart = (id: string) => {
    setOrderCart(prev => prev.filter(item => item.id !== id));
  };

  const submitOrder = async () => {
    if (orderCart.length === 0 || isSavingOrder) return;
    if (orderCart.some(i => (i.qty || 0) <= 0)) {
       alert("দয়া করে সকল পণ্যের পরিমাণ (Quantity) ১ বা তার বেশি দিন।");
       return;
    }
    if (!confirm("আপনি কি নিশ্চিতভাবে এই অর্ডারটি কনফার্ম করতে চান?")) return;

    setIsSavingOrder(true);
    try {
      const dbCo = mapToDbCompany(activeCompany);
      const totalAmt = orderCart.reduce((sum, item) => {
         const q = Number(item.qty) || 0;
         if (item.action === 'RETURN') return sum - (item.tp * q);
         if (item.action === 'REPLACE') return sum;
         return sum + (item.tp * q);
      }, 0);
      
      const { error } = await supabase.from('market_orders').insert([{
        customer_id: user.customer_id,
        company: dbCo,
        total_amount: totalAmt,
        status: 'PENDING',
        items: orderCart.map(i => ({ 
          id: i.id, 
          name: i.name, 
          price: i.tp, 
          qty: i.qty, 
          mrp: i.mrp, 
          action: i.action || 'SALE' 
        })),
        created_by: `CUSTOMER: ${user.name}`
      }]);

      if (error) throw error;

      alert("আপনার অর্ডারটি সফলভাবে পাঠানো হয়েছে! কর্তৃপক্ষ শীঘ্রই আপনার সাথে যোগাযোগ করবে।");
      setOrderCart([]);
    } catch (err: any) {
      alert("অর্ডার পাঠাতে সমস্যা হয়েছে: " + err.message);
    } finally {
      setIsSavingOrder(false);
    }
  };

  const getBrandTheme = (co: string) => {
    switch (co) {
      case 'Transtec': return { gradient: 'from-amber-400 to-orange-600', shadow: 'shadow-orange-200', icon: '⚡' };
      case 'SQ Light': return { gradient: 'from-cyan-400 to-blue-600', shadow: 'shadow-cyan-100', icon: '💡' };
      case 'SQ Cables': return { gradient: 'from-rose-500 to-red-700', shadow: 'shadow-red-100', icon: '🔌' };
      default: return { gradient: 'from-slate-400 to-slate-600', shadow: 'shadow-slate-100', icon: '💎' };
    }
  };

  const filteredProducts = products.filter(p => 
    (p.name || "").toLowerCase().includes((productSearch || "").toLowerCase()) &&
    (p.stock || 0) > 0
  );

  const currentStat = multiStats[activeCompany] || { balance: 0 };
  const totalCartValue = orderCart.reduce((sum, item) => {
    const amt = item.mrp * (item.qty || 0);
    if (item.action === 'RETURN') return sum - amt;
    if (item.action === 'REPLACE') return sum;
    return sum + amt;
  }, 0);

  return (
    <div className="space-y-12 pb-40 animate-reveal font-sans text-slate-900 bg-[#f8fafc]">
      
      {/* 🟢 VIEW 1: DASHBOARD */}
      {type === 'DASHBOARD' && (
        <div className="space-y-14">
          <div className="relative group overflow-hidden rounded-[4.5rem] shadow-2xl border-8 border-white h-[450px] md:h-[600px] bg-slate-950">
             {ads.length > 0 ? (
               ads.map((ad, idx) => {
                 const theme = getBrandTheme(ad.company);
                 return (
                    <div 
                      key={ad.id} 
                      className={`absolute inset-0 transition-all duration-1000 ${idx === currentAdIndex ? 'opacity-100 scale-100' : 'opacity-0 scale-110'}`}
                    >
                       {ad.image_url && <img src={ad.image_url} className="w-full h-full object-cover opacity-60" alt="" />}
                       <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent p-12 flex flex-col justify-end">
                          <span className={`bg-gradient-to-r ${theme.gradient} text-white px-6 py-2 rounded-full text-[10px] font-black uppercase italic mb-6 w-fit`}>
                             {theme.icon} {ad.company} | {(ad.type || "").replace('_', ' ')}
                          </span>
                          <h3 className="text-4xl md:text-8xl font-black text-white uppercase italic tracking-tighter leading-tight drop-shadow-2xl">{ad.title}</h3>
                       </div>
                    </div>
                 )
               })
             ) : <div className="h-full flex items-center justify-center text-white/10 font-black text-6xl italic">IFZA HUB</div>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
             {companies.map(co => {
                const theme = getBrandTheme(co);
                const stat = multiStats[co] || { balance: 0, totalBill: 0, totalPaid: 0 };
                return (
                  <div key={co} className="bg-white rounded-[4rem] p-12 shadow-xl border border-slate-100 relative overflow-hidden group">
                     <div className={`w-20 h-20 rounded-[2.2rem] bg-gradient-to-br ${theme.gradient} flex items-center justify-center text-white text-4xl font-black mb-10 shadow-2xl ${theme.shadow}`}>{theme.icon}</div>
                     <h4 className="text-2xl font-black uppercase italic text-slate-800 tracking-tighter mb-4">{co}</h4>
                     <p className="text-[11px] font-black text-slate-400 uppercase italic mb-2">Active Balance Due</p>
                     <p className={`text-5xl font-black italic tracking-tighter ${(stat.balance || 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>৳{(stat.balance || 0).toLocaleString()}</p>
                  </div>
                )
             })}
          </div>

          <div className="bg-slate-900 p-14 rounded-[5rem] text-white flex flex-col md:flex-row justify-between items-center gap-10 shadow-2xl relative overflow-hidden">
             <div className="relative z-10 flex flex-col md:flex-row items-center gap-10 text-center md:text-left">
                <div className="w-40 h-40 bg-white/5 rounded-[3.5rem] border border-white/10 flex items-center justify-center text-7xl shadow-inner animate-float">📱</div>
                <div>
                   <h3 className="text-4xl font-black uppercase italic tracking-tighter mb-4">স্বাগতম, {user.name}</h3>
                   <p className="text-slate-400 text-lg mb-8 uppercase tracking-widest italic">হেড অফিস যোগাযোগ: 01727544275</p>
                   <a href="tel:01727544275" className="bg-emerald-600 px-12 py-5 rounded-full font-black text-sm uppercase tracking-widest inline-flex items-center gap-4 hover:bg-emerald-700 transition-all active:scale-95">📞 কল করুন (Call Now)</a>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* 📒 VIEW 2: LEDGER */}
      {type === 'LEDGER' && (
        <div className="space-y-10 animate-reveal">
           <div className="bg-slate-900 p-10 md:p-12 rounded-[4rem] text-white shadow-2xl flex flex-col md:flex-row justify-between items-center gap-8">
              <div>
                 <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter leading-none mb-4">ব্যক্তিগত লেজার</h2>
                 <p className="text-slate-500 font-bold uppercase tracking-widest italic">Statement History • {activeCompany}</p>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                 <button 
                   disabled={isDownloading || loading}
                   onClick={handleDownloadPDF}
                   className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl active:scale-95 transition-all flex items-center gap-3"
                 >
                   {isDownloading ? "তৈরি হচ্ছে..." : "স্টেটমেন্ট ডাউনলোড ⎙"}
                 </button>
                 <div className="flex gap-2 bg-white/5 p-1 rounded-2xl">
                    {companies.map(co => (
                      <button key={co} onClick={() => setActiveCompany(co)} className={`px-6 py-3 rounded-xl font-black uppercase text-[9px] whitespace-nowrap transition-all ${activeCompany === co ? 'bg-white text-slate-900 shadow-md scale-105' : 'text-slate-500 hover:text-white'}`}>{co}</button>
                    ))}
                 </div>
              </div>
           </div>

           <div className="bg-white rounded-[4rem] border shadow-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                 <thead>
                    <tr className="bg-slate-50 text-[11px] font-black text-slate-400 uppercase tracking-widest border-b">
                       <th className="px-6 md:px-14 py-8 md:py-10">তারিখ</th>
                       <th className="px-6 md:px-14 py-8 md:py-10">বিবরণ</th>
                       <th className="px-6 md:px-14 py-8 md:py-10 text-right">ডেবিট (বাকি)</th>
                       <th className="px-6 md:px-14 py-8 md:py-10 text-right">ক্রেডিট (জমা)</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                    {loading ? (
                       <tr><td colSpan={4} className="p-40 text-center animate-pulse font-black uppercase text-slate-300">তথ্য লোড হচ্ছে...</td></tr>
                    ) : ledger.map(tx => (
                      <tr key={tx.id} className="hover:bg-blue-50/30 transition-all font-bold group">
                         <td className="px-6 md:px-14 py-8 md:py-12 text-slate-400 italic font-black">{new Date(tx.created_at).toLocaleDateString('bn-BD')}</td>
                         <td className="px-6 md:px-14 py-8 md:py-12 uppercase italic font-black">
                            {tx.payment_type === 'COLLECTION' ? '💰 নগদ জমা' : '📄 সেলস মেমো'}
                            <p className="text-[8px] opacity-40 font-normal">Ref: #{tx.id.slice(-6).toUpperCase()}</p>
                         </td>
                         <td className="px-6 md:px-14 py-8 md:py-12 text-right text-red-600 text-lg md:text-2xl font-black italic">
                            {tx.payment_type !== 'COLLECTION' ? `৳${Math.round(tx.amount || 0).toLocaleString()}` : '—'}
                         </td>
                         <td className="px-6 md:px-14 py-8 md:py-12 text-right text-emerald-600 text-lg md:text-2xl font-black italic">
                            {tx.payment_type === 'COLLECTION' ? `৳${Math.round(tx.amount || 0).toLocaleString()}` : '—'}
                         </td>
                      </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </div>
      )}

      {/* 🛒 VIEW 3: ORDER (Market Order Feature) */}
      {type === 'ORDER' && (
        <div className="space-y-10 animate-reveal">
           <div className="bg-slate-900 p-10 md:p-12 rounded-[4rem] text-white shadow-2xl flex flex-col md:flex-row justify-between items-center gap-8">
              <div>
                 <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter leading-none mb-4">অর্ডার কাটুন</h2>
                 <p className="text-slate-500 font-bold uppercase tracking-widest italic">Place Your Market Order • {activeCompany}</p>
              </div>
              <div className="flex gap-2 bg-white/5 p-1 rounded-2xl">
                 {companies.map(co => (
                   <button key={co} onClick={() => setActiveCompany(co)} className={`px-6 py-3 rounded-xl font-black uppercase text-[9px] whitespace-nowrap transition-all ${activeCompany === co ? 'bg-blue-600 text-white shadow-md scale-105' : 'text-slate-500 hover:text-white'}`}>{co}</button>
                 ))}
              </div>
           </div>

           <div className="flex flex-col lg:flex-row gap-10">
              {/* Product List */}
              <div className="flex-1 space-y-6">
                 <div className="relative">
                    <input 
                      className="w-full p-8 md:p-10 bg-white border-2 rounded-[3.5rem] text-xl md:text-2xl font-black uppercase italic shadow-sm outline-none focus:border-blue-600 transition-all pl-16 md:pl-20" 
                      placeholder="মডেল সার্চ করুন..." 
                      value={productSearch} 
                      onChange={e => setProductSearch(e.target.value)} 
                    />
                    <span className="absolute left-6 md:left-8 top-1/2 -translate-y-1/2 text-2xl md:text-4xl opacity-20">🔍</span>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[600px] overflow-y-auto custom-scroll pr-2">
                    {loading ? (
                       <div className="col-span-full py-20 text-center animate-pulse text-slate-300 font-black uppercase italic">লোড হচ্ছে...</div>
                    ) : filteredProducts.map(p => (
                       <div key={p.id} onClick={() => addToCart(p)} className="bg-white p-8 rounded-[3.5rem] border-2 border-transparent shadow-sm hover:border-blue-600 hover:shadow-xl transition-all cursor-pointer flex justify-between items-center group active:scale-95">
                          <div className="min-w-0 pr-4">
                             <h4 className="text-lg font-black uppercase italic text-slate-800 leading-tight mb-2 truncate">{p.name}</h4>
                             <div className="flex flex-col gap-1">
                                <p className="text-[11px] font-black text-blue-600 italic leading-none">MRP: ৳{(p.mrp || 0).toLocaleString()}</p>
                                <p className="text-[10px] font-black uppercase tracking-widest leading-none text-emerald-500">Available In Stock</p>
                             </div>
                          </div>
                          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 font-black text-xl group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">+</div>
                       </div>
                    ))}
                 </div>
              </div>

              {/* Shopping Cart */}
              <div className="w-full lg:w-[450px] space-y-6">
                 <div className="bg-white p-10 rounded-[4rem] shadow-xl border border-slate-100 flex flex-col h-[700px]">
                    <div className="border-b pb-8 mb-8 flex justify-between items-center">
                       <h3 className="text-xl font-black uppercase italic text-slate-900">অর্ডার লিস্ট 🛒</h3>
                       <span className="bg-blue-100 text-blue-600 px-4 py-1 rounded-full text-[10px] font-black">{orderCart.length} আইটেম</span>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scroll space-y-4 pr-2">
                       {orderCart.length === 0 ? (
                         <div className="h-full flex flex-col items-center justify-center opacity-10 text-center py-20">
                            <span className="text-8xl mb-4">👜</span>
                            <p className="font-black uppercase tracking-widest text-sm">আপনার ব্যাগ খালি</p>
                         </div>
                       ) : orderCart.map(item => (
                         <div key={item.id} className="bg-slate-50 p-6 rounded-[2.5rem] border border-slate-100 animate-reveal relative group">
                            <button 
                              onClick={() => removeFromCart(item.id)} 
                              className="absolute top-4 right-4 w-10 h-10 bg-red-600 text-white rounded-full flex items-center justify-center text-sm shadow-xl active:scale-90 transition-all z-10"
                              title="মুছে ফেলুন"
                            >
                              ✕
                            </button>
                            <p className="text-[11px] font-black uppercase italic text-slate-800 mb-4 pr-10">{item.name}</p>
                            
                            <div className="flex flex-col gap-4">
                               <div className="flex justify-between items-center">
                                  <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border shadow-inner">
                                     <button onClick={() => updateCartItem(item.id, { qty: Math.max(0, (item.qty || 0) - 1) })} className="w-10 h-10 font-black text-xl hover:text-red-500 transition-colors">−</button>
                                     <input 
                                       type="number" 
                                       className="w-16 h-10 text-center font-black text-lg bg-slate-50 rounded-lg outline-none focus:ring-2 ring-blue-200 transition-all"
                                       value={item.qty === 0 ? "" : item.qty}
                                       onChange={(e) => {
                                          const valString = e.target.value;
                                          const val = valString === "" ? 0 : parseInt(valString);
                                          updateCartItem(item.id, { qty: isNaN(val) ? 0 : val });
                                       }}
                                       min="0"
                                     />
                                     <button onClick={() => updateCartItem(item.id, { qty: (item.qty || 0) + 1 })} className="w-10 h-10 font-black text-xl hover:text-blue-600 transition-colors">+</button>
                                  </div>
                                  <div className="text-right">
                                     <p className="text-[10px] font-black text-slate-400 leading-none">Total MRP</p>
                                     <p className="text-lg font-black italic text-slate-900 mt-1">৳{((item.mrp || 0) * (item.qty || 0)).toLocaleString()}</p>
                                  </div>
                               </div>

                               <div className="flex gap-2 p-1 bg-white/50 rounded-2xl border border-slate-100">
                                  <button 
                                    onClick={() => updateCartItem(item.id, { action: 'SALE' })}
                                    className={`flex-1 py-2 rounded-xl font-black text-[9px] uppercase tracking-tighter transition-all ${item.action === 'SALE' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                                  >
                                    Order (S)
                                  </button>
                                  <button 
                                    onClick={() => updateCartItem(item.id, { action: 'RETURN' })}
                                    className={`flex-1 py-2 rounded-xl font-black text-[9px] uppercase tracking-tighter transition-all ${item.action === 'RETURN' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                                  >
                                    Return (R)
                                  </button>
                                  <button 
                                    onClick={() => updateCartItem(item.id, { action: 'REPLACE' })}
                                    className={`flex-1 py-2 rounded-xl font-black text-[9px] uppercase tracking-tighter transition-all ${item.action === 'REPLACE' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                                  >
                                    Replace (Rp)
                                  </button>
                               </div>
                            </div>
                         </div>
                       ))}
                    </div>

                    <div className="mt-8 pt-8 border-t space-y-8">
                       <div className="flex justify-between items-end">
                          <div>
                             <p className="text-[10px] font-black text-slate-400 uppercase italic mb-1">নিট বিল (MRP অনুযায়ী)</p>
                             <p className={`text-4xl font-black italic tracking-tighter ${totalCartValue < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                                ৳{Math.abs(totalCartValue).toLocaleString()}{totalCartValue < 0 ? ' [Return]' : ''}
                             </p>
                          </div>
                       </div>
                       <button 
                         disabled={orderCart.length === 0 || isSavingOrder} 
                         onClick={submitOrder}
                         className="w-full bg-blue-600 text-white py-8 rounded-[3rem] font-black uppercase text-xs tracking-[0.3em] shadow-2xl active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center gap-4 group"
                       >
                          {isSavingOrder ? "অর্ডার পাঠানো হচ্ছে..." : <>অর্ডার কনফার্ম করুন <span className="group-hover:translate-x-2 transition-transform">➔</span></>}
                       </button>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* 📢 VIEW 4: CATALOG */}
      {type === 'CATALOG' && (
        <div className="space-y-10 animate-reveal">
           <div className="bg-slate-900 p-12 rounded-[4rem] text-white shadow-2xl flex flex-col md:flex-row justify-between items-center gap-8">
              <div>
                 <h2 className="text-5xl font-black uppercase italic tracking-tighter leading-none mb-4">অফার ও ক্যাটালগ</h2>
                 <p className="text-slate-500 font-bold uppercase tracking-widest italic">Digital Price List • {activeCompany}</p>
              </div>
              <div className="flex gap-2 w-full md:w-auto overflow-x-auto no-scrollbar">
                 {companies.map(co => (
                   <button key={co} onClick={() => setActiveCompany(co)} className={`px-10 py-5 rounded-3xl font-black uppercase text-[11px] transition-all whitespace-nowrap ${activeCompany === co ? 'bg-amber-600 text-white shadow-xl scale-105' : 'bg-white/5 text-slate-400'}`}>{co}</button>
                 ))}
              </div>
           </div>

           <div className="relative">
              <input 
                className="w-full p-8 md:p-10 bg-white border-2 rounded-[3.5rem] text-xl md:text-2xl font-black uppercase italic shadow-sm outline-none focus:border-blue-600 transition-all pl-16 md:pl-20" 
                placeholder="মডেল সার্চ করুন..." 
                value={productSearch} 
                onChange={e => setProductSearch(e.target.value)} 
              />
              <span className="absolute left-6 md:left-8 top-1/2 -translate-y-1/2 text-2xl md:text-4xl opacity-20">🔍</span>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {loading ? (
                <div className="col-span-full py-40 text-center animate-pulse font-black uppercase text-slate-300">পণ্য তালিকা লোড হচ্ছে...</div>
              ) : filteredProducts.map(p => {
                 const theme = getBrandTheme(activeCompany);
                 return (
                   <div key={p.id} className="bg-white p-8 md:p-12 rounded-[4rem] border shadow-sm group hover:shadow-2xl transition-all animate-reveal">
                      <p className="text-[10px] font-black text-slate-400 uppercase italic mb-8">SKU: #{(p.id || "").slice(-4).toUpperCase()}</p>
                      <h4 className="text-xl md:text-2xl font-black uppercase italic text-slate-800 leading-tight mb-12 min-h-[60px] group-hover:text-blue-600">{(p.name || "Unknown Product")}</h4>
                      <div className="pt-10 border-t flex justify-between items-end">
                         <div>
                            <p className={`text-[11px] font-black uppercase mb-2 bg-clip-text text-transparent bg-gradient-to-r ${theme.gradient}`}>Retail Rate</p>
                            <p className="text-4xl md:text-5xl font-black italic text-slate-900 tracking-tighter">৳{(p.mrp || 0).toLocaleString()}</p>
                         </div>
                         <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 text-3xl font-bold opacity-0 group-hover:opacity-100 group-hover:-translate-y-2 transition-all">🏷️</div>
                      </div>
                   </div>
                 )
              })}
           </div>
        </div>
      )}
    </div>
  );
};

export default CustomerPortal;
