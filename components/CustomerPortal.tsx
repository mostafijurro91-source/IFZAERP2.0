
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

interface OrderItem {
  id: string;
  name: string;
  tp: number;
  qty: number;
  company: string;
  action: 'SALE' | 'RETURN' | 'REPLACE';
}

const CustomerPortal: React.FC<PortalProps> = ({ type, user }) => {
  const [activeCompany, setActiveCompany] = useState<Company>('Transtec');
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerProfile, setCustomerProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentAdIndex, setCurrentAdIndex] = useState(0);
  const [productSearch, setProductSearch] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  
  const [orderCart, setOrderCart] = useState<OrderItem[]>([]);
  const [orderView, setOrderView] = useState<'BROWSE' | 'CART'>('BROWSE');

  const ledgerRef = useRef<HTMLDivElement>(null);
  const sliderTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [multiStats, setMultiStats] = useState<Record<string, CompanyStats>>({
    'Transtec': { balance: 0, totalBill: 0, totalPaid: 0 },
    'SQ Light': { balance: 0, totalBill: 0, totalPaid: 0 },
    'SQ Cables': { balance: 0, totalBill: 0, totalPaid: 0 }
  });

  const companies: Company[] = ['Transtec', 'SQ Light', 'SQ Cables'];

  useEffect(() => {
    if (user.customer_id) {
      fetchCustomerProfile();
      fetchAllData();
      if (type === 'DASHBOARD') fetchAds();
    }
  }, [user.customer_id, type]);

  useEffect(() => {
    if (user.customer_id) {
      if (type === 'CATALOG' || type === 'ORDER') fetchProducts();
      if (type === 'LEDGER') fetchLedgerForCompany(activeCompany);
    }
  }, [type, activeCompany, user.customer_id]);

  useEffect(() => {
    if (ads.length > 1) {
      sliderTimerRef.current = setInterval(() => {
        setCurrentAdIndex(prev => (prev + 1) % ads.length);
      }, 5000);
    }
    return () => { if (sliderTimerRef.current) clearInterval(sliderTimerRef.current); };
  }, [ads.length]);

  const fetchCustomerProfile = async () => {
    const { data } = await supabase.from('customers').select('*').eq('id', user.customer_id).maybeSingle();
    setCustomerProfile(data);
  };

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
      const dbCo = mapToDbCompany(co);
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('customer_id', user.customer_id)
        .eq('company', dbCo)
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
      pdf.save(`Statement_${user.name.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      alert("PDF ডাউনলোড ব্যর্থ হয়েছে।");
    } finally {
      setIsDownloading(false);
    }
  };

  const addToCart = (p: Product) => {
    setOrderCart(prev => {
      const existing = prev.find(item => item.id === p.id);
      if (existing) {
        return prev.map(item => item.id === p.id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, { id: p.id, name: p.name, tp: p.tp, qty: 1, company: p.company, action: 'SALE' }];
    });
  };

  const updateCartItem = (id: string, updates: Partial<OrderItem>) => {
    setOrderCart(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item).filter(item => item.qty > 0));
  };

  const calculateTotal = () => {
    return orderCart.reduce((s, i) => s + (i.tp * i.qty), 0);
  };

  const submitOrder = async () => {
    if (!user.customer_id || orderCart.length === 0 || isSavingOrder) return;
    if (!confirm("আপনি কি নিশ্চিতভাবে এই অর্ডারটি সাবমিট করতে চান?")) return;
    
    setIsSavingOrder(true);
    try {
      const dbCo = mapToDbCompany(activeCompany);
      const totalAmount = calculateTotal();
      
      const orderPayload = {
        customer_id: user.customer_id, 
        company: dbCo, 
        total_amount: Math.round(totalAmount),
        status: 'PENDING', 
        items: orderCart,
        created_by: user.name, // Ensure this exists in DB
        area: customerProfile?.address || ''
      };

      const { error } = await supabase.from('market_orders').insert([orderPayload]);

      if (error) {
        // Fallback for schema mismatch
        if (error.message.includes('created_by')) {
          const { error: fallbackError } = await supabase.from('market_orders').insert([{
            customer_id: user.customer_id, 
            company: dbCo, 
            total_amount: Math.round(totalAmount),
            status: 'PENDING', 
            items: orderCart
          }]);
          if (fallbackError) throw fallbackError;
        } else {
          throw error;
        }
      }

      alert("অর্ডার সফলভাবে সাবমিট হয়েছে! ✅");
      setOrderCart([]);
      setOrderView('BROWSE');
    } catch (err: any) {
      alert("অর্ডার সাবমিট ব্যর্থ: " + (err.message || "সার্ভার এরর!"));
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

  return (
    <div className="space-y-8 animate-reveal font-sans text-slate-900 bg-[#f8fafc] min-h-screen">
      
      {type === 'DASHBOARD' && (
        <div className="space-y-10 pb-20 px-4 md:px-0">
          <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-slate-100 relative overflow-hidden">
             <div className="absolute top-[-10%] right-[-5%] w-64 h-64 bg-blue-50 rounded-full blur-[80px] opacity-40"></div>
             <div className="relative z-10">
                <p className="text-blue-600 font-black uppercase italic tracking-widest text-[11px] mb-2">Retailer Hub</p>
                <h2 className="text-4xl md:text-6xl font-black italic tracking-tighter text-slate-900 leading-none">
                  স্বাগতম, <span className="text-blue-600">{user.name}</span>
                </h2>
                <div className="mt-8 flex gap-4">
                   <button onClick={() => window.location.reload()} className="bg-slate-100 text-slate-500 px-6 py-3 rounded-2xl text-[10px] font-black uppercase">রিফ্রেশ 🔄</button>
                   <div className="bg-emerald-50 text-emerald-600 px-6 py-3 rounded-2xl text-[10px] font-black uppercase flex items-center gap-2">
                     <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span> লাইভ কানেক্টেড
                   </div>
                </div>
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             {companies.map(co => {
                const theme = getBrandTheme(co);
                const stat = multiStats[co] || { balance: 0 };
                return (
                  <div key={co} className="bg-white rounded-[3.5rem] p-10 shadow-lg border border-slate-100 relative overflow-hidden group transition-all hover:-translate-y-1">
                     <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${theme.gradient} flex items-center justify-center text-white text-2xl font-black mb-10 shadow-xl`}>{theme.icon}</div>
                     <h4 className="text-xl font-black uppercase italic text-slate-800 tracking-tighter mb-2">{co}</h4>
                     <p className="text-[10px] font-black text-slate-400 uppercase italic mb-6">Active Balance</p>
                     <p className={`text-4xl font-black italic tracking-tighter ${(stat.balance || 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        ৳{(stat.balance || 0).toLocaleString()}
                     </p>
                  </div>
                )
             })}
          </div>
        </div>
      )}

      {type === 'LEDGER' && (
        <div className="space-y-8 animate-reveal pb-20 px-4 md:px-0">
           <div className="bg-[#0f172a] p-10 rounded-[3rem] text-white shadow-2xl flex flex-col md:flex-row justify-between items-center gap-8">
              <div>
                 <h2 className="text-4xl font-black uppercase italic tracking-tighter leading-none mb-2">ব্যক্তিগত স্টেটমেন্ট</h2>
                 <p className="text-blue-400 font-bold uppercase tracking-[0.4em] italic text-[10px]">{activeCompany} Ledger History</p>
              </div>
              <div className="flex gap-2 bg-white/5 p-1.5 rounded-2xl border border-white/5">
                 {companies.map(co => (
                   <button key={co} onClick={() => setActiveCompany(co)} className={`px-5 py-3 rounded-xl font-black uppercase text-[9px] transition-all ${activeCompany === co ? 'bg-white text-slate-900 shadow-md' : 'text-slate-500 hover:text-white'}`}>{co}</button>
                 ))}
              </div>
           </div>

           <div ref={ledgerRef} className="bg-white rounded-[3.5rem] border border-slate-100 shadow-xl overflow-hidden p-2">
              <div className="bg-slate-900 text-white p-12 text-center border-b-[8px] border-blue-600">
                 <h1 className="text-4xl font-black uppercase italic tracking-tighter mb-1">IFZA ELECTRONICS</h1>
                 <p className="text-sm font-black uppercase tracking-[0.5em] text-blue-400">{activeCompany} STATEMENT</p>
                 <div className="mt-8 flex justify-between items-end text-left border-t border-white/10 pt-8">
                    <div>
                       <p className="text-[10px] font-black text-slate-500 uppercase italic mb-1 tracking-widest">Customer:</p>
                       <p className="text-2xl font-black uppercase italic text-white">{user.name}</p>
                    </div>
                    <div className="text-right">
                       <p className="text-[10px] font-black text-slate-500 uppercase italic mb-1 tracking-widest">Date:</p>
                       <p className="text-xl font-black text-white">{new Date().toLocaleDateString('bn-BD')}</p>
                    </div>
                 </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                   <thead>
                      <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
                         <th className="px-10 py-8">তারিখ</th>
                         <th className="px-10 py-8">বিবরণ</th>
                         <th className="px-10 py-8 text-right">ডেবিট (বাকি)</th>
                         <th className="px-10 py-8 text-right">ক্রেডিট (জমা)</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100 font-bold">
                      {ledger.length === 0 ? (
                        <tr><td colSpan={4} className="p-20 text-center italic font-black text-slate-200 uppercase tracking-widest">No Transactions Found</td></tr>
                      ) : ledger.map((tx, idx) => (
                        <tr key={tx.id} className="hover:bg-blue-50/40 transition-all">
                           <td className="px-10 py-8 text-slate-400 text-sm">{new Date(tx.created_at).toLocaleDateString('bn-BD')}</td>
                           <td className="px-10 py-8 uppercase italic font-black text-slate-800">
                              {tx.payment_type === 'COLLECTION' ? '💰 টাকা জমা' : '📄 সেলস মেমো'}
                              <p className="text-[7px] opacity-30 mt-1 uppercase">ID: #{tx.id.slice(-4).toUpperCase()}</p>
                           </td>
                           <td className="px-10 py-8 text-right text-rose-600 text-xl font-black italic">
                              {tx.payment_type !== 'COLLECTION' ? `৳${Math.round(tx.amount || 0).toLocaleString()}` : '—'}
                           </td>
                           <td className="px-10 py-8 text-right text-emerald-600 text-xl font-black italic">
                              {tx.payment_type === 'COLLECTION' ? `৳${Math.round(tx.amount || 0).toLocaleString()}` : '—'}
                           </td>
                        </tr>
                      ))}
                   </tbody>
                </table>
              </div>
              <div className="p-10 border-t bg-slate-50/50 flex justify-between items-center">
                 <button onClick={handleDownloadPDF} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] shadow-lg active:scale-95">পিডিএফ ডাউনলোড ⎙</button>
                 <div className="text-right">
                    <p className="text-[10px] font-black uppercase text-slate-400 mb-1">নিট ব্যালেন্স</p>
                    <p className="text-3xl font-black italic text-slate-900">৳{(multiStats[activeCompany]?.balance || 0).toLocaleString()}</p>
                 </div>
              </div>
           </div>
        </div>
      )}

      {type === 'ORDER' && (
        <div className="max-w-xl mx-auto px-4 md:px-0 animate-reveal pb-60">
           {orderView === 'BROWSE' ? (
              <div className="space-y-6">
                 {/* Top Navigation & Search */}
                 <div className="bg-white p-6 rounded-[2.5rem] border shadow-xl sticky top-4 z-50">
                    <div className="flex gap-2 mb-6">
                       {companies.map(co => (
                         <button key={co} onClick={() => setActiveCompany(co)} className={`flex-1 py-4 rounded-[1.5rem] font-black uppercase text-[10px] transition-all ${activeCompany === co ? 'bg-blue-600 text-white shadow-lg scale-105' : 'bg-slate-50 text-slate-400'}`}>{co}</button>
                       ))}
                    </div>
                    <div className="relative">
                       <input 
                         className="w-full p-5 bg-slate-50 border-none rounded-[1.8rem] font-black text-sm uppercase italic outline-none focus:ring-4 ring-blue-50 transition-all" 
                         placeholder="মডেল সার্চ করুন..." 
                         value={productSearch} 
                         onChange={e => setProductSearch(e.target.value)} 
                       />
                       {orderCart.length > 0 && (
                          <button onClick={() => setOrderView('CART')} className="absolute right-3 top-1/2 -translate-y-1/2 bg-emerald-500 text-white px-5 py-2.5 rounded-full text-[10px] font-black uppercase shadow-lg animate-bounce">
                             🛒 ({orderCart.length})
                          </button>
                       )}
                    </div>
                 </div>

                 {/* Product List */}
                 <div className="space-y-4">
                    {loading ? (
                      <div className="py-20 text-center animate-pulse text-slate-300 font-black uppercase italic text-xs">মডেল লোড হচ্ছে...</div>
                    ) : products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase())).map((p) => {
                       const inCart = orderCart.find(i => i.id === p.id);
                       const theme = getBrandTheme(p.company);
                       return (
                         <div key={p.id} onClick={() => addToCart(p)} className={`p-6 bg-white rounded-[2.5rem] border-2 transition-all flex justify-between items-center cursor-pointer group active:scale-95 ${inCart ? 'border-blue-500 bg-blue-50/20' : 'border-slate-50 hover:border-blue-100 shadow-sm'}`}>
                            <div className="min-w-0 pr-6">
                               <p className={`text-[14px] font-black uppercase italic leading-tight truncate ${inCart ? 'text-blue-700' : 'text-slate-800'}`}>{p.name}</p>
                               <div className="flex gap-4 items-center mt-3">
                                  <p className="text-[10px] font-bold text-blue-600">৳{p.tp}</p>
                                  <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{p.company}</p>
                               </div>
                            </div>
                            <div className={`w-12 h-12 rounded-[1.2rem] flex items-center justify-center text-2xl font-black transition-all ${inCart ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-300 group-hover:bg-blue-50 group-hover:text-blue-500'}`}>
                               {inCart ? "✓" : "+"}
                            </div>
                         </div>
                       );
                    })}
                 </div>
              </div>
           ) : (
              <div className="space-y-8 animate-reveal">
                 <div className="flex justify-between items-end px-4">
                    <div>
                       <h4 className="text-3xl font-black uppercase italic tracking-tighter text-slate-800">আপনার কার্ট 🛒</h4>
                       <p className="text-blue-500 font-bold uppercase tracking-widest text-[9px] mt-1">সবগুলো আইটেম চেক করুন</p>
                    </div>
                    <button onClick={() => setOrderView('BROWSE')} className="bg-white border-2 border-slate-100 text-slate-400 px-6 py-3 rounded-2xl font-black uppercase text-[9px] tracking-widest hover:border-blue-600 hover:text-blue-600 transition-all active:scale-90">← ব্যাক</button>
                 </div>

                 <div className="space-y-4">
                    {orderCart.map((item) => (
                      <div key={item.id} className="bg-white p-8 rounded-[3rem] border shadow-lg relative overflow-hidden">
                         <button onClick={() => updateCartItem(item.id, {qty: 0})} className="absolute top-6 right-6 text-slate-300 hover:text-red-500 text-xl font-black">✕</button>
                         <h5 className="text-[16px] font-black uppercase italic text-slate-800 leading-tight mb-8 pr-10">{item.name}</h5>
                         <div className="flex items-center justify-between">
                            <div className="flex items-center bg-slate-100 rounded-[1.8rem] p-1.5 border shadow-inner">
                               <button onClick={() => updateCartItem(item.id, {qty: item.qty - 1})} className="w-12 h-12 rounded-full bg-white shadow-md text-2xl font-black text-slate-400 hover:text-red-500">-</button>
                               <span className="w-16 text-center font-black text-2xl italic">{item.qty}</span>
                               <button onClick={() => updateCartItem(item.id, {qty: item.qty + 1})} className="w-12 h-12 rounded-full bg-white shadow-md text-xl font-black text-slate-400 hover:text-blue-600">+</button>
                            </div>
                            <div className="text-right">
                               <p className="text-[9px] font-black text-slate-400 uppercase italic mb-1">Total</p>
                               <p className="text-2xl font-black italic tracking-tighter text-slate-900">৳{(item.tp * item.qty).toLocaleString()}</p>
                            </div>
                         </div>
                      </div>
                    ))}
                 </div>

                 <div className="fixed bottom-0 left-0 right-0 z-[6000] p-6 flex justify-center pointer-events-none">
                    <div className="bg-slate-900 p-10 rounded-[3.5rem] shadow-2xl space-y-8 pointer-events-auto w-full max-w-lg border border-white/5">
                       <div className="flex justify-between items-end border-b border-white/10 pb-8">
                          <div>
                             <p className="text-[10px] font-black text-slate-500 uppercase italic mb-1">Sub-Total Amount</p>
                             <p className="text-5xl font-black italic tracking-tighter text-blue-400">৳{calculateTotal().toLocaleString()}</p>
                          </div>
                          <div className="text-right">
                             <p className="text-[8px] font-black text-white/20 uppercase tracking-widest italic">IFZA Enterprise Sync</p>
                          </div>
                       </div>
                       <button 
                         disabled={isSavingOrder || orderCart.length === 0} 
                         onClick={submitOrder} 
                         className="w-full bg-blue-600 text-white py-8 rounded-[2.5rem] font-black uppercase text-sm tracking-[0.3em] shadow-2xl active:scale-95 transition-all hover:bg-emerald-600 disabled:opacity-30"
                       >
                          {isSavingOrder ? 'অর্ডার পাঠানো হচ্ছে...' : 'অর্ডার কনফার্ম করুন ➔'}
                       </button>
                    </div>
                 </div>
              </div>
           )}
        </div>
      )}
    </div>
  );
};

export default CustomerPortal;
