
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, Advertisement, Company, Product, Booking } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';

interface PortalProps {
  type: 'DASHBOARD' | 'CATALOG' | 'LEDGER' | 'ORDER' | 'BOOKING' | 'ORDER_HISTORY';
  user: User;
}

interface CompanyStats {
  regularDue: number;
  bookingAdvance: number;
  totalBill: number;
  totalPaid: number;
}

type OrderAction = 'SALE' | 'RETURN' | 'REPLACE';

interface OrderItem {
  id: string;
  name: string;
  mrp: number;
  qty: number;
  company: string;
  action: OrderAction;
}

const CustomerPortal: React.FC<PortalProps> = ({ type, user }) => {
  const [activeCompany, setActiveCompany] = useState<Company>('Transtec');
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [marketOrders, setMarketOrders] = useState<any[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [productSearch, setProductSearch] = useState("");
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [orderCart, setOrderCart] = useState<OrderItem[]>([]);
  
  // Dashboard & Catalog Details View State
  const [showDashboardDetails, setShowDashboardDetails] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<Advertisement | null>(null);
  const detailsRef = useRef<HTMLDivElement>(null);

  // Details View States
  const [selectedTxDetails, setSelectedTxDetails] = useState<any>(null);

  const [multiStats, setMultiStats] = useState<Record<string, CompanyStats>>({
    'Transtec': { regularDue: 0, bookingAdvance: 0, totalBill: 0, totalPaid: 0 },
    'SQ Light': { regularDue: 0, bookingAdvance: 0, totalBill: 0, totalPaid: 0 },
    'SQ Cables': { regularDue: 0, bookingAdvance: 0, totalBill: 0, totalPaid: 0 }
  });

  const companies: Company[] = ['Transtec', 'SQ Light', 'SQ Cables'];

  const fetchAds = async () => {
    const { data } = await supabase.from('advertisements').select('*').order('created_at', { ascending: false });
    setAds(data || []);
  };

  const fetchProducts = useCallback(async (co: Company) => {
    setLoading(true);
    try {
      const dbCo = mapToDbCompany(co);
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
  }, []);

  const fetchLedgerForCompany = useCallback(async (co: Company) => {
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
      setLedger([]);
    } finally {
      setLoading(false);
    }
  }, [user.customer_id]);

  const fetchBookingsForCompany = useCallback(async (co: Company) => {
    if (!user.customer_id) return;
    setLoading(true);
    try {
      const dbCo = mapToDbCompany(co);
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('customer_id', user.customer_id)
        .eq('company', dbCo)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setBookings(data || []);
    } catch (err) {
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [user.customer_id]);

  const fetchOrderHistory = useCallback(async () => {
    if (!user.customer_id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('market_orders')
        .select('*')
        .eq('customer_id', user.customer_id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setMarketOrders(data || []);
    } catch (err) {
      setMarketOrders([]);
    } finally {
      setLoading(false);
    }
  }, [user.customer_id]);

  const fetchAllStats = useCallback(async () => {
    if (!user.customer_id) return;
    try {
      const { data: allTxs } = await supabase
        .from('transactions')
        .select('amount, payment_type, company, meta, items')
        .eq('customer_id', user.customer_id);
      
      const stats: Record<string, CompanyStats> = {
        'Transtec': { regularDue: 0, bookingAdvance: 0, totalBill: 0, totalPaid: 0 },
        'SQ Light': { regularDue: 0, bookingAdvance: 0, totalBill: 0, totalPaid: 0 },
        'SQ Cables': { regularDue: 0, bookingAdvance: 0, totalBill: 0, totalPaid: 0 }
      };

      (allTxs || []).forEach(tx => {
        const dbCo = mapToDbCompany(tx.company);
        if (stats[dbCo]) {
          const amt = Number(tx.amount) || 0;
          const isBooking = tx.meta?.is_booking === true || (tx.items && tx.items[0]?.note?.includes('বুকিং'));

          if (tx.payment_type === 'COLLECTION') {
            if (isBooking) {
              stats[dbCo].bookingAdvance += amt;
            } else {
              stats[dbCo].totalPaid += amt;
              stats[dbCo].regularDue -= amt;
            }
          } else if (tx.payment_type === 'DUE') {
            stats[dbCo].totalBill += amt;
            stats[dbCo].regularDue += amt;
          }
        }
      });
      setMultiStats(stats);
    } catch (err) {}
  }, [user.customer_id]);

  useEffect(() => {
    if (user.customer_id) {
      fetchAllStats();
      fetchAds();
    }
  }, [user.customer_id, fetchAllStats]);

  useEffect(() => {
    if (!user.customer_id) return;
    if (type === 'ORDER') fetchProducts(activeCompany);
    if (type === 'LEDGER') fetchLedgerForCompany(activeCompany);
    if (type === 'BOOKING') fetchBookingsForCompany(activeCompany);
    if (type === 'ORDER_HISTORY') fetchOrderHistory();
  }, [type, activeCompany, user.customer_id, fetchProducts, fetchLedgerForCompany, fetchBookingsForCompany, fetchOrderHistory]);

  const addToCart = (p: Product) => {
    setOrderCart(prev => {
      const existing = prev.find(item => item.id === p.id && item.action === 'SALE');
      if (existing) return prev.map(item => (item.id === p.id && item.action === 'SALE') ? { ...item, qty: item.qty + 1 } : item);
      return [...prev, { id: p.id, name: p.name, mrp: p.mrp, qty: 1, company: p.company, action: 'SALE' }];
    });
  };

  const updateCartItem = (idx: number, updates: Partial<OrderItem>) => {
    setOrderCart(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...updates };
      return next.filter(item => item.qty > 0 || (item.qty === 0 && updates.qty === undefined));
    });
  };

  const calculateTotal = () => orderCart.reduce((sum, i) => {
    if (i.action === 'REPLACE') return sum;
    const lineTotal = i.mrp * i.qty;
    return sum + (i.action === 'RETURN' ? -lineTotal : lineTotal);
  }, 0);

  const handleCompanySwitch = (co: Company) => {
    if (orderCart.length > 0) {
      if (!confirm("কোম্পানি পরিবর্তন করলে কার্ট খালি হয়ে যাবে। আপনি কি নিশ্চিত?")) return;
    }
    setOrderCart([]);
    setActiveCompany(co);
    fetchProducts(co);
  };

  const submitOrder = async () => {
    if (!user.customer_id || orderCart.length === 0 || isSavingOrder) return;
    
    const confirmSubmit = window.confirm("আপনি কি নিশ্চিতভাবে এই অর্ডারটি পাঠাতে চান?");
    if (!confirmSubmit) return;

    setIsSavingOrder(true);
    try {
      const dbCo = mapToDbCompany(activeCompany);
      
      const { data: custData } = await supabase
        .from('customers')
        .select('address')
        .eq('id', user.customer_id)
        .single();

      const { error } = await supabase.from('market_orders').insert([{
        customer_id: user.customer_id, 
        company: dbCo, 
        total_amount: Math.round(calculateTotal()),
        status: 'PENDING', 
        items: orderCart, 
        created_by: user.name,
        area: custData?.address || ''
      }]);

      if (error) throw error;
      
      alert("অর্ডার সফলভাবে পাঠানো হয়েছে! ✅ কর্তৃপক্ষের অনুমোদনের পর এটি প্রসেস করা হবে।");
      setOrderCart([]); 
      fetchOrderHistory();
    } catch (err: any) { 
      alert("অর্ডার পাঠানো সম্ভব হয়নি: " + (err.message || "Unknown Error")); 
    } finally { 
      setIsSavingOrder(false); 
    }
  };

  const handleDashboardDetailClick = (co: Company) => {
    setActiveCompany(co);
    fetchLedgerForCompany(co);
    setShowDashboardDetails(true);
    setTimeout(() => {
      detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const safeFormat = (val: any) => Math.round(Number(val || 0)).toLocaleString();

  const brandColors: Record<string, string> = {
    'Transtec': 'bg-amber-500',
    'SQ Light': 'bg-cyan-500',
    'SQ Cables': 'bg-rose-500'
  };

  const brandGradients: Record<string, string> = {
    'Transtec': 'from-amber-400 via-orange-500 to-amber-600',
    'SQ Light': 'from-cyan-400 via-blue-500 to-indigo-600',
    'SQ Cables': 'from-rose-400 via-red-500 to-rose-600'
  };

  // Filter ads for the current brand
  const brandAds = ads.filter(ad => ad.company === activeCompany);
  const offerAds = brandAds.filter(ad => ad.type === 'OFFER');
  const catalogAds = brandAds.filter(ad => ad.type !== 'OFFER');

  return (
    <div className="space-y-4 animate-reveal font-sans text-slate-900 pb-20">
      
      {type === 'DASHBOARD' && (
        <div className="space-y-6 px-1">
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex justify-between items-center relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/50 rounded-full -mr-16 -mt-16 blur-3xl"></div>
             <div className="relative z-10">
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-[0.2em] mb-1">Retailer Terminal</p>
                <h2 className="text-2xl font-black italic tracking-tighter text-slate-800 leading-none">স্বাগতম, {user.name}</h2>
             </div>
             <button onClick={() => window.location.reload()} className="w-12 h-12 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center active:scale-90 transition-all hover:bg-blue-50 hover:text-blue-600 shadow-sm border">🔄</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             {companies.map(co => {
                const stat = multiStats[co] || { regularDue: 0, bookingAdvance: 0 };
                const isActive = activeCompany === co && showDashboardDetails;
                return (
                  <div key={co} className={`bg-white rounded-[2rem] p-6 shadow-sm border transition-all duration-500 flex flex-col relative overflow-hidden ${isActive ? 'ring-4 ring-blue-500/10 border-blue-500/30 scale-[1.02]' : 'border-slate-100'}`}>
                     <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${brandColors[co]}`}></div>
                     <div className="flex justify-between items-center mb-4 pl-3">
                        <h4 className="text-[11px] font-black uppercase text-slate-400 tracking-widest">{co}</h4>
                        <button onClick={() => handleDashboardDetailClick(co)} className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase italic shadow-lg active:scale-95 transition-all ${isActive ? 'bg-blue-600 text-white' : 'bg-slate-900 text-white'}`}>
                          {isActive ? 'দেখছেন ✓' : 'বিস্তারিত ➔'}
                        </button>
                     </div>
                     <div className="grid grid-cols-2 gap-4 pl-3">
                        <div>
                           <p className="text-[9px] font-black text-slate-400 uppercase italic">বকেয়া:</p>
                           <p className={`text-xl font-black italic mt-1 ${stat.regularDue > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>৳{safeFormat(stat.regularDue)}</p>
                        </div>
                        <div className="border-l pl-4 border-slate-100">
                           <p className="text-[9px] font-black text-indigo-400 uppercase italic">বুকিং:</p>
                           <p className="text-xl font-black italic mt-1 text-indigo-600">৳{safeFormat(stat.bookingAdvance)}</p>
                        </div>
                     </div>
                  </div>
                )
             })}
          </div>

          {showDashboardDetails && (
            <div ref={detailsRef} className={`mt-8 bg-white rounded-[3rem] border border-slate-100 shadow-2xl overflow-hidden animate-reveal min-h-[500px]`}>
               <div className={`p-8 border-b bg-slate-50 flex flex-col md:flex-row justify-between items-center gap-6`}>
                  <div className="flex items-center gap-5">
                    <div className={`w-14 h-14 ${brandColors[activeCompany]} rounded-2xl flex items-center justify-center text-white text-2xl font-black italic shadow-xl shadow-blue-500/10`}>
                      {activeCompany.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-2xl font-black uppercase italic tracking-tighter text-slate-800 leading-none">{activeCompany} রিপোর্ট কার্ড</h3>
                      <p className="text-[10px] text-slate-500 font-bold uppercase mt-2 tracking-widest italic">Live Accounting Synchronization</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-4">
                    <div className="bg-white/60 backdrop-blur-md p-4 rounded-2xl border border-white shadow-sm text-center min-w-[120px]">
                      <p className="text-[8px] font-black text-slate-400 uppercase mb-1">মোট কেনাকাটা</p>
                      <p className="text-lg font-black italic text-slate-900 leading-none">৳{safeFormat(multiStats[activeCompany]?.totalBill)}</p>
                    </div>
                    <div className="bg-white/60 backdrop-blur-md p-4 rounded-2xl border border-white shadow-sm text-center min-w-[120px]">
                      <p className="text-[8px] font-black text-emerald-500 uppercase mb-1">মোট পরিশোধ</p>
                      <p className="text-lg font-black italic text-emerald-600 leading-none">৳{safeFormat(multiStats[activeCompany]?.totalPaid)}</p>
                    </div>
                  </div>
               </div>

               <div className="p-2 overflow-x-auto">
                 <table className="w-full text-left text-[13px]">
                   <thead className="bg-slate-50 border-b">
                      <tr className="text-slate-400 font-bold uppercase text-[9px] tracking-widest">
                         <th className="p-6">তারিখ</th>
                         <th className="p-6">লেনদেনের ধরণ</th>
                         <th className="p-6 text-right">পরিমাণ</th>
                         <th className="p-6 text-center">একশন</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50 font-bold">
                      {loading ? (
                        <tr><td colSpan={4} className="p-20 text-center animate-pulse text-slate-300 font-black italic uppercase tracking-widest">ডাটা ফেচ হচ্ছে...</td></tr>
                      ) : ledger.length === 0 ? (
                        <tr><td colSpan={4} className="p-24 text-center text-slate-300 italic uppercase font-black tracking-widest opacity-40">কোনো রেকর্ড পাওয়া যায়নি</td></tr>
                      ) : ledger.slice(0, 10).map((tx, idx) => {
                        const isBooking = tx.meta?.is_booking === true || (tx.items && tx.items[0]?.note?.includes('বুকিং'));
                        const hasReturns = tx.payment_type === 'DUE' && tx.items?.some((it: any) => it.action === 'RETURN');
                        
                        return (
                        <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors group animate-reveal" style={{ animationDelay: `${idx * 0.05}s` }}>
                           <td className="p-6 text-slate-400 font-medium">{new Date(tx.created_at).toLocaleDateString('bn-BD')}</td>
                           <td className="p-6 uppercase font-black text-slate-800 italic flex items-center gap-3">
                              <span className={`w-2 h-2 rounded-full ${tx.payment_type === 'COLLECTION' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                              {tx.payment_type === 'COLLECTION' ? (isBooking ? '📅 বুকিং জমা' : '💰 নগদ জমা') : (hasReturns ? '🔄 মেমো ও ফেরত' : '📄 সেলস মেমো')}
                           </td>
                           <td className={`p-6 text-right font-black italic text-base ${tx.payment_type === 'COLLECTION' ? (isBooking ? 'text-indigo-600' : 'text-emerald-600') : 'text-rose-600'}`}>
                              {tx.payment_type === 'COLLECTION' ? '-' : ''}৳{safeFormat(Math.abs(tx.amount))}
                           </td>
                           <td className="p-6 text-center">
                              <button onClick={() => setSelectedTxDetails(tx)} className="w-10 h-10 bg-slate-50 text-slate-300 rounded-xl flex items-center justify-center hover:bg-blue-600 hover:text-white hover:shadow-lg transition-all active:scale-90">👁️</button>
                           </td>
                        </tr>
                      )})}
                   </tbody>
                 </table>
               </div>
               
               <div className="p-10 bg-slate-50/50 border-t flex justify-between items-center">
                  <p className="text-[10px] font-black text-slate-400 uppercase italic tracking-widest">Showing last 10 transactions</p>
                  <button onClick={() => window.location.href = '#/portal_ledger'} className="text-blue-600 font-black uppercase text-[10px] italic hover:underline">পূর্ণাঙ্গ লেজার দেখুন ➔</button>
               </div>
            </div>
          )}
        </div>
      )}

      {type === 'CATALOG' && (
        <div className="space-y-12 px-1">
          {/* 🎡 Premium Filter Bar */}
          <div className="bg-white/80 backdrop-blur-xl p-2 rounded-[2.5rem] border border-slate-100 shadow-xl flex gap-2 sticky top-0 z-40">
             {companies.map(co => (
                <button key={co} onClick={() => setActiveCompany(co)} className={`flex-1 py-4 rounded-[1.8rem] font-black uppercase text-[11px] tracking-widest transition-all ${activeCompany === co ? 'bg-slate-900 text-white shadow-2xl scale-[1.02]' : 'text-slate-400 hover:text-slate-600'}`}>{co}</button>
             ))}
          </div>

          {/* 🎁 PREMIUM OFFER SECTION */}
          {offerAds.length > 0 && (
            <div className="space-y-6">
              <h3 className="text-xl font-black uppercase italic text-slate-800 ml-4 flex items-center gap-3">
                 <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping"></span>
                 Special Offers & Rewards
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {offerAds.map((ad, idx) => (
                  <div 
                    key={ad.id} 
                    onClick={() => setSelectedOffer(ad)}
                    className="group relative bg-white rounded-[3rem] overflow-hidden shadow-2xl hover:shadow-[0_40px_80px_rgba(255,0,0,0.15)] transition-all duration-700 cursor-pointer animate-reveal border-4 border-slate-900/5 min-h-[300px]"
                    style={{ animationDelay: `${idx * 0.1}s` }}
                  >
                    {/* Boxing Day Style Background Pattern */}
                    <div className="absolute inset-0 diagonal-stripes opacity-10 pointer-events-none"></div>
                    
                    <div className="p-10 relative z-10 h-full flex flex-col">
                       {/* String Lights Mockup */}
                       <div className="absolute top-0 left-0 right-0 h-1 flex justify-around px-10">
                          {[1,2,3,4,5,6].map(i => <div key={i} className={`w-3 h-3 rounded-full ${i%2===0?'bg-rose-500':'bg-amber-400'} animate-pulse shadow-lg -mt-1.5`}></div>)}
                       </div>

                       <div className="flex justify-between items-start mb-4">
                          <span className={`px-5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest text-white shadow-md bg-gradient-to-r ${brandGradients[ad.company]}`}>
                             Exclusive Reward
                          </span>
                          <div className="text-4xl">🎁</div>
                       </div>

                       <div className="flex-1 flex flex-col justify-center text-center">
                          <h4 className="handwritten text-4xl md:text-5xl font-black italic leading-none text-slate-900 tracking-tighter drop-shadow-sm group-hover:scale-105 transition-transform duration-700">
                             {ad.title}
                          </h4>
                          <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.4em] mt-4 italic">অফারটি বিস্তারিত দেখতে ক্লিক করুন</p>
                       </div>

                       <div className="mt-8 flex justify-between items-center opacity-30 pt-6 border-t border-dashed border-slate-200">
                          <span className="text-[9px] font-black uppercase">{new Date(ad.created_at).toLocaleDateString('bn-BD')}</span>
                          <span className="text-[9px] font-black uppercase italic tracking-widest">IFZA OFFICIAL ➔</span>
                       </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 📄 GENERAL CATALOG SECTION */}
          <div className="space-y-8 pt-10 border-t border-slate-100">
             <h3 className="text-xl font-black uppercase italic text-slate-800 ml-4">Division Catalog</h3>
             <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {catalogAds.length === 0 ? (
                   <div className="col-span-full py-20 text-center opacity-10">
                      <p className="text-sm font-black uppercase tracking-[0.5em] italic">No catalog entries for {activeCompany}</p>
                   </div>
                ) : catalogAds.map((ad, idx) => (
                   <div 
                      key={ad.id} 
                      onClick={() => setSelectedOffer(ad)}
                      className="group bg-white rounded-[2rem] overflow-hidden shadow-sm border border-slate-100 hover:shadow-xl transition-all duration-500 cursor-pointer animate-reveal"
                      style={{ animationDelay: `${idx * 0.05}s` }}
                   >
                      <div className="aspect-square bg-slate-50 relative overflow-hidden">
                         {ad.image_url ? (
                           <img src={ad.image_url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" />
                         ) : (
                           <div className="w-full h-full flex items-center justify-center italic font-black text-slate-200 text-2xl">IFZA</div>
                         )}
                         <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-6">
                            <p className="text-[8px] text-blue-400 font-black uppercase tracking-widest">Click to View</p>
                         </div>
                      </div>
                      <div className="p-6">
                         <h4 className="text-[12px] font-black uppercase italic leading-tight text-slate-800 line-clamp-2">{ad.title}</h4>
                      </div>
                   </div>
                ))}
             </div>
          </div>

          {/* 🎞️ CINEMATIC OFFER DETAIL MODAL */}
          {selectedOffer && (
             <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-3xl z-[5000] flex flex-col animate-reveal overflow-y-auto custom-scroll p-4">
                <div className="w-full max-w-4xl mx-auto my-auto bg-white rounded-[4rem] shadow-2xl overflow-hidden border-8 border-slate-900/5 flex flex-col">
                   <div className="p-8 md:p-12 bg-slate-900 text-white flex justify-between items-center relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl"></div>
                      <div className="relative z-10">
                         <h4 className="text-3xl font-black uppercase italic leading-none tracking-tighter">{selectedOffer.title}</h4>
                         <p className={`text-[10px] font-black uppercase tracking-[0.4em] mt-3 italic text-blue-400`}>Official Promotional Offer • {selectedOffer.company}</p>
                      </div>
                      <button onClick={() => setSelectedOffer(null)} className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center text-white text-xl hover:bg-rose-600 transition-all z-20">✕</button>
                   </div>
                   
                   <div className="p-10 md:p-20 space-y-12">
                      {selectedOffer.image_url && (
                         <div className="relative group">
                            <img src={selectedOffer.image_url} className="w-full rounded-[3rem] shadow-2xl border-4 border-slate-100" />
                            <div className="absolute inset-0 rounded-[3rem] ring-1 ring-inset ring-black/10"></div>
                         </div>
                      )}

                      <div className="bg-slate-50 p-12 md:p-16 rounded-[4rem] border-2 border-dashed border-slate-200 relative overflow-hidden">
                         <div className="absolute top-8 left-8 text-6xl text-slate-100 font-black opacity-40">"</div>
                         <p className="text-xl md:text-3xl font-bold leading-[1.5] text-slate-800 italic relative z-10 text-center px-6">
                            {selectedOffer.content}
                         </p>
                         <div className="mt-12 flex flex-col items-center gap-6 relative z-10">
                            <span className="h-px w-24 bg-blue-500/20"></span>
                            <div className="bg-white px-10 py-6 rounded-3xl shadow-xl border border-slate-100 text-center">
                               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Offer Validity</p>
                               <p className="text-lg font-black italic text-rose-600 uppercase">Limited Time Period</p>
                            </div>
                            {selectedOffer.external_url && (
                               <a href={selectedOffer.external_url} target="_blank" className={`mt-4 px-12 py-5 rounded-full font-black uppercase text-[11px] tracking-widest text-white shadow-2xl bg-gradient-to-r ${brandGradients[selectedOffer.company]} active:scale-95 transition-all`}>
                                  বিস্তারিত দেখুন ➔
                               </a>
                            )}
                         </div>
                      </div>
                   </div>

                   <div className="p-10 bg-slate-50 border-t flex justify-center">
                      <button onClick={() => setSelectedOffer(null)} className="bg-slate-900 text-white px-16 py-6 rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all">বন্ধ করুন</button>
                   </div>
                </div>
             </div>
          )}
        </div>
      )}

      {type === 'LEDGER' && (
        <div className="space-y-4 px-1">
           <div className="bg-slate-200 p-1 rounded-2xl flex gap-1">
              {companies.map(co => (
                <button key={co} onClick={() => setActiveCompany(co)} className={`flex-1 py-3 rounded-xl font-black uppercase text-[10px] transition-all ${activeCompany === co ? 'bg-white text-slate-900 shadow-md' : 'text-slate-500'}`}>{co}</button>
              ))}
           </div>
           <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden min-h-[400px]">
              <div className="p-6 border-b bg-slate-50/50 flex flex-col gap-4">
                 <h3 className="text-lg font-black uppercase italic text-slate-800">{activeCompany} Ledger</h3>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-slate-50 rounded-2xl">
                       <p className="text-[8px] font-black text-slate-400 uppercase italic">মালের বকেয়া</p>
                       <p className={`text-lg font-black italic ${(multiStats[activeCompany]?.regularDue || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>৳{safeFormat(multiStats[activeCompany]?.regularDue)}</p>
                    </div>
                    <div className="p-3 bg-indigo-50/30 rounded-2xl">
                       <p className="text-[8px] font-black text-indigo-400 uppercase italic">বুকিং জমা</p>
                       <p className="text-lg font-black italic text-indigo-600">৳{safeFormat(multiStats[activeCompany]?.bookingAdvance)}</p>
                    </div>
                 </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                   <thead className="bg-slate-50 border-b">
                      <tr className="text-slate-400 font-bold uppercase text-[10px]">
                         <th className="p-5">তারিখ</th>
                         <th className="p-5">বিবরণ</th>
                         <th className="p-5 text-right">টাকা</th>
                         <th className="p-5 text-center">...</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50 font-bold">
                      {loading ? (
                        <tr><td colSpan={4} className="p-20 text-center animate-pulse text-slate-300 font-black italic">Syncing Ledger...</td></tr>
                      ) : ledger.length === 0 ? (
                        <tr><td colSpan={4} className="p-20 text-center text-slate-300 italic uppercase font-black tracking-widest opacity-40">No Records</td></tr>
                      ) : ledger.map((tx) => {
                        const isBooking = tx.meta?.is_booking === true || (tx.items && tx.items[0]?.note?.includes('বুকিং'));
                        const hasReturns = tx.payment_type === 'DUE' && tx.items?.some((it: any) => it.action === 'RETURN');
                        
                        return (
                        <tr key={tx.id} className="active:bg-slate-50 transition-colors group">
                           <td className="p-5 text-slate-400 font-medium">{new Date(tx.created_at).toLocaleDateString('bn-BD')}</td>
                           <td className="p-5 uppercase font-black text-slate-800 italic">
                              {tx.payment_type === 'COLLECTION' ? (isBooking ? '📅 বুকিং জমা' : '💰 জমা') : (hasReturns ? '🔄 মেমো ও ফেরত' : '📄 মেমো')}
                           </td>
                           <td className={`p-5 text-right font-black italic ${tx.payment_type === 'COLLECTION' ? (isBooking ? 'text-indigo-600' : 'text-emerald-600') : 'text-rose-600'}`}>
                              {tx.payment_type === 'COLLECTION' ? '-' : ''}৳{safeFormat(Math.abs(tx.amount))}
                           </td>
                           <td className="p-5 text-center">
                              {tx.items && (
                                <button onClick={() => setSelectedTxDetails(tx)} className="text-blue-500 opacity-20 group-hover:opacity-100 transition-all text-lg">👁️</button>
                              )}
                           </td>
                        </tr>
                      )})}
                   </tbody>
                </table>
              </div>
           </div>
        </div>
      )}

      {/* 🧾 LEDGER ITEM DETAILS MODAL */}
      {selectedTxDetails && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[5000] flex items-center justify-center p-4">
           <div className="bg-white rounded-[3rem] w-full max-w-lg shadow-2xl animate-reveal overflow-hidden">
              <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
                 <div>
                    <h4 className="font-black uppercase italic text-sm tracking-tighter leading-none">বিস্তারিত বিবরণ</h4>
                    <p className="text-[8px] font-bold uppercase mt-1.5 opacity-60">ID: #{selectedTxDetails.id.slice(-6).toUpperCase()} • {new Date(selectedTxDetails.created_at).toLocaleDateString('bn-BD')}</p>
                 </div>
                 <button onClick={() => setSelectedTxDetails(null)} className="text-3xl font-black opacity-50 hover:opacity-100 transition-opacity">✕</button>
              </div>
              <div className="p-8 max-h-[60vh] overflow-y-auto custom-scroll bg-slate-50/30">
                 {selectedTxDetails.payment_type === 'COLLECTION' ? (
                   <div className="text-center py-10">
                      <p className="text-sm font-black uppercase text-slate-500 italic mb-2">জমা বিবরণ:</p>
                      <p className="text-2xl font-black italic text-emerald-600">৳{safeFormat(selectedTxDetails.amount)}</p>
                      <p className="text-[10px] font-bold text-slate-400 mt-4 uppercase italic">Note: {selectedTxDetails.items?.[0]?.note || 'N/A'}</p>
                   </div>
                 ) : (
                   <table className="w-full text-left">
                    <thead className="border-b-2">
                       <tr className="text-[9px] font-black uppercase text-slate-400 italic">
                          <th className="pb-4">Product Name</th>
                          <th className="pb-4 text-center">Qty</th>
                          <th className="pb-4 text-right">Total</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y">
                       {selectedTxDetails.items?.map((item: any, idx: number) => (
                          <tr key={idx} className={`group ${item.action === 'RETURN' ? 'text-rose-600 bg-rose-50/30' : ''}`}>
                             <td className="py-4 font-black uppercase italic text-[11px]">
                                {item.name}
                                {item.action && item.action !== 'SALE' && (
                                  <span className={`ml-2 text-[7px] px-1.5 py-0.5 rounded border ${item.action === 'RETURN' ? 'text-rose-500 border-red-100' : 'text-cyan-500 border-cyan-100'}`}>
                                    {item.action === 'RETURN' ? '[ফেরত/RETURN]' : `[${item.action}]`}
                                  </span>
                                )}
                             </td>
                             <td className="py-4 text-center font-black text-xs">{item.qty}</td>
                             <td className={`py-4 text-right font-black italic text-xs ${item.action === 'RETURN' ? 'text-rose-600' : ''}`}>
                                {item.action === 'RETURN' ? '-' : ''}৳{Math.abs(Math.round(item.total || 0)).toLocaleString()}
                             </td>
                          </tr>
                       ))}
                    </tbody>
                   </table>
                 )}
                 <div className="mt-4 flex justify-between border-t-4 border-slate-900 pt-4">
                    <span className="text-[11px] font-black uppercase italic">নিট বিল (Net Bill):</span>
                    <span className="font-black italic text-base text-blue-600">৳{Number(selectedTxDetails.amount || 0).toLocaleString()}</span>
                 </div>
              </div>
              <div className="p-8 bg-white border-t flex justify-center">
                 <button onClick={() => setSelectedTxDetails(null)} className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-black uppercase text-[10px] shadow-lg active:scale-95">বন্ধ করুন</button>
              </div>
           </div>
        </div>
      )}

      {type === 'ORDER_HISTORY' && (
        <div className="space-y-4 px-1">
           <h3 className="text-xl font-black uppercase italic text-slate-800 ml-4">আমার অর্ডারসমূহ</h3>
           <div className="grid grid-cols-1 gap-4">
              {loading ? (
                <div className="py-20 text-center animate-pulse text-slate-300 font-black italic">লোড হচ্ছে...</div>
              ) : marketOrders.length === 0 ? (
                <div className="py-20 text-center opacity-30 font-black uppercase italic border border-dashed rounded-3xl">কোনো অর্ডার পাওয়া যায়নি</div>
              ) : marketOrders.map((order) => (
                <div key={order.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-3">
                   <div className="flex justify-between items-start">
                      <div>
                        <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase italic ${order.status === 'PENDING' ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'}`}>{order.status}</span>
                        <p className="text-[10px] font-black text-slate-300 mt-2 italic">ID: #{order.id.slice(-6).toUpperCase()}</p>
                      </div>
                      <p className="text-xl font-black italic text-slate-900 tracking-tighter">৳{order.total_amount.toLocaleString()}</p>
                   </div>
                   <div className="pt-3 border-t">
                      {order.items?.map((it: any, i: number) => (
                        <p key={i} className="text-[10px] font-bold text-slate-500 uppercase italic">• {it.name} ({it.qty} পিস) - <span className={`text-[8px] uppercase font-black ${it.action === 'RETURN' ? 'text-rose-500' : it.action === 'REPLACE' ? 'text-cyan-500' : 'text-slate-400'}`}>{it.action || 'SALE'}</span></p>
                      ))}
                   </div>
                   <p className="text-[8px] font-black text-slate-400 uppercase mt-2">তারিখ: {new Date(order.created_at).toLocaleString('bn-BD')}</p>
                </div>
              ))}
           </div>
        </div>
      )}

      {type === 'BOOKING' && (
        <div className="space-y-4 px-1">
           <div className="bg-slate-200 p-1 rounded-2xl flex gap-1">
              {companies.map(co => (
                <button key={co} onClick={() => setActiveCompany(co)} className={`flex-1 py-3 rounded-xl font-black uppercase text-[10px] transition-all ${activeCompany === co ? 'bg-white text-slate-900 shadow-md' : 'text-slate-500'}`}>{co}</button>
              ))}
           </div>
           <div className="grid grid-cols-1 gap-4 min-h-[400px]">
              {loading ? (
                <div className="py-20 text-center text-slate-300 font-black uppercase italic animate-pulse">Syncing Bookings...</div>
              ) : bookings.length === 0 ? (
                <div className="py-20 text-center bg-white rounded-3xl border border-dashed border-slate-200 opacity-30 flex flex-col items-center">
                   <p className="text-sm font-black uppercase italic">কোনো বুকিং অর্ডার পাওয়া যায়নি</p>
                </div>
              ) : bookings.map((b) => (
                <div key={b.id} onClick={() => setSelectedBooking(b)} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 cursor-pointer relative overflow-hidden">
                   <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${b.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-indigo-500'}`}></div>
                   <div className="flex-1 text-center md:text-left">
                      <p className="text-[9px] font-black text-slate-300 uppercase italic">ID: #{b.id.slice(-6).toUpperCase()}</p>
                      <h4 className="text-lg font-black uppercase italic tracking-tighter text-slate-800 truncate">{b.items?.[0]?.name || 'বুকিং'}</h4>
                   </div>
                   <div className="flex gap-10 text-center md:text-right shrink-0">
                      <div><p className="text-[9px] font-black text-slate-400 uppercase">Bill</p><p className="text-lg font-black italic">৳{safeFormat(b.total_amount)}</p></div>
                      <div><p className="text-[9px] font-black text-emerald-500 uppercase">Paid</p><p className="text-lg font-black italic text-emerald-600">৳{safeFormat(b.advance_amount)}</p></div>
                   </div>
                </div>
              ))}
           </div>

           {selectedBooking && (
             <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[5000] flex flex-col items-center p-4 overflow-y-auto">
                <div className="w-full max-w-2xl flex justify-between items-center mb-6 bg-slate-900 p-6 rounded-[2.5rem] border border-white/10 sticky top-0">
                   <h3 className="text-white font-black uppercase italic text-[11px]">Digital Booking Memo</h3>
                   <button onClick={() => setSelectedBooking(null)} className="text-white w-10 h-10 rounded-full flex items-center justify-center font-black bg-white/10">✕</button>
                </div>
                <div className="bg-white rounded-[3rem] w-full max-w-2xl shadow-2xl p-10 md:p-14 mb-20 text-black">
                   <div className="text-center border-b-2 border-black pb-8 mb-10">
                      <h1 className="text-3xl font-black uppercase italic tracking-tighter text-indigo-600">IFZA ELECTRONICS</h1>
                      <p className="text-sm font-black uppercase tracking-[0.4em] text-black">{activeCompany} DIVISION</p>
                   </div>
                   <div className="flex justify-between items-start mb-10">
                      <div>
                         <p className="text-[10px] font-black opacity-30 uppercase">Customer Info:</p>
                         <p className="text-2xl font-black uppercase italic">{user.name}</p>
                      </div>
                      <div className="text-right">
                         <p className="text-[10px] font-black opacity-30 uppercase">Memo Summary:</p>
                         <p className="font-bold text-sm">ID: <span className="font-black">#{selectedBooking.id.slice(-6).toUpperCase()}</span></p>
                         <p className="font-bold text-sm">Total: <span className="font-black">৳{selectedBooking.total_amount.toLocaleString()}</span></p>
                      </div>
                   </div>
                   <table className="w-full border-collapse">
                      <thead>
                         <tr className="bg-slate-100 text-[10px] font-black uppercase border-b-2 border-black text-left">
                            <th className="p-3">আইটেম</th>
                            <th className="p-3 text-center">পরিমাণ</th>
                            <th className="p-3 text-center">গেছে</th>
                            <th className="p-3 text-right">মোট</th>
                         </tr>
                      </thead>
                      <tbody className="text-[12px] font-bold italic">
                         {selectedBooking.items?.map((it, idx) => (
                            <tr key={idx} className="border-b">
                               <td className="p-3 uppercase">{it.name}</td>
                               <td className="p-3 text-center">{it.qty}</td>
                               <td className="p-3 text-center text-blue-600">{it.delivered_qty}</td>
                               <td className="p-3 text-right">৳{(it.qty * it.unitPrice).toLocaleString()}</td>
                            </tr>
                         ))}
                      </tbody>
                   </table>
                   <div className="mt-10 pt-10 border-t-2 border-dashed border-slate-200 flex justify-between items-end">
                      <div><p className="text-[9px] font-black uppercase opacity-30">Status:</p><p className="font-black italic text-sm">{selectedBooking.status}</p></div>
                      <div className="text-right">
                         <p className="text-2xl font-black italic text-rose-600 leading-none">Due: ৳{(selectedBooking.total_amount - selectedBooking.advance_amount).toLocaleString()}</p>
                      </div>
                   </div>
                </div>
             </div>
           )}
        </div>
      )}

      {type === 'ORDER' && (
        <div className="flex flex-col lg:flex-row h-[calc(100vh-140px)] gap-6 px-1 relative">
           {/* 🛒 LEFT COLUMN: PRODUCT BROWSER (Scrollable) */}
           <div className="flex-1 lg:flex-[1.5] overflow-y-auto custom-scroll space-y-4 pb-4">
              <div className="sticky top-0 z-30 bg-[#f8fafc] pt-2 space-y-3">
                 <div className="bg-white p-1 rounded-xl flex gap-1 shadow-sm border">
                    {companies.map(co => (
                      <button key={co} onClick={() => handleCompanySwitch(co)} className={`flex-1 py-3 rounded-lg font-black uppercase text-[10px] transition-all ${activeCompany === co ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400'}`}>{co}</button>
                    ))}
                 </div>
                 <div className="relative">
                    <input className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-black text-sm outline-none shadow-sm focus:border-blue-600 transition-all" placeholder="মডেল খুঁজুন..." value={productSearch} onChange={e => setProductSearch(e.target.value)} />
                 </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                 {loading ? (
                    <div className="col-span-full py-20 text-center animate-pulse text-slate-300 font-black uppercase text-xs italic">Loading Catalog...</div>
                 ) : products.length === 0 ? (
                    <div className="col-span-full py-20 text-center opacity-30 italic font-black uppercase text-xs">No Items Available for {activeCompany}</div>
                 ) : products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase())).map((p) => {
                    const isAdded = orderCart.some(i => i.id === p.id && i.action === 'SALE');
                    return (
                      <div key={p.id} onClick={() => addToCart(p)} className={`p-4 bg-white rounded-2xl border flex justify-between items-center transition-all active:scale-[0.97] cursor-pointer ${isAdded ? 'border-blue-500 bg-blue-50/5' : 'border-slate-100 shadow-sm hover:border-blue-200'}`}>
                         <div className="min-w-0 flex-1 pr-4">
                            <p className={`text-[13px] font-black uppercase truncate italic leading-none mb-2 ${isAdded ? 'text-blue-700' : 'text-slate-800'}`}>{p.name}</p>
                            <p className="text-[10px] font-bold text-blue-600 uppercase italic">MRP: ৳{safeFormat(p.mrp)}</p>
                         </div>
                         <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${isAdded ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-300'}`}>
                            {isAdded ? "✓" : "+"}
                         </div>
                      </div>
                    );
                 })}
              </div>
           </div>

           {/* 🛒 RIGHT COLUMN: CART PANEL (Fixed-ish on Desktop) */}
           <div className="w-full lg:w-[400px] shrink-0 bg-white border border-slate-100 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] lg:shadow-xl rounded-[2.5rem] flex flex-col h-[50vh] lg:h-full overflow-hidden sticky bottom-0 lg:top-0 z-40">
              <div className="p-6 border-b flex justify-between items-center bg-slate-50/50">
                 <div>
                    <h4 className="text-sm font-black uppercase italic text-slate-800 leading-none">লাইভ কার্ট ({orderCart.length})</h4>
                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Ready for Confirmation</p>
                 </div>
                 <button onClick={() => { if(confirm("কার্ট পরিষ্কার করতে চান?")) setOrderCart([]); }} className="text-rose-500 font-black text-[10px] uppercase underline">রিসেট</button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/30 custom-scroll">
                 {orderCart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-10">
                       <span className="text-5xl mb-4">🛒</span>
                       <p className="text-[10px] font-black uppercase tracking-widest italic text-center px-10 leading-relaxed">অর্ডার লিস্টে পণ্য যোগ করতে বামদিকের লিস্টে ক্লিক করুন</p>
                    </div>
                 ) : orderCart.map((item, idx) => (
                    <div key={`${item.id}-${idx}`} className={`p-4 rounded-2xl border transition-all ${item.action === 'SALE' ? 'border-slate-100 bg-white shadow-sm' : item.action === 'RETURN' ? 'border-rose-200 bg-rose-50/50' : 'border-cyan-200 bg-cyan-50/50'} flex flex-col gap-3 group`}>
                       <div className="flex justify-between items-start">
                          <div className="min-w-0 flex-1 pr-2">
                             <p className="text-[12px] font-black uppercase italic truncate text-slate-800 leading-none">{item.name}</p>
                             <div className="flex gap-1 mt-2">
                                <button onClick={() => updateCartItem(idx, {action: 'SALE'})} className={`px-2 py-0.5 rounded text-[7px] font-black border transition-all ${item.action==='SALE'?'bg-blue-600 text-white border-blue-600':'bg-white text-slate-400 border-slate-200'}`} title="বিক্রি">S</button>
                                <button onClick={() => updateCartItem(idx, {action: 'RETURN'})} className={`px-2 py-0.5 rounded text-[7px] font-black border transition-all ${item.action==='RETURN'?'bg-rose-600 text-white border-rose-600':'bg-white text-slate-400 border-slate-200'}`} title="ফেরত">R</button>
                                <button onClick={() => updateCartItem(idx, {action: 'REPLACE'})} className={`px-2 py-0.5 rounded text-[7px] font-black border transition-all ${item.action==='REPLACE'?'bg-cyan-600 text-white border-cyan-600':'bg-white text-slate-400 border-slate-200'}`} title="বদল">Rp</button>
                             </div>
                          </div>
                          <button onClick={() => updateCartItem(idx, {qty: 0})} className="text-slate-300 hover:text-rose-500 transition-colors">✕</button>
                       </div>
                       <div className="flex items-center justify-between">
                          <div className="flex items-center bg-slate-50/50 rounded-xl p-1 border shadow-inner">
                             <button onClick={() => updateCartItem(idx, {qty: item.qty - 1})} className="w-8 h-8 flex items-center justify-center font-black text-slate-400 hover:text-rose-500 transition-colors">-</button>
                             <span className="w-12 text-center font-black text-sm text-slate-900 italic">{item.qty}</span>
                             <button onClick={() => updateCartItem(idx, {qty: item.qty + 1})} className="w-8 h-8 flex items-center justify-center font-black text-slate-400 hover:text-blue-500 transition-colors">+</button>
                          </div>
                          <div className="text-right">
                             <p className={`text-xs font-black italic ${item.action === 'RETURN' ? 'text-rose-600' : 'text-slate-900'}`}>{item.action === 'RETURN' ? '-' : ''}৳{safeFormat(item.mrp * item.qty)}</p>
                             <p className="text-[7px] font-bold text-slate-400 uppercase">{item.action === 'REPLACE' ? 'Exchange Item' : 'MRP Total'}</p>
                          </div>
                       </div>
                    </div>
                 ))}
              </div>

              <div className="p-6 bg-slate-900 text-white shrink-0">
                 <div className="flex justify-between items-end mb-6 px-2">
                    <div>
                       <p className="text-[10px] font-black text-slate-500 uppercase italic tracking-widest mb-1 italic">অর্ডার সামারি (Estimated)</p>
                       <p className="text-4xl font-black italic tracking-tighter text-blue-400 leading-none">৳{safeFormat(calculateTotal())}</p>
                    </div>
                    <div className="text-right opacity-30">
                       <p className="text-[9px] font-bold uppercase italic leading-none">{activeCompany}</p>
                       <p className="text-[7px] font-black uppercase mt-1 tracking-widest">Global Node</p>
                    </div>
                 </div>
                 <button 
                    disabled={isSavingOrder || orderCart.length === 0} 
                    onClick={submitOrder} 
                    className="w-full bg-blue-600 text-white py-6 rounded-2xl font-black uppercase text-xs tracking-[0.3em] shadow-xl active:scale-95 disabled:opacity-30 transition-all hover:bg-blue-50 relative z-[50]"
                 >
                    {isSavingOrder ? 'প্রসেসিং...' : 'কনফার্ম অর্ডার ➔'}
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default CustomerPortal;
