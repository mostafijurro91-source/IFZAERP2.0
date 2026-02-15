
import React, { useState, useEffect, useRef } from 'react';
import { User, Advertisement, Company, Product } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';

interface PortalProps {
  type: 'DASHBOARD' | 'CATALOG' | 'LEDGER' | 'ORDER';
  user: User;
}

interface CompanyStats {
  balance: number;
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
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [productSearch, setProductSearch] = useState("");
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [orderCart, setOrderCart] = useState<OrderItem[]>([]);

  const [multiStats, setMultiStats] = useState<Record<string, CompanyStats>>({
    'Transtec': { balance: 0, totalBill: 0, totalPaid: 0 },
    'SQ Light': { balance: 0, totalBill: 0, totalPaid: 0 },
    'SQ Cables': { balance: 0, totalBill: 0, totalPaid: 0 }
  });

  const companies: Company[] = ['Transtec', 'SQ Light', 'SQ Cables'];

  useEffect(() => {
    if (user.customer_id) {
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

  const fetchAds = async () => {
    const { data } = await supabase.from('advertisements').select('*').order('created_at', { ascending: false }).limit(5);
    setAds(data || []);
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const dbCo = mapToDbCompany(activeCompany);
      const { data, error } = await supabase.from('products').select('*').eq('company', dbCo).order('name');
      if (error) throw error;
      setProducts(data || []);
    } catch (err) { setProducts([]); } finally { setLoading(false); }
  };

  const fetchLedgerForCompany = async (co: Company) => {
    if (!user.customer_id) return;
    setLoading(true);
    try {
      const dbCo = mapToDbCompany(co);
      const { data, error } = await supabase.from('transactions').select('*').eq('customer_id', user.customer_id).eq('company', dbCo).order('created_at', { ascending: false }).limit(30);
      if (error) throw error;
      setLedger(data || []);
    } catch (err) { setLedger([]); } finally { setLoading(false); }
  };

  const fetchAllData = async () => {
    if (!user.customer_id) return;
    try {
      const { data: allTxs } = await supabase.from('transactions').select('amount, payment_type, company').eq('customer_id', user.customer_id);
      const stats: Record<string, CompanyStats> = {
        'Transtec': { balance: 0, totalBill: 0, totalPaid: 0 },
        'SQ Light': { balance: 0, totalBill: 0, totalPaid: 0 },
        'SQ Cables': { balance: 0, totalBill: 0, totalPaid: 0 }
      };
      (allTxs || []).forEach(tx => {
        const dbCo = mapToDbCompany(tx.company);
        if (stats[dbCo]) {
          const amt = Number(tx.amount) || 0;
          if (tx.payment_type === 'COLLECTION') { stats[dbCo].totalPaid += amt; stats[dbCo].balance -= amt; }
          else { stats[dbCo].totalBill += amt; stats[dbCo].balance += amt; }
        }
      });
      setMultiStats(stats);
    } catch (err) {}
  };

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

  const submitOrder = async () => {
    if (!user.customer_id || orderCart.length === 0 || isSavingOrder) return;
    if (!confirm("অর্ডার ইনভয়েসটি কি সাবমিট করতে চান?")) return;
    setIsSavingOrder(true);
    try {
      const dbCo = mapToDbCompany(activeCompany);
      const { error } = await supabase.from('market_orders').insert([{
        customer_id: user.customer_id, 
        company: dbCo, 
        total_amount: Math.round(calculateTotal()),
        status: 'PENDING', 
        items: orderCart, 
        created_by: user.name
      }]);
      if (error) throw error;
      alert("অর্ডার সফলভাবে পাঠানো হয়েছে! ✅");
      setOrderCart([]); 
    } catch (err: any) { alert("ব্যর্থ: " + err.message); } finally { setIsSavingOrder(false); }
  };

  const safeFormat = (val: any) => Number(val || 0).toLocaleString();

  const brandColors: Record<string, string> = {
    'Transtec': 'bg-amber-500',
    'SQ Light': 'bg-cyan-500',
    'SQ Cables': 'bg-rose-500'
  };

  return (
    <div className="space-y-4 animate-reveal font-sans text-slate-900 pb-10">
      
      {type === 'DASHBOARD' && (
        <div className="space-y-4 px-1">
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex justify-between items-center overflow-hidden relative">
             <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/50 rounded-full -mr-16 -mt-16 blur-3xl"></div>
             <div className="relative z-10">
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-[0.2em] mb-1">Retailer Terminal</p>
                <h2 className="text-2xl font-black italic tracking-tighter text-slate-800 leading-none">স্বাগতম, {user.name}</h2>
             </div>
             <button onClick={() => window.location.reload()} className="w-12 h-12 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center active:scale-90 transition-all hover:bg-blue-50 hover:text-blue-600 shadow-sm border">🔄</button>
          </div>

          <div className="grid grid-cols-1 gap-3">
             {companies.map(co => {
                const stat = multiStats[co] || { balance: 0 };
                return (
                  <div key={co} className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 flex justify-between items-center group active:scale-[0.98] transition-all relative overflow-hidden">
                     <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${brandColors[co]}`}></div>
                     <div className="pl-3">
                        <h4 className="text-[11px] font-black uppercase text-slate-400 tracking-widest">{co}</h4>
                        <p className={`text-2xl font-black italic mt-1 ${(stat.balance || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                           ৳{safeFormat(stat.balance)}
                        </p>
                     </div>
                     <button onClick={() => { setActiveCompany(co); }} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase italic shadow-lg hover:bg-blue-600 transition-colors">হিসাব দেখুন ➔</button>
                  </div>
                )
             })}
          </div>
        </div>
      )}

      {type === 'LEDGER' && (
        <div className="space-y-4 px-1">
           <div className="bg-slate-200/50 p-1.5 rounded-2xl flex gap-2">
              {companies.map(co => (
                <button key={co} onClick={() => setActiveCompany(co)} className={`flex-1 py-3.5 rounded-xl font-black uppercase text-[10px] transition-all ${activeCompany === co ? 'bg-white text-slate-900 shadow-md scale-[1.02]' : 'text-slate-500'}`}>{co}</button>
              ))}
           </div>

           <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
              <div className="p-6 border-b bg-slate-50/50 flex justify-between items-end">
                 <div>
                    <p className="text-[9px] font-black uppercase italic text-slate-400 mb-1">Statement Summary</p>
                    <h3 className="text-lg font-black uppercase italic text-slate-800">{activeCompany}</h3>
                 </div>
                 <div className="text-right">
                    <p className="text-[9px] font-black uppercase text-slate-400 mb-1">Total Due</p>
                    <p className={`text-xl font-black italic ${(multiStats[activeCompany]?.balance || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>৳{safeFormat(multiStats[activeCompany]?.balance)}</p>
                 </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                   <thead className="bg-slate-50/80 border-b">
                      <tr className="text-slate-400 font-bold uppercase text-[10px]">
                         <th className="p-5">তারিখ</th>
                         <th className="p-5">বিবরণ</th>
                         <th className="p-5 text-right">অ্যামাউন্ট</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50 font-bold">
                      {ledger.length === 0 ? (
                        <tr><td colSpan={3} className="p-20 text-center text-slate-300 italic uppercase font-black tracking-widest opacity-40">No Data</td></tr>
                      ) : ledger.map((tx) => (
                        <tr key={tx.id} className="active:bg-slate-50 transition-colors">
                           <td className="p-5 text-slate-400 font-medium">{new Date(tx.created_at).toLocaleDateString('bn-BD')}</td>
                           <td className="p-5 uppercase font-black text-slate-800 italic">{tx.payment_type === 'COLLECTION' ? '💰 জমা' : '📄 মেমো'}</td>
                           <td className={`p-5 text-right font-black italic ${tx.payment_type === 'COLLECTION' ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {tx.payment_type === 'COLLECTION' ? '-' : ''}৳{safeFormat(tx.amount)}
                           </td>
                        </tr>
                      ))}
                   </tbody>
                </table>
              </div>
           </div>
        </div>
      )}

      {type === 'ORDER' && (
        <div className="flex flex-col h-[calc(100vh-180px)] -mt-2">
           {/* 🛒 TOP SECTION: PRODUCT BROWSER (Scrollable) */}
           <div className="flex-1 overflow-y-auto custom-scroll px-1 space-y-4 pb-4">
              <div className="sticky top-0 z-30 bg-[#f8fafc] pt-2 space-y-3">
                 <div className="bg-white p-1 rounded-xl flex gap-1 shadow-sm border">
                    {companies.map(co => (
                      <button key={co} onClick={() => setActiveCompany(co)} className={`flex-1 py-3 rounded-lg font-black uppercase text-[10px] transition-all ${activeCompany === co ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400'}`}>{co}</button>
                    ))}
                 </div>
                 <div className="relative">
                    <input 
                      className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-black text-sm outline-none focus:ring-4 ring-blue-500/5 transition-all text-slate-800 pr-12 shadow-sm" 
                      placeholder="মডেল খুঁজুন..." 
                      value={productSearch} 
                      onChange={e => setProductSearch(e.target.value)} 
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-20">🔍</div>
                 </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                 {loading ? (
                    <div className="py-20 text-center">
                       <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                       <p className="text-slate-300 font-black text-[10px] uppercase italic">Inventory Loading...</p>
                    </div>
                 ) : products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase())).map((p) => {
                    const isAdded = orderCart.some(i => i.id === p.id && i.action === 'SALE');
                    return (
                      <div 
                        key={p.id} 
                        onClick={() => addToCart(p)} 
                        className={`p-4 bg-white rounded-2xl border flex justify-between items-center transition-all active:scale-[0.97] group ${isAdded ? 'border-blue-500 bg-blue-50/5' : 'border-slate-100 shadow-sm hover:border-blue-200'}`}
                      >
                         <div className="min-w-0 flex-1">
                            <p className={`text-[13px] font-black uppercase truncate italic leading-none mb-2 ${isAdded ? 'text-blue-700' : 'text-slate-800'}`}>{p.name}</p>
                            <p className="text-[10px] font-bold text-blue-600 uppercase italic">MRP: ৳{safeFormat(p.mrp)}</p>
                         </div>
                         <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black transition-all ${isAdded ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-300'}`}>
                            {isAdded ? "✓" : "+"}
                         </div>
                      </div>
                    );
                 })}
              </div>
           </div>

           {/* 📄 BOTTOM SECTION: LIVE INVOICE PANEL (Fixed-ish) */}
           <div className="shrink-0 bg-white border-t-2 border-slate-100 shadow-[0_-20px_40px_rgba(0,0,0,0.05)] rounded-t-[2.5rem] flex flex-col max-h-[50%] overflow-hidden">
              <div className="p-6 border-b flex justify-between items-center bg-slate-50/50">
                 <div>
                    <h4 className="text-sm font-black uppercase italic text-slate-800 leading-none">লাইভ ইনভয়েস কার্ট</h4>
                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Review & Confirm Memo</p>
                 </div>
                 <button onClick={() => setOrderCart([])} className="text-rose-500 font-black text-[9px] uppercase hover:underline">রিসেট কার্ট</button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-2 bg-slate-50/30">
                 {orderCart.length === 0 ? (
                    <div className="py-10 text-center opacity-10 flex flex-col items-center">
                       <span className="text-4xl mb-2">🛒</span>
                       <p className="text-[10px] font-black uppercase tracking-widest italic">কোনো মাল যোগ করা হয়নি</p>
                    </div>
                 ) : orderCart.map((item, idx) => (
                    <div key={`${item.id}-${idx}`} className={`p-4 rounded-2xl border shadow-sm transition-all bg-white flex flex-col gap-3 ${item.action === 'RETURN' ? 'border-red-200' : item.action === 'REPLACE' ? 'border-cyan-200' : 'border-slate-100'}`}>
                       <div className="flex justify-between items-start">
                          <div className="min-w-0 flex-1 pr-4">
                             <h5 className="text-[12px] font-black uppercase italic text-slate-800 truncate leading-none mb-1">{item.name}</h5>
                             <p className="text-[9px] font-bold text-blue-600 uppercase italic">MRP: ৳{safeFormat(item.mrp)}</p>
                          </div>
                          <button onClick={() => updateCartItem(idx, {qty: 0})} className="text-slate-300 hover:text-rose-600 font-black">✕</button>
                       </div>
                       
                       <div className="flex items-center justify-between gap-3">
                          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
                             <button onClick={() => updateCartItem(idx, {action: 'SALE'})} className={`px-3 py-1.5 rounded-lg text-[8px] font-black transition-all ${item.action === 'SALE' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400'}`}>S</button>
                             <button onClick={() => updateCartItem(idx, {action: 'RETURN'})} className={`px-3 py-1.5 rounded-lg text-[8px] font-black transition-all ${item.action === 'RETURN' ? 'bg-red-600 text-white shadow-md' : 'text-slate-400'}`}>R</button>
                             <button onClick={() => updateCartItem(idx, {action: 'REPLACE'})} className={`px-3 py-1.5 rounded-lg text-[8px] font-black transition-all ${item.action === 'REPLACE' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400'}`}>Rp</button>
                          </div>

                          <div className="flex items-center bg-slate-50 rounded-xl p-1 border shadow-inner flex-1 max-w-[120px]">
                             <button onClick={() => updateCartItem(idx, {qty: item.qty - 1})} className="w-7 h-7 flex items-center justify-center font-black text-slate-400 hover:text-rose-600">-</button>
                             <span className="flex-1 text-center font-black text-[12px] italic text-slate-800">{item.qty}</span>
                             <button onClick={() => updateCartItem(idx, {qty: item.qty + 1})} className="w-7 h-7 flex items-center justify-center font-black text-slate-400 hover:text-blue-600">+</button>
                          </div>
                          
                          <div className="text-right min-w-[70px]">
                             <p className="text-[11px] font-black italic text-slate-800 leading-none">৳{safeFormat((item.action === 'REPLACE' ? 0 : item.mrp) * item.qty)}</p>
                          </div>
                       </div>
                    </div>
                 ))}
              </div>

              <div className="p-6 bg-slate-900 text-white flex flex-col gap-4">
                 <div className="flex justify-between items-end">
                    <div>
                       <p className="text-[10px] font-black text-slate-500 uppercase italic tracking-widest mb-1">মোট বিল (MRP)</p>
                       <p className="text-3xl font-black italic tracking-tighter text-blue-400 leading-none">৳{safeFormat(calculateTotal())}</p>
                    </div>
                    <div className="text-right opacity-50">
                       <p className="text-[10px] font-bold italic uppercase">{activeCompany} Sync</p>
                    </div>
                 </div>
                 <button 
                   disabled={isSavingOrder || orderCart.length === 0} 
                   onClick={submitOrder} 
                   className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black uppercase text-[12px] tracking-[0.2em] active:scale-[0.98] transition-all shadow-xl shadow-blue-900/20 hover:bg-blue-500 disabled:opacity-20"
                 >
                    {isSavingOrder ? 'প্রসেসিং...' : 'অর্ডার কনফার্ম করুন ➔'}
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default CustomerPortal;
