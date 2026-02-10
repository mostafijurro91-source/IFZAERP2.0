
import React, { useState, useEffect, useMemo } from 'react';
import { Company, User, Product, formatCurrency } from '../types';
import { supabase, db, mapToDbCompany } from '../lib/supabase';

interface OrderManagementProps {
  company: Company;
  user: User;
}

const OrderManagement: React.FC<OrderManagementProps> = ({ company, user }) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCust, setSelectedCust] = useState<any>(null);
  
  const [modalCustSearch, setModalCustSearch] = useState("");
  const [modalAreaFilter, setModalAreaFilter] = useState("");
  const [uniqueAreas, setUniqueAreas] = useState<string[]>([]);
  
  const [isSaving, setIsSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(1); 

  const isAdmin = user.role === 'ADMIN';

  useEffect(() => { fetchData(); }, [company]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ordRes, prodRes, custRes] = await Promise.all([
        db.getMarketOrders(company),
        db.getProducts(company),
        db.getCustomers()
      ]);
      setOrders(ordRes);
      setProducts(prodRes);
      setCustomers(custRes);
      
      const areas = Array.from(new Set(custRes.map((c: any) => c.address?.trim()).filter(Boolean))) as string[];
      setUniqueAreas(areas.sort());
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const addToCart = (p: Product) => {
    const existing = cart.find(i => i.id === p.id);
    if (existing) {
      setCart(cart.map(i => i.id === p.id ? { ...i, qty: i.qty + 1 } : i));
    } else {
      setCart([...cart, { id: p.id, name: p.name, price: p.tp, qty: 1, mrp: p.mrp, company: p.company }]);
    }
    if (navigator.vibrate) navigator.vibrate(10);
  };

  const updateCartItem = (id: string, updates: any) => {
    setCart(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item).filter(item => item.qty > 0));
  };

  const calculateTotal = () => cart.reduce((acc, i) => acc + (Number(i.price) * Number(i.qty)), 0);

  const handleSubmitOrder = async () => {
    if (!selectedCust || cart.length === 0) return alert("দোকান এবং পণ্য বাছাই করুন!");
    setIsSaving(true);
    try {
      const dbCo = mapToDbCompany(company);
      const { error } = await supabase.from('market_orders').insert([{ 
        customer_id: selectedCust.id, 
        company: dbCo, 
        total_amount: calculateTotal(), 
        status: 'PENDING', 
        items: cart, 
        created_by: user.name,
        area: selectedCust.address
      }]);
      if (error) throw error;
      alert("অর্ডার সফলভাবে সেভ হয়েছে!");
      setShowAddModal(false); setCart([]); setSelectedCust(null); setCurrentStep(1); fetchData();
    } catch (err: any) { alert(err.message); } finally { setIsSaving(false); }
  };

  const handleApproveOrder = async () => {
    if (!selectedOrder || !isAdmin) return;
    if (!confirm("অর্ডার কনফার্ম করতে চান? এটি করলে স্টক আপডেট হবে।")) return;
    
    setIsSaving(true);
    try {
      const dbCo = mapToDbCompany(company);
      for (const item of selectedOrder.items) {
        await supabase.rpc('increment_stock', { row_id: item.id, amt: -item.qty });
      }
      await supabase.from('transactions').insert([{
        customer_id: selectedOrder.customer_id,
        company: dbCo,
        amount: selectedOrder.total_amount,
        payment_type: 'DUE',
        items: selectedOrder.items,
        submitted_by: selectedOrder.created_by
      }]);
      await supabase.from('market_orders').update({ status: 'COMPLETED' }).eq('id', selectedOrder.id);
      alert("সফলভাবে স্টক আপডেট হয়েছে! ✅");
      setShowDetailModal(false); fetchData();
    } catch (err: any) { alert(err.message); } finally { setIsSaving(false); }
  };

  const filteredModalCustomers = useMemo(() => {
    return customers.filter(c => {
      const q = modalCustSearch.toLowerCase().trim();
      const matchesSearch = !q || c.name.toLowerCase().includes(q) || c.phone.includes(q);
      const matchesArea = !modalAreaFilter || c.address === modalAreaFilter;
      return matchesSearch && matchesArea;
    });
  }, [customers, modalCustSearch, modalAreaFilter]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => p.stock > 0 && p.name.toLowerCase().includes(search.toLowerCase()));
  }, [products, search]);

  return (
    <div className="space-y-6 pb-24 font-sans text-black animate-reveal">
      <div className="bg-slate-900 p-8 rounded-[2.5rem] flex flex-col md:flex-row justify-between items-center gap-6 shadow-2xl border border-white/5 overflow-hidden">
        <div className="flex items-center gap-5">
           <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl font-black italic bg-blue-600 text-white shadow-xl`}>O</div>
           <div>
              <h3 className="text-xl font-black text-white uppercase italic tracking-tighter leading-none">মার্কেট অর্ডার হাব</h3>
              <p className="text-[10px] text-slate-400 font-black uppercase mt-2 tracking-widest">{company} Terminal</p>
           </div>
        </div>
        <button onClick={() => { 
          setModalCustSearch(""); setModalAreaFilter(""); setSelectedCust(null); 
          setCart([]); setCurrentStep(1); setShowAddModal(true); 
        }} className="w-full md:w-auto bg-white text-slate-900 px-10 py-4 rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-xl active:scale-95 transition-all hover:bg-blue-600 hover:text-white">+ নতুন অর্ডার যোগ করুন</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="col-span-full py-20 text-center animate-pulse text-slate-300 font-black uppercase tracking-[0.5em] italic">অর্ডার লোড হচ্ছে...</div>
        ) : orders.length === 0 ? (
          <div className="col-span-full py-32 text-center bg-white border-2 border-dashed border-slate-100 rounded-[3rem] text-slate-300 font-black uppercase">কোনো অপেক্ষমাণ অর্ডার পাওয়া যায়নি</div>
        ) : orders.map(order => (
          <div key={order.id} onClick={() => { setSelectedOrder(order); setShowDetailModal(true); }} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all cursor-pointer group animate-reveal">
             <div className="flex justify-between items-start mb-6">
                <span className={`px-4 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest ${
                  order.status === 'PENDING' ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'
                }`}>{order.status}</span>
                <p className="text-[8px] font-bold text-slate-300 uppercase">Ref: #{order.id.slice(-6).toUpperCase()}</p>
             </div>
             <h4 className="font-black text-slate-900 text-xl uppercase italic leading-none truncate mb-2">{order.customers?.name}</h4>
             <p className="text-[10px] text-slate-400 font-black uppercase italic truncate tracking-widest">📍 এরিয়া: {order.customers?.address || 'অনির্ধারিত'}</p>
             <div className="mt-8 flex justify-between items-end border-t pt-6">
                <div>
                   <p className="text-[8px] font-black text-slate-400 uppercase mb-1">প্রাক্কলিত বিল</p>
                   <p className="text-2xl font-black italic text-slate-900 tracking-tighter leading-none">{formatCurrency(order.total_amount)}</p>
                </div>
                <div className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 px-5 py-2 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all">বিস্তারিত ➔</div>
             </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-white z-[3000] flex flex-col h-screen overflow-hidden text-black animate-reveal">
           <div className="bg-slate-900 text-white p-6 md:p-10 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-6">
                 <button onClick={() => currentStep === 2 ? setCurrentStep(1) : setShowAddModal(false)} className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-xl hover:bg-white/20">
                    {currentStep === 1 ? '✕' : '←'}
                 </button>
                 <div>
                    <h3 className="text-xl md:text-3xl font-black uppercase italic tracking-tighter leading-none">
                       {currentStep === 1 ? "১. দোকান খুঁজুন" : "২. পণ্য নির্বাচন ও কার্ট"}
                    </h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase mt-2 tracking-widest italic">Order Step {currentStep} of 2</p>
                 </div>
              </div>
           </div>

           <div className="flex-1 overflow-y-auto custom-scroll p-6 md:p-12 pb-40">
              {currentStep === 1 ? (
                 <div className="max-w-4xl mx-auto space-y-8">
                    <div className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 shadow-inner grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                       <div className="space-y-3">
                          <label className="text-[10px] font-black text-blue-600 uppercase ml-4 italic tracking-widest">১. এরিয়া ফিল্টার (ঐচ্ছিক)</label>
                          <select className="w-full p-6 bg-white rounded-3xl font-black text-sm uppercase outline-none border-2 border-transparent focus:border-blue-500 shadow-sm transition-all" value={modalAreaFilter} onChange={e => { setModalAreaFilter(e.target.value); setSelectedCust(null); }}>
                            <option value="">সকল এরিয়া</option>
                            {uniqueAreas.map(area => <option key={area} value={area}>{area}</option>)}
                          </select>
                       </div>
                       <div className="space-y-3">
                          <label className="text-[10px] font-black text-blue-600 uppercase ml-4 italic tracking-widest">২. দ্রুত সার্চ (নাম বা মোবাইল)</label>
                          <div className="relative">
                            <input autoFocus className="w-full p-6 bg-white rounded-3xl font-black text-sm uppercase outline-none border-2 border-transparent focus:border-blue-500 shadow-sm transition-all" placeholder="দোকানের নাম লিখুন..." value={modalCustSearch} onChange={e => setModalCustSearch(e.target.value)} />
                            <span className="absolute right-6 top-1/2 -translate-y-1/2 opacity-20">🔍</span>
                          </div>
                       </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       {filteredModalCustomers.length === 0 ? (
                         <div className="col-span-full py-20 text-center opacity-10 font-black italic uppercase">কোনো দোকান খুঁজে পাওয়া যায়নি</div>
                       ) : filteredModalCustomers.map(c => (
                          <div key={c.id} onClick={() => { setSelectedCust(c); setCurrentStep(2); }} className={`p-8 rounded-[2.5rem] border-2 transition-all flex justify-between items-center cursor-pointer ${selectedCust?.id === c.id ? 'bg-slate-900 text-white border-slate-900 shadow-2xl scale-[1.02]' : 'bg-white border-slate-100 hover:border-blue-600 hover:shadow-xl'}`}>
                             <div className="min-w-0 pr-6">
                                <p className="text-lg font-black uppercase italic leading-none mb-3 truncate">{c.name}</p>
                                <p className="text-[10px] font-black uppercase opacity-50 tracking-widest">📍 {c.address || '—'}</p>
                                <p className="text-[10px] font-bold mt-2 text-blue-500 uppercase italic">📱 {c.phone}</p>
                             </div>
                             {selectedCust?.id === c.id ? <span className="text-blue-400 text-3xl font-black">✓</span> : <span className="opacity-10 text-4xl italic group-hover:opacity-40 transition-all">➔</span>}
                          </div>
                       ))}
                    </div>
                 </div>
              ) : (
                 <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10">
                    <div className="space-y-6">
                       <div className="sticky top-0 bg-white z-20 pb-4">
                          <label className="text-[10px] font-black text-slate-400 uppercase ml-4 italic mb-2 block">পণ্য নির্বাচন করুন</label>
                          <input className="w-full p-5 bg-slate-100 rounded-[2.5rem] font-black text-xs uppercase outline-none border-2 border-transparent focus:border-blue-500 shadow-inner" placeholder="মডেল নাম লিখে সার্চ দিন..." value={search} onChange={e => setSearch(e.target.value)} />
                       </div>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {filteredProducts.map(p => (
                             <div key={p.id} onClick={() => addToCart(p)} className={`bg-white p-6 border-2 border-slate-50 rounded-[2rem] flex justify-between items-center active:scale-95 transition-all shadow-sm ${p.stock <= 0 ? 'opacity-30 grayscale pointer-events-none' : 'hover:border-blue-600'}`}>
                                <div className="min-w-0 pr-4">
                                   <p className="text-[11px] font-black uppercase italic leading-none mb-3 truncate">{p.name}</p>
                                   <div className="flex items-center gap-3">
                                      <span className="text-lg font-black text-slate-900 italic leading-none">৳{p.tp}</span>
                                      <span className={`text-[8px] font-black px-2 py-0.5 rounded uppercase ${p.stock < 10 ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>Stock: {p.stock}</span>
                                   </div>
                                </div>
                                <button className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center text-xl font-black shadow-lg hover:bg-blue-600">+</button>
                             </div>
                          ))}
                       </div>
                    </div>

                    <div className="space-y-6 bg-slate-50 p-8 rounded-[3rem] border shadow-inner h-fit sticky top-12">
                       <h4 className="text-[11px] font-black text-slate-500 uppercase italic tracking-widest border-b pb-4 mb-4">অর্ডার কার্ট ({cart.length})</h4>
                       <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scroll pr-2">
                          {cart.map((item, idx) => (
                             <div key={idx} className="bg-white p-6 rounded-[2rem] border shadow-sm animate-reveal">
                                <div className="flex justify-between items-start mb-4">
                                   <p className="text-[12px] font-black uppercase italic text-slate-800 leading-tight pr-10">
                                     <span className="text-blue-600 mr-1">[{item.company}]</span> {item.name}
                                   </p>
                                   <button onClick={() => setCart(cart.filter((_, i) => i !== idx))} className="text-red-400 font-black text-2xl leading-none">✕</button>
                                </div>
                                <div className="flex items-center gap-4">
                                   <div className="flex-1 flex items-center bg-slate-50 rounded-2xl px-4 py-2 border">
                                      <span className="text-[8px] font-black uppercase opacity-30 mr-2">Rate:</span>
                                      <input type="number" className="w-full bg-transparent font-black text-xs outline-none" value={item.price} onChange={e => updateCartItem(item.id, { price: e.target.value })} />
                                   </div>
                                   <div className="flex items-center gap-4 bg-slate-900 text-white rounded-2xl px-4 py-2 shadow-lg">
                                      <button onClick={() => updateCartItem(item.id, { qty: item.qty - 1 })} className="w-10 h-10 flex items-center justify-center bg-rose-600 text-white rounded-xl font-black text-xl hover:bg-rose-700 transition-all shadow-sm active:scale-90">−</button>
                                      <input type="number" className="w-10 bg-transparent text-center font-black text-xs text-white outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={item.qty} onChange={e => updateCartItem(item.id, { qty: Number(e.target.value) })} />
                                      <button onClick={() => updateCartItem(item.id, { qty: item.qty + 1 })} className="text-xl font-black px-2 opacity-50 hover:opacity-100">+</button>
                                   </div>
                                </div>
                             </div>
                          ))}
                       </div>
                       {cart.length === 0 && <div className="py-20 text-center opacity-10 font-black italic uppercase">কার্ট খালি</div>}
                    </div>
                 </div>
              )}
           </div>

           <div className="fixed bottom-0 inset-x-0 p-6 md:p-10 bg-white border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6 shadow-[0_-10px_50px_rgba(0,0,0,0.1)] z-[3001]">
              <div className="flex gap-10 items-center w-full md:w-auto overflow-x-auto no-scrollbar">
                 <div className="shrink-0">
                    <p className="text-[9px] font-black text-slate-400 uppercase italic mb-1 tracking-widest">সিলেক্টেড শপ</p>
                    <p className="text-lg font-black uppercase text-blue-600 truncate max-w-[250px] italic leading-none">{selectedCust ? selectedCust.name : "..."}</p>
                 </div>
                 <div className="shrink-0 border-l pl-10">
                    <p className="text-[9px] font-black text-slate-400 uppercase italic mb-1 tracking-widest">এরিয়া/রুট</p>
                    <p className="text-lg font-black uppercase text-slate-800 italic leading-none">{selectedCust ? selectedCust.address : "..."}</p>
                 </div>
                 <div className="shrink-0 border-l pl-10 text-right">
                    <p className="text-[9px] font-black text-slate-400 uppercase italic mb-1 tracking-widest">মোট বিল</p>
                    <p className="text-4xl font-black italic text-slate-900 tracking-tighter leading-none">{formatCurrency(calculateTotal())}</p>
                 </div>
              </div>
              <button disabled={isSaving || cart.length === 0 || !selectedCust} onClick={handleSubmitOrder} className="w-full md:w-auto bg-blue-600 text-white px-20 py-7 rounded-[2.5rem] font-black uppercase text-[13px] tracking-[0.3em] shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-20 hover:bg-blue-700">
                 {isSaving ? "প্রসেসিং..." : "অর্ডার সেভ করুন ➔"}
              </button>
           </div>
        </div>
      )}

      {showDetailModal && selectedOrder && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-3xl z-[4000] flex items-center justify-center p-4">
           <div className="bg-white rounded-[4rem] w-full max-w-3xl h-[85vh] overflow-hidden flex flex-col shadow-2xl animate-reveal">
              <div className="p-10 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <div>
                    <h3 className="text-2xl font-black uppercase italic tracking-tighter">অর্ডার ইনভয়েস বিবরণ</h3>
                    <p className="text-[10px] text-slate-500 mt-2 uppercase font-black tracking-widest">Order ID: #{selectedOrder.id.slice(-6).toUpperCase()}</p>
                 </div>
                 <button onClick={() => setShowDetailModal(false)} className="text-4xl text-slate-500 font-black hover:text-white transition-colors">✕</button>
              </div>
              <div className="p-10 flex-1 overflow-y-auto custom-scroll space-y-10 text-slate-900">
                 <div className="grid grid-cols-2 gap-10 pb-10 border-b border-slate-100">
                    <div className="space-y-2">
                       <p className="text-[9px] font-black text-slate-400 uppercase italic mb-1">কাস্টমার প্রোফাইল:</p>
                       <p className="font-black text-xl uppercase italic leading-none">{selectedOrder.customers?.name}</p>
                       <p className="font-black text-xs uppercase text-blue-600 tracking-widest">📍 {selectedOrder.customers?.address}</p>
                    </div>
                    <div className="text-right space-y-2">
                       <p className="text-[9px] font-black text-slate-400 uppercase italic mb-1">এন্ট্রি তথ্য:</p>
                       <p className="font-black text-sm uppercase">সংগ্রহকারী: {selectedOrder.created_by}</p>
                       <p className="font-black text-sm text-slate-400 italic">তারিখ: {new Date(selectedOrder.created_at).toLocaleDateString('bn-BD')}</p>
                    </div>
                 </div>
                 <div className="space-y-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase italic tracking-widest">অর্ডারকৃত মালের তালিকা:</p>
                    <div className="divide-y border rounded-[2.5rem] overflow-hidden bg-slate-50 shadow-inner">
                       {selectedOrder.items.map((item: any, idx: number) => (
                         <div key={idx} className="p-6 flex justify-between items-center bg-white/50 hover:bg-white transition-colors">
                            <div className="flex-1">
                               <p className="text-[13px] font-black uppercase italic text-slate-800 leading-tight">
                                 <span className="text-blue-600 mr-1">[{item.company}]</span> {item.name}
                               </p>
                            </div>
                            <div className="text-right">
                               <p className="text-[10px] font-bold text-slate-400 italic">{item.qty} পিস x ৳{item.price}</p>
                               <p className="text-[14px] font-black text-blue-600 italic mt-1">৳{ (item.price * item.qty).toLocaleString() }</p>
                            </div>
                         </div>
                       ))}
                    </div>
                 </div>
                 <div className="pt-10 flex justify-between items-center border-t-4 border-slate-50">
                    <p className="text-[14px] font-black uppercase text-slate-400 italic tracking-widest">মোট অর্ডার ভ্যালু (Net)</p>
                    <p className="text-4xl font-black italic tracking-tighter text-slate-900">{formatCurrency(selectedOrder.total_amount)}</p>
                 </div>
              </div>
              <div className="p-10 bg-slate-900 border-t flex flex-col md:flex-row gap-4 shrink-0">
                 {isAdmin && selectedOrder.status === 'PENDING' && (
                    <button disabled={isSaving} onClick={handleApproveOrder} className="flex-1 bg-blue-600 text-white py-6 rounded-3xl font-black uppercase text-xs tracking-[0.2em] shadow-2xl active:scale-95 transition-all hover:bg-emerald-600">অর্ডার অ্যাপ্রুভ ও মেমো তৈরি ✅</button>
                 )}
                 <button onClick={() => setShowDetailModal(false)} className="px-12 py-6 text-white font-black uppercase text-[10px] tracking-widest bg-white/10 rounded-3xl hover:bg-white/20">বন্ধ করুন</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default OrderManagement;
