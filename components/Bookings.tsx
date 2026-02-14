
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
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  
  const [selectedBooking, setSelectedBooking] = useState<ExtendedBooking | null>(null);
  
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCust, setSelectedCust] = useState<any>(null);
  const [bookingCart, setBookingCart] = useState<any[]>([]);
  
  const [custSearch, setCustSearch] = useState("");
  const [prodSearch, setProdSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [modalAreaSelection, setModalAreaSelection] = useState("");
  const [currentStep, setCurrentStep] = useState(1);
  const [form, setForm] = useState({ advance: 0 });

  // Delivery & Payment States for selected booking
  const [deliveryUpdates, setDeliveryUpdates] = useState<Record<string, number>>({});
  const [newPaymentAmt, setNewPaymentAmt] = useState<string>("");

  const invoiceRef = useRef<HTMLDivElement>(null);

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

  const handleUpdateBookingStats = async () => {
    if (!selectedBooking || isSaving) return;
    setIsSaving(true);
    try {
      const dbCo = mapToDbCompany(company);
      
      // 1. Process Delivery Updates
      const updatedItems = selectedBooking.items.map(item => {
        const updateVal = Number(deliveryUpdates[item.id] || 0);
        return { 
          ...item, 
          delivered_qty: (item.delivered_qty || 0) + updateVal 
        };
      });

      // 2. Process New Payment
      const payAmt = Number(newPaymentAmt) || 0;
      const newAdvance = (selectedBooking.advance_amount || 0) + payAmt;

      // Calculate new status
      let newStatus = selectedBooking.status;
      const allDone = updatedItems.every(i => i.delivered_qty >= i.qty);
      const someDone = updatedItems.some(i => i.delivered_qty > 0);
      if (allDone) newStatus = 'COMPLETED';
      else if (someDone) newStatus = 'PARTIAL';

      const { error: bkError } = await supabase.from('bookings').update({
        items: updatedItems,
        advance_amount: newAdvance,
        status: newStatus
      }).eq('id', selectedBooking.id);

      if (bkError) throw bkError;

      // Record transaction if payment made
      if (payAmt > 0) {
        await supabase.from('transactions').insert([{
          customer_id: selectedBooking.customer_id,
          company: dbCo,
          amount: payAmt,
          payment_type: 'COLLECTION',
          items: [{ note: `বুকিং পেমেন্ট আপডেট (ID: ${selectedBooking.id.slice(-6).toUpperCase()})` }],
          submitted_by: user.name
        }]);
      }

      // Update Inventory Stock for delivered items
      for (const id in deliveryUpdates) {
        const q = Number(deliveryUpdates[id]);
        if (q > 0) {
          await supabase.rpc('increment_stock', { row_id: id, amt: -q });
        }
      }

      alert("বুকিং এবং ডেলিভারি তথ্য আপডেট হয়েছে!");
      setDeliveryUpdates({});
      setNewPaymentAmt("");
      setShowDetailModal(false);
      fetchData();
    } catch (err: any) {
      alert("ত্রুটি: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddBooking = async () => {
    if (!selectedCust || bookingCart.length === 0 || isSaving) return;
    setIsSaving(true);
    try {
      const dbCo = mapToDbCompany(company);
      const totalAmount = bookingCart.reduce((acc, it) => acc + it.total, 0);
      const itemsToSave = bookingCart.map(it => ({ ...it, id: it.product_id, delivered_qty: 0 }));
      
      const { data, error } = await supabase.from('bookings').insert([{ 
        customer_id: selectedCust.id, 
        company: dbCo, 
        product_name: itemsToSave[0].name, 
        qty: itemsToSave.reduce((sum, item) => sum + item.qty, 0), 
        items: itemsToSave, 
        advance_amount: Number(form.advance), 
        total_amount: totalAmount, 
        status: 'PENDING' 
      }]).select().single();

      if (error) throw error;

      if (Number(form.advance) > 0) {
        await supabase.from('transactions').insert([{ 
          customer_id: selectedCust.id, 
          company: dbCo, 
          amount: Number(form.advance), 
          payment_type: 'COLLECTION', 
          items: [{ note: `বুকিং অগ্রিম (ID: ${String(data.id).slice(-6).toUpperCase()})` }], 
          submitted_by: user.name 
        }]);
      }

      alert("বুকিং সফলভাবে সম্পন্ন হয়েছে!");
      setShowAddModal(false);
      setBookingCart([]);
      setSelectedCust(null);
      setCurrentStep(1);
      fetchData();
    } catch (err: any) { 
      alert(err.message); 
    } finally { 
      setIsSaving(false); 
    }
  };

  const addToCart = (p: Product) => {
    if (bookingCart.find(i => i.product_id === p.id)) return;
    setBookingCart([...bookingCart, { product_id: p.id, name: p.name, qty: 1, unitPrice: p.tp, total: p.tp, mrp: p.mrp }]);
    setProdSearch(""); 
  };

  const updateCartItem = (idx: number, updates: any) => {
    const updated = [...bookingCart];
    const item = { ...updated[idx], ...updates };
    const price = Number(item.unitPrice) || 0;
    const qty = Number(item.qty) || 0;
    item.total = qty * price;
    updated[idx] = item;
    setBookingCart(updated.filter(i => i.qty > 0 || updates.qty === undefined));
  };

  const handleDownloadPDF = async (ref: React.RefObject<HTMLDivElement>, filename: string) => {
    if (!ref.current || isDownloading) return;
    setIsDownloading(true);
    try {
      const element = ref.current;
      const canvas = await html2canvas(element, { scale: 3, useCORS: true, backgroundColor: '#ffffff', logging: false });
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      const pdf = new jsPDF('p', 'mm', 'a5');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, imgHeight);
      pdf.save(`${filename}_${new Date().getTime()}.pdf`);
    } catch (err) { alert("PDF Error"); } finally { setIsDownloading(false); }
  };

  const filteredModalCustomers = useMemo(() => {
    return customers.filter(c => {
      const q = custSearch.toLowerCase().trim();
      const matchesSearch = !q || c.name.toLowerCase().includes(q) || c.phone.includes(q);
      const matchesArea = !modalAreaSelection || c.address === modalAreaSelection;
      return matchesSearch && matchesArea;
    });
  }, [customers, custSearch, modalAreaSelection]);

  const filteredProducts = useMemo(() => products.filter(p => p.name.toLowerCase().includes(prodSearch.toLowerCase())), [products, prodSearch]);
  const uniqueAreas = useMemo(() => Array.from(new Set(customers.map(c => c.address?.trim()).filter(Boolean))).sort(), [customers]);
  const filteredBookings = useMemo(() => bookings.filter(b => statusFilter === "ALL" || b.status === statusFilter), [bookings, statusFilter]);

  return (
    <div className="space-y-6 pb-24 font-sans text-black animate-reveal">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 no-print">
        <div className="bg-white p-5 md:p-8 rounded-[2.2rem] border shadow-sm">
           <p className="text-[10px] font-black text-slate-400 uppercase italic mb-1">বুকিং ভ্যালু</p>
           <p className="text-xl md:text-3xl font-black italic text-slate-900 leading-none tracking-tighter">
             {formatCurrency(filteredBookings.reduce((s, b) => s + Number(b.total_amount), 0))}
           </p>
        </div>
        <div className="bg-white p-5 md:p-8 rounded-[2.2rem] border shadow-sm">
           <p className="text-[10px] font-black text-slate-400 uppercase italic mb-1">মোট জমা</p>
           <p className="text-xl md:text-3xl font-black italic text-emerald-600 leading-none tracking-tighter">
             {formatCurrency(filteredBookings.reduce((s, b) => s + Number(b.advance_amount), 0))}
           </p>
        </div>
        <div className="bg-slate-900 p-5 md:p-8 rounded-[2.2rem] shadow-xl text-white col-span-2 md:col-span-1">
           <p className="text-[10px] font-black text-slate-500 uppercase italic mb-1">বাকি টাকা</p>
           <p className="text-xl md:text-3xl font-black italic text-red-400 leading-none tracking-tighter">
             {formatCurrency(filteredBookings.reduce((s, b) => s + (Number(b.total_amount) - Number(b.advance_amount)), 0))}
           </p>
        </div>
      </div>

      <div className="bg-white p-4 md:p-6 rounded-[2.5rem] border shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 no-print">
        <div className="flex items-center gap-4">
           <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black italic shadow-lg">B</div>
           <div>
              <h3 className="text-lg font-black uppercase italic tracking-tighter leading-none">বুকিং টার্মিনাল</h3>
              <p className="text-[9px] text-slate-400 font-black uppercase mt-1 tracking-widest">{company}</p>
           </div>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <select className="p-4 bg-slate-50 border rounded-xl text-[10px] font-black uppercase outline-none" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
             <option value="ALL">সকল</option>
             <option value="PENDING">পেন্ডিং</option>
             <option value="PARTIAL">অংশিক</option>
             <option value="COMPLETED">সম্পন্ন</option>
          </select>
          <button 
            onClick={() => { setShowAddModal(true); setBookingCart([]); setSelectedCust(null); setCurrentStep(1); }} 
            className="flex-1 md:flex-none bg-blue-600 text-white px-8 py-4 rounded-xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all"
          >
            + নতুন বুকিং এন্ট্রি
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 no-print">
        {loading ? (
          <div className="col-span-full py-20 text-center animate-pulse font-black uppercase italic opacity-20">লোড হচ্ছে...</div>
        ) : filteredBookings.map(b => (
            <div key={b.id} onClick={() => { setSelectedBooking(b); setDeliveryUpdates({}); setNewPaymentAmt(""); setShowDetailModal(true); }} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all cursor-pointer group relative flex flex-col justify-between animate-reveal">
               <div className="mb-4">
                  <div className="flex justify-between items-start mb-4">
                     <span className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${
                       b.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600' : b.status === 'PARTIAL' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'
                     }`}>{b.status === 'PARTIAL' ? 'অংশিক' : b.status}</span>
                     <span className="text-[9px] font-bold text-slate-300">#{b.id.slice(-4).toUpperCase()}</span>
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

      {/* ➕ ADD NEW BOOKING MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[4000] flex items-center justify-center p-4">
           <div className="bg-white rounded-[3.5rem] w-full max-w-5xl h-[92vh] flex flex-col shadow-2xl animate-reveal overflow-hidden">
              <div className="p-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <div className="flex items-center gap-6">
                    <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-xl font-black italic">B</div>
                    <div>
                       <h3 className="text-2xl font-black uppercase italic tracking-tighter">বুকিং এন্ট্রি স্ক্রিন</h3>
                       <div className="flex items-center gap-3 mt-1">
                          <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${currentStep === 1 ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400'}`}>Step 1: Shop</span>
                          <span className="text-slate-700">/</span>
                          <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${currentStep === 2 ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400'}`}>Step 2: Items & Rate</span>
                       </div>
                    </div>
                 </div>
                 <button onClick={() => setShowAddModal(false)} className="text-4xl text-slate-500 hover:text-white font-black transition-colors">✕</button>
              </div>

              {currentStep === 1 ? (
                <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
                   <div className="p-8 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                           <label className="text-[9px] font-black text-slate-400 uppercase italic ml-4">এরিয়া অনুযায়ী ফিল্টার</label>
                           <select 
                              className="w-full p-5 bg-white border-2 border-slate-100 rounded-[1.8rem] font-black text-xs uppercase outline-none shadow-sm focus:border-blue-600 transition-all"
                              value={modalAreaSelection}
                              onChange={e => setModalAreaSelection(e.target.value)}
                           >
                              <option value="">সকল এরিয়া</option>
                              {uniqueAreas.map(a => <option key={a} value={a}>{a}</option>)}
                           </select>
                        </div>
                        <div className="space-y-1">
                           <label className="text-[9px] font-black text-slate-400 uppercase italic ml-4">দোকানের নাম খুঁজুন</label>
                           <input 
                              className="w-full p-5 bg-white border-2 border-slate-100 rounded-[1.8rem] font-black text-xs uppercase outline-none shadow-sm focus:border-blue-600 transition-all"
                              placeholder="Shop ID or Name..."
                              value={custSearch}
                              onChange={e => setCustSearch(e.target.value)}
                           />
                        </div>
                      </div>
                   </div>
                   <div className="flex-1 overflow-y-auto custom-scroll px-8 pb-8 space-y-3">
                      {filteredModalCustomers.length === 0 ? (
                        <div className="py-20 text-center italic font-black text-slate-200 uppercase tracking-widest">দোকান পাওয়া যায়নি</div>
                      ) : filteredModalCustomers.map(c => (
                        <div 
                          key={c.id} 
                          onClick={() => { setSelectedCust(c); setCurrentStep(2); }}
                          className="p-6 bg-white rounded-3xl border-2 border-transparent shadow-sm hover:border-blue-600 hover:shadow-lg transition-all cursor-pointer flex justify-between items-center group"
                        >
                           <div className="min-w-0 flex-1">
                              <h4 className="font-black text-slate-800 uppercase italic text-sm group-hover:text-blue-600 leading-none">{c.name}</h4>
                              <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase italic tracking-widest leading-none">📍 {c.address} | 📱 {c.phone}</p>
                           </div>
                           <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center group-hover:bg-blue-50 group-hover:text-blue-600 transition-all">➔</div>
                        </div>
                      ))}
                   </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                   <div className="w-full lg:w-1/2 p-8 border-r overflow-hidden flex flex-col gap-6 bg-slate-50">
                      <div className="flex justify-between items-center px-4">
                         <h4 className="text-[10px] font-black text-slate-400 uppercase italic tracking-widest">পণ্য যোগ করুন</h4>
                         <button onClick={() => setCurrentStep(1)} className="bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-[9px] font-black uppercase hover:bg-slate-300">↩ দোকান পরিবর্তন</button>
                      </div>
                      <div className="relative">
                         <input 
                            className="w-full p-5 bg-white border-2 border-slate-100 rounded-[2rem] font-black text-xs uppercase outline-none shadow-sm focus:border-blue-600 transition-all pl-14"
                            placeholder="মডেল সার্চ (যেমন: 15W LED)..."
                            value={prodSearch}
                            onChange={e => setProdSearch(e.target.value)}
                         />
                         <span className="absolute left-6 top-1/2 -translate-y-1/2 text-xl opacity-20">🔍</span>
                      </div>
                      <div className="flex-1 overflow-y-auto custom-scroll grid grid-cols-1 md:grid-cols-2 gap-3 pr-2 content-start">
                         {filteredProducts.map(p => {
                           const isInCart = bookingCart.find(i => i.product_id === p.id);
                           return (
                             <div key={p.id} onClick={() => addToCart(p)} className={`p-5 rounded-[2rem] border-2 transition-all cursor-pointer flex flex-col justify-between h-32 ${isInCart ? 'bg-blue-600 border-blue-600 text-white shadow-xl scale-[1.02]' : 'bg-white border-slate-100 hover:border-blue-300 hover:shadow-md'}`}>
                                <p className="text-[11px] font-black uppercase italic leading-tight mb-2 line-clamp-2">{p.name}</p>
                                <div className="flex justify-between items-end">
                                   <p className={`text-[8px] font-bold ${isInCart ? 'text-blue-100' : 'text-slate-400'} uppercase tracking-widest`}>Stock: {p.stock}</p>
                                   <p className={`text-[12px] font-black italic ${isInCart ? 'text-white' : 'text-blue-600'}`}>৳{p.tp}</p>
                                </div>
                             </div>
                           );
                         })}
                      </div>
                   </div>

                   <div className="w-full lg:w-1/2 flex flex-col bg-white">
                      <div className="p-8 flex justify-between items-center border-b bg-slate-900/5">
                         <div className="min-w-0">
                            <p className="text-[8px] font-black text-slate-400 uppercase italic mb-1">সিলেক্টেড শপ:</p>
                            <h4 className="font-black text-slate-900 uppercase italic text-sm truncate leading-none">{selectedCust?.name}</h4>
                         </div>
                         <div className="text-right">
                            <span className="px-4 py-2 bg-blue-600 text-white rounded-full text-[9px] font-black italic shadow-lg">বুকিং আইটেম: {bookingCart.length}</span>
                         </div>
                      </div>

                      <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scroll bg-slate-50/30">
                         {bookingCart.map((item, idx) => (
                           <div key={item.product_id} className="p-6 bg-white rounded-[2.5rem] shadow-sm border border-slate-100 animate-reveal">
                              <div className="flex justify-between items-start mb-6">
                                 <p className="text-[12px] font-black uppercase italic text-slate-800 leading-tight flex-1 pr-4">{item.name}</p>
                                 <button onClick={() => updateCartItem(idx, { qty: 0 })} className="w-10 h-10 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center font-black hover:bg-rose-500 hover:text-white transition-all shadow-sm">✕</button>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                 <div className="space-y-1">
                                    <label className="text-[8px] font-black text-blue-500 uppercase tracking-widest ml-3 italic">বুকিং রেট</label>
                                    <input type="number" className="w-full p-4 bg-blue-50 border-2 border-blue-100 rounded-2xl font-black text-lg italic text-blue-700 outline-none" value={item.unitPrice} onChange={e => updateCartItem(idx, { unitPrice: e.target.value })} />
                                 </div>
                                 <div className="space-y-1">
                                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-3 italic">পরিমাণ</label>
                                    <div className="flex items-center bg-slate-100 rounded-2xl p-1 shadow-inner border">
                                       <button onClick={() => updateCartItem(idx, { qty: item.qty - 1 })} className="w-10 h-10 font-black text-xl text-slate-300 hover:text-rose-500">-</button>
                                       <input type="number" className="flex-1 text-center bg-transparent font-black text-xl italic outline-none" value={item.qty} onChange={e => updateCartItem(idx, { qty: Number(e.target.value) })} />
                                       <button onClick={() => updateCartItem(idx, { qty: item.qty + 1 })} className="w-10 h-10 font-black text-xl text-slate-300 hover:text-blue-600">+</button>
                                    </div>
                                 </div>
                              </div>
                           </div>
                         ))}
                      </div>

                      <div className="p-8 bg-slate-900 text-white rounded-t-[3.5rem] shadow-[0_-15px_40px_rgba(0,0,0,0.2)] space-y-6">
                         <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                            <div className="flex-1 w-full">
                               <p className="text-[9px] font-black text-emerald-500 uppercase italic mb-3 tracking-widest">বুকিং অগ্রিম জমা</p>
                               <input type="number" className="w-full p-6 bg-white/5 border-2 border-white/10 rounded-[2rem] text-center text-4xl font-black italic text-emerald-400 outline-none" placeholder="0" value={form.advance || ""} onChange={e => setForm({ ...form, advance: Number(e.target.value) })} />
                            </div>
                            <div className="text-right shrink-0">
                               <p className="text-[10px] font-black text-slate-500 uppercase italic mb-1">Grand Total</p>
                               <p className="text-5xl font-black italic text-blue-400">
                                 {formatCurrency(bookingCart.reduce((s, i) => s + i.total, 0))}
                               </p>
                            </div>
                         </div>
                         <button disabled={isSaving || bookingCart.length === 0} onClick={handleAddBooking} className="w-full bg-blue-600 text-white py-8 rounded-[2.5rem] font-black uppercase text-sm tracking-[0.4em] shadow-2xl active:scale-95 transition-all">
                            {isSaving ? 'Processing...' : 'বুকিং কনফার্ম করুন ➔'}
                         </button>
                      </div>
                   </div>
                </div>
              )}
           </div>
        </div>
      )}

      {/* 🔍 DETAIL MODAL - Updated with Delivery & Payment Tracking */}
      {showDetailModal && selectedBooking && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[3000] flex items-center justify-center p-4 no-print">
           <div className="bg-white rounded-[4rem] w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl animate-reveal overflow-hidden">
              <div className="p-10 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <div>
                    <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none">বুকিং ও ডেলিভারি রিপোর্ট</h3>
                    <p className="text-[10px] text-slate-500 uppercase font-black mt-3 tracking-widest">ID: #{String(selectedBooking.id).slice(-8).toUpperCase()}</p>
                 </div>
                 <button onClick={() => setShowDetailModal(false)} className="text-4xl text-slate-500 font-black hover:text-white transition-colors">✕</button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scroll p-10 space-y-12">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-10 pb-10 border-b">
                    <div className="space-y-3">
                       <p className="text-[9px] font-black text-slate-400 uppercase italic tracking-widest">ক্রেতা তথ্য:</p>
                       <p className="text-2xl font-black uppercase italic text-slate-900">{selectedBooking.customer_name}</p>
                       <p className="text-[11px] font-bold text-blue-600 italic">📍 {selectedBooking.customer_address}</p>
                    </div>
                    <div className="text-right space-y-6">
                       <div className="bg-slate-50 p-6 rounded-[2rem] border">
                          <p className="text-[9px] font-black text-slate-400 uppercase mb-2">হিসাব বিবরণী</p>
                          <p className="text-lg font-black text-emerald-600">জমা: {formatCurrency(selectedBooking.advance_amount)}</p>
                          <p className="text-4xl font-black text-red-600 tracking-tighter">বাকি: {formatCurrency(selectedBooking.total_amount - selectedBooking.advance_amount)}</p>
                       </div>
                       
                       <div className="space-y-2">
                          <p className="text-[9px] font-black text-emerald-500 uppercase italic tracking-widest text-left ml-4">নতুন টাকা জমা নিন</p>
                          <div className="relative">
                            <input 
                              type="number" 
                              className="w-full p-5 bg-emerald-50 border-2 border-emerald-100 rounded-2xl font-black text-xl text-emerald-600 outline-none text-center"
                              placeholder="জমার পরিমাণ"
                              value={newPaymentAmt}
                              onChange={e => setNewPaymentAmt(e.target.value)}
                            />
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-emerald-300">৳</span>
                          </div>
                       </div>
                    </div>
                 </div>

                 <div className="space-y-6">
                    <p className="text-[11px] font-black text-slate-400 uppercase italic tracking-widest">মালের ডেলিভারি আপডেট দিন:</p>
                    <div className="space-y-4">
                       {selectedBooking.items.map((it, idx) => {
                          const delivered = (it.delivered_qty || 0);
                          const remaining = it.qty - delivered;
                          const progress = Math.round((delivered / it.qty) * 100);

                          return (
                            <div key={idx} className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-200 group">
                               <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                                  <div className="flex-1">
                                     <h4 className="text-lg font-black uppercase italic text-slate-900 mb-2">{it.name}</h4>
                                     <div className="flex gap-4 items-center">
                                        <span className="bg-blue-600 text-white px-3 py-1 rounded-lg text-[9px] font-black">অর্ডার: {it.qty}</span>
                                        <span className="bg-emerald-600 text-white px-3 py-1 rounded-lg text-[9px] font-black">ডেলিভারি হয়েছে: {delivered}</span>
                                        <span className="bg-rose-100 text-rose-600 px-3 py-1 rounded-lg text-[9px] font-black">বাকি: {remaining}</span>
                                     </div>
                                  </div>
                                  
                                  {remaining > 0 ? (
                                    <div className="w-full md:w-48 space-y-2">
                                       <p className="text-[8px] font-black text-slate-400 uppercase italic ml-2">আজ পাঠালাম (Qty)</p>
                                       <input 
                                         type="number" 
                                         max={remaining}
                                         className="w-full p-4 bg-white border-2 border-blue-100 rounded-xl font-black text-center text-blue-600 focus:border-blue-600 outline-none"
                                         placeholder="0"
                                         value={deliveryUpdates[it.id] || ""}
                                         onChange={e => setDeliveryUpdates({ ...deliveryUpdates, [it.id]: Math.min(remaining, Number(e.target.value)) })}
                                       />
                                    </div>
                                  ) : (
                                    <div className="px-6 py-3 bg-emerald-100 text-emerald-600 rounded-full font-black text-[10px] uppercase italic">ডেলিভারি সম্পন্ন ✓</div>
                                  )}
                               </div>
                               
                               <div className="mt-8">
                                  <div className="flex justify-between text-[8px] font-black text-slate-400 uppercase mb-2">
                                     <span>ডেলিভারি অগ্রগতি</span>
                                     <span>{progress}%</span>
                                  </div>
                                  <div className="h-3 bg-white rounded-full overflow-hidden border border-slate-100 shadow-inner">
                                     <div className={`h-full transition-all duration-1000 ${progress === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${progress}%` }}></div>
                                  </div>
                               </div>
                            </div>
                          );
                       })}
                    </div>
                 </div>
              </div>

              <div className="p-10 bg-slate-50 border-t flex flex-col md:flex-row gap-4 shrink-0">
                  <button 
                    disabled={isSaving}
                    onClick={handleUpdateBookingStats} 
                    className="flex-1 bg-blue-600 text-white py-6 rounded-3xl font-black uppercase text-xs tracking-[0.2em] shadow-xl active:scale-95 transition-all hover:bg-emerald-600"
                  >
                    {isSaving ? 'সেভ হচ্ছে...' : 'সব তথ্য আপডেট করুন ✅'}
                  </button>
                  <button onClick={() => handleDownloadPDF(invoiceRef, 'Booking_Update')} className="bg-slate-900 text-white px-10 py-6 rounded-3xl font-black uppercase text-xs shadow-xl active:scale-95 transition-all">📄 রিপোর্ট ডাউনলোড</button>
              </div>
           </div>
        </div>
      )}

      {/* Hidden PDF Area for Invoicing */}
      <div className="fixed -left-[5000px] top-0 no-print">
        <div ref={invoiceRef} className="bg-white w-[148mm] p-10 flex flex-col text-black font-sans border-[3px] border-black">
           <div className="text-center border-b-4 border-black pb-4 mb-8">
              <h1 className="text-[34px] font-black uppercase italic mb-1 leading-none">IFZA ELECTRONICS</h1>
              <p className="text-xl font-black uppercase tracking-[0.3em] mb-1">{company}</p>
              <p className="text-[10px] font-black uppercase bg-black text-white px-8 py-1.5 rounded-full italic inline-block mt-4">BOOKING & DELIVERY STATUS</p>
           </div>
           {selectedBooking && (
             <>
               <div className="flex justify-between items-start mb-10 text-[12px] font-bold">
                  <div className="space-y-1">
                     <p className="font-black border-b-2 border-black w-fit mb-3 uppercase tracking-widest opacity-60">ক্রেতা (Customer):</p>
                     <p className="text-2xl font-black uppercase italic leading-none">{selectedBooking.customer_name}</p>
                     <p className="text-[13px] font-bold mt-2">📍 {selectedBooking.customer_address}</p>
                  </div>
                  <div className="text-right space-y-1">
                     <p className="font-black text-base">#BK-{String(selectedBooking.id).slice(-8).toUpperCase()}</p>
                     <p className="font-black italic opacity-60">তারিখ: {new Date().toLocaleDateString('bn-BD')}</p>
                  </div>
               </div>
               <table className="w-full text-left border-collapse border-[2px] border-black mb-10">
                  <thead>
                     <tr className="bg-black text-white text-[10px] font-black uppercase italic">
                        <th className="p-3 border border-black text-left">Description</th>
                        <th className="p-3 border border-black text-center w-16">অর্ডার</th>
                        <th className="p-3 border border-black text-center w-16">ডেলিভারি</th>
                        <th className="p-3 border border-black text-center w-16">বাকি</th>
                     </tr>
                  </thead>
                  <tbody>
                     {selectedBooking.items.map((it, idx) => (
                        <tr key={idx} className="font-bold text-[11px] border-b border-black italic">
                           <td className="p-3 border border-black uppercase leading-tight">{it.name}</td>
                           <td className="p-3 border border-black text-center">{it.qty}</td>
                           <td className="p-3 border border-black text-center text-blue-600">{it.delivered_qty || 0}</td>
                           <td className="p-3 border border-black text-center text-red-600">{it.qty - (it.delivered_qty || 0)}</td>
                        </tr>
                     ))}
                  </tbody>
               </table>
               <div className="flex justify-end mb-20">
                  <div className="w-64 space-y-2 font-black italic text-[12px]">
                     <div className="flex justify-between border-b border-black/10 pb-1"><span>TOTAL BILL:</span><span>{formatCurrency(selectedBooking.total_amount)}</span></div>
                     <div className="flex justify-between text-emerald-700 border-b border-black/10 pb-1"><span>PAID AMOUNT:</span><span>{formatCurrency(selectedBooking.advance_amount)}</span></div>
                     <div className="flex justify-between text-2xl font-black border-4 border-black p-3 bg-black text-white mt-4 tracking-tighter">
                        <span className="text-[10px] self-center uppercase mr-4 tracking-widest">NET DUE:</span>
                        <span>{formatCurrency(selectedBooking.total_amount - selectedBooking.advance_amount)}</span>
                     </div>
                  </div>
               </div>
               <div className="mt-auto pt-10 text-center">
                  <p className="text-[9px] font-black uppercase italic tracking-[0.4em] opacity-30">Infrastructure by IFZAERP.COM</p>
               </div>
             </>
           )}
        </div>
      </div>
    </div>
  );
};

export default Bookings;
