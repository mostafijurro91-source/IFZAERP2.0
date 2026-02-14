
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
  const [isSyncing, setIsSyncing] = useState(false);
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
      const canvas = await html2canvas(element, { 
        scale: 3, 
        useCORS: true, 
        backgroundColor: '#ffffff',
        logging: false
      });
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, imgHeight);
      pdf.save(`Statement_${user.name.replace(/\s+/g, '_')}_${activeCompany}.pdf`);
    } catch (err) {
      alert("PDF ডাউনলোড ব্যর্থ হয়েছে।");
    } finally {
      setIsDownloading(false);
    }
  };

  const addToCart = (p: Product) => {
    setOrderCart(prev => {
      const existing = prev.find(item => item.id === p.id);
      if (existing) return prev.map(item => item.id === p.id ? { ...item, qty: item.qty + 1 } : item);
      return [...prev, { id: p.id, name: p.name, tp: p.tp, qty: 1, company: p.company, action: 'SALE' }];
    });
  };

  const updateCartItem = (id: string, updates: Partial<OrderItem>) => {
    setOrderCart(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item).filter(item => item.qty > 0));
  };

  const removeFromCart = (id: string) => {
    setOrderCart(prev => prev.filter(item => item.id !== id));
  };

  const calculateTotal = () => {
    return orderCart.reduce((s, i) => {
      if (i.action === 'REPLACE') return s;
      const amt = i.tp * i.qty;
      return i.action === 'RETURN' ? s - amt : s + amt;
    }, 0);
  };

  const submitOrder = async () => {
    if (!user.customer_id || orderCart.length === 0 || isSavingOrder) return;
    if (!confirm("আপনি কি নিশ্চিতভাবে এই অর্ডারটি সাবমিট করতে চান?")) return;
    
    setIsSavingOrder(true);
    try {
      const dbCo = mapToDbCompany(activeCompany);
      const totalAmount = calculateTotal();
      
      const mappedItems = orderCart.map(item => ({
        id: item.id,
        name: item.name,
        price: item.tp,
        qty: item.qty,
        company: item.company,
        action: item.action
      }));

      // Restored 'area' from customerProfile and improved insert
      const { error } = await supabase.from('market_orders').insert([{
        customer_id: user.customer_id, 
        company: dbCo, 
        total_amount: Math.round(totalAmount),
        status: 'PENDING', 
        items: mappedItems, 
        created_by: user.name,
        area: customerProfile?.address || ''
      }]);

      if (error) throw error;

      alert("অর্ডার সফলভাবে সাবমিট হয়েছে! এটি আপনার কোম্পানির প্যানেলে 'মার্কেট অর্ডার' হিসেবে জমা হয়েছে। ✅");
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
    <div className="space-y-12 animate-reveal font-sans text-slate-900 bg-[#f8fafc]">
      {type === 'LEDGER' && (
        <div className="space-y-10 animate-reveal pb-20">
           <div className="bg-[#0f172a] p-10 md:p-14 rounded-[4rem] text-white shadow-2xl flex flex-col md:flex-row justify-between items-center gap-10 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 blur-[100px] rounded-full"></div>
              <div className="relative z-10">
                 <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter leading-none mb-4">ব্যক্তিগত স্টেটমেন্ট</h2>
                 <p className="text-blue-400 font-bold uppercase tracking-[0.4em] italic text-[11px]">Ledger History • {activeCompany}</p>
              </div>
              <div className="flex flex-wrap justify-center gap-4 relative z-10">
                 <button 
                   disabled={isDownloading || loading}
                   onClick={handleDownloadPDF}
                   className="bg-emerald-600 text-white px-10 py-5 rounded-[2.5rem] font-black uppercase text-[11px] tracking-widest shadow-xl active:scale-95 transition-all flex items-center gap-4"
                 >
                   {isDownloading ? "পিডিএফ জেনারেট হচ্ছে..." : "PDF রিপোর্ট ডাউনলোড ⎙"}
                 </button>
                 <div className="flex gap-2 bg-white/5 p-1.5 rounded-3xl backdrop-blur-xl border border-white/5">
                    {companies.map(co => (
                      <button key={co} onClick={() => setActiveCompany(co)} className={`px-6 py-3 rounded-2xl font-black uppercase text-[9px] transition-all ${activeCompany === co ? 'bg-white text-slate-900 shadow-md' : 'text-slate-500 hover:text-white'}`}>{co}</button>
                    ))}
                 </div>
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-white p-10 rounded-[3.5rem] shadow-xl border border-slate-100 group overflow-hidden relative">
                 <div className="absolute top-0 right-0 w-24 h-24 bg-rose-50 rounded-bl-[4rem] -z-0 opacity-40"></div>
                 <p className="text-[11px] font-black text-slate-400 uppercase italic mb-2 relative z-10">মোট বিল</p>
                 <p className="text-4xl font-black italic text-slate-800 tracking-tighter relative z-10">৳{(multiStats[activeCompany]?.totalBill || 0).toLocaleString()}</p>
              </div>
              <div className="bg-white p-10 rounded-[3.5rem] shadow-xl border border-slate-100 group overflow-hidden relative">
                 <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-bl-[4rem] -z-0 opacity-40"></div>
                 <p className="text-[11px] font-black text-slate-400 uppercase italic mb-2 relative z-10">মোট জমা</p>
                 <p className="text-4xl font-black italic text-emerald-600 tracking-tighter relative z-10">৳{(multiStats[activeCompany]?.totalPaid || 0).toLocaleString()}</p>
              </div>
              <div className="bg-slate-900 p-10 rounded-[3.5rem] shadow-2xl text-white group overflow-hidden relative">
                 <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-bl-[4rem] -z-0"></div>
                 <p className="text-[11px] font-black text-indigo-400 uppercase italic mb-2 relative z-10">বর্তমান বকেয়া</p>
                 <p className="text-4xl font-black italic text-rose-400 tracking-tighter relative z-10">৳{(multiStats[activeCompany]?.balance || 0).toLocaleString()}</p>
              </div>
           </div>

           <div ref={ledgerRef} className="bg-white rounded-[4rem] border border-slate-100 shadow-xl overflow-hidden p-2">
              <div className="bg-slate-900 text-white p-14 text-center border-b-[10px] border-blue-600">
                 <h1 className="text-5xl font-black uppercase italic tracking-tighter mb-2">IFZA ELECTRONICS</h1>
                 <p className="text-md font-black uppercase tracking-[0.5em] text-blue-400 mb-8">{activeCompany} STATEMENT</p>
                 <div className="mt-10 text-left border-t border-white/10 pt-10 flex justify-between">
                    <div>
                       <p className="text-[10px] font-black text-slate-500 uppercase italic mb-1 tracking-widest">Customer Details:</p>
                       <p className="text-3xl font-black uppercase italic text-white leading-tight">{user.name}</p>
                    </div>
                    <div className="text-right flex flex-col justify-end">
                       <p className="text-[10px] font-black text-slate-500 uppercase italic mb-1 tracking-widest">Date Generated:</p>
                       <p className="text-xl font-black text-white">{new Date().toLocaleDateString('bn-BD', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                    </div>
                 </div>
              </div>
              
              <div className="overflow-x-auto custom-scroll">
                <table className="w-full text-left border-collapse">
                   <thead>
                      <tr className="bg-slate-50 text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] border-b">
                         <th className="px-12 py-10">তারিখ</th>
                         <th className="px-12 py-10">বিবরণ</th>
                         <th className="px-12 py-10 text-right">ডেবিট (বাকি)</th>
                         <th className="px-12 py-10 text-right">ক্রেডিট (জমা)</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                      {loading ? (
                         <tr><td colSpan={4} className="p-40 text-center animate-pulse font-black uppercase text-slate-300"> hisাব সিঙ্ক হচ্ছে...</td></tr>
                      ) : ledger.length === 0 ? (
                         <tr><td colSpan={4} className="p-40 text-center italic font-black text-slate-200 text-xl uppercase tracking-widest">No Transactions Found</td></tr>
                      ) : ledger.map((tx, idx) => (
                        <tr key={tx.id} className="hover:bg-blue-50/40 transition-all font-bold group animate-reveal" style={{ animationDelay: `${idx * 0.02}s` }}>
                           <td className="px-12 py-10 text-slate-400 italic font-black text-sm">{new Date(tx.created_at).toLocaleDateString('bn-BD')}</td>
                           <td className="px-12 py-10 uppercase italic font-black text-slate-800">
                              <span className={tx.payment_type === 'COLLECTION' ? 'text-emerald-600' : 'text-indigo-600'}>
                                 {tx.payment_type === 'COLLECTION' ? '💰 টাকা জমা' : '📄 সেলস মেমো'}
                              </span>
                              <p className="text-[8px] opacity-40 font-bold mt-1 tracking-widest uppercase">ID: #{tx.id.slice(-6).toUpperCase()}</p>
                           </td>
                           <td className="px-12 py-10 text-right text-rose-600 text-2xl font-black italic tracking-tighter">
                              {tx.payment_type !== 'COLLECTION' ? `৳${Math.round(tx.amount || 0).toLocaleString()}` : '—'}
                           </td>
                           <td className="px-12 py-10 text-right text-emerald-600 text-2xl font-black italic tracking-tighter">
                              {tx.payment_type === 'COLLECTION' ? `৳${Math.round(tx.amount || 0).toLocaleString()}` : '—'}
                           </td>
                        </tr>
                      ))}
                   </tbody>
                </table>
              </div>
              <div className="p-14 border-t-2 border-slate-100 bg-slate-50/30 flex justify-between items-end">
                 <div className="w-60 border-t border-black pt-4 text-center font-black italic uppercase text-[10px]">Accounts Authority</div>
                 <div className="text-right">
                    <p className="text-[10px] font-black uppercase italic text-slate-400">Final Summary</p>
                    <p className="text-3xl font-black italic text-slate-900">৳{(multiStats[activeCompany]?.balance || 0).toLocaleString()}</p>
                    <p className="text-[8px] font-black uppercase text-rose-500 mt-1">Net Balance Due</p>
                 </div>
              </div>
           </div>
        </div>
      )}

      {type === 'DASHBOARD' && (
        <div className="space-y-12 pb-20 px-4 md:px-0">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-10 rounded-[3rem] shadow-xl border border-slate-100 relative overflow-hidden">
             <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-blue-50 rounded-full blur-[80px] opacity-50"></div>
             <div className="relative z-10">
                <p className="text-blue-600 font-black uppercase italic tracking-widest text-[11px] mb-2">Retailer Dashboard</p>
                <h2 className="text-4xl md:text-6xl font-black italic tracking-tighter text-slate-900 leading-none">
                  স্বাগতম, <span className="text-blue-600">{user.name}</span>
                </h2>
             </div>
             <div className="bg-slate-900 text-white p-6 rounded-[2.2rem] shadow-2xl relative z-10 group transition-all hover:scale-105 active:scale-95">
                <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1 italic">অফিসিয়াল হেল্পলাইন</p>
                <p className="text-xl font-black italic tracking-tighter text-emerald-400">০১৭২৭৫৪৪২৭৫</p>
             </div>
          </div>

          <div className="space-y-6">
             <div className="flex items-center gap-4 px-6">
                <span className="h-px flex-1 bg-slate-200"></span>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] italic">Your Ledger Portfolio</p>
                <span className="h-px flex-1 bg-slate-200"></span>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {companies.map(co => {
                   const theme = getBrandTheme(co);
                   const stat = multiStats[co] || { balance: 0 };
                   return (
                     <div key={co} className="bg-white rounded-[4rem] p-10 shadow-xl border border-slate-100 relative overflow-hidden group transition-all hover:-translate-y-2 duration-500">
                        <div className={`w-16 h-16 rounded-[1.8rem] bg-gradient-to-br ${theme.gradient} flex items-center justify-center text-white text-3xl font-black mb-10 shadow-2xl group-hover:rotate-6 transition-transform`}>{theme.icon}</div>
                        
                        <div className="flex justify-between items-end mb-6">
                           <div>
                              <h4 className="text-2xl font-black uppercase italic text-slate-800 tracking-tighter leading-none">{co}</h4>
                              <p className="text-[10px] font-black text-slate-400 uppercase italic mt-2">Active Balance</p>
                           </div>
                           <button 
                             onClick={() => { setActiveCompany(co); }}
                             className="bg-slate-50 text-slate-400 px-5 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-sm active:scale-90"
                           >
                             সি অল ➔
                           </button>
                        </div>

                        <p className={`text-5xl font-black italic tracking-tighter ${(stat.balance || 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                           ৳{(stat.balance || 0).toLocaleString()}
                        </p>
                        
                        <div className="mt-8 h-1 w-full bg-slate-50 rounded-full overflow-hidden">
                           <div className={`h-full bg-gradient-to-r ${theme.gradient} opacity-20`} style={{ width: '100%' }}></div>
                        </div>
                     </div>
                   )
                })}
             </div>
          </div>

          <div className="space-y-6">
             <div className="flex items-center gap-4 px-6">
                <span className="h-px flex-1 bg-slate-200"></span>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] italic">Latest Feed & Offers</p>
                <span className="h-px flex-1 bg-slate-200"></span>
             </div>
             
             <div className="relative group overflow-hidden rounded-[4.5rem] shadow-2xl border-8 border-white h-[400px] md:h-[550px] bg-slate-950">
                {ads.length > 0 ? ads.map((ad, idx) => {
                  const theme = getBrandTheme(ad.company);
                  return (
                     <div key={ad.id} className={`absolute inset-0 transition-all duration-1000 ${idx === currentAdIndex ? 'opacity-100 scale-100' : 'opacity-0 scale-110'}`}>
                        {ad.image_url && <img src={ad.image_url} className="w-full h-full object-cover opacity-50" alt="" />}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent p-12 flex flex-col justify-end">
                           <span className={`bg-gradient-to-r ${theme.gradient} text-white px-6 py-2 rounded-full text-[10px] font-black uppercase italic mb-6 w-fit shadow-xl`}>{theme.icon} {ad.company}</span>
                           <h3 className="text-3xl md:text-7xl font-black text-white uppercase italic tracking-tighter leading-tight drop-shadow-2xl">{ad.title}</h3>
                        </div>
                     </div>
                  )
                }) : <div className="h-full flex items-center justify-center text-white/10 font-black text-6xl italic">IFZA HUB</div>}
                
                <div className="absolute bottom-8 right-12 flex gap-3 z-20">
                   {ads.map((_, i) => (
                      <div key={i} className={`h-1 rounded-full transition-all duration-500 ${i === currentAdIndex ? 'w-10 bg-blue-500' : 'w-2 bg-white/20'}`}></div>
                   ))}
                </div>
             </div>
          </div>
        </div>
      )}

      {type === 'CATALOG' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-20">
           {ads.map(ad => (
             <div key={ad.id} className="bg-white rounded-[3.5rem] overflow-hidden border border-slate-100 shadow-lg group">
                <div className="aspect-video bg-slate-100 overflow-hidden">
                   {ad.image_url && <img src={ad.image_url} className="w-full h-full object-cover group-hover:scale-110 transition-all duration-1000" alt="" />}
                </div>
                <div className="p-10">
                   <span className="bg-blue-50 text-blue-600 px-4 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest italic">{ad.company}</span>
                   <h4 className="text-xl font-black uppercase italic mt-4 mb-2 text-slate-800">{ad.title}</h4>
                   <p className="text-slate-400 text-sm font-medium italic line-clamp-3 leading-relaxed">"{ad.content}"</p>
                </div>
             </div>
           ))}
        </div>
      )}

      {type === 'ORDER' && (
        <div className="max-w-xl mx-auto px-4 md:px-0 animate-reveal">
           {orderView === 'BROWSE' ? (
              <div className="space-y-10 pb-40">
                 <div className="bg-white p-8 rounded-[3.5rem] border-2 border-slate-50 shadow-xl sticky top-4 z-50">
                    <div className="flex gap-2 mb-8">
                       {companies.map(co => (
                         <button key={co} onClick={() => setActiveCompany(co)} className={`flex-1 py-5 rounded-[2rem] font-black uppercase text-[10px] transition-all tracking-widest ${activeCompany === co ? 'bg-blue-600 text-white shadow-xl scale-105' : 'bg-slate-50 text-slate-400'}`}>{co}</button>
                       ))}
                    </div>
                    <div className="relative">
                       <input 
                         className="w-full p-6 bg-slate-50 border-none rounded-[2.5rem] font-black text-sm uppercase italic outline-none focus:ring-4 ring-blue-50 transition-all placeholder:text-slate-300" 
                         placeholder="মডেল সার্চ করুন..." 
                         value={productSearch} 
                         onChange={e => setProductSearch(e.target.value)} 
                       />
                       <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-4">
                          {orderCart.length > 0 && (
                             <button onClick={() => setOrderView('CART')} className="bg-emerald-500 text-white px-6 py-2.5 rounded-full text-[10px] font-black uppercase shadow-lg animate-bounce flex items-center gap-2">
                                🛒 ({orderCart.length})
                             </button>
                          )}
                       </div>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 gap-5">
                    {loading ? (
                      <div className="py-20 text-center">
                         <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                         <p className="font-black text-slate-300 uppercase italic text-xs">মডেল লোড হচ্ছে...</p>
                      </div>
                    ) : products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase())).map((p, idx) => {
                       const inCart = orderCart.find(i => i.id === p.id);
                       return (
                         <div key={p.id} onClick={() => addToCart(p)} className={`p-8 bg-white rounded-[3.5rem] border-2 transition-all flex justify-between items-center cursor-pointer group active:scale-95 animate-reveal ${inCart ? 'border-blue-500 bg-blue-50/20' : 'border-slate-50 hover:border-blue-100 shadow-sm'}`} style={{ animationDelay: `${idx * 0.05}s` }}>
                            <div className="min-w-0 pr-6">
                               <p className={`text-[15px] font-black uppercase italic leading-tight truncate ${inCart ? 'text-blue-700' : 'text-slate-800'}`}>{p.name}</p>
                               <div className="flex gap-4 items-center mt-3">
                                  <p className="text-[11px] font-bold text-blue-600">MRP: ৳{p.mrp}</p>
                                  <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{activeCompany}</p>
                               </div>
                            </div>
                            <div className={`w-14 h-14 rounded-[1.8rem] flex items-center justify-center text-3xl font-black transition-all ${inCart ? 'bg-blue-600 text-white shadow-xl' : 'bg-slate-50 text-slate-300 group-hover:bg-blue-50 group-hover:text-blue-500'}`}>
                               {inCart ? <span className="animate-reveal">✓</span> : "+"}
                            </div>
                         </div>
                       );
                    })}
                 </div>
              </div>
           ) : (
              <div className="space-y-10 pb-[500px] animate-reveal">
                 <div className="flex justify-between items-end px-6">
                    <div>
                       <h4 className="text-4xl font-black uppercase italic tracking-tighter text-slate-800">অর্ডার লিস্ট 🛒</h4>
                       <p className="text-blue-500 font-bold uppercase tracking-widest text-[10px] mt-2">আপনার কার্টে {orderCart.length} টি আইটেম আছে</p>
                    </div>
                    <button onClick={() => setOrderView('BROWSE')} className="bg-white border-2 border-slate-100 text-slate-400 px-6 py-3 rounded-2xl font-black uppercase text-[9px] tracking-widest hover:border-blue-600 hover:text-blue-600 transition-all active:scale-90 shadow-sm">← আরও যোগ করুন</button>
                 </div>

                 <div className="space-y-6">
                    {orderCart.map((item, idx) => (
                      <div key={item.id} className="bg-white p-10 rounded-[4rem] border shadow-xl relative animate-reveal overflow-hidden group" style={{ animationDelay: `${idx * 0.05}s` }}>
                         <button onClick={() => removeFromCart(item.id)} className="absolute top-6 right-6 w-12 h-12 bg-rose-500 rounded-full flex items-center justify-center text-white text-xl font-black shadow-lg hover:scale-110 active:scale-90 transition-all z-10">✕</button>
                         
                         <div className="mb-10 pr-12">
                            <h5 className="text-[20px] font-black uppercase italic text-slate-800 leading-tight">{item.name}</h5>
                            <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest italic">{activeCompany} DIVISION</p>
                         </div>

                         <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-10">
                            <div className="flex items-center bg-slate-50 rounded-[2.5rem] p-2 border shadow-inner w-full md:w-auto">
                               <button onClick={() => updateCartItem(item.id, { qty: item.qty - 1 })} className="w-16 h-16 rounded-[1.8rem] bg-white shadow-md flex items-center justify-center text-4xl font-black text-slate-300 hover:text-rose-500 transition-colors active:scale-90">-</button>
                               <span className="w-24 text-center font-black text-3xl italic text-slate-900">{item.qty}</span>
                               <button onClick={() => updateCartItem(item.id, { qty: item.qty + 1 })} className="w-16 h-16 rounded-[1.8rem] bg-white shadow-md flex items-center justify-center text-3xl font-black text-slate-300 hover:text-blue-600 transition-colors active:scale-90">+</button>
                            </div>
                            <div className="text-right w-full md:w-auto">
                               <p className="text-[10px] font-black text-slate-400 uppercase italic mb-1 tracking-widest">Total Value</p>
                               <p className="text-4xl font-black italic tracking-tighter text-slate-900 leading-none">৳{(item.tp * item.qty).toLocaleString()}</p>
                            </div>
                         </div>

                         <div className="bg-slate-50 p-2 rounded-[2.5rem] flex gap-2 border shadow-inner">
                            <button 
                              onClick={() => updateCartItem(item.id, { action: 'SALE' })} 
                              className={`flex-1 py-4 rounded-[1.8rem] text-[11px] font-black uppercase tracking-widest transition-all ${item.action === 'SALE' ? 'bg-blue-600 text-white shadow-xl' : 'bg-transparent text-slate-400 hover:text-slate-600'}`}
                            >
                               Order (S)
                            </button>
                            <button 
                              onClick={() => updateCartItem(item.id, { action: 'RETURN' })} 
                              className={`flex-1 py-4 rounded-[1.8rem] text-[11px] font-black uppercase tracking-widest transition-all ${item.action === 'RETURN' ? 'bg-rose-500 text-white shadow-xl' : 'bg-transparent text-slate-400 hover:text-slate-600'}`}
                            >
                               Return (R)
                            </button>
                            <button 
                              onClick={() => updateCartItem(item.id, { action: 'REPLACE' })} 
                              className={`flex-1 py-4 rounded-[1.8rem] text-[11px] font-black uppercase tracking-widest transition-all ${item.action === 'REPLACE' ? 'bg-cyan-500 text-white shadow-xl' : 'bg-transparent text-slate-400 hover:text-slate-600'}`}
                            >
                               Replace (RP)
                            </button>
                         </div>
                      </div>
                    ))}
                    {orderCart.length === 0 && (
                       <div className="py-40 text-center flex flex-col items-center opacity-10">
                          <span className="text-9xl mb-6 italic">🛒</span>
                          <p className="font-black text-2xl uppercase tracking-[0.5em]">আপনার কার্ট খালি</p>
                       </div>
                    )}
                 </div>

                 <div className="fixed bottom-0 left-0 right-0 z-[6000] p-6 pointer-events-none flex justify-center">
                    <div className="bg-white p-10 md:p-12 rounded-[4rem] shadow-[0_-40px_100px_rgba(0,0,0,0.15),0_40px_100px_rgba(0,0,0,0.3)] border-2 border-slate-50 space-y-8 animate-reveal pointer-events-auto w-full max-w-lg md:max-w-xl">
                       <div className="flex justify-between items-end border-b-2 border-slate-50 pb-8">
                          <div>
                             <p className="text-[11px] font-black text-slate-400 uppercase italic mb-3 tracking-widest">নিট বিল (MRP অনুযায়ী)</p>
                             <p className="text-5xl md:text-6xl font-black italic tracking-tighter text-slate-900 leading-none">৳{calculateTotal().toLocaleString()}</p>
                          </div>
                          <div className="text-right">
                             <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-[1.8rem] flex items-center justify-center font-black italic shadow-inner text-2xl">if</div>
                          </div>
                       </div>
                       <button 
                         disabled={orderCart.length === 0 || isSavingOrder} 
                         onClick={submitOrder} 
                         className="w-full bg-blue-600 text-white py-8 md:py-10 rounded-[3rem] font-black uppercase text-base tracking-[0.3em] shadow-[0_25px_50px_rgba(37,99,235,0.4)] active:scale-95 transition-all hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-6 group"
                       >
                          <span className="group-hover:translate-x-1 transition-transform">{isSavingOrder ? 'প্রসেস হচ্ছে...' : 'অর্ডার কনফার্ম করুন'}</span>
                          <span className="text-3xl group-hover:translate-x-2 transition-transform">➔</span>
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
