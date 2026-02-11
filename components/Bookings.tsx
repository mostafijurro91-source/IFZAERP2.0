import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Company, UserRole, Product, formatCurrency, Booking, BookingItem, User } from '../types';
import { db, supabase, mapToDbCompany } from '../lib/supabase';
import { jsPDF } from 'jspdf';
import * as html2canvasModule from 'html2canvas';

const html2canvas = (html2canvasModule as any).default || html2canvasModule;

interface ExtendedBooking extends Booking {
  customer_address?: string;
  customer_phone?: string;
}

interface BookingsProps {
  company: Company;
  role: UserRole;
  user: User;
}

const Bookings: React.FC<BookingsProps> = ({ company, role, user }) => {
  const [bookings, setBookings] = useState<ExtendedBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDeliverModal, setShowDeliverModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showDeliverySuccess, setShowDeliverySuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  
  const [selectedBooking, setSelectedBooking] = useState<ExtendedBooking | null>(null);
  const [deliveryItems, setDeliveryItems] = useState<Record<string, number>>({});
  const [lastDeliverySummary, setLastDeliverySummary] = useState<any[]>([]);
  const [newPaymentAmount, setNewPaymentAmount] = useState<number | "">("");
  
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCust, setSelectedCust] = useState<any>(null);
  const [bookingCart, setBookingCart] = useState<any[]>([]);
  
  const [custSearch, setCustSearch] = useState("");
  const [prodSearch, setProdSearch] = useState("");
  const [showCustList, setShowCustList] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  
  const [modalAreaSelection, setModalAreaSelection] = useState("");
  const [form, setForm] = useState({ qty: 1, unitPrice: 0, advance: 0 });

  const invoiceRef = useRef<HTMLDivElement>(null);
  const challanRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchData(); }, [company]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const dbCompany = mapToDbCompany(company);
      const { data: bkData, error: bkErr } = await supabase
        .from('bookings')
        .select('*, customers(name, address, phone)')
        .eq('company', dbCompany)
        .order('created_at', { ascending: false });

      if (bkErr) throw bkErr;
      const formattedBookings = bkData.map(b => ({
        ...b, 
        customer_name: b.customers?.name, 
        customer_address: b.customers?.address,
        customer_phone: b.customers?.phone
      }));

      const [custData, prodData] = await Promise.all([
        db.getCustomers(),
        supabase.from('products').select('*').eq('company', dbCompany).order('name')
      ]);

      setBookings(formattedBookings || []);
      setCustomers(custData || []);
      setProducts(prodData.data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleDownloadPDF = async (ref: React.RefObject<HTMLDivElement>, filename: string) => {
    if (!ref.current || isDownloading) return;
    setIsDownloading(true);
    try {
      const element = ref.current;
      const canvas = await html2canvas(element, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      const pdf = new jsPDF('p', 'mm', 'a5');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, imgHeight);
      pdf.save(`${filename}_${new Date().getTime()}.pdf`);
    } catch (err) {
      alert("পিডিএফ ডাউনলোড করা যায়নি।");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleBookingPayment = async () => {
    if (!selectedBooking || !newPaymentAmount || Number(newPaymentAmount) <= 0) return;
    setIsSaving(true);
    try {
      const dbCompany = mapToDbCompany(company);
      const amt = Number(newPaymentAmount);
      
      const { error: updateErr } = await supabase
        .from('bookings')
        .update({ advance_amount: (selectedBooking.advance_amount || 0) + amt })
        .eq('id', selectedBooking.id);

      if (updateErr) throw updateErr;

      await supabase.from('transactions').insert([{
        customer_id: selectedBooking.customer_id,
        company: dbCompany,
        amount: amt,
        payment_type: 'COLLECTION',
        items: [{ note: `বুকিং পেমেন্ট (ID: ${selectedBooking.id.slice(-6).toUpperCase()})` }],
        submitted_by: user.name
      }]);

      alert("টাকা সফলভাবে জমা হয়েছে!");
      setShowPaymentModal(false);
      setNewPaymentAmount("");
      fetchData();
      setShowDetailModal(false);
    } catch (err: any) { alert(err.message); } finally { setIsSaving(false); }
  };

  const handleDelivery = async () => {
    if (!selectedBooking) return;
    
    const batchItems = selectedBooking.items
      .filter(it => (deliveryItems[it.id] || 0) > 0)
      .map(it => ({
        name: it.name,
        qty: deliveryItems[it.id],
        mrp: products.find(p => p.id === it.product_id)?.mrp || 0
      }));

    if (batchItems.length === 0) return alert("অন্তত একটি পণ্যের পরিমাণ লিখুন!");

    setIsSaving(true);
    try {
      const updatedItems = selectedBooking.items.map(item => ({
        ...item,
        delivered_qty: (item.delivered_qty || 0) + (deliveryItems[item.id] || 0)
      }));

      for (const item of selectedBooking.items) {
        const qty = deliveryItems[item.id] || 0;
        if (qty > 0) {
          await supabase.rpc('increment_stock', { row_id: item.product_id, amt: -qty });
        }
      }

      const allDone = updatedItems.every(i => i.delivered_qty >= i.qty);
      const { error } = await supabase
        .from('bookings')
        .update({ items: updatedItems, status: allDone ? 'COMPLETED' : 'PARTIAL' })
        .eq('id', selectedBooking.id);

      if (error) throw error;

      setLastDeliverySummary(batchItems);
      setShowDeliverModal(false);
      setShowDeliverySuccess(true);
      fetchData();
    } catch (err: any) { alert(err.message); } finally { setIsSaving(false); }
  };

  const addToCart = (p: Product) => {
    if (bookingCart.find(i => i.product_id === p.id)) return;
    setBookingCart([...bookingCart, { 
      product_id: p.id, 
      name: p.name, 
      qty: 1, 
      unitPrice: p.tp, 
      total: p.tp, 
      mrp: p.mrp 
    }]);
    setProdSearch(""); 
  };

  const updateCartItem = (idx: number, updates: any) => {
    const updated = [...bookingCart];
    const item = { ...updated[idx], ...updates };
    item.total = item.qty * item.unitPrice;
    updated[idx] = item;
    setBookingCart(updated);
  };

  const handleAddBooking = async () => {
    if (!selectedCust || bookingCart.length === 0 || isSaving) return;
    setIsSaving(true);
    try {
      const dbCo = mapToDbCompany(company);
      const totalAmount = bookingCart.reduce((acc, it) => acc + it.total, 0);
      const itemsToSave = bookingCart.map(it => ({ ...it, id: it.product_id, delivered_qty: 0 }));

      const { error } = await supabase.from('bookings').insert([{
        customer_id: selectedCust.id,
        company: dbCo,
        product_name: itemsToSave[0].name,
        qty: itemsToSave.reduce((sum, item) => sum + item.qty, 0),
        items: itemsToSave,
        advance_amount: Number(form.advance),
        total_amount: totalAmount,
        status: 'PENDING'
      }]);
      if (error) throw error;
      
      if (Number(form.advance) > 0) {
        await supabase.from('transactions').insert([{
          customer_id: selectedCust.id, company: dbCo, amount: Number(form.advance),
          payment_type: 'COLLECTION', items: [{ note: `বুকিং অগ্রিম` }], submitted_by: user.name
        }]);
      }

      alert("বুকিং সফলভাবে সেভ হয়েছে!");
      setShowAddModal(false); setBookingCart([]); setSelectedCust(null);
      setForm({ qty: 1, unitPrice: 0, advance: 0 }); fetchData();
    } catch (err: any) { alert(err.message); } finally { setIsSaving(false); }
  };

  const filteredBookings = useMemo(() => {
    return bookings.filter(b => statusFilter === "ALL" || b.status === statusFilter);
  }, [bookings, statusFilter]);

  const uniqueAreas = useMemo(() => Array.from(new Set(customers.map(c => c.address?.trim()).filter(Boolean))).sort(), [customers]);

  return (
    <div className="space-y-6 pb-24 font-sans text-black animate-reveal">
      
      {/* Visual Header Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 no-print">
        <div className="bg-white p-5 md:p-8 rounded-[2.2rem] border shadow-sm">
           <p className="text-[10px] font-black text-slate-400 uppercase italic mb-1">বুকিং ভ্যালু</p>
           <p className="text-xl md:text-3xl font-black italic text-slate-900 leading-none tracking-tighter">{formatCurrency(filteredBookings.reduce((s, b) => s + Number(b.total_amount), 0))}</p>
        </div>
        <div className="bg-white p-5 md:p-8 rounded-[2.2rem] border shadow-sm">
           <p className="text-[10px] font-black text-slate-400 uppercase italic mb-1">মোট জমা</p>
           <p className="text-xl md:text-3xl font-black italic text-emerald-600 leading-none tracking-tighter">{formatCurrency(filteredBookings.reduce((s, b) => s + Number(b.advance_amount), 0))}</p>
        </div>
        <div className="bg-slate-900 p-5 md:p-8 rounded-[2.2rem] shadow-xl text-white col-span-2 md:col-span-1">
           <p className="text-[10px] font-black text-slate-500 uppercase italic mb-1">বাকি টাকা</p>
           <p className="text-xl md:text-3xl font-black italic text-red-400 leading-none tracking-tighter">{formatCurrency(filteredBookings.reduce((s, b) => s + (Number(b.total_amount) - Number(b.advance_amount)), 0))}</p>
        </div>
      </div>

      {/* Terminal Title & Controls */}
      <div className="bg-white p-4 md:p-6 rounded-[2.5rem] border shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 no-print">
        <div className="flex items-center gap-4">
           <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black italic shadow-lg">B</div>
           <div>
              <h3 className="text-lg font-black uppercase italic tracking-tighter leading-none">বুকিং টার্মিনাল</h3>
              <p className="text-[9px] text-slate-400 font-black uppercase mt-1 tracking-widest">{company} Division Hub</p>
           </div>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <select className="p-4 bg-slate-50 border rounded-xl text-[10px] font-black uppercase outline-none" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
             <option value="ALL">সকল</option>
             <option value="PENDING">পেন্ডিং</option>
             <option value="PARTIAL">অংশিক</option>
             <option value="COMPLETED">সম্পন্ন</option>
          </select>
          <button onClick={() => { setShowAddModal(true); setBookingCart([]); setSelectedCust(null); setProdSearch(""); }} className="flex-1 md:flex-none bg-slate-900 text-white px-8 py-4 rounded-xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all">+ নতুন বুকিং এন্ট্রি</button>
        </div>
      </div>

      {/* Booking Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 no-print pt-2">
        {loading ? (
          <div className="col-span-full py-20 text-center animate-pulse font-black uppercase italic opacity-20">লোড হচ্ছে...</div>
        ) : filteredBookings.map(b => (
            <div key={b.id} onClick={() => { setSelectedBooking(b); setShowDetailModal(true); }} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all cursor-pointer group relative overflow-hidden flex flex-col justify-between">
               <div className="mb-4">
                  <div className="flex justify-between items-start mb-4">
                     <span className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${
                       b.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600' : b.status === 'PARTIAL' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'
                     }`}>{b.status === 'PARTIAL' ? 'অংশিক' : b.status}</span>
                     <p className="text-[8px] font-bold text-slate-200 uppercase">ID: {b.id.slice(-4).toUpperCase()}</p>
                  </div>
                  <h4 className="font-black text-slate-900 text-base md:text-lg uppercase italic leading-none truncate mb-1">{b.customer_name}</h4>
                  <p className="text-[9px] text-slate-400 font-black uppercase truncate italic">📍 {b.customer_address}</p>
               </div>
               <div className="flex justify-between items-end border-t pt-4 mt-auto">
                  <div><p className="text-[8px] font-black text-slate-400 uppercase mb-1">বিল</p><p className="text-base md:text-lg font-black italic text-slate-900 leading-none">{formatCurrency(b.total_amount)}</p></div>
                  <div className="text-right">
                     <p className="text-[8px] font-black text-red-300 uppercase mb-1">বাকি</p>
                     <p className="text-base md:text-lg font-black italic text-red-600 leading-none">{formatCurrency(b.total_amount - b.advance_amount)}</p>
                  </div>
               </div>
            </div>
        ))}
      </div>

      {/* 🧾 ADD NEW BOOKING MODAL - TRUE FULL SCREEN ON ALL DEVICES */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-xl z-[3000] flex flex-col h-screen overflow-hidden text-slate-900 animate-reveal">
           {/* Header - Sticky */}
           <div className="p-6 md:p-8 bg-slate-900 text-white flex justify-between items-center shrink-0 border-b border-white/10">
              <div className="flex items-center gap-5">
                 <button onClick={() => setShowAddModal(false)} className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-xl hover:bg-white/20 transition-all">✕</button>
                 <div>
                    <h3 className="text-xl md:text-2xl font-black uppercase italic tracking-tighter leading-none">নতুন বুকিং এন্ট্রি</h3>
                    <p className="text-[9px] font-black text-slate-500 uppercase mt-1.5 tracking-widest italic hidden md:block">IFZA Enterprise Cloud Hub</p>
                 </div>
              </div>
              <div className="text-right hidden md:block">
                 <p className="text-[9px] font-black text-slate-500 uppercase italic">Operator: {user.name}</p>
                 <p className="text-sm font-black italic">{new Date().toLocaleDateString('bn-BD')}</p>
              </div>
           </div>

           {/* Full Screen Scrollable Body with Panels */}
           <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0 bg-white">
              {/* Left Panel: Shop & Product Selection */}
              <div className="w-full lg:w-1/2 p-6 md:p-10 border-r overflow-y-auto custom-scroll space-y-8 bg-slate-50/50 overscroll-contain">
                 <div className="space-y-3">
                    <label className="text-[10px] font-black text-indigo-600 uppercase italic ml-4 block tracking-widest">১. এরিয়া/রুট বাছাই</label>
                    <select className="w-full p-5 bg-white border-2 border-slate-100 rounded-[2.2rem] font-black text-base uppercase outline-none shadow-sm focus:border-indigo-500 transition-all" value={modalAreaSelection} onChange={e => { setModalAreaSelection(e.target.value); setSelectedCust(null); }}>
                       <option value="">সকল এরিয়া</option>
                       {uniqueAreas.map(area => <option key={area} value={area}>{area}</option>)}
                    </select>
                 </div>

                 <div className="relative">
                    <label className="text-[10px] font-black text-indigo-600 uppercase italic ml-4 mb-2 block tracking-widest">২. দোকান নির্বাচন</label>
                    <div onClick={() => setShowCustList(!showCustList)} className="p-6 bg-white border-2 border-slate-100 rounded-[2.2rem] font-black text-base uppercase italic cursor-pointer flex justify-between items-center shadow-sm hover:border-indigo-400 transition-all">
                       {selectedCust ? selectedCust.name : "দোকান বেছে নিন (Select Shop)..."}
                       <span className="opacity-20 text-xl">▼</span>
                    </div>
                    {showCustList && (
                      <div className="absolute z-[100] w-full mt-2 bg-white border shadow-2xl rounded-[2.5rem] max-h-80 overflow-hidden flex flex-col p-2 animate-reveal">
                         <input autoFocus className="w-full p-5 border-b outline-none font-bold italic text-base bg-slate-50 rounded-t-[2.5rem]" placeholder="দোকান সার্চ..." value={custSearch} onChange={e => setCustSearch(e.target.value)} />
                         <div className="overflow-y-auto custom-scroll flex-1 p-2">
                           {customers.filter(c => (!custSearch || c.name.toLowerCase().includes(custSearch.toLowerCase())) && (!modalAreaSelection || c.address === modalAreaSelection)).map(c => (
                             <div key={c.id} onClick={() => { setSelectedCust(c); setShowCustList(false); }} className="p-5 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 font-black text-sm uppercase italic rounded-xl transition-colors">
                               {c.name}<p className="text-[10px] opacity-40 font-bold tracking-tighter mt-1">📍 {c.address}</p>
                             </div>
                           ))}
                         </div>
                      </div>
                    )}
                 </div>

                 <div className="space-y-4">
                    <label className="text-[10px] font-black text-indigo-600 uppercase ml-4 mb-1 block tracking-widest">৩. প্রোডাক্ট মডেল সার্চ</label>
                    <div className="relative">
                       <input className="w-full p-6 bg-white border-2 border-slate-100 rounded-[2.2rem] font-black text-lg uppercase italic outline-none focus:border-indigo-500 shadow-md transition-all" placeholder="যেমন: CDL 15W..." value={prodSearch} onChange={e => setProdSearch(e.target.value)} />
                       <span className="absolute right-8 top-1/2 -translate-y-1/2 text-2xl opacity-20">🔍</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                       {prodSearch.trim() !== "" && products.filter(p => p.name.toLowerCase().includes(prodSearch.toLowerCase())).slice(0, 4).map(p => (
                         <div key={p.id} onClick={() => addToCart(p)} className="p-6 border-2 border-indigo-100 rounded-[2.5rem] hover:border-indigo-500 cursor-pointer transition-all bg-white active:scale-95 shadow-lg flex justify-between items-center group">
                            <div className="min-w-0 pr-4">
                               <p className="text-lg font-black uppercase italic truncate text-slate-800">{p.name}</p>
                               <p className="text-[10px] font-bold text-indigo-600 mt-2 italic tracking-widest">MRP: ৳{p.mrp}</p>
                            </div>
                            <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-3xl font-black text-indigo-500 group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">+</div>
                         </div>
                       ))}
                    </div>
                 </div>
              </div>

              {/* Right Panel: Order Cart with Sticky Footer Integration */}
              <div className="w-full lg:w-1/2 flex flex-col bg-white overflow-hidden min-h-0 border-l border-slate-100">
                 <div className="p-6 md:p-8 border-b shrink-0 bg-slate-50 flex justify-between items-center">
                    <h4 className="text-[11px] font-black text-slate-400 uppercase italic tracking-[0.2em]">অর্ডার কার্ট ({bookingCart.length} আইটেম)</h4>
                    <button onClick={() => setBookingCart([])} className="text-rose-500 font-black text-[10px] uppercase underline transition-colors hover:text-rose-700">সব মুছুন</button>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto custom-scroll p-6 md:p-10 space-y-5 overscroll-contain bg-white shadow-inner">
                    {bookingCart.map((it, idx) => (
                      <div key={idx} className="bg-slate-50 p-6 md:p-8 rounded-[3rem] border border-slate-200 space-y-5 relative overflow-hidden group animate-reveal shadow-sm">
                         <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0 pr-12">
                               <p className="text-xl font-black uppercase italic truncate leading-none text-slate-900">{it.name}</p>
                               <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 italic tracking-widest">Model MRP: ৳{it.mrp}</p>
                            </div>
                            <button onClick={() => setBookingCart(bookingCart.filter((_, i) => i !== idx))} className="absolute top-6 right-8 bg-rose-50 text-rose-500 w-12 h-12 rounded-full flex items-center justify-center text-2xl font-black hover:bg-rose-500 hover:text-white transition-all shadow-md">✕</button>
                         </div>
                         
                         <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-1.5">
                               <label className="text-[9px] font-black text-blue-500 uppercase ml-2 italic tracking-widest">বুকিং রেট (৳)</label>
                               <input type="number" className="w-full p-5 bg-white border border-blue-100 rounded-[1.8rem] text-center font-black text-xl text-blue-600 outline-none shadow-sm focus:border-blue-400" value={it.unitPrice} onChange={e => updateCartItem(idx, { unitPrice: Number(e.target.value) })} />
                            </div>
                            <div className="space-y-1.5">
                               <label className="text-[9px] font-black text-slate-400 uppercase ml-2 italic tracking-widest">পরিমাণ (QTY)</label>
                               <input type="number" className="w-full p-5 bg-white border border-slate-200 rounded-[1.8rem] text-center font-black text-xl text-slate-900 outline-none shadow-sm focus:border-indigo-400" value={it.qty} onChange={e => updateCartItem(idx, { qty: Number(e.target.value) })} />
                            </div>
                         </div>
                         <div className="text-right border-t border-slate-200 pt-4">
                            <p className="text-[11px] font-black text-slate-800 italic uppercase">আইটেম টোটাল: <span className="text-2xl text-indigo-600 ml-2 font-black italic">৳{it.total.toLocaleString()}</span></p>
                         </div>
                      </div>
                    ))}
                    {bookingCart.length === 0 && (
                       <div className="py-32 text-center opacity-10 font-black uppercase italic tracking-[0.5em] flex flex-col items-center">
                          <span className="text-[120px] mb-6">🛒</span>
                          কার্ট খালি
                       </div>
                    )}
                 </div>

                 {/* Sticky Calculations & Save Button */}
                 <div className="pt-6 border-t space-y-5 bg-slate-900 p-6 md:p-10 shrink-0 z-50 shadow-[0_-20px_60px_rgba(0,0,0,0.3)]">
                    <div className="bg-white/5 p-6 rounded-[2.5rem] border border-white/10 flex flex-col md:flex-row justify-between items-center gap-6">
                       <div className="w-full md:flex-1">
                          <label className="text-[10px] font-black text-emerald-400 uppercase italic block mb-2 tracking-widest">অগ্রিম পেমেন্ট জমা (Advance)</label>
                          <input type="number" className="w-full bg-transparent text-5xl font-black italic outline-none text-emerald-400 tracking-tighter" placeholder="0.00" value={form.advance} onChange={e => setForm({...form, advance: Number(e.target.value)})} />
                       </div>
                       <div className="w-full md:w-auto md:border-l md:border-white/10 md:pl-10 text-center md:text-right">
                          <p className="text-[10px] font-black text-white/40 uppercase italic mb-2 tracking-widest">গ্র্যান্ড টোটাল বিল</p>
                          <p className="text-5xl font-black italic text-white tracking-tighter leading-none">৳{bookingCart.reduce((s, i) => s + i.total, 0).toLocaleString()}</p>
                       </div>
                    </div>
                    <button disabled={isSaving || bookingCart.length === 0 || !selectedCust} onClick={handleAddBooking} className="w-full bg-indigo-600 text-white py-10 rounded-[2.5rem] font-black uppercase text-base tracking-[0.5em] shadow-2xl active:scale-95 transition-all hover:bg-indigo-500 disabled:opacity-20 flex items-center justify-center gap-4">
                       {isSaving ? "সংরক্ষণ হচ্ছে..." : "বুকিং নিশ্চিত করুন ➔"}
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* DETAIL MODAL - Robust Scrolling */}
      {showDetailModal && selectedBooking && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[3000] flex items-center justify-center p-0 md:p-10 no-print overflow-hidden">
           <div className="bg-white rounded-none md:rounded-[3rem] w-full max-w-2xl h-full md:h-fit max-h-[90vh] flex flex-col shadow-2xl animate-reveal overflow-hidden">
              <div className="p-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <div><h3 className="text-xl font-black uppercase italic leading-none">বুকিং হিসাব ও ডেলিভারি</h3><p className="text-[10px] text-slate-500 uppercase font-black mt-2 tracking-widest">Order ID: #{selectedBooking.id.slice(-6).toUpperCase()}</p></div>
                 <button onClick={() => setShowDetailModal(false)} className="text-4xl text-slate-500 font-black hover:text-white transition-colors">✕</button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scroll p-8 space-y-10 text-slate-900 overscroll-contain min-h-0">
                 <div className="grid grid-cols-2 gap-6 border-b pb-8 border-slate-100">
                    <div>
                       <p className="text-[10px] font-black text-slate-400 uppercase italic mb-1">দোকান তথ্য:</p>
                       <p className="text-xl font-black uppercase italic leading-tight text-slate-900">{selectedBooking.customer_name}</p>
                       <p className="text-[11px] font-bold mt-2 uppercase text-slate-500 tracking-widest italic">📍 {selectedBooking.customer_address}</p>
                    </div>
                    <div className="text-right">
                       <p className="text-[10px] font-black text-slate-400 uppercase italic mb-1">পেমেন্ট অবস্থা:</p>
                       <p className="text-sm font-black italic text-emerald-600">জমা: {formatCurrency(selectedBooking.advance_amount)}</p>
                       <p className="text-3xl font-black italic text-red-600 mt-2 tracking-tighter">বাকি: {formatCurrency(selectedBooking.total_amount - selectedBooking.advance_amount)}</p>
                    </div>
                 </div>

                 <div className="space-y-4">
                    <p className="text-[11px] font-black text-slate-400 uppercase italic tracking-widest">ডেলিভারি ট্র্যাকিং স্ট্যাটাস:</p>
                    <div className="divide-y border border-slate-100 rounded-[2.5rem] overflow-hidden bg-slate-50 shadow-inner">
                       {selectedBooking.items.map((it, idx) => {
                          const p = Math.round(((it.delivered_qty || 0) / it.qty) * 100);
                          return (
                            <div key={idx} className="p-8 bg-white">
                               <div className="flex justify-between items-center mb-4">
                                  <div><p className="text-base font-black uppercase italic leading-none text-slate-900">{it.name}</p><p className="text-[10px] font-bold text-slate-400 uppercase mt-2 italic tracking-widest">অর্ডার: {it.qty} | <span className="text-blue-600 font-black">ডেলিভারি: {it.delivered_qty || 0}</span></p></div>
                                  <span className={`text-sm font-black italic ${p === 100 ? 'text-emerald-600' : 'text-blue-600'}`}>{p}%</span>
                               </div>
                               <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                                  <div className={`h-full transition-all duration-1000 ${p === 100 ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${p}%` }}></div>
                                </div>
                            </div>
                          );
                       })}
                    </div>
                 </div>
              </div>
              <div className="p-6 md:p-8 bg-slate-50 border-t shrink-0 grid grid-cols-3 gap-3">
                  <button onClick={() => { setNewPaymentAmount(""); setShowPaymentModal(true); }} className="bg-emerald-600 text-white py-6 rounded-2xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all">💰 টাকা জমা</button>
                  <button onClick={() => { setDeliveryItems({}); setShowDeliverModal(true); }} className="bg-blue-600 text-white py-6 rounded-2xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all">🚚 ডেলিভারি</button>
                  <button onClick={() => handleDownloadPDF(invoiceRef, 'Booking_Invoice')} className="bg-slate-900 text-white py-6 rounded-2xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all">📄 মেমো ডাউঃ</button>
              </div>
           </div>
        </div>
      )}

      {/* Hidden PDF Templates */}
      <div className="fixed -left-[2000px] top-0 no-print">
        <div ref={invoiceRef} className="bg-white w-[148mm] p-10 flex flex-col text-black font-sans border-2 border-black">
           <div className="text-center border-b-4 border-black pb-4 mb-8">
              <h1 className="text-3xl font-black uppercase italic mb-1">IFZA ELECTRONICS</h1>
              <p className="text-base font-black uppercase tracking-[0.3em] mb-1">{company} DIVISION</p>
              <div className="inline-block px-5 py-1 bg-black text-white text-[8px] font-black uppercase rounded-full italic">Booking Order Invoice</div>
           </div>
           {selectedBooking && (
             <>
               <div className="flex justify-between items-start mb-8 text-[10px]">
                  <div>
                     <p className="font-black border-b border-black w-fit mb-1 uppercase tracking-widest opacity-60">ক্রেতা (Customer):</p>
                     <p className="text-lg font-black uppercase italic leading-none">{selectedBooking.customer_name}</p>
                     <p className="font-bold mt-1">📍 {selectedBooking.customer_address}</p>
                  </div>
                  <div className="text-right">
                     <p className="font-black border-b border-black w-fit ml-auto mb-1 uppercase tracking-widest opacity-60">মেমো তথ্য:</p>
                     <p className="font-black text-xs">Invoice: #{selectedBooking.id.slice(-6).toUpperCase()}</p>
                     <p className="font-black">Date: {new Date(selectedBooking.created_at).toLocaleDateString('bn-BD')}</p>
                  </div>
               </div>
               <table className="w-full text-left border-collapse border-2 border-black mb-8">
                  <thead>
                     <tr className="bg-black text-white text-[9px] font-black uppercase italic">
                        <th className="p-2 border border-black text-left">Description</th>
                        <th className="p-2 border border-black text-center w-20">Rate</th>
                        <th className="p-2 border border-black text-center w-20">Qty</th>
                        <th className="p-2 border border-black text-right w-24">Total</th>
                     </tr>
                  </thead>
                  <tbody>
                     {selectedBooking.items.map((it, idx) => (
                        <tr key={idx} className="font-bold text-[10px] border-b border-black italic">
                           <td className="p-2 border border-black uppercase">{it.name}</td>
                           <td className="p-2 border border-black text-center">৳{it.unitPrice}</td>
                           <td className="p-2 border border-black text-center">{it.qty}</td>
                           <td className="p-2 border border-black text-right">৳{(it.unitPrice * it.qty).toLocaleString()}</td>
                        </tr>
                     ))}
                  </tbody>
               </table>
               <div className="flex justify-end mb-16">
                  <div className="w-56 space-y-1.5 font-black italic text-[11px]">
                     <div className="flex justify-between border-b border-black/10 pb-0.5"><span>TOTAL BILL:</span><span>{formatCurrency(selectedBooking.total_amount)}</span></div>
                     <div className="flex justify-between text-emerald-600 border-b border-black/10 pb-0.5"><span>ADVANCE PAID:</span><span>{formatCurrency(selectedBooking.advance_amount)}</span></div>
                     <div className="flex justify-between text-xl font-black border-2 border-black p-2 bg-black text-white mt-3">
                        <span className="text-[8px] self-center uppercase">Due:</span>
                        <span>{formatCurrency(selectedBooking.total_amount - selectedBooking.advance_amount)}</span>
                     </div>
                  </div>
               </div>
               <div className="mt-10 flex justify-between items-end px-4 mb-4">
                  <div className="text-center w-36 border-t-2 border-black pt-1 font-black italic text-[10px]">ক্রেতার স্বাক্ষর</div>
                  <div className="text-center w-48 border-t-2 border-black pt-1 text-right">
                     <p className="text-[14px] font-black uppercase italic tracking-tighter">কর্তৃপক্ষের স্বাক্ষর</p>
                  </div>
               </div>
             </>
           )}
        </div>
      </div>

      {/* Payment and Delivery Modals handled via detail trigger */}
      {showPaymentModal && selectedBooking && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[4000] flex items-center justify-center p-4 no-print overflow-hidden">
          <div className="bg-white p-8 rounded-[3rem] w-full max-w-sm shadow-2xl animate-reveal flex flex-col max-h-[90vh]">
             <div className="flex justify-between items-center mb-8 border-b pb-4 shrink-0">
                <h3 className="text-lg font-black uppercase italic tracking-tighter">টাকা জমা নিন</h3>
                <button onClick={() => setShowPaymentModal(false)} className="text-3xl text-slate-300 font-black">✕</button>
             </div>
             <div className="space-y-8 text-slate-900 overflow-y-auto custom-scroll">
                <div className="bg-slate-50 p-6 rounded-3xl border text-center shadow-inner">
                   <p className="text-[10px] font-black text-slate-400 uppercase italic mb-2 tracking-widest">বর্তমান বকেয়া</p>
                   <p className="text-3xl font-black italic text-red-600 leading-none tracking-tighter">{formatCurrency(selectedBooking.total_amount - selectedBooking.advance_amount)}</p>
                </div>
                <div className="space-y-3">
                   <label className="text-[10px] font-black text-slate-400 uppercase ml-3 italic tracking-[0.2em] text-center block">জমা অ্যামাউন্ট (৳)</label>
                   <input autoFocus type="number" className="w-full p-8 bg-blue-50 border-none rounded-[2.5rem] text-4xl font-black italic text-center text-blue-600 outline-none shadow-inner" placeholder="0.00" value={newPaymentAmount} onChange={e => setNewPaymentAmount(e.target.value === "" ? "" : Number(e.target.value))} />
                </div>
                <button disabled={isSaving || !newPaymentAmount} onClick={handleBookingPayment} className="w-full bg-slate-900 text-white py-8 rounded-[2.5rem] font-black uppercase text-[12px] tracking-[0.3em] shadow-xl active:scale-95 transition-all">কালেকশন সেভ করুন ➔</button>
             </div>
          </div>
        </div>
      )}

      {showDeliverModal && selectedBooking && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[4000] flex items-center justify-center p-4 no-print overflow-hidden">
          <div className="bg-white rounded-[3rem] w-full max-w-xl shadow-2xl flex flex-col h-full max-h-[85vh] animate-reveal">
             <div className="p-8 bg-blue-600 text-white flex justify-between items-center shrink-0 rounded-t-[3rem]">
                <div><h3 className="text-xl font-black uppercase italic leading-none">চালান তৈরি (Delivery)</h3><p className="text-[10px] text-blue-200 font-black uppercase mt-2 tracking-widest italic">কতটুকু মাল আজ পাঠানো হচ্ছে?</p></div>
                <button onClick={() => setShowDeliverModal(false)} className="text-4xl text-white/30 font-black">✕</button>
             </div>
             <div className="flex-1 overflow-y-auto custom-scroll p-8 space-y-4 text-slate-900 overscroll-contain">
                {selectedBooking.items.map((it) => {
                   const remaining = it.qty - (it.delivered_qty || 0);
                   return (
                      <div key={it.id} className="bg-slate-50 p-6 rounded-[2.2rem] border-2 border-slate-100 flex justify-between items-center group hover:bg-white hover:border-blue-400 transition-all shadow-sm">
                         <div className="flex-1 pr-6">
                            <p className="text-lg font-black uppercase italic truncate text-slate-800 leading-tight">{it.name}</p>
                            <p className="text-[10px] font-black text-slate-400 mt-2 uppercase tracking-widest">অবশিষ্ট মাল: <span className="text-rose-500 font-black">{remaining} পিস</span></p>
                         </div>
                         <div className="flex items-center bg-white rounded-2xl shadow-md px-5 py-3 border border-slate-200">
                            <input autoFocus type="number" className="w-16 bg-transparent text-center font-black text-2xl outline-none text-blue-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" placeholder="0" value={deliveryItems[it.id] || ""} onChange={e => setDeliveryItems({...deliveryItems, [it.id]: Math.max(0, Math.min(remaining, Number(e.target.value)))})} />
                            <span className="text-[10px] font-black opacity-30 uppercase ml-2 italic">Qty</span>
                         </div>
                      </div>
                   );
                })}
             </div>
             <div className="p-8 bg-white border-t shrink-0 rounded-b-[3rem]">
                <button disabled={isSaving} onClick={handleDelivery} className="w-full bg-blue-600 text-white py-10 rounded-[2.5rem] font-black uppercase text-base tracking-[0.3em] shadow-2xl active:scale-95 transition-all">চালান কনফার্ম করুন ✅</button>
             </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Bookings;
