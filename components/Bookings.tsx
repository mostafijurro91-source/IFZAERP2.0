
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

  // RESTORED: Payment Handling Logic
  const handleBookingPayment = async () => {
    if (!selectedBooking || !newPaymentAmount || Number(newPaymentAmount) <= 0) return;
    setIsSaving(true);
    try {
      const dbCompany = mapToDbCompany(company);
      const amt = Number(newPaymentAmount);
      
      // Update booking table
      const { error: updateErr } = await supabase
        .from('bookings')
        .update({ advance_amount: (selectedBooking.advance_amount || 0) + amt })
        .eq('id', selectedBooking.id);

      if (updateErr) throw updateErr;

      // Create transaction record
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
      setShowDetailModal(false); // Close detail to refresh stats
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
    setBookingCart([...bookingCart, { product_id: p.id, name: p.name, qty: 1, unitPrice: p.tp, total: p.tp, mrp: p.mrp }]);
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
      
      {/* Stats Summary Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 no-print">
        <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm">
           <p className="text-[10px] font-black text-slate-400 uppercase italic mb-2">মোট বুকিং ভ্যালু</p>
           <p className="text-2xl font-black italic text-slate-900">{formatCurrency(filteredBookings.reduce((s, b) => s + Number(b.total_amount), 0))}</p>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm">
           <p className="text-[10px] font-black text-slate-400 uppercase italic mb-2">মোট জমা (Paid)</p>
           <p className="text-2xl font-black italic text-emerald-600">{formatCurrency(filteredBookings.reduce((s, b) => s + Number(b.advance_amount), 0))}</p>
        </div>
        <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-xl text-white">
           <p className="text-[10px] font-black text-slate-500 uppercase italic mb-2">বাকি টাকা (Due)</p>
           <p className="text-2xl font-black italic text-red-400">{formatCurrency(filteredBookings.reduce((s, b) => s + (Number(b.total_amount) - Number(b.advance_amount)), 0))}</p>
        </div>
      </div>

      {/* Control Header */}
      <div className="bg-white p-8 rounded-[3rem] border shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 no-print">
        <div className="flex items-center gap-6">
           <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black italic shadow-xl">B</div>
           <div>
              <h3 className="text-xl font-black uppercase italic tracking-tighter leading-none">বুকিং টার্মিনাল</h3>
              <p className="text-[10px] text-slate-400 font-black uppercase mt-2 tracking-widest">{company} Nodes</p>
           </div>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <select className="p-4 bg-slate-50 border rounded-2xl text-[10px] font-black uppercase outline-none" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
             <option value="ALL">সকল বুকিং</option>
             <option value="PENDING">পেন্ডিং</option>
             <option value="PARTIAL">অংশিক মাল গেছে</option>
             <option value="COMPLETED">সম্পন্ন</option>
          </select>
          <button onClick={() => setShowAddModal(true)} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] shadow-xl active:scale-95 transition-all">+ নতুন বুকিং এন্ট্রি</button>
        </div>
      </div>

      {/* Cards List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 no-print">
        {loading ? (
          <div className="col-span-full py-20 text-center animate-pulse font-black uppercase italic opacity-20">লোড হচ্ছে...</div>
        ) : filteredBookings.map(b => (
            <div key={b.id} onClick={() => { setSelectedBooking(b); setShowDetailModal(true); }} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-2xl transition-all cursor-pointer group relative overflow-hidden">
               <div className="flex justify-between items-start mb-6">
                  <span className={`px-4 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest ${
                    b.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600' : b.status === 'PARTIAL' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'
                  }`}>{b.status === 'PARTIAL' ? 'অংশিক মাল গেছে' : b.status}</span>
                  <p className="text-[8px] font-bold text-slate-300 uppercase">ID: {b.id.slice(-6).toUpperCase()}</p>
               </div>
               <h4 className="font-black text-slate-900 text-lg uppercase italic leading-none truncate mb-2">{b.customer_name}</h4>
               <p className="text-[10px] text-slate-400 font-black uppercase truncate mb-6 italic">📍 {b.customer_address}</p>
               <div className="flex justify-between items-end border-t pt-6">
                  <div><p className="text-[8px] font-black text-slate-300 uppercase mb-1">বুকিং বিল</p><p className="text-xl font-black italic text-slate-900">{formatCurrency(b.total_amount)}</p></div>
                  <div className="text-right">
                     <p className="text-[8px] font-black text-red-300 uppercase mb-1">বাকি টাকা</p>
                     <p className="text-lg font-black italic text-red-600">{formatCurrency(b.total_amount - b.advance_amount)}</p>
                  </div>
               </div>
            </div>
        ))}
      </div>

      {/* 🧾 BOOKING DETAILS MODAL (Primary Workspace) */}
      {showDetailModal && selectedBooking && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[1000] flex items-center justify-center p-4 no-print">
           <div className="bg-white rounded-[3.5rem] w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-reveal">
              <div className="p-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <div><h3 className="text-xl font-black uppercase italic">বুকিং হিসাব ও ডেলিভারি</h3><p className="text-[9px] text-slate-500 uppercase font-black mt-1">ID: #{selectedBooking.id.slice(-6).toUpperCase()}</p></div>
                 <button onClick={() => setShowDetailModal(false)} className="text-4xl text-slate-500 font-black hover:text-white transition-colors">×</button>
              </div>
              <div className="p-10 overflow-y-auto custom-scroll space-y-8 text-slate-900">
                 <div className="grid grid-cols-2 gap-8 border-b pb-8">
                    <div>
                       <p className="text-[9px] font-black text-slate-400 uppercase italic mb-2">ক্রেতা:</p>
                       <p className="text-lg font-black uppercase italic leading-tight">{selectedBooking.customer_name}</p>
                       <p className="text-[10px] font-bold mt-2 uppercase">{selectedBooking.customer_address}</p>
                    </div>
                    <div className="text-right">
                       <p className="text-[9px] font-black text-slate-400 uppercase italic mb-2">বুকিং স্ট্যাটাস:</p>
                       <p className="text-sm font-black italic text-emerald-600">জমা: {formatCurrency(selectedBooking.advance_amount)}</p>
                       <p className="text-xl font-black italic text-red-600 mt-2">বাকি: {formatCurrency(selectedBooking.total_amount - selectedBooking.advance_amount)}</p>
                    </div>
                 </div>

                 <div className="space-y-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase italic">ডেলিভারি ট্র্যাকিং (মালের হিসাব):</p>
                    <div className="divide-y border rounded-[2rem] overflow-hidden bg-slate-50 shadow-inner">
                       {selectedBooking.items.map((it, idx) => {
                          const p = Math.round(((it.delivered_qty || 0) / it.qty) * 100);
                          return (
                            <div key={idx} className="p-6">
                               <div className="flex justify-between items-center mb-3">
                                  <div><p className="text-[12px] font-black uppercase italic">{it.name}</p><p className="text-[9px] font-bold text-slate-400 uppercase mt-1">অর্ডার: {it.qty} | <span className="text-blue-600 font-black">পাঠানো হয়েছে: {it.delivered_qty || 0}</span></p></div>
                                  <span className={`text-[11px] font-black italic ${p === 100 ? 'text-emerald-600' : 'text-blue-600'}`}>{p}% গেছে</span>
                               </div>
                               <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                  <div className={`h-full transition-all duration-1000 ${p === 100 ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${p}%` }}></div>
                                </div>
                            </div>
                          );
                       })}
                    </div>
                 </div>

                 {/* ACTION BUTTONS (RESTORED PAYMENT) */}
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-6">
                    <button onClick={() => { setNewPaymentAmount(""); setShowPaymentModal(true); }} className="bg-emerald-600 text-white py-6 rounded-3xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 flex flex-col items-center justify-center gap-1">
                       <span>💰 টাকা জমা নিন</span>
                       <span className="text-[8px] opacity-70">Payment</span>
                    </button>
                    <button onClick={() => { setDeliveryItems({}); setShowDeliverModal(true); }} className="bg-blue-600 text-white py-6 rounded-3xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 flex flex-col items-center justify-center gap-1">
                       <span>🚚 মাল পাঠাতে স্লিপ</span>
                       <span className="text-[8px] opacity-70">Delivery Slip</span>
                    </button>
                    <button onClick={() => handleDownloadPDF(invoiceRef, 'Full_Booking_Invoice')} className="bg-slate-900 text-white py-6 rounded-3xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 flex flex-col items-center justify-center gap-1">
                       <span>📄 বুকিং মেমো</span>
                       <span className="text-[8px] opacity-70">Full A5 Invoice</span>
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* 🛠️ PAYMENT MODAL (RESTORED) */}
      {showPaymentModal && selectedBooking && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[2000] flex items-center justify-center p-4 no-print">
          <div className="bg-white p-10 rounded-[4rem] w-full max-w-md shadow-2xl animate-reveal">
             <div className="flex justify-between items-center mb-10 border-b pb-6">
                <h3 className="text-xl font-black uppercase italic">টাকা জমা (পেমেন্ট)</h3>
                <button onClick={() => setShowPaymentModal(false)} className="text-3xl text-slate-300 font-black">×</button>
             </div>
             <div className="space-y-6 text-slate-900">
                <div className="bg-slate-50 p-6 rounded-[2rem] border text-center">
                   <p className="text-[10px] font-black text-slate-400 uppercase italic mb-2">বুকিংয়ের বর্তমান বকেয়া</p>
                   <p className="text-3xl font-black italic text-red-600">{formatCurrency(selectedBooking.total_amount - selectedBooking.advance_amount)}</p>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase ml-4 italic">জমা অ্যামাউন্ট (৳)</label>
                   <input autoFocus type="number" className="w-full p-8 bg-blue-50 border-none rounded-[2.5rem] text-4xl font-black italic text-center text-blue-600 outline-none shadow-inner" placeholder="0.00" value={newPaymentAmount} onChange={e => setNewPaymentAmount(e.target.value === "" ? "" : Number(e.target.value))} />
                </div>
                <button disabled={isSaving || !newPaymentAmount} onClick={handleBookingPayment} className="w-full bg-slate-900 text-white py-6 rounded-[2.5rem] font-black uppercase text-xs tracking-[0.2em] shadow-2xl active:scale-95 transition-all">কনফার্ম জমা করুন ➔</button>
             </div>
          </div>
        </div>
      )}

      {/* 📦 DELIVERY ACTION MODAL */}
      {showDeliverModal && selectedBooking && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[2000] flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-[3.5rem] w-full max-w-xl shadow-2xl overflow-hidden flex flex-col animate-reveal">
             <div className="p-8 bg-blue-600 text-white flex justify-between items-center">
                <div><h3 className="text-xl font-black uppercase italic">চালান এন্ট্রি (ডেলিভারি)</h3><p className="text-[9px] text-blue-200 font-black uppercase mt-1">কতটুকু মাল আজ যাচ্ছে তা লিখুন</p></div>
                <button onClick={() => setShowDeliverModal(false)} className="text-4xl text-white/50 font-black">×</button>
             </div>
             <div className="p-10 space-y-6 text-slate-900 overflow-y-auto max-h-[70vh] custom-scroll">
                {selectedBooking.items.map((it) => {
                   const remaining = it.qty - (it.delivered_qty || 0);
                   return (
                      <div key={it.id} className="bg-slate-50 p-6 rounded-[2rem] border flex justify-between items-center group hover:bg-white transition-all">
                         <div className="flex-1 pr-6">
                            <p className="text-xs font-black uppercase italic truncate">{it.name}</p>
                            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">বাকি আছে: {remaining} টি</p>
                         </div>
                         <div className="flex items-center bg-white rounded-2xl shadow-inner px-4 py-2 border border-slate-100">
                            <input autoFocus type="number" className="w-16 bg-transparent text-center font-black text-lg outline-none text-blue-600" placeholder="0" value={deliveryItems[it.id] || ""} onChange={e => setDeliveryItems({...deliveryItems, [it.id]: Math.max(0, Math.min(remaining, Number(e.target.value)))})} />
                            <span className="text-[9px] font-black opacity-30 uppercase ml-2">পিস</span>
                         </div>
                      </div>
                   );
                })}
                <button disabled={isSaving} onClick={handleDelivery} className="w-full bg-blue-600 text-white py-6 rounded-3xl font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all mt-4">ডেলিভারি সম্পন্ন ও স্লিপ তৈরি ✅</button>
             </div>
          </div>
        </div>
      )}

      {/* 🎉 DELIVERY CHALLAN PREVIEW MODAL */}
      {showDeliverySuccess && selectedBooking && (
        <div className="fixed inset-0 bg-[#020617]/98 backdrop-blur-3xl z-[3000] flex flex-col items-center p-4 overflow-y-auto no-print">
           <div className="w-full max-w-[148mm] flex justify-between gap-6 mb-8 sticky top-0 z-[3001] bg-slate-900/90 p-6 rounded-3xl border border-white/10 shadow-2xl items-center">
              <button onClick={() => setShowDeliverySuccess(false)} className="text-white font-black uppercase text-[10px] px-6 hover:underline">← Close Challan</button>
              <button onClick={() => handleDownloadPDF(challanRef, 'Delivery_Challan')} className="bg-emerald-600 text-white px-10 py-3 rounded-xl font-black text-[10px] uppercase shadow-xl active:scale-95 transition-all">Download Challan Slip ⬇</button>
           </div>

           <div ref={challanRef} className="bg-white w-[148mm] min-h-[210mm] p-10 flex flex-col font-sans text-black shadow-2xl border-[3px] border-black">
              <div className="text-center mb-10 border-b-4 border-black pb-6">
                 <h1 className="text-[42px] font-black uppercase italic tracking-tighter leading-none mb-1">IFZA ELECTRONICS</h1>
                 <p className="text-2xl font-black uppercase italic">{company} DIVISION</p>
                 <div className="mt-4 inline-block px-8 py-1.5 bg-black text-white text-[10px] font-black uppercase rounded-full italic tracking-[0.3em]">DELIVERY CHALLAN (ডেলিভারি চালান)</div>
              </div>

              <div className="flex justify-between items-start mb-10 text-[12px] font-bold">
                 <div>
                    <p className="text-[10px] font-black border-b border-black w-fit mb-2 uppercase italic opacity-60">ক্রেতা (Customer):</p>
                    <p className="text-3xl font-black uppercase italic leading-none">{selectedBooking.customer_name}</p>
                    <p className="text-[13px] font-bold mt-2">📍 {selectedBooking.customer_address}</p>
                    <p className="text-[13px] font-bold">📱 {selectedBooking.customer_phone}</p>
                 </div>
                 <div className="text-right">
                    <p className="text-[10px] font-black border-b border-black w-fit ml-auto mb-2 uppercase italic opacity-60">চালান তথ্য (Shipment):</p>
                    <p className="text-[14px] font-black">বুকিং আইডি: #{selectedBooking.id.slice(-6).toUpperCase()}</p>
                    <p className="text-[14px] font-black">তারিখ: {new Date().toLocaleDateString('bn-BD')}</p>
                    <p className="text-[11px] font-bold italic mt-1 opacity-70">প্রতিনিধি: {user.name}</p>
                 </div>
              </div>

              <div className="flex-1">
                 <p className="text-[10px] font-black uppercase mb-4 italic text-slate-500">নিম্নোক্ত পণ্যসমূহ আজ পাঠানো হলো:</p>
                 <table className="w-full border-collapse border-2 border-black">
                    <thead>
                       <tr className="bg-black text-white text-[11px] font-black uppercase italic">
                          <th className="p-3 text-left border border-black">বিবরণ (Description)</th>
                          <th className="p-3 text-center border border-black w-32">MRP</th>
                          <th className="p-3 text-center border border-black w-32">পরিমাণ (Qty)</th>
                       </tr>
                    </thead>
                    <tbody>
                       {lastDeliverySummary.map((it, idx) => (
                          <tr key={idx} className="border-b border-black text-[15px] font-black italic">
                             <td className="p-4 uppercase border-r border-black">{it.name}</td>
                             <td className="p-4 text-center border-r border-black">৳{it.mrp}</td>
                             <td className="p-4 text-center">{it.qty} পিস (Pcs)</td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
                 <div className="mt-8 p-6 bg-slate-50 border-2 border-black rounded-2xl italic font-black text-[12px] leading-relaxed">
                    ঘোষণা: আজ প্রেরিত সকল পণ্য "IFZA" এর গুণগত মান অনুযায়ী ক্রেতাকে বুঝিয়ে দেওয়া হয়েছে। বুকিংয়ের অবশিষ্ট মাল পরবর্তী ধাপে সরবরাহ করা হবে।
                 </div>
              </div>

              <div className="mt-20 flex justify-between items-end px-4 mb-4">
                 <div className="text-center w-48 border-t-2 border-black pt-2 font-black italic text-[14px]">ক্রেতার স্বাক্ষর</div>
                 <div className="text-center w-60 border-t-2 border-black pt-2 text-right">
                    <p className="text-[18px] font-black uppercase italic tracking-tighter">কর্তৃপক্ষের স্বাক্ষর</p>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* 🏗️ ADD BOOKING MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[2000] flex items-center justify-center p-4 text-slate-900 no-print">
           <div className="bg-white rounded-[4rem] w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-reveal">
              <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
                 <h3 className="text-2xl font-black uppercase italic tracking-tighter">নতুন বুকিং এন্ট্রি</h3>
                 <button onClick={() => setShowAddModal(false)} className="text-4xl text-slate-500 font-black">×</button>
              </div>
              <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                 <div className="w-full lg:w-1/2 p-10 border-r overflow-y-auto custom-scroll space-y-6 bg-slate-50/30">
                    <div className="space-y-3">
                       <label className="text-[10px] font-black text-slate-400 uppercase italic ml-4 block">১. এরিয়া/রুট</label>
                       <select className="w-full p-5 bg-white border-2 border-slate-100 rounded-[2rem] font-black text-xs uppercase outline-none" value={modalAreaSelection} onChange={e => { setModalAreaSelection(e.target.value); setSelectedCust(null); }}>
                          <option value="">সকল এরিয়া</option>
                          {uniqueAreas.map(area => <option key={area} value={area}>{area}</option>)}
                       </select>
                    </div>
                    <div className="relative">
                       <label className="text-[10px] font-black text-slate-400 uppercase italic ml-4 mb-2 block">২. দোকান</label>
                       <div onClick={() => setShowCustList(!showCustList)} className="p-5 bg-white border-2 border-slate-100 rounded-[2rem] font-black text-xs uppercase italic cursor-pointer flex justify-between items-center">
                          {selectedCust ? selectedCust.name : "দোকান বেছে নিন..."}
                          <span className="opacity-20">▼</span>
                       </div>
                       {showCustList && (
                         <div className="absolute z-[100] w-full mt-2 bg-white border shadow-2xl rounded-[2.5rem] max-h-60 overflow-hidden flex flex-col p-2">
                            <input autoFocus className="w-full p-4 border-b outline-none font-bold italic text-sm" placeholder="সার্চ দোকান..." value={custSearch} onChange={e => setCustSearch(e.target.value)} />
                            <div className="overflow-y-auto custom-scroll flex-1">
                              {customers.filter(c => (!custSearch || c.name.toLowerCase().includes(custSearch.toLowerCase())) && (!modalAreaSelection || c.address === modalAreaSelection)).map(c => (
                                <div key={c.id} onClick={() => { setSelectedCust(c); setShowCustList(false); }} className="p-4 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 font-black text-[11px] uppercase italic">
                                  {c.name}<p className="text-[8px] opacity-40 font-bold tracking-tighter">📍 {c.address}</p>
                                </div>
                              ))}
                            </div>
                         </div>
                       )}
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase italic ml-4 mb-2 block">৩. মাল বাছাই</label>
                       <input className="w-full p-5 bg-white border-2 border-slate-100 rounded-[2rem] font-black text-xs uppercase italic outline-none" placeholder="সার্চ প্রোডাক্ট..." value={prodSearch} onChange={e => setProdSearch(e.target.value)} />
                       <div className="grid grid-cols-2 gap-2 mt-4">
                          {products.filter(p => p.name.toLowerCase().includes(prodSearch.toLowerCase())).slice(0, 10).map(p => (
                            <div key={p.id} onClick={() => addToCart(p)} className="p-4 border rounded-2xl hover:border-indigo-500 cursor-pointer transition-all bg-white active:scale-95 shadow-sm">
                               <p className="text-[10px] font-black uppercase italic truncate">{p.name}</p><p className="text-[9px] font-bold text-indigo-600 mt-1 italic">MRP: {p.mrp}</p>
                            </div>
                          ))}
                       </div>
                    </div>
                 </div>
                 <div className="w-full lg:w-1/2 p-10 bg-slate-50 flex flex-col">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase italic mb-6">অর্ডার কার্ট</h4>
                    <div className="flex-1 overflow-y-auto custom-scroll space-y-3">
                       {bookingCart.map((it, idx) => (
                         <div key={idx} className="bg-white p-5 rounded-[2rem] border flex justify-between items-center shadow-sm">
                            <div className="flex-1 min-w-0 pr-4">
                               <p className="text-[10px] font-black uppercase italic truncate">{it.name}</p><p className="text-[8px] font-bold text-slate-300 uppercase italic mt-1">Rate: ৳{it.unitPrice}</p>
                            </div>
                            <div className="flex items-center gap-2">
                               <input type="number" className="w-16 p-2 bg-slate-50 rounded-xl text-center font-black outline-none border" value={it.qty} onChange={e => setBookingCart(bookingCart.map((item, i) => i === idx ? {...item, qty: Number(e.target.value), total: Number(e.target.value) * item.unitPrice} : item))} />
                               <button onClick={() => setBookingCart(bookingCart.filter((_, i) => i !== idx))} className="text-red-400 text-xl font-black px-2">×</button>
                            </div>
                         </div>
                       ))}
                    </div>
                    <div className="pt-8 border-t space-y-4">
                       <div className="bg-white p-6 rounded-[2.5rem] border shadow-inner">
                          <label className="text-[9px] font-black text-slate-400 uppercase italic block mb-2">অগ্রিম পেমেন্ট (৳)</label>
                          <input type="number" className="w-full bg-transparent text-3xl font-black italic outline-none text-emerald-600" placeholder="0.00" value={form.advance} onChange={e => setForm({...form, advance: Number(e.target.value)})} />
                       </div>
                       <button disabled={isSaving || bookingCart.length === 0 || !selectedCust} onClick={handleAddBooking} className="w-full bg-indigo-600 text-white py-6 rounded-[2.5rem] font-black uppercase text-xs tracking-[0.2em] shadow-2xl active:scale-95 transition-all">বুকিং সম্পন্ন করুন ➔</button>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* 📄 HIDDEN FULL BOOKING INVOICE FOR PDF DOWNLOAD */}
      <div className="fixed -left-[2000px] top-0 no-print">
        <div ref={invoiceRef} className="bg-white w-[148mm] p-10 flex flex-col text-black font-sans shadow-none border-2 border-black">
           <div className="text-center border-b-4 border-black pb-4 mb-8">
              <h1 className="text-4xl font-black uppercase italic mb-1">IFZA ELECTRONICS</h1>
              <p className="text-lg font-black uppercase tracking-[0.3em] mb-1">{company} DIVISION</p>
              <div className="inline-block px-6 py-1.5 bg-black text-white text-[10px] font-black uppercase rounded-full italic">Booking Order Invoice (সম্পূর্ণ বুকিং মেমো)</div>
           </div>
           {selectedBooking && (
             <>
               <div className="flex justify-between items-start mb-10 text-xs">
                  <div>
                     <p className="font-black border-b border-black w-fit mb-1 uppercase tracking-widest opacity-60">ক্রেতা (Customer):</p>
                     <p className="text-xl font-black uppercase italic leading-none">{selectedBooking.customer_name}</p>
                     <p className="font-bold mt-1">📍 {selectedBooking.customer_address}</p>
                  </div>
                  <div className="text-right">
                     <p className="font-black border-b border-black w-fit ml-auto mb-1 uppercase tracking-widest opacity-60">মেমো তথ্য:</p>
                     <p className="font-black text-sm">Invoice: #{selectedBooking.id.slice(-6).toUpperCase()}</p>
                     <p className="font-black">Date: {new Date(selectedBooking.created_at).toLocaleDateString('bn-BD')}</p>
                  </div>
               </div>
               <table className="w-full text-left border-collapse border-2 border-black mb-10">
                  <thead>
                     <tr className="bg-black text-white text-[10px] font-black uppercase italic">
                        <th className="p-3 border border-black text-left">Description</th>
                        <th className="p-3 border border-black text-center w-24">Ordered</th>
                        <th className="p-3 border border-black text-center w-24">Delivered</th>
                        <th className="p-3 border border-black text-right w-32">Total Price</th>
                     </tr>
                  </thead>
                  <tbody>
                     {selectedBooking.items.map((it, idx) => (
                        <tr key={idx} className="font-bold text-[12px] border-b border-black italic">
                           <td className="p-3 border border-black uppercase">{it.name}</td>
                           <td className="p-3 border border-black text-center">{it.qty}</td>
                           <td className="p-3 border border-black text-center text-blue-600">{it.delivered_qty || 0}</td>
                           <td className="p-3 border border-black text-right">৳{(it.unitPrice * it.qty).toLocaleString()}</td>
                        </tr>
                     ))}
                  </tbody>
               </table>
               <div className="flex justify-end mb-20">
                  <div className="w-64 space-y-2 font-black italic">
                     <div className="flex justify-between text-xs border-b border-black/10 pb-1"><span>TOTAL BILL:</span><span>{formatCurrency(selectedBooking.total_amount)}</span></div>
                     <div className="flex justify-between text-xs text-emerald-600 border-b border-black/10 pb-1"><span>ADVANCE PAID:</span><span>{formatCurrency(selectedBooking.advance_amount)}</span></div>
                     <div className="flex justify-between text-2xl font-black border-2 border-black p-3 bg-black text-white mt-4">
                        <span className="text-[10px] self-center uppercase">Total Due:</span>
                        <span>{formatCurrency(selectedBooking.total_amount - selectedBooking.advance_amount)}</span>
                     </div>
                  </div>
               </div>
               <div className="mt-12 flex justify-between items-end px-4 mb-4">
                  <div className="text-center w-40 border-t-2 border-black pt-2 font-black italic text-[11px]">ক্রেতার স্বাক্ষর</div>
                  <div className="text-center w-52 border-t-2 border-black pt-2 text-right">
                     <p className="text-[16px] font-black uppercase italic tracking-tighter">কর্তৃপক্ষের স্বাক্ষর</p>
                  </div>
               </div>
             </>
           )}
        </div>
      </div>

    </div>
  );
};

export default Bookings;
