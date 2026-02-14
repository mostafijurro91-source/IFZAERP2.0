
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
  const isStaff = user.role === 'STAFF';

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

  const handleDeleteOrder = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!isAdmin && !isStaff) return alert("আপনার অর্ডার ডিলিট করার অনুমতি নেই।");
    if (!confirm("আপনি কি নিশ্চিত এই মার্কেট অর্ডারটি ডিলিট করতে চান?")) return;
    
    setLoading(true);
    try {
      const { error } = await supabase.from('market_orders').delete().eq('id', id);
      if (error) throw error;
      alert("অর্ডারটি সফলভাবে ডিলিট করা হয়েছে!");
      setShowDetailModal(false);
      fetchData();
    } catch (err: any) { 
      alert("ডিলিট করা যায়নি: " + err.message); 
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (p: Product) => {
    const existing = cart.find(i => i.id === p.id);
    if (existing) {
      setCart(cart.map(i => i.id === p.id ? { ...i, qty: i.qty + 1 } : i));
    } else {
      setCart([...cart, { id: p.id, name: p.name, price: p.tp, qty: 1, mrp: p.mrp, company: p.company }]);
    }
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
        total_amount: Math.round(calculateTotal()), 
        status: 'PENDING', 
        items: cart, 
        created_by: user.name,
        area: selectedCust.address || ''
      }]);
      
      if (error) throw error;
      
      alert("অর্ডার সেভ হয়েছে!");
      setShowAddModal(false); 
      setCart([]); 
      setSelectedCust(null); 
      setCurrentStep(1); 
      fetchData();
    } catch (err: any) { 
      alert("অর্ডার সাবমিট ব্যর্থ: " + (err.message || "সার্ভার কানেকশন এরর!")); 
    } finally { 
      setIsSaving(false); 
    }
  };

  const handleApproveOrder = async () => {
    if (!selectedOrder) return;
    if (!confirm("অর্ডার কনফার্ম করতে চান? এটি করলে স্টক আপডেট হবে এবং মেমো তৈরি হবে।")) return;
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
      alert("অর্ডারটি সফলভাবে মেমোতে রূপান্তর করা হয়েছে! ✅"); 
      setShowDetailModal(false); 
      fetchData();
    } catch (err: any) { 
      alert("ত্রুটি: " + err.message); 
    } finally { 
      setIsSaving(false); 
    }
  };

  const filteredModalCustomers = useMemo(() => {
    return customers.filter(c => {
      const q = modalCustSearch.toLowerCase().trim();
      const matchesSearch = !q || c.name.toLowerCase().includes(q) || c.phone.includes(q);
      const matchesArea = !modalAreaFilter || c.address === modalAreaFilter;
      return matchesSearch && matchesArea;
    });
  }, [customers, modalCustSearch, modalAreaFilter]);

  const filteredProducts = useMemo(() => products.filter(p => p.stock > 0 && p.name.toLowerCase().includes(search.toLowerCase())), [products, search]);

  return (
    <div className="space-y-6 pb-24 font-sans text-black animate-reveal">
      <div className="bg-slate-900 p-8 rounded-[2.5rem] flex flex-col md:flex-row justify-between items-center gap-6 shadow-2xl border border-white/5">
        <div className="flex items-center gap-5">
           <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl font-black italic bg-blue-600 text-white shadow-xl`}>O</div>
           <div>
              <h3 className="text-xl font-black text-white uppercase italic tracking-tighter leading-none">মার্কেট অর্ডার হাব</h3>
              <p className="text-[10px] text-slate-400 font-black uppercase mt-2 tracking-widest">{company}</p>
           </div>
        </div>
        <button onClick={() => { setModalCustSearch(""); setModalAreaFilter(""); setSelectedCust(null); setCart([]); setCurrentStep(1); setShowAddModal(true); }} className="w-full md:w-auto bg-white text-slate-900 px-10 py-4 rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-xl active:scale-95 hover:bg-blue-600 hover:text-white transition-all">+ নতুন অর্ডার যোগ করুন</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="col-span-full py-20 text-center animate-pulse text-slate-300 font-black uppercase italic">লোড হচ্ছে...</div>
        ) : orders.map(order => (
          <div key={order.id} onClick={() => { setSelectedOrder(order); setShowDetailModal(true); }} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all cursor-pointer group animate-reveal">
             <div className="flex justify-between items-start mb-6">
                <span className={`px-4 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest ${order.status === 'PENDING' ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'}`}>{order.status}</span>
                {(isAdmin || isStaff) && (
                  <button 
                    onClick={(e) => handleDeleteOrder(order.id, e)} 
                    className="w-10 h-10 bg-red-50 text-red-500 rounded-xl flex items-center justify-center border shadow-sm hover:bg-red-600 hover:text-white transition-all active:scale-90"
                    title="Delete Wrong Order"
                  >
                    🗑️
                  </button>
                )}
             </div>
             <h4 className="font-black text-slate-900 text-xl uppercase italic leading-none truncate mb-2">{order.customers?.name}</h4>
             <p className="text-[10px] text-slate-400 font-black uppercase italic truncate tracking-widest">📍 এরিয়া: {order.customers?.address || 'অনির্ধারিত'}</p>
             <div className="mt-8 flex justify-between items-end border-t pt-6">
                <div>
                   <p className="text-[8px] font-black text-slate-400 uppercase mb-1">বিল</p>
                   <p className="text-2xl font-black italic text-slate-900 tracking-tighter leading-none">{formatCurrency(order.total_amount)}</p>
                </div>
                <div className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 px-5 py-2 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all">বিস্তারিত ➔</div>
             </div>
          </div>
        ))}
      </div>

      {showDetailModal && selectedOrder && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-3xl z-[4000] flex items-center justify-center p-4">
           <div className="bg-white rounded-[4rem] w-full max-w-3xl h-[85vh] overflow-hidden flex flex-col shadow-2xl animate-reveal">
              <div className="p-10 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <div>
                    <h3 className="text-2xl font-black uppercase italic tracking-tighter">অর্ডার ইনভয়েস বিবরণ</h3>
                    <p className="text-[10px] text-slate-500 mt-2 uppercase font-black tracking-widest">Order ID: #{String(selectedOrder.id).slice(-6).toUpperCase()}</p>
                 </div>
                 <div className="flex gap-4">
                    {(isAdmin || isStaff) && <button onClick={() => handleDeleteOrder(selectedOrder.id)} className="w-12 h-12 bg-red-600/20 text-red-500 rounded-2xl flex items-center justify-center hover:bg-red-600 hover:text-white transition-all">🗑️</button>}
                    <button onClick={() => setShowDetailModal(false)} className="text-4xl text-slate-500 font-black hover:text-white transition-colors">✕</button>
                 </div>
              </div>
              <div className="p-10 flex-1 overflow-y-auto custom-scroll space-y-10 text-slate-900">
                 <div className="grid grid-cols-2 gap-10 pb-10 border-b border-slate-100">
                    <div className="space-y-2">
                       <p className="text-[9px] font-black text-slate-400 uppercase italic mb-1">কাস্টমার:</p>
                       <p className="font-black text-xl uppercase italic leading-none">{selectedOrder.customers?.name}</p>
                       <p className="font-black text-xs uppercase text-blue-600 tracking-widest">📍 {selectedOrder.customers?.address}</p>
                    </div>
                    <div className="text-right space-y-2">
                       <p className="text-[9px] font-black text-slate-400 uppercase italic mb-1">এন্ট্রি তথ্য:</p>
                       <p className="font-black text-sm uppercase">সংগ্রহকারী: {selectedOrder.created_by}</p>
                    </div>
                 </div>
                 <div className="space-y-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase italic tracking-widest">মালের তালিকা:</p>
                    <div className="divide-y border rounded-[2.5rem] overflow-hidden bg-slate-50 shadow-inner">
                       {selectedOrder.items.map((item: any, idx: number) => (
                         <div key={idx} className="p-6 flex justify-between items-center bg-white/50 hover:bg-white transition-colors">
                            <div className="flex-1"><p className="text-[13px] font-black uppercase italic text-slate-800 leading-tight">[{item.company}] {item.name}</p></div>
                            <div className="text-right">
                               <p className="text-[10px] font-bold text-slate-400 italic">{item.qty} পিস x ৳{item.price}</p>
                               <p className="text-[14px] font-black text-blue-600 italic mt-1">৳{ (item.price * item.qty).toLocaleString() }</p>
                            </div>
                         </div>
                       ))}
                    </div>
                 </div>
                 <div className="pt-10 flex justify-between items-center border-t-4 border-slate-50">
                    <p className="text-[14px] font-black uppercase text-slate-400 italic tracking-widest">মোট অর্ডার ভ্যালু</p>
                    <p className="text-4xl font-black italic tracking-tighter text-slate-900">{formatCurrency(selectedOrder.total_amount)}</p>
                 </div>
              </div>
              <div className="p-10 bg-slate-50 border-t flex flex-col md:flex-row gap-4 shrink-0">
                 {selectedOrder.status === 'PENDING' && (
                    <button disabled={isSaving} onClick={handleApproveOrder} className="flex-1 bg-blue-600 text-white py-6 rounded-3xl font-black uppercase text-xs tracking-[0.2em] shadow-xl active:scale-95 transition-all hover:bg-emerald-600">অর্ডার অ্যাপ্রুভ ও মেমো তৈরি ✅</button>
                 )}
                 <button onClick={() => setShowDetailModal(false)} className="px-12 py-6 text-slate-500 font-black uppercase text-[10px] tracking-widest bg-white border rounded-3xl active:scale-95">বন্ধ করুন</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default OrderManagement;
