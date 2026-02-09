
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Company, UserRole, Product, formatCurrency, Booking, BookingItem } from '../types';
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
}

const Bookings: React.FC<BookingsProps> = ({ company, role }) => {
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
  const [showCustList, setShowCustList] = useState(false);
  const [showProdList, setShowProdList] = useState(false);
  const [selectedAreaFilter, setSelectedAreaFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  
  const [modalAreaSelection, setModalAreaSelection] = useState("");
  const [form, setForm] = useState({ qty: 1, unitPrice: 0, advance: 0 });

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

  const handleDownloadPDF = async () => {
    if (!invoiceRef.current || isDownloading || !selectedBooking) return;
    setIsDownloading(true);
    try {
      const element = invoiceRef.current;
      const canvas = await html2canvas(element, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a5');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
      pdf.save(`Booking_Invoice_${selectedBooking.id.slice(-6).toUpperCase()}.pdf`);
    } catch (err) {
      console.error("PDF error:", err);
      alert("পিডিএফ তৈরি করা যায়নি।");
    } finally {
      setIsDownloading(false);
    }
  };

  const uniqueAreas = useMemo(() => {
    const areas = customers.map(c => c.address?.trim()).filter(Boolean);
    return Array.from(new Set(areas)).sort() as string[];
  }, [customers]);

  const filteredBookings = useMemo(() => {
    return bookings.filter(b => {
      const matchesArea = !selectedAreaFilter || b.customer_address === selectedAreaFilter;
      const matchesStatus = statusFilter === "ALL" || b.status === statusFilter;
      return matchesArea && matchesStatus;
    });
  }, [bookings, selectedAreaFilter, statusFilter]);

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

      const { error: txErr } = await supabase.from('transactions').insert([{
        customer_id: selectedBooking.customer_id,
        company: dbCompany,
        amount: amt,
        payment_type: 'COLLECTION',
        items: [{ note: `বুকিং পেমেন্ট (ID: ${selectedBooking.id.slice(-6).toUpperCase()})` }]
      }]);

      if (txErr) throw txErr;

      alert("টাকা জমা হয়েছে!");
      setShowPaymentModal(false);
      setNewPaymentAmount("");
      await fetchData();
    } catch (err: any) { alert("ত্রুটি: " + err.message); } finally { setIsSaving(false); }
  };

  const stats = useMemo(() => {
    const totalVal = filteredBookings.reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
    const totalPaid = filteredBookings.reduce((s, b) => s + (Number(b.advance_amount) || 0), 0);
    return { totalVal, totalPaid, totalDue: totalVal - totalPaid };
  }, [filteredBookings]);

  const handleDelivery = async () => {
    if (!selectedBooking) return;
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
      alert("ডেলিভারি সম্পন্ন!");
      setShowDeliverModal(false);
      setShowDetailModal(false);
      fetchData();
    } catch (err: any) { alert(err.message); } finally { setIsSaving(false); }
  };

  const addToCart = (p: Product) => {
    if (bookingCart.find(i => i.product_id === p.id)) return;
    setBookingCart([...bookingCart, { product_id: p.id, name: p.name, qty: 1, unitPrice: p.tp, total: p.tp }]);
    setShowProdList(false);
  };

  const handleAddBooking = async () => {
    if (!selectedCust || bookingCart.length === 0 || isSaving) return;
    setIsSaving(true);
    try {
      const dbCompany = mapToDbCompany(company);
      const totalAmount = bookingCart.reduce((acc, it) => acc + it.total, 0);
      const itemsToSave = bookingCart.map(it => ({ ...it, id: it.product_id, delivered_qty: 0 }));

      const { error } = await supabase.from('bookings').insert([{
        customer_id: selectedCust.id,
        company: dbCompany,
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
          customer_id: selectedCust.id, company: dbCompany, amount: Number(form.advance),
          payment_type: 'COLLECTION', items: [{ note: `বুকিং অগ্রিম` }]
        }]);
      }

      alert("বুকিং সম্পন্ন হয়েছে!");
      setShowAddModal(false); setBookingCart([]); setSelectedCust(null); setModalAreaSelection("");
      setForm({ qty: 1, unitPrice: 0, advance: 0 }); fetchData();
    } catch (err: any) { alert("ত্রুটি: " + err.message); } finally { setIsSaving(false); }
  };

  const filteredModalCustomers = useMemo(() => {
    return customers.filter(c => {
      const q = custSearch.toLowerCase().trim();
      const matchesSearch = !q || c.name.toLowerCase().includes(q) || c.phone.includes(q);
      const matchesArea = !modalAreaSelection || c.address?.trim() === modalAreaSelection;
      return matchesSearch && matchesArea;
    });
  }, [customers, custSearch, modalAreaSelection]);

  return (
    <div className="space-y-6 pb-24 font-sans text-black animate-in fade-in duration-500">
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 no-print">
        <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm">
           <p className="text-[10px] font-black text-slate-400 uppercase italic mb-2">মোট বুকিং ভ্যালু</p>
           <p className="text-2xl font-black italic text-slate-900">{formatCurrency(stats.totalVal)}</p>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm">
           <p className="text-[10px] font-black text-slate-400 uppercase italic mb-2">মোট জমা (Paid)</p>
           <p className="text-2xl font-black italic text-emerald-600">{formatCurrency(stats.totalPaid)}</p>
        </div>
        <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-xl text-white">
           <p className="text-[10px] font-black text-slate-500 uppercase italic mb-2">মোট বাকি (Outstanding)</p>
           <p className="text-2xl font-black italic text-red-400">{formatCurrency(stats.totalDue)}</p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-[3rem] border shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 no-print">
        <div className="flex items-center gap-6">
           <div className={`w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black italic shadow-xl`}>B</div>
           <div>
              <h3 className="text-xl font-black uppercase italic tracking-tighter leading-none">বুকিং টার্মিনাল</h3>
              <p className="text-[10px] text-slate-400 font-black uppercase mt-2 tracking-widest">{company} Hub</p>
           </div>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <select className="p-4 bg-slate-50 border rounded-2xl text-[10px] font-black uppercase outline-none" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
             <option value="ALL">সব স্ট্যাটাস</option>
             <option value="PENDING">পেন্ডিং (Pending)</option>
             <option value="PARTIAL">অংশিক (Partial)</option>
             <option value="COMPLETED">কমপ্লিট (Completed)</option>
          </select>
          <button onClick={() => setShowAddModal(true)} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] shadow-xl">+ নতুন বুকিং সংগ্রহ</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 no-print">
        {loading ? (
          <div className="col-span-full py-20 text-center animate-pulse font-black uppercase italic opacity-20">ডাটা লোড হচ্ছে...</div>
        ) : filteredBookings.map(b => {
          const totalQty = b.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
          const totalDelivered = b.items.reduce((sum, item) => sum + (Number(item.delivered_qty) || 0), 0);
          const progressPercent = totalQty > 0 ? Math.round((totalDelivered / totalQty) * 100) : 0;
          
          return (
            <div key={b.id} onClick={() => { setSelectedBooking(b); setShowDetailModal(true); }} className="bg-white p-8 rounded-[3rem] border shadow-sm hover:shadow-2xl transition-all cursor-pointer group relative overflow-hidden">
               <div className="flex justify-between items-start mb-6">
                  <span className={`px-4 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest ${
                    b.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600' : b.status === 'PARTIAL' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'
                  }`}>{b.status}</span>
                  <p className="text-[8px] font-bold text-slate-300 uppercase">ID: {b.id.slice(-6).toUpperCase()}</p>
               </div>
               <h4 className="font-black text-slate-900 text-lg uppercase italic leading-none truncate mb-2">{b.customer_name}</h4>
               <p className="text-[10px] text-slate-400 font-black uppercase truncate mb-6 italic">📍 {b.customer_address}</p>
               <div className="flex justify-between items-end border-t pt-6 mb-4">
                  <div>
                     <p className="text-[8px] font-black text-slate-300 uppercase mb-1">মোট বুকিং বিল</p>
                     <p className="text-xl font-black italic text-slate-900">{formatCurrency(b.total_amount)}</p>
                  </div>
                  <div className="text-right">
                     <p className="text-[8px] font-black text-red-300 uppercase mb-1">বাকি (Due)</p>
                     <p className="text-lg font-black italic text-red-600">{formatCurrency(b.total_amount - b.advance_amount)}</p>
                  </div>
               </div>
               <div className="absolute bottom-0 inset-x-0 h-2 bg-slate-50">
                  <div className={`h-full transition-all duration-1000 ${progressPercent === 100 ? 'bg-emerald-500' : progressPercent > 0 ? 'bg-orange-500' : 'bg-blue-500'}`} style={{ width: `${progressPercent}%` }}></div>
               </div>
            </div>
          );
        })}
      </div>

      {showDetailModal && selectedBooking && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[1000] flex items-center justify-center p-4 no-print">
           <div className="bg-white rounded-[3.5rem] w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
              <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
                 <div><h3 className="text-xl font-black uppercase italic">বুকিং ইনভয়েস বিবরণ</h3><p className="text-[9px] text-slate-500 uppercase font-black mt-1">ID: #{selectedBooking.id.slice(-6).toUpperCase()}</p></div>
                 <div className="flex items-center gap-4">
                    <button disabled={isDownloading} onClick={handleDownloadPDF} className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-black text-[9px] uppercase shadow-lg hover:bg-emerald-700 transition-all">
                       {isDownloading ? "Downloading..." : "Download PDF (A5) ⬇"}
                    </button>
                    <button onClick={() => setShowDetailModal(false)} className="text-4xl text-slate-500 font-black">×</button>
                 </div>
              </div>
              <div className="p-10 overflow-y-auto custom-scroll space-y-8 text-slate-900">
                 <div className="grid grid-cols-2 gap-8 border-b pb-8">
                    <div>
                       <p className="text-[9px] font-black text-slate-400 uppercase italic mb-2">ক্রেতার তথ্য:</p>
                       <p className="text-lg font-black uppercase italic">{selectedBooking.customer_name}</p>
                       <p className="text-[10px] font-bold mt-1 uppercase">{selectedBooking.customer_address}</p>
                       <p className="text-[10px] font-bold text-blue-600 mt-1 uppercase">📱 {selectedBooking.customer_phone}</p>
                    </div>
                    <div className="text-right">
                       <p className="text-[9px] font-black text-slate-400 uppercase italic mb-2">হিসাব বিবরণ:</p>
                       <p className="text-lg font-black italic text-slate-900">মোট: {formatCurrency(selectedBooking.total_amount)}</p>
                       <p className="text-sm font-black italic text-emerald-600">জমা: {formatCurrency(selectedBooking.advance_amount)}</p>
                       <p className="text-xl font-black italic text-red-600 mt-2 border-t pt-2">বাকি: {formatCurrency(selectedBooking.total_amount - selectedBooking.advance_amount)}</p>
                    </div>
                 </div>
                 <div className="space-y-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase italic">বুকিং করা মালের তালিকা:</p>
                    <div className="divide-y border rounded-[2rem] overflow-hidden">
                       {selectedBooking.items.map((it, idx) => (
                         <div key={idx} className="p-5 flex justify-between items-center bg-slate-50/30">
                            <div>
                               <p className="text-[11px] font-black uppercase italic">{it.name}</p>
                               <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">
                                 অর্ডার: {it.qty} টি | <span className="text-emerald-600">ডেলিভারি: {it.delivered_qty || 0} টি</span>
                               </p>
                            </div>
                            <p className="text-xs font-black italic">{formatCurrency(it.unitPrice * it.qty)}</p>
                         </div>
                       ))}
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-3 pt-6">
                    <button onClick={() => setShowPaymentModal(true)} className="bg-blue-600 text-white py-5 rounded-3xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95">💰 টাকা জমা নিন (Add Payment)</button>
                    <button onClick={() => { setDeliveryItems({}); setShowDeliverModal(true); }} className="bg-slate-900 text-white py-5 rounded-3xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95">🚚 মাল ডেলিভারি করুন</button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Hidden Printable A5 Template for PDF */}
      <div className="fixed -left-[2000px] top-0 no-print">
        <div ref={invoiceRef} className="bg-white w-[148mm] p-10 flex flex-col text-black font-sans shadow-none border-2 border-black">
           <div className="text-center border-b-4 border-black pb-4 mb-8">
              <h1 className="text-4xl font-black uppercase italic tracking-tighter mb-1 text-black">IFZA ELECTRONICS</h1>
              <p className="text-lg font-black uppercase tracking-[0.3em] mb-1 text-black">{company} DIVISION</p>
              <div className="inline-block px-6 py-1.5 bg-black text-white text-[10px] font-black uppercase rounded-full italic">Booking Invoice (A5)</div>
           </div>
           
           {selectedBooking && (
             <>
               <div className="flex justify-between items-start mb-10 text-xs">
                  <div className="space-y-1.5">
                     <p className="font-black border-b border-black w-fit mb-1 uppercase tracking-widest">Customer Info:</p>
                     <p className="text-xl font-black uppercase italic leading-none">{selectedBooking.customer_name}</p>
                     <p className="font-bold">Address: {selectedBooking.customer_address}</p>
                     <p className="font-bold">Phone: {selectedBooking.customer_phone}</p>
                  </div>
                  <div className="text-right space-y-1.5">
                     <p className="font-black border-b border-black w-fit ml-auto mb-1 uppercase tracking-widest">Memo Info:</p>
                     <p className="font-black text-sm">Invoice: #{selectedBooking.id.slice(-6).toUpperCase()}</p>
                     <p className="font-black">Date: {new Date(selectedBooking.created_at).toLocaleDateString('bn-BD')}</p>
                  </div>
               </div>

               <table className="w-full text-left border-collapse border-2 border-black mb-10">
                  <thead>
                     <tr className="bg-black text-white text-[10px] font-black uppercase italic">
                        <th className="p-3 border border-black text-left">Description</th>
                        <th className="p-3 border border-black text-center w-24">Qty</th>
                        <th className="p-3 border border-black text-center w-28">Rate</th>
                        <th className="p-3 border border-black text-right w-32">Amount</th>
                     </tr>
                  </thead>
                  <tbody>
                     {selectedBooking.items.map((it, idx) => (
                        <tr key={idx} className="font-bold text-[12px] border-b border-black">
                           <td className="p-3 border border-black uppercase italic">{it.name}</td>
                           <td className="p-3 border border-black text-center">{it.qty}</td>
                           <td className="p-3 border border-black text-center">৳{it.unitPrice.toLocaleString()}</td>
                           <td className="p-3 border border-black text-right italic">৳{(it.unitPrice * it.qty).toLocaleString()}</td>
                        </tr>
                     ))}
                  </tbody>
               </table>

               <div className="flex justify-end mb-20">
                  <div className="w-64 space-y-2 font-black italic">
                     <div className="flex justify-between text-xs border-b border-black/10 pb-1"><span>SUBTOTAL:</span><span>{formatCurrency(selectedBooking.total_amount)}</span></div>
                     <div className="flex justify-between text-xs text-emerald-600 border-b border-black/10 pb-1"><span>ADVANCE PAID:</span><span>{formatCurrency(selectedBooking.advance_amount)}</span></div>
                     <div className="flex justify-between text-2xl font-black border-2 border-black p-3 bg-black text-white mt-4">
                        <span className="text-[10px] self-center uppercase">Total Due:</span>
                        <span>{formatCurrency(selectedBooking.total_amount - selectedBooking.advance_amount)}</span>
                     </div>
                  </div>
               </div>

               <div className="flex justify-between items-end mt-12 text-[10px] font-black uppercase italic px-4">
                  <div className="text-center w-40 border-t-2 border-black pt-2">Customer Signature</div>
                  <div className="text-center w-52 border-t-2 border-black pt-2">
                     <p className="text-[8px] font-bold">IFZA ELECTRONICS</p>
                     <p className="mt-0.5">Authorised Signature</p>
                  </div>
               </div>
             </>
           )}
        </div>
      </div>

      {showPaymentModal && selectedBooking && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[2000] flex items-center justify-center p-4 no-print">
          <div className="bg-white p-10 rounded-[4rem] w-full max-w-md shadow-2xl animate-in zoom-in-95">
             <div className="flex justify-between items-center mb-10 border-b pb-6">
                <h3 className="text-xl font-black uppercase italic">টাকা জমা (Collection)</h3>
                <button onClick={() => setShowPaymentModal(false)} className="text-3xl text-slate-300 font-black">×</button>
             </div>
             <div className="space-y-6 text-slate-900">
                <div className="bg-slate-50 p-6 rounded-[2rem] border text-center">
                   <p className="text-[10px] font-black text-slate-400 uppercase italic mb-2">বর্তমান বকেয়া (Current Due)</p>
                   <p className="text-3xl font-black italic text-red-600">{formatCurrency(selectedBooking.total_amount - selectedBooking.advance_amount)}</p>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase ml-4 italic">জমা অ্যামাউন্ট (৳)</label>
                   <input autoFocus type="number" className="w-full p-8 bg-blue-50 border-none rounded-[2.5rem] text-4xl font-black italic text-center text-blue-600 outline-none shadow-inner" placeholder="0.00" value={newPaymentAmount} onChange={e => setNewPaymentAmount(e.target.value === "" ? "" : Number(e.target.value))} />
                </div>
                <button disabled={isSaving || !newPaymentAmount} onClick={handleBookingPayment} className="w-full bg-slate-900 text-white py-6 rounded-[2.5rem] font-black uppercase text-xs tracking-[0.2em] shadow-2xl active:scale-95 transition-all">
                  {isSaving ? "প্রসেসিং..." : "টাকা জমা করুন ➔"}
                </button>
             </div>
          </div>
        </div>
      )}

      {showDeliverModal && selectedBooking && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[2000] flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-[3.5rem] w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
             <div className="p-8 bg-emerald-600 text-white flex justify-between items-center">
                <h3 className="text-xl font-black uppercase italic">ডেলিভারি পোস্টিং</h3>
                <button onClick={() => setShowDeliverModal(false)} className="text-4xl text-white/50 font-black">×</button>
             </div>
             <div className="p-10 space-y-6 text-slate-900">
                {selectedBooking.items.map((it) => (
                  <div key={it.id} className="bg-slate-50 p-6 rounded-[2rem] border flex justify-between items-center">
                     <div>
                        <p className="text-xs font-black uppercase italic">{it.name}</p>
                        <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">বাকি আছে: {it.qty - (it.delivered_qty || 0)} টি</p>
                     </div>
                     <div className="flex items-center bg-white rounded-xl shadow-inner px-4 py-1">
                        <input type="number" className="w-20 bg-transparent text-center font-black text-lg outline-none" placeholder="0" value={deliveryItems[it.id] || ""} onChange={e => setDeliveryItems({...deliveryItems, [it.id]: Math.min(it.qty - (it.delivered_qty || 0), Number(e.target.value))})} />
                        <span className="text-[9px] font-black opacity-20 uppercase">PCS</span>
                     </div>
                  </div>
                ))}
                <button disabled={isSaving} onClick={handleDelivery} className="w-full bg-emerald-600 text-white py-6 rounded-3xl font-black uppercase text-xs tracking-widest shadow-xl active:scale-95">ডেলিভারি কনফার্ম করুন ✅</button>
             </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[2000] flex items-center justify-center p-4 text-slate-900 no-print">
           <div className="bg-white rounded-[4rem] w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-reveal">
              <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
                 <h3 className="text-2xl font-black uppercase italic tracking-tighter">নতুন বুকিং সংগ্রহ</h3>
                 <button onClick={() => { setShowAddModal(false); setModalAreaSelection(""); }} className="text-4xl text-slate-500 font-black">×</button>
              </div>
              <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                 <div className="w-full lg:w-1/2 p-10 border-r overflow-y-auto custom-scroll space-y-6 bg-slate-50/30">
                    <div className="bg-white p-6 rounded-[2.5rem] border shadow-sm space-y-3">
                       <label className="text-[10px] font-black text-slate-400 uppercase italic ml-4 block">১. এরিয়া/রুট বাছাই করুন</label>
                       <select className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-[2rem] font-black text-xs uppercase outline-none focus:border-indigo-500 transition-all" value={modalAreaSelection} onChange={e => { setModalAreaSelection(e.target.value); setSelectedCust(null); }}>
                          <option value="">সকল এরিয়া (All Areas)</option>
                          {uniqueAreas.map(area => <option key={area} value={area}>{area}</option>)}
                       </select>
                    </div>
                    <div className="relative">
                       <label className="text-[10px] font-black text-slate-400 uppercase italic ml-4 mb-2 block">২. দোকান সিলেক্ট করুন</label>
                       <div onClick={() => setShowCustList(!showCustList)} className="p-5 bg-white border-2 border-slate-100 rounded-[2rem] font-black text-xs uppercase italic cursor-pointer flex justify-between items-center shadow-sm">
                          {selectedCust ? selectedCust.name : "দোকান বেছে নিন..."}
                          <span className="opacity-20">▼</span>
                       </div>
                       {showCustList && (
                         <div className="absolute z-[100] w-full mt-2 bg-white border shadow-2xl rounded-[2.5rem] max-h-60 overflow-hidden flex flex-col p-2 animate-in zoom-in-95">
                            <input autoFocus className="w-full p-4 border-b outline-none font-bold italic text-sm" placeholder="সার্চ দোকান..." value={custSearch} onChange={e => setCustSearch(e.target.value)} />
                            <div className="overflow-y-auto custom-scroll flex-1">
                              {filteredModalCustomers.length === 0 ? (
                                <p className="p-10 text-center text-[10px] font-black uppercase opacity-20 italic">দোকান পাওয়া যায়নি</p>
                              ) : filteredModalCustomers.map(c => (
                                <div key={c.id} onClick={() => { setSelectedCust(c); setShowCustList(false); }} className="p-4 hover:bg-indigo-50 hover:text-indigo-600 cursor-pointer border-b border-slate-50 font-black text-[11px] uppercase italic transition-colors">
                                  {c.name}<p className="text-[8px] opacity-40 font-bold tracking-tighter">📍 {c.address}</p>
                                </div>
                              ))}
                            </div>
                         </div>
                       )}
                    </div>
                    <div className="relative">
                       <label className="text-[10px] font-black text-slate-400 uppercase italic ml-4 mb-2 block">৩. মাল বাছাই করুন</label>
                       <input className="w-full p-5 bg-white border-2 border-slate-100 rounded-[2rem] font-black text-xs uppercase italic outline-none shadow-sm focus:border-indigo-500 transition-all" placeholder="সার্চ প্রোডাক্ট..." value={prodSearch} onChange={e => setProdSearch(e.target.value)} />
                       <div className="grid grid-cols-2 gap-2 mt-4">
                          {products.filter(p => p.name.toLowerCase().includes(prodSearch.toLowerCase())).slice(0, 10).map(p => (
                            <div key={p.id} onClick={() => addToCart(p)} className="p-4 border rounded-2xl hover:border-indigo-500 cursor-pointer transition-all bg-white shadow-sm hover:shadow-lg active:scale-95">
                               <p className="text-[10px] font-black uppercase italic truncate">{p.name}</p><p className="text-[9px] font-bold text-indigo-600 mt-1 italic">TP: {p.tp}</p>
                            </div>
                          ))}
                       </div>
                    </div>
                 </div>
                 <div className="w-full lg:w-1/2 p-10 bg-slate-50 flex flex-col">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase italic mb-6">বুকিং কার্ট ও পেমেন্ট</h4>
                    <div className="flex-1 overflow-y-auto custom-scroll space-y-3">
                       {bookingCart.map((it, idx) => (
                         <div key={idx} className="bg-white p-5 rounded-[2rem] border flex justify-between items-center shadow-sm animate-in slide-in-from-right-4">
                            <div className="flex-1 min-w-0 pr-4">
                               <p className="text-[10px] font-black uppercase italic truncate">{it.name}</p><p className="text-[8px] font-bold text-slate-300 uppercase italic mt-1">Rate: ৳{it.unitPrice}</p>
                            </div>
                            <div className="flex items-center gap-2">
                               <input type="number" className="w-16 p-2 bg-slate-50 rounded-xl text-center font-black outline-none border focus:border-indigo-500" value={it.qty} onChange={e => setBookingCart(bookingCart.map((item, i) => i === idx ? {...item, qty: Number(e.target.value), total: Number(e.target.value) * item.unitPrice} : item))} />
                               <button onClick={() => setBookingCart(bookingCart.filter((_, i) => i !== idx))} className="text-red-400 text-xl font-black px-2 hover:scale-125 transition-transform">×</button>
                            </div>
                         </div>
                       ))}
                       {bookingCart.length === 0 && <div className="py-20 text-center opacity-10 font-black italic uppercase">কার্ট খালি</div>}
                    </div>
                    <div className="pt-8 border-t space-y-4">
                       <div className="bg-white p-6 rounded-[2.5rem] border shadow-inner">
                          <label className="text-[9px] font-black text-slate-400 uppercase italic block mb-2">অ্যাডভান্স পেমেন্ট (জমা টাকা)</label>
                          <input type="number" className="w-full bg-transparent text-3xl font-black italic outline-none text-emerald-600" placeholder="0.00" value={form.advance} onChange={e => setForm({...form, advance: Number(e.target.value)})} />
                       </div>
                       <button disabled={isSaving || bookingCart.length === 0 || !selectedCust} onClick={handleAddBooking} className="w-full bg-indigo-600 text-white py-6 rounded-[2.5rem] font-black uppercase text-xs tracking-[0.2em] shadow-2xl active:scale-95 transition-all hover:bg-indigo-700 disabled:opacity-20">বুকিং সেভ করুন ➔</button>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Bookings;
