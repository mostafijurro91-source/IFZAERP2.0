
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
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  
  const [selectedBooking, setSelectedBooking] = useState<ExtendedBooking | null>(null);
  const [deliveryItems, setDeliveryItems] = useState<Record<string, number>>({});
  const [newPaymentAmount, setNewPaymentAmount] = useState<number | "">("");
  
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

  const invoiceRef = useRef<HTMLDivElement>(null);
  const isAdmin = user.role === 'ADMIN';

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
    item.total = item.qty * item.unitPrice;
    updated[idx] = item;
    setBookingCart(updated.filter(i => i.qty > 0));
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
      {/* 📊 Summary Stats */}
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

      {/* ⚙️ Toolbar */}
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

      {/* 📦 Booking List Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 no-print">
        {loading ? (
          <div className="col-span-full py-20 text-center animate-pulse font-black uppercase italic opacity-20">লোড হচ্ছে...</div>
        ) : filteredBookings.map(b => (
            <div key={b.id} onClick={() => { setSelectedBooking(b); setShowDetailModal(true); }} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all cursor-pointer group relative flex flex-col justify-between">
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
           <div className="bg-white rounded-[3.5rem] w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl animate-reveal overflow-hidden">
              <div className="p-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <div className="flex items-center gap-6">
                    <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-xl font-black italic">B</div>
                    <div>
                       <h3 className="text-2xl font-black uppercase italic tracking-tighter">নতুন বুকিং এন্ট্রি</h3>
                       <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">{currentStep === 1 ? 'ধাপ ১: দোকান বাছাই করুন' : 'ধাপ ২: পণ্য ও অগ্রিম টাকা'}</p>
                    </div>
                 </div>
                 <button onClick={() => setShowAddModal(false)} className="text-4xl text-slate-500 hover:text-white font-black">✕</button>
              </div>

              {currentStep === 1 ? (
                <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
                   <div className="p-8 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <select 
                          className="w-full p-5 bg-white border-2 border-slate-100 rounded-[1.8rem] font-black text-xs uppercase outline-none shadow-sm focus:border-blue-600 transition-all"
                          value={modalAreaSelection}
                          onChange={e => setModalAreaSelection(e.target.value)}
                        >
                          <option value="">সকল এরিয়া</option>
                          {uniqueAreas.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                        <input 
                          className="w-full p-5 bg-white border-2 border-slate-100 rounded-[1.8rem] font-black text-xs uppercase outline-none shadow-sm focus:border-blue-600 transition-all"
                          placeholder="দোকানের নাম লিখে খুঁজুন..."
                          value={custSearch}
                          onChange={e => setCustSearch(e.target.value)}
                        />
                      </div>
                   </div>
                   <div className="flex-1 overflow-y-auto custom-scroll px-8 pb-8 space-y-2">
                      {filteredModalCustomers.map(c => (
                        <div 
                          key={c.id} 
                          onClick={() => { setSelectedCust(c); setCurrentStep(2); }}
                          className="p-6 bg-white rounded-3xl border border-slate-100 shadow-sm hover:border-blue-600 hover:shadow-lg transition-all cursor-pointer flex justify-between items-center group"
                        >
                           <div className="min-w-0 flex-1">
                              <h4 className="font-black text-slate-800 uppercase italic text-sm group-hover:text-blue-600">{c.name}</h4>
                              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase italic tracking-widest">📍 {c.address} | 📱 {c.phone}</p>
                           </div>
                           <span className="text-2xl text-slate-100 group-hover:text-blue-600 transition-colors">➔</span>
                        </div>
                      ))}
                   </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                   {/* Left: Product Selection */}
                   <div className="w-full lg:w-1/2 p-8 border-r overflow-hidden flex flex-col gap-6 bg-slate-50">
                      <div className="flex justify-between items-center px-4">
                         <h4 className="text-[10px] font-black text-slate-400 uppercase italic tracking-widest">পণ্য বাছাই করুন</h4>
                         <button onClick={() => setCurrentStep(1)} className="text-[9px] font-black text-blue-600 uppercase">দোকান পরিবর্তন ↩</button>
                      </div>
                      <input 
                         className="w-full p-5 bg-white border-2 border-slate-100 rounded-[1.8rem] font-black text-xs uppercase outline-none shadow-sm focus:border-blue-600 transition-all"
                         placeholder="মডেল সার্চ করুন..."
                         value={prodSearch}
                         onChange={e => setProdSearch(e.target.value)}
                      />
                      <div className="flex-1 overflow-y-auto custom-scroll grid grid-cols-1 md:grid-cols-2 gap-2 pr-2">
                         {filteredProducts.map(p => {
                           const isIn = bookingCart.find(i => i.product_id === p.id);
                           return (
                             <div key={p.id} onClick={() => addToCart(p)} className={`p-4 rounded-2xl border-2 transition-all cursor-pointer ${isIn ? 'bg-blue-600 border-blue-600 text-white shadow-xl' : 'bg-white border-slate-100 hover:border-blue-400'}`}>
                                <p className="text-[10px] font-black uppercase truncate leading-tight mb-2">{p.name}</p>
                                <p className={`text-[8px] font-bold ${isIn ? 'text-blue-100' : 'text-slate-400'} uppercase tracking-widest`}>Stock: {p.stock} | ৳{p.tp}</p>
                             </div>
                           );
                         })}
                      </div>
                   </div>

                   {/* Right: Cart & Advance */}
                   <div className="w-full lg:w-1/2 flex flex-col bg-white">
                      <div className="p-8 flex justify-between items-center border-b">
                         <div className="min-w-0">
                            <p className="text-[8px] font-black text-slate-400 uppercase italic mb-1">সিলেক্টেড শপ:</p>
                            <h4 className="font-black text-slate-900 uppercase italic text-sm truncate">{selectedCust?.name}</h4>
                         </div>
                         <div className="text-right">
                            <p className="text-[10px] font-black text-blue-600 italic">আইটেম: {bookingCart.length}</p>
                         </div>
                      </div>

                      <div className="flex-1 overflow-y-auto p-8 space-y-3 custom-scroll">
                         {bookingCart.map((item, idx) => (
                           <div key={item.product_id} className="p-4 bg-slate-50 rounded-2xl flex items-center justify-between group animate-reveal">
                              <div className="flex-1 min-w-0 pr-4">
                                 <p className="text-[11px] font-black uppercase italic text-slate-800 truncate leading-none mb-2">{item.name}</p>
                                 <p className="text-[9px] font-black text-blue-600 italic">৳{item.unitPrice} x {item.qty} = ৳{item.total.toLocaleString()}</p>
                              </div>
                              <div className="flex items-center gap-3">
                                 <div className="flex items-center bg-white rounded-xl p-1 shadow-sm">
                                    <button onClick={() => updateCartItem(idx, { qty: item.qty - 1 })} className="w-8 h-8 font-black text-slate-300 hover:text-red-500">-</button>
                                    <input type="number" className="w-10 text-center font-black text-xs outline-none" value={item.qty} onChange={e => updateCartItem(idx, { qty: Number(e.target.value) })} />
                                    <button onClick={() => updateCartItem(idx, { qty: item.qty + 1 })} className="w-8 h-8 font-black text-slate-300 hover:text-blue-600">+</button>
                                 </div>
                                 <button onClick={() => updateCartItem(idx, { qty: 0 })} className="text-red-300 hover:text-red-500 font-black text-xl ml-2">×</button>
                              </div>
                           </div>
                         ))}
                         {bookingCart.length === 0 && (
                           <div className="py-20 text-center opacity-10 font-black uppercase italic tracking-widest text-xs">কার্ট খালি, বাম পাশ থেকে পণ্য যোগ করুন</div>
                         )}
                      </div>

                      <div className="p-8 bg-slate-900 text-white rounded-t-[3rem] space-y-6">
                         <div className="grid grid-cols-2 gap-4">
                            <div>
                               <p className="text-[9px] font-black text-slate-500 uppercase italic mb-2 tracking-widest">বুকিং অগ্রিম (টাকা)</p>
                               <input 
                                 type="number" 
                                 className="w-full p-5 bg-white/5 border border-white/10 rounded-2xl text-center text-2xl font-black italic text-emerald-400 outline-none shadow-inner"
                                 placeholder="0"
                                 value={form.advance || ""}
                                 onChange={e => setForm({ ...form, advance: Number(e.target.value) })}
                               />
                            </div>
                            <div className="text-right flex flex-col justify-end">
                               <p className="text-[9px] font-black text-slate-500 uppercase italic mb-1 tracking-widest">Grand Total</p>
                               <p className="text-3xl font-black italic tracking-tighter text-blue-400">
                                 {formatCurrency(bookingCart.reduce((s, i) => s + i.total, 0))}
                               </p>
                            </div>
                         </div>
                         <button 
                           disabled={isSaving || bookingCart.length === 0} 
                           onClick={handleAddBooking}
                           className="w-full bg-blue-600 text-white py-6 rounded-[2.2rem] font-black uppercase text-xs tracking-[0.2em] shadow-2xl active:scale-95 transition-all hover:bg-emerald-600 disabled:opacity-20"
                         >
                            {isSaving ? 'প্রসেসিং হচ্ছে...' : 'বুকিং সেভ করুন ➔'}
                         </button>
                      </div>
                   </div>
                </div>
              )}
           </div>
        </div>
      )}

      {/* 🔍 DETAIL MODAL & OTHER UI REMAIN UNCHANGED FOR CONSISTENCY... */}
      {showDetailModal && selectedBooking && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[3000] flex items-center justify-center p-0 md:p-10 no-print overflow-hidden">
           <div className="bg-white rounded-none md:rounded-[3rem] w-full max-w-2xl h-full md:h-fit max-h-[90vh] flex flex-col shadow-2xl animate-reveal overflow-hidden">
              <div className="p-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <div><h3 className="text-xl font-black uppercase italic leading-none">বুকিং হিসাব</h3><p className="text-[10px] text-slate-500 uppercase font-black mt-2 tracking-widest">Order ID: #{String(selectedBooking.id).slice(-6).toUpperCase()}</p></div>
                 <button onClick={() => setShowDetailModal(false)} className="text-4xl text-slate-500 font-black hover:text-white transition-colors">✕</button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scroll p-8 space-y-10 text-slate-900 overscroll-contain">
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
                    <p className="text-[11px] font-black text-slate-400 uppercase italic tracking-widest">ডেলিভারি ট্র্যাকিং:</p>
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
              <div className="p-6 md:p-8 bg-slate-50 border-t shrink-0 grid grid-cols-2 gap-3">
                  <button onClick={() => handleDownloadPDF(invoiceRef, 'Booking_Invoice')} className="bg-slate-900 text-white py-6 rounded-2xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all">📄 ইনভয়েস ডাউনলোড</button>
                  <button onClick={() => setShowDetailModal(false)} className="bg-slate-200 text-slate-500 py-6 rounded-2xl font-black uppercase text-[10px]">বন্ধ করুন</button>
              </div>
           </div>
        </div>
      )}

      {/* Hidden PDF Area */}
      <div className="fixed -left-[2000px] top-0 no-print">
        <div ref={invoiceRef} className="bg-white w-[148mm] p-10 flex flex-col text-black font-sans border-2 border-black">
           <div className="text-center border-b-4 border-black pb-4 mb-8">
              <h1 className="text-3xl font-black uppercase italic mb-1">IFZA ELECTRONICS</h1>
              <p className="text-base font-black uppercase tracking-[0.3em] mb-1">{company}</p>
              <p className="text-[10px] font-black uppercase bg-black text-white px-6 py-1 rounded-full italic inline-block mt-2">BOOKING INVOICE (বুকিং মেমো)</p>
           </div>
           {selectedBooking && (
             <>
               <div className="flex justify-between items-start mb-8 text-[10px]">
                  <div>
                     <p className="font-black border-b border-black w-fit mb-1 uppercase tracking-widest opacity-60">ক্রেতা:</p>
                     <p className="text-lg font-black uppercase italic leading-none">{selectedBooking.customer_name}</p>
                     <p className="font-bold mt-1">📍 {selectedBooking.customer_address}</p>
                  </div>
                  <div className="text-right">
                     <p className="font-black text-xs">ID: #{String(selectedBooking.id).slice(-6).toUpperCase()}</p>
                     <p className="font-black">তারিখ: {new Date(selectedBooking.created_at).toLocaleDateString('bn-BD')}</p>
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
                        <span className="text-[8px] self-center uppercase font-sans font-black">Due:</span>
                        <span>{formatCurrency(selectedBooking.total_amount - selectedBooking.advance_amount)}</span>
                     </div>
                  </div>
               </div>
               <div className="mt-auto pt-10 text-center border-t border-slate-100">
                  <p className="text-[8px] font-black uppercase italic tracking-[0.4em] opacity-40">Powered by IFZAERP.COM</p>
               </div>
             </>
           )}
        </div>
      </div>
    </div>
  );
};

export default Bookings;
