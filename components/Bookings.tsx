
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

  // Delivery & Payment States for updates
  const [deliveryUpdates, setDeliveryUpdates] = useState<Record<string, number>>({});
  const [newPaymentAmt, setNewPaymentAmt] = useState<string>("");

  const invoiceRef = useRef<HTMLDivElement>(null);
  const isAdmin = role === 'ADMIN';

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

  const handleDeleteBooking = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!isAdmin) return alert("আপনার এই বুকিং ডিলিট করার অনুমতি নেই।");
    if (!confirm("আপনি কি নিশ্চিতভাবে এই বুকিংটি ডিলিট করতে চান? এটি চিরতরে মুছে যাবে।")) return;
    
    setLoading(true);
    try {
      const { error } = await supabase.from('bookings').delete().eq('id', id);
      if (error) throw error;
      alert("বুকিং সফলভাবে ডিলিট করা হয়েছে! 🗑️");
      setShowDetailModal(false);
      fetchData();
    } catch (err: any) {
      alert("ডিলিট করতে সমস্যা হয়েছে: " + err.message);
    } finally {
      setLoading(false);
    }
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

      // Calculate status
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

      // Log transaction for payment
      if (payAmt > 0) {
        await supabase.from('transactions').insert([{
          customer_id: selectedBooking.customer_id,
          company: dbCo,
          amount: payAmt,
          payment_type: 'COLLECTION',
          items: [{ note: `বুকিং পেমেন্ট আপডেট (#${selectedBooking.id.slice(-4).toUpperCase()})` }],
          submitted_by: user.name
        }]);
      }

      // Update Inventory Stock for delivered units
      for (const id in deliveryUpdates) {
        const q = Number(deliveryUpdates[id]);
        if (q > 0) {
          await supabase.rpc('increment_stock', { row_id: id, amt: -q });
        }
      }

      alert("বুকিং ও ডেলিভারি তথ্য সফলভাবে আপডেট হয়েছে!");
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
      const totalAmount = bookingCart.reduce((acc, it) => acc + (it.qty * it.unitPrice), 0);
      const itemsToSave = bookingCart.map(it => ({ 
        id: it.product_id, 
        product_id: it.product_id,
        name: it.name, 
        qty: it.qty, 
        unitPrice: it.unitPrice,
        delivered_qty: 0 
      }));
      
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
          items: [{ note: `বুকিং অগ্রিম (ID: #${String(data.id).slice(-4).toUpperCase()})` }], 
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
      alert("ত্রুটি: " + err.message); 
    } finally { 
      setIsSaving(false); 
    }
  };

  const addToCart = (p: Product) => {
    if (bookingCart.find(i => i.product_id === p.id)) return;
    setBookingCart([...bookingCart, { product_id: p.id, name: p.name, qty: 1, unitPrice: p.tp, mrp: p.mrp }]);
    setProdSearch(""); 
  };

  const updateCartItem = (idx: number, updates: any) => {
    const updated = [...bookingCart];
    updated[idx] = { ...updated[idx], ...updates };
    setBookingCart(updated.filter(i => i.qty > 0 || updates.qty === undefined));
  };

  const handleDownloadPDF = async () => {
    if (!invoiceRef.current || isDownloading) return;
    setIsDownloading(true);
    try {
      const element = invoiceRef.current;
      const canvas = await html2canvas(element, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      const pdf = new jsPDF('p', 'mm', 'a5');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, imgHeight);
      pdf.save(`Booking_Report_${selectedBooking?.id.slice(-4)}.pdf`);
    } catch (err) { alert("পিডিএফ তৈরি করা যায়নি।"); } finally { setIsDownloading(false); }
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
  const uniqueAreas = useMemo(() => Array.from(new Set(customers.map(c => c.address?.trim()).filter(Boolean))).sort() as string[], [customers]);
  const filteredBookings = useMemo(() => bookings.filter(b => statusFilter === "ALL" || b.status === statusFilter), [bookings, statusFilter]);

  return (
    <div className="space-y-6 md:space-y-10 pb-40 animate-reveal text-slate-900 font-sans mt-2">
      
      {/* 🏛️ Stat Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 no-print px-1">
        <div className="bg-white p-6 md:p-10 rounded-[2.5rem] border border-slate-100 shadow-xl flex flex-col justify-between group overflow-hidden relative">
           <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-[4rem] -z-0 opacity-40 group-hover:scale-110 transition-transform"></div>
           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 italic relative z-10">Active Booking Value</p>
           <h3 className="text-2xl md:text-4xl font-black italic tracking-tighter text-slate-900 relative z-10">{formatCurrency(filteredBookings.reduce((s, b) => s + Number(b.total_amount), 0))}</h3>
        </div>
        <div className="bg-white p-6 md:p-10 rounded-[2.5rem] border border-slate-100 shadow-xl flex flex-col justify-between group overflow-hidden relative">
           <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-bl-[4rem] -z-0 opacity-40 group-hover:scale-110 transition-transform"></div>
           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 italic relative z-10">Collected Advance</p>
           <h3 className="text-2xl md:text-4xl font-black italic tracking-tighter text-emerald-600 relative z-10">{formatCurrency(filteredBookings.reduce((s, b) => s + Number(b.advance_amount), 0))}</h3>
        </div>
        <div className="bg-slate-900 p-6 md:p-10 rounded-[2.5rem] shadow-2xl flex flex-col justify-between text-white group overflow-hidden relative">
           <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-bl-[4rem] -z-0 group-hover:scale-110 transition-transform"></div>
           <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1 italic relative z-10">Total Net Due</p>
           <h3 className="text-2xl md:text-4xl font-black italic tracking-tighter text-rose-400 relative z-10">{formatCurrency(filteredBookings.reduce((s, b) => s + (Number(b.total_amount) - Number(b.advance_amount)), 0))}</h3>
        </div>
      </div>

      <div className="bg-white p-6 md:p-8 rounded-[2.5rem] md:rounded-[3.5rem] border border-slate-100 shadow-xl flex flex-col md:flex-row justify-between items-center gap-6 no-print mx-1">
        <div className="flex items-center gap-5 w-full md:w-auto">
           <div className="w-12 h-12 md:w-14 md:h-14 bg-indigo-600 rounded-[1.2rem] md:rounded-[1.5rem] flex items-center justify-center text-white text-xl md:text-2xl font-black italic shadow-xl">B</div>
           <div>
              <h3 className="text-lg md:text-xl font-black uppercase italic tracking-tighter leading-none">Booking Terminal</h3>
              <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-2">{company} Division</p>
           </div>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <select className="flex-1 md:flex-none p-4 md:p-5 bg-slate-50 border border-slate-100 rounded-2xl md:rounded-3xl text-[9px] font-black uppercase outline-none shadow-inner" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
             <option value="ALL">সকল বুকিং</option>
             <option value="PENDING">পেন্ডিং</option>
             <option value="PARTIAL">অংশিক</option>
             <option value="COMPLETED">সম্পন্ন</option>
          </select>
          <button onClick={() => { setShowAddModal(true); setCurrentStep(1); setBookingCart([]); setSelectedCust(null); }} className="flex-[1.5] md:flex-none bg-indigo-600 text-white px-6 md:px-10 py-4 md:p-5 rounded-2xl md:rounded-3xl font-black uppercase text-[9px] tracking-widest shadow-xl active:scale-95 transition-all">+ নিউ বুকিং</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8 no-print px-1">
        {loading ? (
          <div className="col-span-full py-40 text-center animate-pulse text-slate-300 font-black uppercase italic text-xs">Loading Terminal...</div>
        ) : filteredBookings.map((b, idx) => (
            <div key={b.id} onClick={() => { setSelectedBooking(b); setDeliveryUpdates({}); setNewPaymentAmt(""); setShowDetailModal(true); }} className="bg-white p-8 md:p-10 rounded-[2.5rem] md:rounded-[3.5rem] border border-slate-100 shadow-lg hover:shadow-2xl transition-all duration-700 cursor-pointer group relative flex flex-col justify-between animate-reveal" style={{ animationDelay: `${idx * 0.05}s` }}>
               <div className="mb-6 md:mb-8">
                  <div className="flex justify-between items-start mb-4 md:mb-6">
                     <span className={`px-3 py-1 md:px-4 md:py-1.5 rounded-lg md:rounded-xl text-[8px] font-black uppercase tracking-widest shadow-sm ${
                       b.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : b.status === 'PARTIAL' ? 'bg-orange-50 text-orange-600 border border-orange-100' : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                     }`}>{b.status === 'PARTIAL' ? 'অংশিক' : b.status}</span>
                     <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black text-slate-300">#{b.id.slice(-4).toUpperCase()}</span>
                        {isAdmin && (
                          <button 
                            onClick={(e) => handleDeleteBooking(b.id, e)} 
                            className="w-8 h-8 bg-rose-50 text-rose-500 rounded-lg flex items-center justify-center border shadow-sm hover:bg-rose-500 hover:text-white transition-all active:scale-90"
                            title="Delete Booking"
                          >
                            🗑️
                          </button>
                        )}
                     </div>
                  </div>
                  <h4 className="font-black text-slate-800 text-base md:text-lg uppercase italic leading-tight truncate mb-2 group-hover:text-indigo-600 transition-colors">{b.customer_name}</h4>
                  <p className="text-[9px] text-slate-400 font-bold uppercase truncate italic tracking-widest leading-none">📍 {b.customer_address}</p>
               </div>
               <div className="flex justify-between items-end border-t pt-6 md:pt-8 mt-auto">
                  <div>
                    <p className="text-[8px] font-black text-slate-300 uppercase mb-1 md:mb-2 italic">Total Bill</p>
                    <p className="text-lg md:text-xl font-black italic text-slate-900 leading-none tracking-tighter">{formatCurrency(b.total_amount)}</p>
                  </div>
                  <div className="text-right">
                     <p className="text-[8px] font-black text-rose-300 uppercase mb-1 md:mb-2 italic">Net Due</p>
                     <p className="text-lg md:text-xl font-black italic text-rose-600 leading-none tracking-tighter">{formatCurrency(b.total_amount - b.advance_amount)}</p>
                  </div>
               </div>
            </div>
        ))}
      </div>

      {/* ➕ Add New Booking Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[4000] flex items-center justify-center p-4">
           <div className="bg-white rounded-[4rem] w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl animate-reveal overflow-hidden">
              <div className="p-8 md:p-10 bg-indigo-600 text-white flex justify-between items-center shrink-0">
                 <div className="flex items-center gap-6">
                    <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-xl font-black italic shadow-inner">+</div>
                    <div>
                       <h3 className="text-2xl font-black uppercase italic tracking-tighter">নতুন বুকিং এন্ট্রি</h3>
                       <p className="text-[10px] text-indigo-200 font-bold uppercase tracking-widest mt-1">Register Advance Booking Order</p>
                    </div>
                 </div>
                 <button onClick={() => setShowAddModal(false)} className="text-4xl text-white/50 hover:text-white font-black transition-colors">✕</button>
              </div>

              <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
                 {currentStep === 1 ? (
                   <>
                     <div className="p-10 space-y-6">
                        <p className="text-[11px] font-black text-slate-400 uppercase italic tracking-[0.2em] ml-2">ধাপ ১: কাস্টমার দোকান নির্বাচন করুন</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <select className="w-full p-6 bg-white border border-slate-100 rounded-[2.5rem] font-black text-xs uppercase italic shadow-sm outline-none focus:border-indigo-500 transition-all" value={modalAreaSelection} onChange={e => setModalAreaSelection(e.target.value)}>
                              <option value="">সকল এরিয়া</option>
                              {uniqueAreas.map(a => <option key={a} value={a}>{a}</option>)}
                           </select>
                           <input 
                             className="w-full p-6 bg-white border border-slate-100 rounded-[2.5rem] font-black text-xs uppercase italic shadow-sm outline-none focus:border-indigo-500 transition-all"
                             placeholder="দোকান বা মোবাইল সার্চ..."
                             value={custSearch}
                             onChange={e => setCustSearch(e.target.value)}
                           />
                        </div>
                     </div>
                     <div className="flex-1 overflow-y-auto custom-scroll px-10 pb-10 space-y-3">
                        {filteredModalCustomers.map(c => (
                          <div key={c.id} onClick={() => { setSelectedCust(c); setCurrentStep(2); }} className="p-6 bg-white rounded-3xl border-2 border-transparent shadow-sm hover:border-indigo-500 hover:shadow-xl transition-all cursor-pointer flex justify-between items-center group">
                             <div>
                                <h4 className="font-black text-slate-800 uppercase italic text-sm group-hover:text-indigo-600 leading-none">{c.name}</h4>
                                <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest leading-none">📍 {c.address} | 📱 {c.phone}</p>
                             </div>
                             <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all">➔</div>
                          </div>
                        ))}
                     </div>
                   </>
                 ) : (
                   <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                      <div className="w-full lg:w-1/2 p-10 border-r flex flex-col gap-6 bg-slate-50">
                         <div className="flex justify-between items-center px-2">
                            <p className="text-[11px] font-black text-slate-400 uppercase italic tracking-[0.2em]">ধাপ ২: প্রোডাক্ট ও পরিমাণ</p>
                            <button onClick={() => setCurrentStep(1)} className="text-[9px] font-black text-indigo-600 uppercase underline">↩ Change Customer</button>
                         </div>
                         <div className="relative">
                            <input className="w-full p-5 bg-white border-2 border-slate-100 rounded-[2rem] font-black text-xs uppercase italic shadow-sm outline-none focus:border-indigo-500 transition-all pl-14" placeholder="মডেল সার্চ..." value={prodSearch} onChange={e => setProdSearch(e.target.value)} />
                         </div>
                         <div className="flex-1 overflow-y-auto custom-scroll space-y-2 pr-2">
                            {filteredProducts.map(p => (
                               <div key={p.id} onClick={() => addToCart(p)} className="p-5 bg-white rounded-[2rem] border border-slate-100 hover:border-indigo-400 hover:shadow-lg transition-all cursor-pointer group flex justify-between items-center">
                                  <p className="text-[11px] font-black uppercase italic text-slate-800 pr-4">{p.name}</p>
                                  <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-indigo-600 font-black">+</div>
                               </div>
                            ))}
                         </div>
                      </div>
                      <div className="w-full lg:w-1/2 p-10 bg-white flex flex-col">
                         <h4 className="text-[11px] font-black text-slate-400 uppercase italic mb-6">সিলেক্টেড প্রোডাক্টস ({bookingCart.length})</h4>
                         <div className="flex-1 overflow-y-auto custom-scroll space-y-3 pr-2 mb-8">
                            {bookingCart.map((it, idx) => (
                               <div key={it.product_id} className="p-5 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex items-center justify-between">
                                  <div className="min-w-0 flex-1 pr-6">
                                     <p className="text-[11px] font-black uppercase italic text-slate-800 truncate mb-1">{it.name}</p>
                                     <p className="text-[9px] font-bold text-indigo-500 uppercase">৳{it.unitPrice}</p>
                                  </div>
                                  <div className="flex items-center gap-4">
                                     <div className="flex items-center bg-white rounded-2xl p-1 border shadow-inner">
                                        <button onClick={() => updateCartItem(idx, {qty: it.qty - 1})} className="w-10 h-10 font-black text-xl text-slate-300">-</button>
                                        <input className="w-10 text-center font-black text-xs bg-transparent" value={it.qty} readOnly />
                                        <button onClick={() => updateCartItem(idx, {qty: it.qty + 1})} className="w-10 h-10 font-black text-xl text-slate-300">+</button>
                                     </div>
                                  </div>
                               </div>
                            ))}
                         </div>
                         <div className="space-y-4 pt-4 border-t">
                            <div className="grid grid-cols-2 gap-4">
                               <div className="space-y-1">
                                  <p className="text-[9px] font-black text-slate-400 uppercase italic ml-2">Total Bill</p>
                                  <div className="p-5 bg-slate-100 rounded-3xl font-black text-xl italic text-slate-900">৳{bookingCart.reduce((s,i)=>s+(i.qty*i.unitPrice),0).toLocaleString()}</div>
                               </div>
                               <div className="space-y-1">
                                  <p className="text-[9px] font-black text-emerald-500 uppercase italic ml-2">Advance Amount</p>
                                  <input type="number" className="w-full p-5 bg-emerald-50 border-none rounded-3xl font-black text-xl italic text-emerald-600 outline-none" value={form.advance} onChange={e => setForm({...form, advance: Number(e.target.value)})} />
                               </div>
                            </div>
                            <button disabled={isSaving || bookingCart.length === 0} onClick={handleAddBooking} className="w-full bg-indigo-600 text-white py-6 rounded-[2.5rem] font-black uppercase text-xs tracking-[0.3em] shadow-xl active:scale-95 transition-all">কনফার্ম বুকিং সেভ ➔</button>
                         </div>
                      </div>
                   </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {/* 🔍 Booking Detail Modal */}
      {showDetailModal && selectedBooking && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-3xl z-[5000] flex flex-col items-center p-4 overflow-y-auto no-print">
           <div className="w-full max-w-4xl flex justify-between items-center mb-6 sticky top-0 z-[5001] bg-slate-900/90 p-6 rounded-[2.5rem] border border-white/10 shadow-2xl">
              <button onClick={() => setShowDetailModal(false)} className="text-white font-black uppercase text-[10px] px-6 transition-colors hover:text-indigo-400">← ফিরে যান</button>
              <div className="flex gap-3">
                 <button onClick={handleDownloadPDF} className="bg-white text-slate-900 px-6 py-4 rounded-xl font-black text-[10px] uppercase shadow-xl active:scale-95">PDF ⎙</button>
                 <button onClick={handleUpdateBookingStats} disabled={isSaving} className="bg-emerald-600 text-white px-10 py-4 rounded-xl font-black text-[10px] uppercase shadow-xl hover:bg-emerald-700 transition-all">সংরক্ষণ করুন ✓</button>
              </div>
           </div>

           <div className="bg-white rounded-[3rem] w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col mb-20 border-[6px] border-slate-100">
              <div ref={invoiceRef} className="p-10 md:p-14 bg-white text-black">
                 <div className="text-center border-b-4 border-black pb-8 mb-10">
                    <h1 className="text-4xl font-black uppercase italic tracking-tighter leading-none mb-1 text-indigo-600">IFZA ELECTRONICS</h1>
                    <p className="text-lg font-black uppercase tracking-[0.4em] mb-4 text-black">{company} DIVISION</p>
                    <div className="inline-block px-10 py-2 bg-black text-white text-[11px] font-black uppercase rounded-full italic tracking-widest">
                       Booking Statement & Delivery Log
                    </div>
                 </div>

                 <div className="flex flex-col md:flex-row justify-between items-start gap-10 mb-12">
                    <div className="space-y-3 flex-1">
                       <p className="text-[10px] font-black opacity-30 uppercase border-b border-black w-fit mb-4">দোকান ও ঠিকানা (Customer Info):</p>
                       <p className="text-3xl font-black uppercase italic leading-none">{selectedBooking.customer_name}</p>
                       <p className="text-[14px] font-bold mt-2">📍 {selectedBooking.customer_address}</p>
                       <p className="text-[14px] font-bold">📱 {selectedBooking.customer_phone}</p>
                    </div>
                    <div className="text-right space-y-3 w-72 shrink-0">
                       <p className="text-[10px] font-black opacity-30 uppercase border-b border-black w-fit ml-auto mb-4">বুকিং সারসংক্ষেপ:</p>
                       <div className="space-y-1">
                          <p className="flex justify-between font-bold text-[14px]"><span>বুকিং আইডি:</span> <span className="font-black">#{selectedBooking.id.slice(-6).toUpperCase()}</span></p>
                          <p className="flex justify-between font-bold text-[14px]"><span>তারিখ:</span> <span className="font-black">{new Date(selectedBooking.created_at).toLocaleDateString('bn-BD')}</span></p>
                          <p className="flex justify-between font-black text-[18px] text-indigo-600 border-t-2 border-slate-100 pt-3 mt-3"><span>মোট বিল:</span> <span>৳{Number(selectedBooking.total_amount).toLocaleString()}</span></p>
                          <p className="flex justify-between font-black text-[18px] text-emerald-600"><span>মোট জমা:</span> <span>৳{Number(selectedBooking.advance_amount).toLocaleString()}</span></p>
                          <p className="flex justify-between font-black text-[22px] text-rose-600 border-t-4 border-black pt-3 mt-3 italic tracking-tighter"><span>নিট বাকি:</span> <span>৳{(Number(selectedBooking.total_amount) - Number(selectedBooking.advance_amount)).toLocaleString()}</span></p>
                       </div>
                    </div>
                 </div>

                 <table className="w-full border-collapse border-2 border-black">
                    <thead>
                       <tr className="bg-slate-100 text-[11px] font-black uppercase italic border-b-2 border-black">
                          <th className="p-4 text-left border-r border-black">পণ্যের নাম</th>
                          <th className="p-4 text-center border-r border-black w-24">পরিমাণ (Qty)</th>
                          <th className="p-4 text-center border-r border-black w-24">দর (Rate)</th>
                          <th className="p-4 text-center border-r border-black w-24">গেছে (Dlv)</th>
                          <th className="p-4 text-right border-black w-28">মোট (Total)</th>
                       </tr>
                    </thead>
                    <tbody className="text-[14px] font-bold italic">
                       {selectedBooking.items.map((it, idx) => (
                          <tr key={it.id} className="border-b border-black/30">
                             <td className="p-4 border-r border-black/30 uppercase">{it.name}</td>
                             <td className="p-4 text-center border-r border-black/30">{it.qty}</td>
                             <td className="p-4 text-center border-r border-black/30">৳{it.unitPrice}</td>
                             <td className="p-4 text-center border-r border-black/30 text-emerald-600 font-black">{it.delivered_qty}</td>
                             <td className="p-4 text-right">৳{(it.qty * it.unitPrice).toLocaleString()}</td>
                          </tr>
                       ))}
                    </tbody>
                 </table>

                 <div className="mt-14 no-print bg-slate-50 p-8 rounded-[2.5rem] border-2 border-dashed border-slate-200">
                    <h5 className="text-[10px] font-black uppercase text-indigo-600 mb-6 italic tracking-widest text-center">ডেলিভারি ও পেমেন্ট আপডেট টার্মিনাল</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                       <div className="space-y-4">
                          <p className="text-[9px] font-black uppercase text-slate-400 ml-4 italic">আজকের ডেলিভারি (পিস)</p>
                          {selectedBooking.items.map(it => (
                            <div key={it.id} className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm">
                               <span className="text-[11px] font-black uppercase italic truncate max-w-[150px]">{it.name}</span>
                               <input 
                                 type="number" 
                                 placeholder="0" 
                                 className="w-20 text-center p-2 bg-indigo-50 border-none rounded-xl font-black text-indigo-600 outline-none" 
                                 value={deliveryUpdates[it.id] || ""} 
                                 onChange={e => setDeliveryUpdates({...deliveryUpdates, [it.id]: Number(e.target.value)})} 
                               />
                            </div>
                          ))}
                       </div>
                       <div className="space-y-4">
                          <p className="text-[9px] font-black uppercase text-emerald-500 ml-4 italic">আজকের নগদ জমা (টাকা)</p>
                          <div className="bg-emerald-50 p-6 rounded-[2.5rem] flex flex-col items-center border border-emerald-100 shadow-inner h-full justify-center">
                             <input 
                               type="number" 
                               placeholder="0.00" 
                               className="w-full bg-transparent text-center text-5xl font-black italic text-emerald-600 outline-none" 
                               value={newPaymentAmt} 
                               onChange={e => setNewPaymentAmt(e.target.value)} 
                             />
                             <p className="text-[11px] font-black text-emerald-400 uppercase mt-4 italic">New Collection Entry</p>
                          </div>
                       </div>
                    </div>
                 </div>

                 <div className="mt-24 flex justify-between items-end px-10 border-t-2 border-slate-50 pt-12">
                    <div className="text-center w-56 border-t border-black pt-2 font-black italic text-[11px] uppercase opacity-30">ক্রেতার স্বাক্ষর</div>
                    <div className="text-center w-56 border-t border-black pt-2 font-black italic text-[11px] uppercase opacity-30">কর্তৃপক্ষের স্বাক্ষর</div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {loading && <div className="fixed inset-0 bg-white/50 backdrop-blur-sm z-[9999] flex items-center justify-center font-black uppercase italic text-blue-600 animate-pulse tracking-[0.3em]">Syncing Booking Terminal...</div>}
    </div>
  );
};

export default Bookings;
