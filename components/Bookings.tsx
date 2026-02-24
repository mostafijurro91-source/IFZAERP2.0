
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
   const [activeBookingsForCust, setActiveBookingsForCust] = useState<any[]>([]);
   const [targetBookingId, setTargetBookingId] = useState<string | "NEW">("NEW");
   const [bookingCart, setBookingCart] = useState<any[]>([]);

   const [custSearch, setCustSearch] = useState("");
   const [prodSearch, setProdSearch] = useState("");
   const [statusFilter, setStatusFilter] = useState<string>("ACTIVE");
   const [modalAreaSelection, setModalAreaSelection] = useState("");
   const [currentStep, setCurrentStep] = useState(1);
   const [form, setForm] = useState({ advance: 0, bank_deposit: 0 });

   const [deliveryUpdates, setDeliveryUpdates] = useState<Record<string, number>>({});
   const [orderQtyUpdates, setOrderQtyUpdates] = useState<Record<string, number>>({});
   const [newCashAmt, setNewCashAmt] = useState<string>("");
   const [newBankAmt, setNewBankAmt] = useState<string>("");

   const invoiceRef = useRef<HTMLDivElement>(null);
   const slipRef = useRef<HTMLDivElement>(null);
   const [showSlipModal, setShowSlipModal] = useState(false);
   const [selectedSlipData, setSelectedSlipData] = useState<any>(null);

   // Helper for number formatting
   const safeFormat = (val: any) => Math.round(Number(val || 0)).toLocaleString();

   useEffect(() => {
      fetchData();
      const channel = supabase
         .channel('booking-sync-isolated-v2')
         .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => fetchData())
         .subscribe();
      return () => { supabase.removeChannel(channel); };
   }, [company]);

   const fetchData = async () => {
      try {
         const dbCompany = mapToDbCompany(company);
         const { data: bkData, error: bkErr } = await supabase
            .from('bookings')
            .select('*, customers(name, address, phone)')
            .eq('company', dbCompany)
            .order('created_at', { ascending: false });

         if (bkErr) throw bkErr;

         const formattedBookings = (bkData || []).map(b => ({
            ...b,
            customer_name: b.customers?.name,
            customer_address: b.customers?.address,
            customer_phone: b.customers?.phone
         }));

         const [custData, prodData] = await Promise.all([
            db.getCustomers(),
            supabase.from('products').select('*').eq('company', dbCompany).order('name')
         ]);

         setBookings(formattedBookings);
         setCustomers(custData || []);
         setProducts(prodData.data || []);
      } catch (err) { console.error("Fetch Error:", err); } finally { setLoading(false); }
   };

   const fetchActiveBookingsForCustomer = async (customerId: string) => {
      try {
         const dbCo = mapToDbCompany(company);
         const { data, error } = await supabase
            .from('bookings')
            .select('*')
            .eq('customer_id', customerId)
            .eq('company', dbCo)
            .neq('status', 'COMPLETED');

         if (error) throw error;
         setActiveBookingsForCust(data || []);
         setTargetBookingId("NEW");
      } catch (err) { setActiveBookingsForCust([]); }
   };

   // ✅ ডিলার যখন কোম্পানিকে টাকা পাঠিয়ে দেয়
   const handleCompanySettlement = async (b: ExtendedBooking) => {
      if (b.advance_amount <= 0) return alert("এই বুকিংয়ে দোকানদারের কোনো জমা টাকা নেই!");
      const confirmMsg = `আপনি কি দোকানদার ${b.customer_name}-এর জমা ৳${b.advance_amount.toLocaleString()} টাকা ${company}-কে পাঠাতে চান?`;
      if (!confirm(confirmMsg)) return;
      setIsSaving(true);
      try {
         const dbCo = mapToDbCompany(company);
         await supabase.from('company_ledger').insert([{
            company: dbCo, type: 'BANK_TRANSFER', amount: Number(b.advance_amount),
            note: `বুকিং পেমেন্ট টু কোম্পানি: ${b.customer_name}`,
            date: new Date().toISOString().split('T')[0],
         }]);
         await supabase.from('bookings').update({ advance_amount: 0 }).eq('id', b.id);
         alert("সফলভাবে কোম্পানিকে টাকা পাঠানো হয়েছে! ✅");
         fetchData();
      } catch (err: any) { alert("ত্রুটি: " + err.message); } finally { setIsSaving(false); }
   };

   const filteredBookings = useMemo(() => {
      return bookings.filter(b => {
         const totalOrdered = b.items?.reduce((s, i) => s + i.qty, 0) || 0;
         const totalDelivered = b.items?.reduce((s, i) => s + (i.delivered_qty || 0), 0) || 0;
         const isActuallyDone = totalOrdered > 0 && totalDelivered >= totalOrdered;

         if (statusFilter === 'ALL') return true;
         if (statusFilter === 'ACTIVE') return !isActuallyDone;
         if (statusFilter === 'COMPLETED') return isActuallyDone;
         return true;
      });
   }, [bookings, statusFilter]);

   const uniqueBookingCustomersCount = useMemo(() => {
      return new Set(filteredBookings.map(b => b.customer_id)).size;
   }, [filteredBookings]);

   const handleUpdateBookingStats = async () => {
      if (!selectedBooking || isSaving) return;
      setIsSaving(true);
      try {
         const dbCo = mapToDbCompany(company);
         const updatedItems = selectedBooking.items.map(it => {
            const d_qty = deliveryUpdates[it.id] || 0;
            const o_qty = orderQtyUpdates[it.id] !== undefined ? orderQtyUpdates[it.id] : it.qty;
            return { ...it, qty: o_qty, delivered_qty: (it.delivered_qty || 0) + d_qty };
         });

         const newTotal = updatedItems.reduce((s, i) => s + (i.qty * i.unitPrice), 0);
         const newAdvance = Number(selectedBooking.advance_amount) + (Number(newCashAmt) || 0) + (Number(newBankAmt) || 0);

         // ✅ কঠোর স্ট্যাটাস লজিক: ডেলিভারি সংখ্যা অর্ডার সংখ্যার সমান বা বেশি হলেই কেবল COMPLETED
         const totalOrdered = updatedItems.reduce((s, i) => s + i.qty, 0);
         const totalDelivered = updatedItems.reduce((s, i) => s + (i.delivered_qty || 0), 0);
         const isAllDelivered = totalOrdered > 0 && totalDelivered >= totalOrdered;
         const newStatus = isAllDelivered ? 'COMPLETED' : 'PARTIAL';

         const { error: bkErr } = await supabase.from('bookings').update({
            items: updatedItems, total_amount: newTotal, advance_amount: newAdvance,
            qty: totalOrdered, status: newStatus
         }).eq('id', selectedBooking.id);

         if (bkErr) throw bkErr;

         if (Number(newCashAmt) > 0 || Number(newBankAmt) > 0) {
            await supabase.from('transactions').insert([{
               customer_id: selectedBooking.customer_id, company: dbCo, amount: (Number(newCashAmt) || 0) + (Number(newBankAmt) || 0),
               payment_type: 'COLLECTION', items: [{ note: `বুকিং অগ্রিম জমা` }], submitted_by: user.name, meta: { is_booking: true }
            }]);
         }

         for (const it of selectedBooking.items) {
            const d_qty = deliveryUpdates[it.id] || 0;
            if (d_qty > 0) await supabase.rpc('increment_stock', { row_id: it.id, amt: -d_qty });
         }

         alert(`বুকিং আপডেট সফল হয়েছে! ✅ এটি এখন ${isAllDelivered ? '"সম্পন্ন"' : '"চলমান"'} লিস্টে থাকবে।`);
         setShowDetailModal(false);
         setDeliveryUpdates({}); setOrderQtyUpdates({}); setNewCashAmt(""); setNewBankAmt("");
         fetchData();
      } catch (err: any) { alert("ত্রুটি: " + err.message); } finally { setIsSaving(false); }
   };

   const handleDownloadPDF = async (ref: React.RefObject<HTMLDivElement | null>, filename: string) => {
      if (!ref.current || isDownloading) return;
      setIsDownloading(true);

      const parent = ref.current.parentElement;
      const parentOverflow = parent ? parent.style.overflowX : '';
      if (parent) parent.style.overflowX = 'visible';

      try {
         const element = ref.current;
         const canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff'
         });
         const imgData = canvas.toDataURL('image/jpeg', 0.95);

         const isSlip = filename === 'Booking_Slip';
         const pdf = new jsPDF('p', 'mm', isSlip ? 'a5' : 'a4');
         const pageWidth = pdf.internal.pageSize.getWidth();
         const pageHeight = pdf.internal.pageSize.getHeight();

         // Forced scaling for A5 slips to ensure single page
         let finalWidth = pageWidth;
         let finalHeight = (canvas.height * pageWidth) / canvas.width;

         if (isSlip && finalHeight > pageHeight) {
            const scale = pageHeight / finalHeight;
            finalHeight = pageHeight;
            finalWidth = finalWidth * scale;
         }

         const xPos = (pageWidth - finalWidth) / 2;
         pdf.addImage(imgData, 'JPEG', xPos, 0, finalWidth, finalHeight);

         pdf.save(`${filename}_${new Date().getTime()}.pdf`);
      } catch (err) {
         console.error(err);
         alert("PDF ডাউনলোড ব্যর্থ হয়েছে।");
      } finally {
         if (parent) parent.style.overflowX = parentOverflow;
         setIsDownloading(false);
      }
   };

   const handleAddBooking = async () => {
      if (!selectedCust || bookingCart.length === 0 || isSaving) return;
      setIsSaving(true);
      try {
         const dbCo = mapToDbCompany(company);
         const newItemsValue = bookingCart.reduce((acc, it) => acc + (it.qty * it.unitPrice), 0);
         const newItemsFormatted = bookingCart.map(it => ({
            id: it.product_id, product_id: it.product_id, name: it.name, qty: it.qty, unitPrice: it.unitPrice, delivered_qty: 0
         }));

         const totalInitialDeposit = Number(form.advance) + Number(form.bank_deposit);

         if (targetBookingId !== "NEW") {
            const existing = activeBookingsForCust.find(b => b.id === targetBookingId);
            const combinedItems = [...(existing.items || []), ...newItemsFormatted];
            const totalOrd = combinedItems.reduce((s, i) => s + i.qty, 0);
            const totalDel = combinedItems.reduce((s, i) => s + (i.delivered_qty || 0), 0);
            const newSt = totalDel >= totalOrd ? 'COMPLETED' : 'PARTIAL';

            await supabase.from('bookings').update({
               items: combinedItems, total_amount: Number(existing.total_amount) + newItemsValue,
               advance_amount: Number(existing.advance_amount) + totalInitialDeposit,
               qty: totalOrd, status: newSt
            }).eq('id', targetBookingId);
         } else {
            await supabase.from('bookings').insert([{
               customer_id: selectedCust.id, company: dbCo, product_name: newItemsFormatted[0].name,
               qty: newItemsFormatted.reduce((sum, item) => sum + item.qty, 0), items: newItemsFormatted,
               advance_amount: totalInitialDeposit, total_amount: newItemsValue, status: 'PENDING'
            }]);
         }

         if (totalInitialDeposit > 0) {
            await supabase.from('transactions').insert([{
               customer_id: selectedCust.id, company: dbCo, amount: totalInitialDeposit,
               payment_type: 'COLLECTION', items: [{ note: `বুকিং অগ্রিম গ্রহণ` }], submitted_by: user.name, meta: { is_booking: true }
            }]);
         }

         alert(`নতুন বুকিং চ্যাপ্টার ওপেন হয়েছে! ✅`);
         setShowAddModal(false); setBookingCart([]); setSelectedCust(null); setForm({ advance: 0, bank_deposit: 0 }); setCurrentStep(1); fetchData();
      } catch (err: any) { alert("ত্রুটি: " + err.message); } finally { setIsSaving(false); }
   };

   const uniqueAreas = useMemo(() => Array.from(new Set(customers.map(c => c.address?.trim()).filter(Boolean))).sort() as string[], [customers]);

   return (
      <div className="space-y-6 md:space-y-10 pb-40 animate-reveal text-slate-900 font-sans mt-2">

         {/* 📊 SUMMARY CARDS */}
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 no-print px-1">
            <div className="bg-indigo-600 p-6 md:p-8 rounded-[2rem] shadow-xl flex flex-col justify-between text-white relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-bl-[3rem] group-hover:scale-110 transition-transform"></div>
               <p className="text-[9px] font-black text-indigo-100 uppercase tracking-widest mb-1 italic relative z-10">Active Chapter Orders</p>
               <h3 className="text-3xl md:text-4xl font-black italic tracking-tighter relative z-10">{uniqueBookingCustomersCount} <span className="text-xs font-normal uppercase tracking-normal opacity-50">দোকান</span></h3>
            </div>
            <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-between">
               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Total Order Value</p>
               <h3 className="text-2xl md:text-3xl font-black italic tracking-tighter text-slate-900">৳{safeFormat(filteredBookings.reduce((s, b) => s + Number(b.total_amount), 0))}</h3>
            </div>
            <div className="bg-slate-900 p-6 md:p-8 rounded-[2rem] shadow-xl flex flex-col justify-between text-white">
               <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1 italic">Dealer Hand Advance</p>
               <h3 className="text-2xl md:text-3xl font-black italic tracking-tighter text-emerald-400">৳{safeFormat(filteredBookings.reduce((s, b) => s + Number(b.advance_amount), 0))}</h3>
            </div>
            <div className="bg-rose-50 p-6 md:p-8 rounded-[2rem] border border-rose-100 shadow-sm flex flex-col justify-between">
               <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-1 italic">Expected Collection</p>
               <h3 className="text-2xl md:text-3xl font-black italic tracking-tighter text-rose-600">৳{safeFormat(filteredBookings.reduce((s, b) => s + (Number(b.total_amount) - Number(b.advance_amount)), 0))}</h3>
            </div>
         </div>

         {/* 🚀 HUB HEADER */}
         <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-lg flex flex-col md:flex-row justify-between items-center gap-6 no-print mx-1">
            <div className="flex items-center gap-5 w-full md:w-auto">
               <div className="w-12 h-12 md:w-14 md:h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-xl md:text-2xl font-black italic shadow-lg">B</div>
               <div>
                  <h3 className="text-lg md:text-xl font-black uppercase italic tracking-tighter">বুকিং সেক্টর (Isolated)</h3>
                  <p className="text-[9px] text-slate-400 font-bold uppercase mt-1 tracking-widest">{company} • ডিলার কন্ট্রোল</p>
               </div>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
               <select className="flex-1 md:flex-none p-4 md:p-5 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] font-black uppercase outline-none shadow-inner" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option value="ACTIVE">চলমান (Active)</option>
                  <option value="COMPLETED">সম্পন্ন (Completed)</option>
                  <option value="ALL">সকল রেকর্ড</option>
               </select>
               <button onClick={() => { setShowAddModal(true); setCurrentStep(1); setBookingCart([]); setSelectedCust(null); setTargetBookingId("NEW"); }} className="flex-[1.5] md:flex-none bg-indigo-600 text-white px-8 md:px-10 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all">+ নিউ বুকিং</button>
            </div>
         </div>

         {/* 📋 BOOKING LIST */}
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 no-print px-1">
            {loading ? (
               <div className="col-span-full py-40 text-center animate-pulse text-slate-300 font-black italic tracking-widest">বুকিং ডাটা লোড হচ্ছে...</div>
            ) : filteredBookings.map((b, idx) => {
               const totalOrdered = b.items?.reduce((s, i) => s + i.qty, 0) || 0;
               const totalDelivered = b.items?.reduce((s, i) => s + (i.delivered_qty || 0), 0) || 0;
               const remainingQty = totalOrdered - totalDelivered;
               const deliveryPercent = totalOrdered > 0 ? (totalDelivered / totalOrdered) * 100 : 0;

               // ✅ কার্ডে প্রদর্শিত স্ট্যাটাস সরাসরি অংকের ওপর নির্ভর করবে
               const isFull = totalOrdered > 0 && totalDelivered >= totalOrdered;

               const netBalance = b.total_amount - b.advance_amount;
               const isExcess = netBalance < 0;

               return (
                  <div key={b.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-md hover:shadow-2xl transition-all duration-500 group relative flex flex-col justify-between animate-reveal overflow-hidden" style={{ animationDelay: `${idx * 0.05}s` }}>
                     <div className="mb-6">
                        <div className="flex justify-between items-start mb-4">
                           <span className={`px-4 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest shadow-sm ${isFull ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-orange-50 text-orange-600 border border-orange-100'
                              }`}>{isFull ? 'সম্পন্ন (FULL)' : 'চলমান (PARTIAL)'}</span>
                           <div className="flex items-center gap-2">
                              <button
                                 onClick={() => handleCompanySettlement(b)}
                                 title="কোম্পানিকে টাকা পাঠান"
                                 className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-lg shadow-sm hover:bg-emerald-600 hover:text-white transition-all active:scale-90"
                              >
                                 🏦
                              </button>
                              <button
                                 onClick={(e) => { e.stopPropagation(); setSelectedSlipData({ ...b, items: b.items, customer_name: b.customer_name, address: b.customer_address, phone: b.customer_phone, booking_id: b.id, total_amount: b.total_amount, advance_amount: b.advance_amount }); setShowSlipModal(true); }}
                                 title="মেমো প্রিন্ট করুন"
                                 className="w-9 h-9 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center text-lg shadow-sm hover:bg-slate-900 hover:text-white transition-all active:scale-90"
                              >
                                 🖨️
                              </button>
                              <span className="text-[9px] font-black text-slate-300">#{b.id.slice(-4).toUpperCase()}</span>
                           </div>
                        </div>
                        <h4 onClick={() => { setSelectedBooking(b); setShowDetailModal(true); }} className="font-black text-slate-800 text-lg uppercase italic leading-tight truncate mb-2 group-hover:text-indigo-600 transition-colors cursor-pointer">{b.customer_name}</h4>

                     </div>

                     <div className="mb-8 space-y-2 px-1">
                        <div className="flex justify-between text-[8px] font-black uppercase italic text-slate-400">
                           <span>ডেলিভারি প্রগতি</span>
                           <span className={isFull ? 'text-emerald-500' : 'text-indigo-500'}>{totalDelivered} / {totalOrdered} Pcs</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                           <div className={`h-full transition-all duration-1000 ${isFull ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${deliveryPercent}%` }}></div>
                        </div>
                     </div>

                     <div className="flex justify-between items-end border-t pt-6">
                        <div>
                           <p className="text-[8px] font-black text-slate-300 uppercase mb-1 italic">Total Bill</p>
                           <p className="text-xl font-black italic text-slate-900 leading-none tracking-tighter">৳{safeFormat(b.total_amount)}</p>
                        </div>
                        <div className="text-right">
                           <p className={`text-[8px] font-black uppercase mb-1 italic ${isExcess ? 'text-emerald-500 animate-pulse' : 'text-rose-300'}`}>
                              {isExcess ? 'Extra Deposit' : 'Net Pending'}
                           </p>
                           <p className={`text-xl font-black italic leading-none tracking-tighter ${isExcess ? 'text-emerald-600' : 'text-rose-600'}`}>
                              ৳{safeFormat(Math.abs(netBalance))}
                           </p>
                        </div>
                     </div>
                  </div>
               );
            })}
         </div>

         {/* ➕ ADD BOOKING MODAL */}
         {showAddModal && (
            <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[4000] flex items-center justify-center p-4">
               <div className="bg-white rounded-[4rem] w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl animate-reveal overflow-hidden">
                  <div className="p-8 bg-indigo-600 text-white flex justify-between items-center shrink-0">
                     <div>
                        <h3 className="text-2xl font-black uppercase italic tracking-tighter">বুকিং এন্ট্রি (Isolated)</h3>
                        <p className="text-[9px] font-black text-white/50 uppercase tracking-widest mt-1">Step {currentStep} of 2</p>
                     </div>
                     <button onClick={() => setShowAddModal(false)} className="text-4xl text-white/50 hover:text-white font-black">✕</button>
                  </div>

                  <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
                     {currentStep === 1 ? (
                        <div className="flex-1 flex flex-col p-10 gap-6">
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <select className="p-6 bg-white border border-slate-100 rounded-[2.5rem] font-black text-xs uppercase outline-none focus:border-indigo-500 transition-all shadow-sm" value={modalAreaSelection} onChange={e => setModalAreaSelection(e.target.value)}>
                                 <option value="">সকল এরিয়া</option>
                                 {uniqueAreas.map(a => <option key={a} value={a}>{a}</option>)}
                              </select>
                              <input className="p-6 bg-white border border-slate-100 rounded-[2.5rem] font-black text-xs uppercase outline-none focus:border-indigo-500 shadow-sm" placeholder="দোকান বা মোবাইল সার্চ..." value={custSearch} onChange={e => setCustSearch(e.target.value)} />
                           </div>
                           <div className="flex-1 overflow-y-auto custom-scroll space-y-3">
                              {customers.filter(c => (!custSearch || c.name.toLowerCase().includes(custSearch.toLowerCase()) || c.phone.includes(custSearch)) && (!modalAreaSelection || c.address === modalAreaSelection)).map(c => (
                                 <div key={c.id} onClick={async () => { setSelectedCust(c); await fetchActiveBookingsForCustomer(c.id); setCurrentStep(2); }} className="p-3 bg-white rounded-3xl border border-slate-100 hover:border-indigo-500 shadow-sm hover:shadow-xl transition-all cursor-pointer flex justify-between items-center group">
                                    <div>
                                       <h4 className="font-black text-slate-800 uppercase italic text-sm group-hover:text-indigo-600 leading-none">{c.name}</h4>
                                       <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase italic tracking-widest leading-none">📍 {c.address} | 📱 {c.phone}</p>
                                    </div>
                                    <div className="text-xl">➔</div>
                                 </div>
                              ))}
                           </div>
                        </div>
                     ) : (
                        <div className="flex-1 flex flex-col overflow-hidden">
                           <div className="bg-indigo-50 p-6 flex flex-col md:flex-row justify-between items-center gap-4 border-b border-indigo-100">
                              <div className="flex items-center gap-4">
                                 <span className="text-[11px] font-black text-indigo-400 uppercase">সিলেক্টেড: {selectedCust.name}</span>
                                 <button onClick={() => setCurrentStep(1)} className="text-[8px] font-black text-indigo-600 uppercase underline">পরিবর্তন করুন</button>
                              </div>
                              <div className="flex items-center gap-3">
                                 <label className="text-[9px] font-black text-indigo-500 uppercase italic">বুকিং গন্তব্য:</label>
                                 <select className="p-3 bg-white border border-indigo-200 rounded-xl text-[10px] font-black uppercase outline-none shadow-sm" value={targetBookingId} onChange={e => setTargetBookingId(e.target.value)}>
                                    <option value="NEW">নতুন চ্যাপ্টার (New Entry)</option>
                                    {activeBookingsForCust.map(b => (
                                       <option key={b.id} value={b.id}>যোগ করুন: #{b.id.slice(-4).toUpperCase()} (বাকি ৳{(b.total_amount - b.advance_amount).toLocaleString()})</option>
                                    ))}
                                 </select>
                              </div>
                           </div>

                           <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                              <div className="w-full lg:w-1/2 p-8 border-r flex flex-col gap-6 bg-slate-50">
                                 <input className="w-full p-4 bg-white border-2 border-slate-100 rounded-[1.5rem] font-black text-xs uppercase italic outline-none shadow-sm" placeholder="মডেল সার্চ..." value={prodSearch} onChange={e => setProdSearch(e.target.value)} />
                                 <div className="flex-1 overflow-y-auto custom-scroll space-y-2 pr-2">
                                    {products.filter(p => p.name.toLowerCase().includes(prodSearch.toLowerCase())).map(p => (
                                       <div key={p.id} onClick={() => { if (!bookingCart.find(i => i.product_id === p.id)) setBookingCart([...bookingCart, { product_id: p.id, name: p.name, qty: 1, unitPrice: p.tp, delivered_qty: 0 }]); }} className="p-4 bg-white rounded-[1.5rem] border border-slate-100 hover:border-indigo-400 cursor-pointer flex justify-between items-center group transition-all">
                                          <p className="text-[10px] font-black uppercase italic text-slate-800 truncate pr-4">{p.name}</p>
                                          <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-indigo-600 font-black">+</div>
                                       </div>
                                    ))}
                                 </div>
                              </div>

                              <div className="w-full lg:w-1/2 p-8 bg-white flex flex-col">
                                 <div className="flex-1 overflow-y-auto custom-scroll space-y-3 pr-2 mb-6">
                                    {bookingCart.length === 0 && <div className="h-full flex items-center justify-center text-[10px] font-black uppercase text-slate-300 italic">কার্টে পণ্য যোগ করুন</div>}
                                    {bookingCart.map((it, idx) => (
                                       <div key={it.product_id} className="p-4 bg-slate-50 rounded-[2rem] border border-slate-100 flex items-center justify-between">
                                          <div className="min-w-0 flex-1 pr-4">
                                             <p className="text-[10px] font-black uppercase italic text-slate-800 truncate mb-1">{it.name}</p>
                                             <input type="number" className="w-20 p-2 bg-white border border-slate-200 rounded-lg font-black text-[10px]" value={it.unitPrice} onChange={(e) => { const n = [...bookingCart]; n[idx].unitPrice = Number(e.target.value); setBookingCart(n); }} />
                                          </div>
                                          <div className="flex items-center bg-white rounded-xl p-1 border shadow-inner">
                                             <button onClick={() => { const n = [...bookingCart]; n[idx].qty = Math.max(0, n[idx].qty - 1); setBookingCart(n.filter(i => i.qty > 0)); }} className="w-8 h-8 font-black text-lg text-slate-300">-</button>
                                             <span className="w-10 text-center font-black text-sm">{it.qty}</span>
                                             <button onClick={() => { const n = [...bookingCart]; n[idx].qty++; setBookingCart(n); }} className="w-8 h-8 font-black text-lg text-slate-300">+</button>
                                          </div>
                                       </div>
                                    ))}
                                 </div>

                                 <div className="space-y-6 pt-6 border-t border-slate-100">
                                    <div className="grid grid-cols-2 gap-4">
                                       <div className="space-y-1">
                                          <label className="text-[8px] font-black text-emerald-600 uppercase ml-4 italic">নগদ গ্রহণ (দোকান থেকে)</label>
                                          <input type="number" className="w-full p-4 bg-emerald-50 text-emerald-600 rounded-2xl font-black text-lg italic text-center outline-none border border-emerald-100" placeholder="0" value={form.advance} onChange={e => setForm({ ...form, advance: Number(e.target.value) })} />
                                       </div>
                                       <div className="space-y-1">
                                          <label className="text-[8px] font-black text-blue-600 uppercase ml-4 italic">ব্যাংক গ্রহণ (দোকান থেকে)</label>
                                          <input type="number" className="w-full p-4 bg-blue-50 text-blue-600 rounded-2xl font-black text-lg italic text-center outline-none border border-blue-100" placeholder="0" value={form.bank_deposit} onChange={e => setForm({ ...form, bank_deposit: Number(e.target.value) })} />
                                       </div>
                                    </div>
                                    <button disabled={isSaving || bookingCart.length === 0} onClick={handleAddBooking} className="w-full bg-indigo-600 text-white py-6 rounded-[2.5rem] font-black uppercase text-xs tracking-[0.3em] shadow-xl active:scale-95 transition-all">
                                       {targetBookingId === "NEW" ? "বুকিং চ্যাপ্টার ওপেন করুন ➔" : "আগের বুকিং-এ যোগ করুন ➔"}
                                    </button>
                                 </div>
                              </div>
                           </div>
                        </div>
                     )}
                  </div>
               </div>
            </div>
         )}

         {/* 🔍 DETAIL MODAL */}
         {showDetailModal && selectedBooking && (
            <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[5000] flex flex-col items-center p-4 overflow-y-auto no-print">
               <div className="w-full max-w-4xl flex justify-between items-center mb-6 sticky top-0 z-[5001] bg-slate-900/90 p-6 rounded-[2rem] border border-white/10 shadow-2xl">
                  <button onClick={() => setShowDetailModal(false)} className="text-white font-black uppercase text-[10px] px-6 transition-colors hover:text-indigo-400">← ফিরে যান</button>
                  <div className="flex gap-3">
                     <button disabled={isSaving} onClick={handleUpdateBookingStats} className="bg-emerald-600 text-white px-10 py-4 rounded-xl font-black text-[10px] uppercase shadow-xl transition-all hover:bg-emerald-700">সব আপডেট সেভ করুন ✓</button>
                  </div>
               </div>

               <div className="bg-white rounded-[3rem] w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col mb-20 border-[6px] border-slate-100">
                  <div ref={invoiceRef} className="p-10 md:p-14 bg-white text-black min-h-fit">
                     <div className="text-center border-b-4 border-black pb-8 mb-10">
                        <h1 className="text-4xl font-black uppercase italic tracking-tighter leading-none mb-1 text-indigo-600">IFZA ELECTRONICS</h1>
                        <p className="text-lg font-black uppercase tracking-[0.4em] mb-4 text-black">{company} DIVISION • BOOKING PORTAL</p>
                        <div className="inline-block px-10 py-2 bg-black text-white text-[11px] font-black uppercase rounded-full italic">Booking Sector - Isolated Tracking</div>
                     </div>

                     <div className="flex flex-col md:flex-row justify-between items-start gap-10 mb-12">
                        <div className="space-y-3 flex-1">
                           <p className="text-3xl font-black uppercase italic leading-none">{selectedBooking.customer_name}</p>
                           <p className="text-[14px] font-bold mt-2">📍 {selectedBooking.customer_address} | 📱 {selectedBooking.customer_phone}</p>
                        </div>
                        <div className="text-right space-y-2 w-72 shrink-0">
                           <p className="flex justify-between font-black text-[16px] text-slate-400 border-b pb-2"><span>বুকিং বিল:</span> <span>৳{Number(selectedBooking.total_amount).toLocaleString()}</span></p>
                           <p className="flex justify-between font-black text-[16px] text-emerald-600"><span>বর্তমানে জমা:</span> <span>৳{Number(selectedBooking.advance_amount).toLocaleString()}</span></p>
                           <p className="flex justify-between font-black text-[24px] text-rose-600 border-t-4 border-black pt-3 italic tracking-tighter leading-none mt-2">
                              <span>নিট বকেয়া:</span> <span>৳{(Number(selectedBooking.total_amount) - Number(selectedBooking.advance_amount)).toLocaleString()}</span>
                           </p>
                        </div>
                     </div>

                     <div className="grid grid-cols-3 gap-4 mb-8">
                        <div className="bg-slate-50 p-6 rounded-[2rem] border-2 border-black/5 text-center">
                           <span className="block text-[10px] font-black text-slate-400 uppercase italic mb-1">Items Ordered</span>
                           <span className="text-3xl font-black text-black leading-none">{selectedBooking.items?.reduce((s: any, i: any) => s + i.qty, 0) || 0}</span>
                        </div>
                        <div className="bg-blue-50 p-6 rounded-[2rem] border-2 border-blue-100 text-center">
                           <span className="block text-[10px] font-black text-blue-400 uppercase italic mb-1">Delivered So Far</span>
                           <span className="text-3xl font-black text-blue-600 leading-none">{selectedBooking.items?.reduce((s: any, i: any) => s + (i.delivered_qty || 0), 0) || 0}</span>
                        </div>
                        <div className="bg-rose-50 p-6 rounded-[2rem] border-2 border-rose-100 text-center">
                           <span className="block text-[10px] font-black text-rose-400 uppercase italic mb-1">Remaining Items</span>
                           <span className="text-3xl font-black text-rose-600 leading-none">{(selectedBooking.items?.reduce((s: any, i: any) => s + i.qty, 0) || 0) - (selectedBooking.items?.reduce((s: any, i: any) => s + (i.delivered_qty || 0), 0) || 0)}</span>
                        </div>
                     </div>

                     <div className="mt-4 mb-10 border-[3px] border-black p-6 rounded-[2rem] bg-indigo-50 flex flex-col md:flex-row justify-between items-center gap-6 shadow-sm no-print">
                        <div className="flex flex-col text-center md:text-left">
                           <h3 className="text-[14px] font-black uppercase italic tracking-wider text-indigo-900 border-b-2 border-indigo-200 w-fit">পুরো স্লিপ (Unified Delivery Slip)</h3>
                           <p className="text-[9px] font-bold text-indigo-400 uppercase mt-2">সবগুলো আইটেম এবং আর্থিক হিসেব একসাথে প্রিন্ট করতে এখানে ক্লিক করুন</p>
                        </div>
                        <button
                           onClick={() => {
                              setSelectedSlipData({
                                 ...selectedBooking,
                                 today_delivery_map: deliveryUpdates
                              });
                              setShowSlipModal(true);
                           }}
                           className="w-full md:w-auto bg-slate-900 text-white px-12 py-5 rounded-2xl font-black uppercase text-[12px] tracking-widest hover:bg-slate-700 transition-all shadow-2xl active:scale-95 border-b-4 border-black"
                        >
                           পুরো স্লিপ প্রিন্ট 🖨️
                        </button>
                     </div>

                     <div className="flex-1 overflow-x-auto">
                        <table className="w-full border-collapse border-2 border-black">
                           <thead>
                              <tr className="bg-slate-100 text-[11px] font-black uppercase italic border-b-2 border-black">
                                 <th className="p-4 text-left border-r border-black">পণ্যের নাম</th>
                                 <th className="p-4 text-center border-r border-black w-24">মোট অর্ডার</th>
                                 <th className="p-4 text-center border-r border-black w-20">দর (Rate)</th>
                                 <th className="p-4 text-center border-r border-black w-20 text-blue-600">গেছে (Delv)</th>
                                 <th className="p-4 text-center border-r border-black w-20 text-rose-600">বাকি (Bal)</th>
                                 <th className="p-4 text-right border-r border-black w-28">মোট বিল</th>
                                 <th className="p-4 text-center border-black w-20 no-print-col">মেমো</th>
                              </tr>
                           </thead>
                           <tbody className="text-[14px] font-bold italic">
                              {selectedBooking.items.map((it) => {
                                 const currentQty = orderQtyUpdates[it.id] !== undefined ? orderQtyUpdates[it.id] : it.qty;
                                 return (
                                    <tr key={it.id} className="border-b border-black/30">
                                       <td className="p-4 border-r border-black/30 uppercase">{it.name}</td>
                                       <td className="p-4 border-r border-black/30 text-center">
                                          <div className="flex items-center justify-center gap-3">
                                             <button onClick={() => setOrderQtyUpdates({ ...orderQtyUpdates, [it.id]: Math.max(it.delivered_qty || 0, currentQty - 1) })} className="w-8 h-8 bg-slate-100 rounded-lg font-black text-slate-400">-</button>
                                             <span className="min-w-[30px] font-black text-lg">{currentQty}</span>
                                             <button onClick={() => setOrderQtyUpdates({ ...orderQtyUpdates, [it.id]: currentQty + 1 })} className="w-8 h-8 bg-slate-100 rounded-lg font-black text-slate-400">+</button>
                                          </div>
                                       </td>
                                       <td className="p-4 text-center border-r border-black/30">৳{it.unitPrice}</td>
                                       <td className="p-4 text-center border-r border-black/30 text-blue-600 font-black text-lg">{it.delivered_qty}</td>
                                       <td className="p-4 text-center border-r border-black/30 text-rose-600 font-black text-lg">{currentQty - (it.delivered_qty || 0)}</td>
                                       <td className="p-4 text-right border-r border-black/30">৳{(currentQty * it.unitPrice).toLocaleString()}</td>
                                       <td className="p-2 text-center no-print-col border-black/30">
                                          <button onClick={() => {
                                             const todayDelv = deliveryUpdates[it.id] || 0;
                                             setSelectedSlipData({
                                                ...it,
                                                customer_name: selectedBooking.customer_name,
                                                booking_id: selectedBooking.id,
                                                today_delivery_map: deliveryUpdates,
                                                total_amount: selectedBooking.total_amount,
                                                advance_amount: selectedBooking.advance_amount
                                             });
                                             setShowSlipModal(true);
                                          }} className="bg-slate-900 text-white px-3 py-1.5 rounded text-[8px] font-black uppercase hover:bg-slate-700 transition-colors">স্লিপ 🖨️</button>
                                       </td>
                                    </tr>
                                 );
                              })}
                           </tbody>
                        </table>
                     </div>

                     <div className="mt-14 border-t-2 border-black pt-8 flex justify-between items-end">
                        <div className="space-y-1">
                           <p className="text-[10px] font-black uppercase italic text-slate-400">Isolated Banking Note:</p>
                           <p className="text-[12px] font-bold text-slate-600">বুকিং সেক্টরের অর্থ লেনদেন প্রধান লেজার থেকে আলাদা রাখা হয়েছে।</p>
                        </div>
                        <div className="text-center">
                           <div className="w-48 border-t-2 border-black pt-2 font-black italic text-[14px]">IFZA Authorized</div>
                        </div>
                     </div>
                  </div>

                  <div className="bg-slate-900 p-8 border-t-2 border-white/10 no-print">
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-4">
                           <p className="text-[9px] font-black text-indigo-400 uppercase italic">১. মাল ডেলিভারি এন্ট্রি (গেছে)</p>
                           {selectedBooking.items.map(it => {
                              const currentQty = orderQtyUpdates[it.id] !== undefined ? orderQtyUpdates[it.id] : it.qty;
                              const currentDelivery = deliveryUpdates[it.id] || 0;
                              return (
                                 <div key={it.id} className="bg-white/5 p-3 rounded-xl flex justify-between items-center border border-white/5">
                                    <div className="flex flex-col truncate pr-4">
                                       <span className="text-[9px] font-bold text-white uppercase truncate">{it.name}</span>
                                       <span className="text-[7px] font-black text-rose-400 uppercase italic">বাকি: {currentQty - (it.delivered_qty || 0)}</span>
                                    </div>
                                    <div className="flex items-center gap-3 bg-black/40 p-1 rounded-lg">
                                       <button onClick={() => setDeliveryUpdates({ ...deliveryUpdates, [it.id]: Math.max(0, currentDelivery - 1) })} className="w-7 h-7 text-white">-</button>
                                       <span className="text-white text-xs font-black w-5 text-center">{currentDelivery}</span>
                                       <button onClick={() => { if (currentDelivery + (it.delivered_qty || 0) < currentQty) setDeliveryUpdates({ ...deliveryUpdates, [it.id]: currentDelivery + 1 }); }} className="w-7 h-7 text-white">+</button>
                                    </div>
                                 </div>
                              )
                           })}
                        </div>
                        <div className="space-y-4">
                           <p className="text-[9px] font-black text-emerald-400 uppercase italic">২. নতুন জমা এন্ট্রি (দোকান থেকে)</p>
                           <input type="number" className="w-full p-6 bg-emerald-500/5 text-emerald-400 border border-emerald-500/20 rounded-2xl text-center text-3xl font-black outline-none" placeholder="0.00" value={newCashAmt} onChange={e => setNewCashAmt(e.target.value)} />
                        </div>
                        <div className="flex flex-col justify-center items-center p-8 bg-white/5 rounded-[2.5rem] border border-white/5 text-center">
                           <div className="text-center">
                              <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-4 italic">Dealer Actions</p>
                              <button
                                 onClick={() => handleCompanySettlement(selectedBooking)}
                                 className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-[9px] tracking-widest shadow-xl active:scale-95 transition-all"
                              >
                                 🏦 টাকা কোম্পানিকে দিন
                              </button>
                              <p className="text-[7px] text-slate-500 mt-4 uppercase">টাকা কোম্পানিকে দিলে বুকিং অগ্রিম ০ হবে</p>
                           </div>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
         )}

         {/* 🖨️ SLIP MODAL */}
         {showSlipModal && selectedSlipData && (
            <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[6000] flex flex-col items-center p-4 overflow-y-auto no-print">
               <div className="w-full max-w-[148mm] flex justify-between gap-6 mb-8 sticky top-0 z-[6001] bg-slate-900/90 p-6 rounded-3xl border border-white/10 shadow-2xl items-center">
                  <button onClick={() => setShowSlipModal(false)} className="text-white font-black uppercase text-[10px] px-6">← ফিরে যান</button>
                  <button disabled={isDownloading} onClick={() => handleDownloadPDF(slipRef, 'Booking_Slip')} className="bg-emerald-600 text-white px-10 py-4 rounded-xl font-black text-[10px] uppercase shadow-xl active:scale-95 transition-all">
                     {isDownloading ? "ডাউনলোড..." : "স্লিপ ⬇"}
                  </button>
               </div>

               <div ref={slipRef} className="bg-white mx-auto w-[140mm] p-6 flex flex-col font-sans text-black shadow-2xl border-[3px] border-black">
                  <div className="text-center mb-4 border-b-4 border-black pb-3">
                     <h1 className="text-[28px] font-black uppercase italic tracking-tighter leading-none mb-1">IFZA ELECTRONICS</h1>
                     <p className="text-lg font-black uppercase italic">{company} DIVISION</p>
                     <div className="mt-1 inline-block px-6 py-0.5 bg-black text-white text-[8px] font-black uppercase rounded-full italic">DELIVERY CHALLAN</div>
                  </div>

                  <div className="flex justify-between items-start mb-6 text-[10px] font-bold">
                     <div>
                        <p className="text-[8px] font-black border-b border-black w-fit mb-1 uppercase opacity-60">Customer:</p>
                        <p className="text-xl font-black uppercase italic leading-none">{selectedSlipData.customer_name}</p>
                        <p className="text-[11px] font-bold mt-1">📍 {selectedSlipData.address || selectedBooking.customer_address}</p>
                     </div>
                     <div className="text-right">
                        <p className="text-[8px] font-black border-b border-black w-fit ml-auto mb-1 uppercase opacity-60">Info:</p>
                        <p className="text-[11px] font-black">ID: #{selectedSlipData.booking_id ? String(selectedSlipData.booking_id).slice(-6).toUpperCase() : (selectedSlipData.id ? String(selectedSlipData.id).slice(-6).toUpperCase() : 'N/A')}</p>
                        <p className="text-[11px] font-black">Date: {new Date().toLocaleDateString('bn-BD')}</p>
                     </div>
                  </div>

                  <div className="flex-1">
                     <table className="w-full border-collapse border-2 border-black">
                        <thead>
                           <tr className="bg-black text-white text-[10px] font-black uppercase italic">
                              <th className="p-2 text-left border border-black text-xs">Description</th>
                              <th className="p-2 text-center border border-black w-20 text-xs">Order</th>
                              <th className="p-2 text-center border border-black w-20 text-xs">Prev</th>
                              <th className="p-2 text-center border border-black w-20 bg-blue-600 text-white text-xs">Today</th>
                              <th className="p-2 text-center border border-black w-20 text-xs">Bal</th>
                           </tr>
                        </thead>
                        <tbody>
                           {selectedSlipData.items && Array.isArray(selectedSlipData.items) ? (
                              selectedSlipData.items.map((item: any, idx: number) => {
                                 const todayDelivery = (selectedSlipData.today_delivery_map && selectedSlipData.today_delivery_map[item.id]) || 0;
                                 return (
                                    <tr key={idx} className="border-b border-black text-[13px] font-black italic">
                                       <td className="p-2 uppercase border-r border-black">{item.name}</td>
                                       <td className="p-2 text-right border-r border-black font-black">{item.qty}</td>
                                       <td className="p-2 text-right border-r border-black font-black">{item.delivered_qty}</td>
                                       <td className="p-2 text-right border-r border-black bg-blue-50 font-black text-blue-600">{todayDelivery}</td>
                                       <td className="p-2 text-right font-black text-rose-600">{item.qty - (item.delivered_qty || 0) - todayDelivery}</td>
                                    </tr>
                                 );
                              })
                           ) : (
                              <tr className="border-b border-black text-[13px] font-black italic">
                                 <td className="p-2 uppercase border-r border-black">{selectedSlipData.name}</td>
                                 <td className="p-2 text-right border-r border-black font-black">{selectedSlipData.qty}</td>
                                 <td className="p-2 text-right border-r border-black font-black">{selectedSlipData.delivered_qty || 0}</td>
                                 <td className="p-2 text-right border-r border-black bg-blue-50 font-black text-blue-600">{(selectedSlipData.today_delivery_map && selectedSlipData.today_delivery_map[selectedSlipData.id]) || 0}</td>
                                 <td className="p-2 text-right font-black text-rose-600">{(selectedSlipData.qty || 0) - (selectedSlipData.delivered_qty || 0) - ((selectedSlipData.today_delivery_map && selectedSlipData.today_delivery_map[selectedSlipData.id]) || 0)}</td>
                              </tr>
                           )}
                        </tbody>
                     </table>

                     <div className="mt-8 flex justify-end">
                        <div className="w-1/2 space-y-2 border-2 border-black p-4">
                           <div className="flex justify-between text-[12px] font-black border-b border-black pb-1">
                              <span>TOTAL BILL:</span>
                              <span>৳{Math.round(selectedSlipData.total_amount || 0).toLocaleString()}</span>
                           </div>
                           <div className="flex justify-between text-[12px] font-black border-b border-black pb-1">
                              <span>TOTAL PAID:</span>
                              <span>৳{Math.round(selectedSlipData.advance_amount || 0).toLocaleString()}</span>
                           </div>
                           <div className="flex justify-between text-[16px] font-black">
                              <span>{(selectedSlipData.total_amount - selectedSlipData.advance_amount) >= 0 ? "NET PENDING:" : "EXTRA DEPOSIT:"}</span>
                              <span className={(selectedSlipData.total_amount - selectedSlipData.advance_amount) >= 0 ? "text-rose-600" : "text-emerald-600"}>
                                 ৳{Math.abs(Math.round((selectedSlipData.total_amount || 0) - (selectedSlipData.advance_amount || 0))).toLocaleString()}
                              </span>
                           </div>
                        </div>
                     </div>
                  </div>

                  <div className="mt-20 flex justify-between items-end px-4 mb-4">
                     <div className="text-center w-40 border-t-2 border-black pt-2 font-black italic text-[12px]">Buyer Sign</div>
                     <div className="text-center w-40 border-t-2 border-black pt-2 text-right">
                        <p className="text-[14px] font-black uppercase italic">Authority</p>
                     </div>
                  </div>
               </div>
            </div>
         )}
      </div>
   );
};

export default Bookings;
