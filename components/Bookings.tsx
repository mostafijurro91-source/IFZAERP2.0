import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Company, UserRole, Product, formatCurrency, Booking, BookingItem, User } from '../types';
import { db, supabase, mapToDbCompany } from '../lib/supabase';
import { parseAmount } from '../lib/utils';
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
   const [nextDeliveryCommitment, setNextDeliveryCommitment] = useState<string>("");

   const safeFormat = (val: any) => Math.round(parseAmount(val || 0)).toLocaleString();

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

         const formattedBookings = (bkData || []).map(b => {
            const itemsArr = Array.isArray(b.items) ? b.items : [];
            const metaItem = itemsArr.find((it: any) => it._is_meta || it.id === '_meta_') || {};
            const cleanItems = itemsArr.filter((it: any) => !it._is_meta && it.id !== '_meta_');
            return {
               ...b,
               items: cleanItems,
               delivery_date: metaItem.delivery_date || '',
               payment_history: metaItem.payment_history || [],
               customer_name: b.customers?.name,
               customer_address: b.customers?.address,
               customer_phone: b.customers?.phone
            };
         });

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
         const cleanedCustBookings = (data || []).map((b: any) => {
            const itemsArr = Array.isArray(b.items) ? b.items : [];
            const metaItem = itemsArr.find((it: any) => it._is_meta || it.id === '_meta_') || {};
            const cleanItems = itemsArr.filter((it: any) => !it._is_meta && it.id !== '_meta_');
            return { ...b, items: cleanItems, delivery_date: metaItem.delivery_date || '', payment_history: metaItem.payment_history || [] };
         });
         setActiveBookingsForCust(cleanedCustBookings);
         setTargetBookingId("NEW");
      } catch (err) { setActiveBookingsForCust([]); }
   };

   const handleCompanySettlement = async (b: ExtendedBooking) => {
      if (b.advance_amount <= 0) return alert("এই বুকিংয়ে দোকানদারের কোনো জমা টাকা নেই!");
      const confirmMsg = `আপনি কি দোকানদার ${b.customer_name}-এর জমা ৳${b.advance_amount.toLocaleString()} টাকা ${company}-কে পাঠাতে চান?`;
      if (!confirm(confirmMsg)) return;
      setIsSaving(true);
      try {
         const dbCo = mapToDbCompany(company);
         await supabase.from('company_ledger').insert([{
            company: dbCo, type: 'BANK_TRANSFER', amount: parseAmount(b.advance_amount),
            note: `বুকিং পেমেন্ট টু কোম্পানি: ${b.customer_name}`,
            date: new Date().toISOString().split('T')[0],
         }]);
         await supabase.from('bookings').update({ advance_amount: 0 }).eq('id', b.id);
         alert("সফলভাবে কোম্পানিকে টাকা পাঠানো হয়েছে! ✅");
         fetchData();
      } catch (err: any) { alert("ত্রুটি: " + err.message); } finally { setIsSaving(false); }
   };

   // ✅ ডিলিট ফাংশন (ADMIN Only)
   const handleDeleteBooking = async (bookingId: string, customerName: string) => {
      if (role !== 'ADMIN') return alert("শুধুমাত্র অ্যাডমিন বুকিং ডিলিট করতে পারবেন!");
      if (!confirm(`${customerName}-এর এই বুকিং রেকর্ডটি কি সম্পূর্ণ মুছে ফেলতে চান?`)) return;
      setIsSaving(true);
      try {
         const { error } = await supabase.from('bookings').delete().eq('id', bookingId);
         if (error) throw error;
         alert("বুকিং মুছে ফেলা হয়েছে।");
         fetchData();
      } catch (err) { alert("Error deleting record"); } finally { setIsSaving(false); }
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

         const totalOrdered = updatedItems.reduce((s, i) => s + i.qty, 0);
         const totalDelivered = updatedItems.reduce((s, i) => s + (i.delivered_qty || 0), 0);
         const isAllDelivered = totalOrdered > 0 && totalDelivered >= totalOrdered;

         const newTotal = updatedItems.reduce((s, i) => s + (parseAmount(i.qty || 0) * parseAmount(i.unitPrice || 0)), 0);
         const paymentAmt = (parseAmount(newCashAmt) || 0) + (parseAmount(newBankAmt) || 0);
         const newAdvance = parseAmount(selectedBooking.advance_amount) + paymentAmt;
         const remainingDue = Math.max(0, newTotal - newAdvance);

         const newHistory = [...(selectedBooking.payment_history || [])];
         if (paymentAmt > 0) {
            newHistory.push({
               date: new Date().toISOString().split('T')[0],
               amount: paymentAmt,
               note: parseAmount(newCashAmt) > 0 ? `ক্যাশ জমা ৳${newCashAmt}` : `ব্যাংক জমা ৳${newBankAmt}`,
               method: parseAmount(newCashAmt) > 0 ? 'CASH' : 'BANK'
            });
         }
         const itemsToSave = [...updatedItems, { id: '_meta_', name: 'META_INFO', _is_meta: true, delivery_date: selectedBooking.delivery_date || '', payment_history: newHistory }];

         // ✅ সব মাল ডেলিভারি হলে অটো-ডিলিট কনফার্মেশন
         if (isAllDelivered) {
            if (remainingDue > 0) {
               const proceedDel = confirm(`সতর্কতা: এই বুকিংয়ের এখনও ৳${remainingDue.toLocaleString()} টাকা বাকি রয়েছে! আপনার নিয়ম অনুযায়ী ডেট অনুযায়ী ফুল টাকা জমা নিয়ে মাল ডেলিভারি দেওয়া উচিত। আপনি কি ফুল পেমেন্ট ছাড়াই মাল ডেলিভারি দিতে চান?`);
               if (!proceedDel) { setIsSaving(false); return; }
            }
            const confirmDel = confirm("সব মাল ডেলিভারি হয়েছে, বুকিংটি কি ডিলিট করে দেব? (হিসাব ট্রানজেকশনে জমা থাকবে)");
            if (confirmDel) {
               const { error: delErr } = await supabase.from('bookings').delete().eq('id', selectedBooking.id);
               if (delErr) throw delErr;
               alert("বুকিংটি সফলভাবে ডেলিভারি ও ডিলিট করা হয়েছে! ✅");
               setShowDetailModal(false);
            } else {
               // ডিলিট না করলে শুধু COMPLETED হবে
               await supabase.from('bookings').update({ items: itemsToSave, status: 'COMPLETED', qty: totalOrdered, total_amount: newTotal, advance_amount: newAdvance }).eq('id', selectedBooking.id);
               alert("বুকিং আপডেট সফল হয়েছে! ✅");
            }
         } else {
            await supabase.from('bookings').update({
               items: itemsToSave, total_amount: newTotal, advance_amount: newAdvance,
               qty: totalOrdered, status: 'PARTIAL'
            }).eq('id', selectedBooking.id);
            alert("বুকিং আপডেট সফল হয়েছে! ✅");
         }

         // স্টক আপডেট
         for (const it of selectedBooking.items) {
            const d_qty = deliveryUpdates[it.id] || 0;
            if (d_qty > 0) await supabase.rpc('increment_stock', { row_id: it.id, amt: -d_qty });
         }

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
         const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
         const imgData = canvas.toDataURL('image/jpeg', 0.95);
         const isSlip = filename === 'Booking_Slip';
         const pdf = new jsPDF('p', 'mm', isSlip ? 'a5' : 'a4');
         const pageWidth = pdf.internal.pageSize.getWidth();
         const pageHeight = pdf.internal.pageSize.getHeight();
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
      } catch (err) { alert("PDF ডাউনলোড ব্যর্থ হয়েছে।"); } finally {
         if (parent) parent.style.overflowX = parentOverflow;
         setIsDownloading(false);
      }
   };

   const handleAddBooking = async () => {
      if (!selectedCust || bookingCart.length === 0 || isSaving) return;
      setIsSaving(true);
      try {
         const dbCo = mapToDbCompany(company);
         const newItemsValue = bookingCart.reduce((acc, it) => acc + (parseAmount(it.qty || 0) * parseAmount(it.unitPrice || 0)), 0);
         const newItemsFormatted = bookingCart.map(it => ({
            id: it.product_id, product_id: it.product_id, name: it.name, qty: it.qty, unitPrice: it.unitPrice, delivered_qty: 0
         }));
         const totalInitialDeposit = parseAmount(form.advance) + parseAmount(form.bank_deposit);
         const initialHistory = totalInitialDeposit > 0 ? [{
            date: new Date().toISOString().split('T')[0],
            amount: totalInitialDeposit,
            note: `বুকিং শুরুর অগ্রিম জমা (ক্যাশ: ৳${form.advance || 0}, ব্যাংক: ৳${form.bank_deposit || 0})`,
            method: parseAmount(form.advance) > 0 ? 'CASH' : 'BANK'
         }] : [];

         if (targetBookingId !== "NEW") {
            const existing = activeBookingsForCust.find(b => b.id === targetBookingId);
            const combinedItems = [...(existing.items || []), ...newItemsFormatted];
            const totalOrd = combinedItems.reduce((s, i) => s + i.qty, 0);
            const combHistory = [...(existing.payment_history || []), ...initialHistory];
            const itemsToSave = [...combinedItems, { id: '_meta_', name: 'META_INFO', _is_meta: true, delivery_date: existing.delivery_date || '', payment_history: combHistory }];

            await supabase.from('bookings').update({
               items: itemsToSave, total_amount: parseAmount(existing.total_amount) + newItemsValue,
               advance_amount: parseAmount(existing.advance_amount) + totalInitialDeposit,
               qty: totalOrd, status: 'PARTIAL'
            }).eq('id', targetBookingId);
         } else {
            const itemsToSave = [...newItemsFormatted, { id: '_meta_', name: 'META_INFO', _is_meta: true, delivery_date: '', payment_history: initialHistory }];
            await supabase.from('bookings').insert([{
               customer_id: selectedCust.id, company: dbCo, product_name: newItemsFormatted[0].name,
               qty: newItemsFormatted.reduce((sum, item) => sum + item.qty, 0), items: itemsToSave,
               advance_amount: totalInitialDeposit, total_amount: newItemsValue, status: 'PENDING'
            }]);
         }
         alert(`বুকিং সম্পন্ন হয়েছে! ✅`);
         setShowAddModal(false); setBookingCart([]); setSelectedCust(null); setForm({ advance: 0, bank_deposit: 0 }); setCurrentStep(1); fetchData();
      } catch (err: any) { alert("ত্রুটি: " + err.message); } finally { setIsSaving(false); }
   };

   const uniqueAreas = useMemo(() => Array.from(new Set(customers.map(c => c.address?.trim()).filter(Boolean))).sort() as string[], [customers]);

   return (
      <div className="space-y-6 md:space-y-10 pb-40 animate-reveal text-slate-900 font-sans mt-2">
         {/* SUMMARY CARDS */}
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 no-print px-1">
            <div className="bg-indigo-600 p-6 md:p-8 rounded-[2rem] shadow-xl flex flex-col justify-between text-white relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-bl-[3rem] group-hover:scale-110 transition-transform"></div>
               <p className="text-[9px] font-black text-indigo-100 uppercase tracking-widest mb-1 italic relative z-10">Active Chapter Orders</p>
               <h3 className="text-3xl md:text-4xl font-black italic tracking-tighter relative z-10">{uniqueBookingCustomersCount} <span className="text-xs font-normal uppercase tracking-normal opacity-50">দোকান</span></h3>
            </div>
            <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-between">
               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Total Order Value</p>
               <h3 className="text-2xl md:text-3xl font-black italic tracking-tighter text-slate-900">৳{safeFormat(filteredBookings.reduce((s, b) => s + parseAmount(b.total_amount), 0))}</h3>
            </div>
            <div className="bg-slate-900 p-6 md:p-8 rounded-[2rem] shadow-xl flex flex-col justify-between text-white">
               <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1 italic">Dealer Hand Advance</p>
               <h3 className="text-2xl md:text-3xl font-black italic tracking-tighter text-emerald-400">৳{safeFormat(filteredBookings.reduce((s, b) => s + parseAmount(b.advance_amount), 0))}</h3>
            </div>
            <div className="bg-rose-50 p-6 md:p-8 rounded-[2rem] border border-rose-100 shadow-sm flex flex-col justify-between">
               <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-1 italic">Expected Collection</p>
               <h3 className="text-2xl md:text-3xl font-black italic tracking-tighter text-rose-600">৳{safeFormat(filteredBookings.reduce((s, b) => s + (parseAmount(b.total_amount) - parseAmount(b.advance_amount)), 0))}</h3>
            </div>
         </div>

         {/* HUB HEADER */}
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

         {/* BOOKING LIST */}
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 no-print px-1">
            {loading ? (
               <div className="col-span-full py-40 text-center animate-pulse text-slate-300 font-black italic tracking-widest">বুকিং ডাটা লোড হচ্ছে...</div>
            ) : filteredBookings.map((b, idx) => {
               const totalOrdered = b.items?.reduce((s, i) => s + i.qty, 0) || 0;
               const totalDelivered = b.items?.reduce((s, i) => s + (i.delivered_qty || 0), 0) || 0;
               const deliveryPercent = totalOrdered > 0 ? (totalDelivered / totalOrdered) * 100 : 0;
               const isFull = totalOrdered > 0 && totalDelivered >= totalOrdered;
               const netBalance = b.total_amount - b.advance_amount;
               const isExcess = netBalance < 0;

               return (
                  <div key={b.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-md hover:shadow-2xl transition-all duration-500 group relative flex flex-col justify-between animate-reveal overflow-hidden">
                     <div className="mb-6">
                        <div className="flex justify-between items-start mb-4">
                           <span className={`px-4 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest shadow-sm ${isFull ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-orange-50 text-orange-600 border border-orange-100'}`}>{isFull ? 'সম্পন্ন (FULL)' : 'চলমান (PARTIAL)'}</span>
                           <div className="flex items-center gap-2">
                              <button onClick={() => handleCompanySettlement(b)} title="কোম্পানিকে টাকা পাঠান" className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-lg shadow-sm hover:bg-emerald-600 hover:text-white transition-all active:scale-90">🏦</button>
                              <button onClick={(e) => { e.stopPropagation(); setSelectedSlipData({ ...b, customer_name: b.customer_name, address: b.customer_address, phone: b.customer_phone, booking_id: b.id }); setShowSlipModal(true); }} className="w-9 h-9 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center text-lg shadow-sm hover:bg-slate-900 hover:text-white transition-all active:scale-90">🖨️</button>
                              
                              {/* ডিলিট বাটন - শুধুমাত্র অ্যাডমিন */}
                              {role === 'ADMIN' && (
                                 <button 
                                    onClick={(e) => { 
                                       e.stopPropagation(); 
                                       handleDeleteBooking(b.id, b.customer_name || "গ্রাহক"); 
                                    }} 
                                    className="w-9 h-9 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center text-lg shadow-sm hover:bg-rose-600 hover:text-white transition-all active:scale-90 border border-rose-100"
                                 >
                                    🗑️
                                 </button>
                              )}
                              
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
                           <p className={`text-[8px] font-black uppercase mb-1 italic ${isExcess ? 'text-emerald-500' : 'text-rose-300'}`}>{isExcess ? 'Extra Deposit' : 'Net Pending'}</p>
                           <p className={`text-xl font-black italic leading-none tracking-tighter ${isExcess ? 'text-emerald-600' : 'text-rose-600'}`}>৳{safeFormat(Math.abs(netBalance))}</p>
                        </div>
                     </div>
                  </div>
               );
            })}
         </div>

         {/* ADD BOOKING MODAL */}
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
                              <select className="p-6 bg-white border border-slate-100 rounded-[2.5rem] font-black text-xs uppercase outline-none shadow-sm" value={modalAreaSelection} onChange={e => setModalAreaSelection(e.target.value)}>
                                 <option value="">সকল এরিয়া</option>
                                 {uniqueAreas.map(a => <option key={a} value={a}>{a}</option>)}
                              </select>
                              <input className="p-6 bg-white border border-slate-100 rounded-[2.5rem] font-black text-xs uppercase outline-none shadow-sm" placeholder="দোকান সার্চ..." value={custSearch} onChange={e => setCustSearch(e.target.value)} />
                           </div>
                           <div className="flex-1 overflow-y-auto custom-scroll space-y-3">
                              {customers.filter(c => (!custSearch || c.name.toLowerCase().includes(custSearch.toLowerCase())) && (!modalAreaSelection || c.address === modalAreaSelection)).map(c => (
                                 <div key={c.id} onClick={async () => { setSelectedCust(c); await fetchActiveBookingsForCustomer(c.id); setCurrentStep(2); }} className="p-3 bg-white rounded-3xl border border-slate-100 hover:border-indigo-500 shadow-sm cursor-pointer flex justify-between items-center group">
                                    <div><h4 className="font-black text-slate-800 uppercase italic text-sm">{c.name}</h4><p className="text-[10px] font-bold text-slate-400 mt-2">📍 {c.address}</p></div>
                                    <div className="text-xl">➔</div>
                                 </div>
                              ))}
                           </div>
                        </div>
                     ) : (
                        <div className="flex-1 flex flex-col overflow-hidden">
                           <div className="bg-indigo-50 p-6 flex justify-between items-center gap-4 border-b border-indigo-100">
                              <span className="text-[11px] font-black text-indigo-400 uppercase">সিলেক্টেড: {selectedCust.name}</span>
                              <select className="p-3 bg-white border border-indigo-200 rounded-xl text-[10px] font-black uppercase outline-none shadow-sm" value={targetBookingId} onChange={e => setTargetBookingId(e.target.value)}>
                                 <option value="NEW">নতুন চ্যাপ্টার</option>
                                 {activeBookingsForCust.map(b => (<option key={b.id} value={b.id}>যোগ করুন: #{b.id.slice(-4).toUpperCase()}</option>))}
                              </select>
                           </div>
                           <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                              <div className="w-full lg:w-1/2 p-8 border-r flex flex-col gap-6 bg-slate-50">
                                 <input className="w-full p-4 bg-white border-2 border-slate-100 rounded-[1.5rem] font-black text-xs uppercase italic outline-none shadow-sm" placeholder="মডেল সার্চ..." value={prodSearch} onChange={e => setProdSearch(e.target.value)} />
                                 <div className="flex-1 overflow-y-auto custom-scroll space-y-2">
                                    {products.filter(p => p.name.toLowerCase().includes(prodSearch.toLowerCase())).map(p => (
                                       <div key={p.id} onClick={() => { if (!bookingCart.find(i => i.product_id === p.id)) setBookingCart([...bookingCart, { product_id: p.id, name: p.name, qty: 1, unitPrice: p.tp, delivered_qty: 0 }]); }} className="p-4 bg-white rounded-[1.5rem] border border-slate-100 hover:border-indigo-400 cursor-pointer flex justify-between items-center group">
                                          <p className="text-[10px] font-black uppercase text-slate-800 truncate pr-4">{p.name}</p>
                                          <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-indigo-600 font-black">+</div>
                                       </div>
                                    ))}
                                 </div>
                              </div>
                              <div className="w-full lg:w-1/2 p-8 bg-white flex flex-col">
                                 <div className="flex-1 overflow-y-auto custom-scroll space-y-3 pr-2 mb-4">
                                    {bookingCart.length === 0 ? (
                                       <div className="h-40 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-[2rem] p-6 text-center">
                                          <span className="text-3xl mb-2">🛒</span>
                                          <p className="text-xs font-black uppercase">কোনো প্রোডাক্ট সিলেক্ট করা হয়নি</p>
                                          <p className="text-[10px] font-bold mt-1 text-slate-400">বাম পাশের লিস্ট থেকে প্রোডাক্টে ক্লিক করে কার্টে যোগ করুন</p>
                                       </div>
                                    ) : (
                                       bookingCart.map((it, idx) => (
                                          <div key={it.product_id} className="p-4 bg-slate-50 rounded-[2rem] border border-slate-100 flex items-center justify-between gap-3 shadow-sm hover:border-indigo-200 transition-all">
                                             <div className="min-w-0 flex-1">
                                                <p className="text-[11px] font-black uppercase text-slate-800 truncate mb-1.5" title={it.name}>{it.name}</p>
                                                <div className="flex items-center gap-1.5">
                                                   <span className="text-[10px] font-bold text-slate-500">দর (৳):</span>
                                                   <input 
                                                      type="number" 
                                                      min="0"
                                                      className="w-20 p-1.5 bg-white border border-slate-200 rounded-lg font-black text-[11px] text-indigo-600 outline-none focus:border-indigo-500 shadow-inner" 
                                                      value={it.unitPrice === 0 ? '' : it.unitPrice} 
                                                      placeholder="দর"
                                                      onChange={(e) => { const n = [...bookingCart]; n[idx].unitPrice = parseAmount(e.target.value); setBookingCart(n); }} 
                                                   />
                                                   <span className="text-[10px] font-black text-slate-400 ml-1">মোট: ৳{(it.qty * (it.unitPrice || 0)).toLocaleString()}</span>
                                                </div>
                                             </div>
                                             <div className="flex items-center gap-2">
                                                <div className="flex items-center bg-white rounded-xl p-1 border border-slate-200 shadow-inner gap-1">
                                                   <button onClick={() => { const n = [...bookingCart]; n[idx].qty = Math.max(1, n[idx].qty - 1); setBookingCart(n); }} className="w-7 h-7 font-black text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all">-</button>
                                                   <input 
                                                      type="number" 
                                                      min="1" 
                                                      className="w-14 text-center font-black text-sm bg-indigo-50/50 border border-indigo-200 rounded-lg py-1 outline-none text-indigo-700 shadow-sm" 
                                                      value={it.qty === 0 ? '' : it.qty} 
                                                      placeholder="পরিমাণ"
                                                      onChange={(e) => { 
                                                         const val = Math.max(1, parseInt(e.target.value) || 0); 
                                                         const n = [...bookingCart]; 
                                                         n[idx].qty = val; 
                                                         setBookingCart(n); 
                                                      }} 
                                                   />
                                                   <button onClick={() => { const n = [...bookingCart]; n[idx].qty++; setBookingCart(n); }} className="w-7 h-7 font-black text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all">+</button>
                                                </div>
                                                <button onClick={() => { setBookingCart(bookingCart.filter((_, i) => i !== idx)); }} className="w-8 h-8 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-xl font-black flex items-center justify-center transition-all" title="লিস্ট থেকে বাদ দিন">×</button>
                                             </div>
                                          </div>
                                       ))
                                    )}
                                 </div>

                                 {/* 💰 বুকিং অগ্রিম জমা ও বিলের হিসাব কার্ড */}
                                 <div className="mt-2 pt-4 border-t-2 border-indigo-100 bg-indigo-50/40 p-6 rounded-[2.5rem] space-y-4 shadow-sm">
                                    <div className="border-b border-indigo-100/80 pb-2">
                                       <h3 className="text-xs font-black text-indigo-950 uppercase italic flex items-center gap-2">
                                          <span>💰 বুকিং অগ্রিম জমা ও বিলের হিসাব (Deposit & Bill Summary)</span>
                                       </h3>
                                       <p className="text-[10px] font-bold text-slate-600 mt-1 leading-relaxed">
                                          বুকিং নেওয়ার সময় কাস্টমার যে পরিমাণ টাকা অগ্রিম জমা দিচ্ছেন তা নিচের ক্যাশ বা ব্যাংক অপশনে লিখুন। বাকি টাকা মাল ডেলিভারি নেওয়ার সময় পরিশোধ করতে হবে।
                                       </p>
                                    </div>

                                    {/* বিল ও জমার হিসাব সামারি */}
                                    <div className="bg-white p-3.5 rounded-2xl border border-indigo-100 shadow-sm grid grid-cols-3 gap-2 text-center">
                                       <div>
                                          <p className="text-[9px] font-black text-slate-400 uppercase">মোট অর্ডারের বিল</p>
                                          <p className="text-sm font-black text-slate-800 mt-0.5">
                                             ৳{bookingCart.reduce((sum, item) => sum + (item.qty * (item.unitPrice || 0)), 0).toLocaleString()}
                                          </p>
                                       </div>
                                       <div className="border-x border-slate-100">
                                          <p className="text-[9px] font-black text-emerald-500 uppercase">মোট অগ্রিম জমা</p>
                                          <p className="text-sm font-black text-emerald-600 mt-0.5">
                                             ৳{(parseAmount(form.advance) + parseAmount(form.bank_deposit)).toLocaleString()}
                                          </p>
                                       </div>
                                       <div>
                                          <p className="text-[9px] font-black text-rose-500 uppercase">বাকি থাকবে (Due)</p>
                                          <p className="text-sm font-black text-rose-600 mt-0.5">
                                             ৳{Math.max(0, bookingCart.reduce((sum, item) => sum + (item.qty * (item.unitPrice || 0)), 0) - (parseAmount(form.advance) + parseAmount(form.bank_deposit))).toLocaleString()}
                                          </p>
                                       </div>
                                    </div>

                                    {/* জমা দেওয়ার অপশন */}
                                    <div className="space-y-2">
                                       <p className="text-[10px] font-black text-slate-700 uppercase">টাকা জমা দেওয়ার মাধ্যম ও পরিমাণ লিখুন:</p>
                                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                          <div className="bg-emerald-50/80 p-3 rounded-2xl border border-emerald-200">
                                             <label className="block text-[10px] font-black text-emerald-800 uppercase mb-1 flex items-center justify-between">
                                                <span>💵 ক্যাশ জমা (Cash)</span>
                                                <span className="text-[8px] bg-emerald-200/70 text-emerald-900 px-1.5 py-0.5 rounded font-black">নগদ টাকা</span>
                                             </label>
                                             <input 
                                                type="number" 
                                                min="0"
                                                className="w-full p-2.5 bg-white text-emerald-700 rounded-xl font-black text-sm text-center outline-none border border-emerald-300 shadow-inner focus:ring-2 focus:ring-emerald-400" 
                                                placeholder="ক্যাশ টাকার পরিমাণ..." 
                                                value={form.advance === 0 ? '' : form.advance} 
                                                onChange={e => setForm({ ...form, advance: parseAmount(e.target.value) })} 
                                             />
                                          </div>
                                          <div className="bg-blue-50/80 p-3 rounded-2xl border border-blue-200">
                                             <label className="block text-[10px] font-black text-blue-800 uppercase mb-1 flex items-center justify-between">
                                                <span>🏦 ব্যাংক জমা (Bank)</span>
                                                <span className="text-[8px] bg-blue-200/70 text-blue-900 px-1.5 py-0.5 rounded font-black">ব্যাংক / বিকাশ / নগদ</span>
                                             </label>
                                             <input 
                                                type="number" 
                                                min="0"
                                                className="w-full p-2.5 bg-white text-blue-700 rounded-xl font-black text-sm text-center outline-none border border-blue-300 shadow-inner focus:ring-2 focus:ring-blue-400" 
                                                placeholder="ব্যাংক জমার পরিমাণ..." 
                                                value={form.bank_deposit === 0 ? '' : form.bank_deposit} 
                                                onChange={e => setForm({ ...form, bank_deposit: parseAmount(e.target.value) })} 
                                             />
                                          </div>
                                       </div>
                                    </div>

                                    <button 
                                       disabled={isSaving || bookingCart.length === 0 || bookingCart.some(i => i.qty <= 0)} 
                                       onClick={handleAddBooking} 
                                       className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
                                    >
                                       <span>✅ নতুন বুকিং কনফার্ম ও সেভ করুন ➔</span>
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

         {/* DETAIL MODAL */}
         {showDetailModal && selectedBooking && (
            <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[5000] flex flex-col items-center p-4 overflow-y-auto no-print">
               <div className="w-full max-w-4xl flex justify-between items-center mb-6 sticky top-0 z-[5001] bg-slate-900/90 p-6 rounded-[2rem] border border-white/10 shadow-2xl">
                  <button onClick={() => setShowDetailModal(false)} className="text-white font-black uppercase text-[10px] px-6 transition-colors hover:text-indigo-400">← ফিরে যান</button>
                  <button disabled={isSaving} onClick={handleUpdateBookingStats} className="bg-emerald-600 text-white px-10 py-4 rounded-xl font-black text-[10px] uppercase shadow-xl transition-all hover:bg-emerald-700">সব আপডেট সেভ করুন ✓</button>
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
                           <div className="mt-3 flex items-center gap-3 no-print">
                              <span className="text-[12px] font-black uppercase text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100">📅 ডেলিভারি তারিখ:</span>
                              <input 
                                 type="date" 
                                 className="p-2 border-2 border-indigo-200 rounded-xl text-sm font-black text-slate-800 bg-white shadow-inner" 
                                 value={selectedBooking.delivery_date || ''} 
                                 onChange={(e) => setSelectedBooking({ ...selectedBooking, delivery_date: e.target.value })} 
                              />
                           </div>
                        </div>
                        <div className="text-right space-y-2 w-72 shrink-0">
                           <p className="flex justify-between font-black text-[16px] text-slate-400 border-b pb-2"><span>বুকিং বিল:</span> <span>৳{parseAmount(selectedBooking.total_amount).toLocaleString()}</span></p>
                           <p className="flex justify-between font-black text-[16px] text-emerald-600"><span>বর্তমানে জমা:</span> <span>৳{parseAmount(selectedBooking.advance_amount).toLocaleString()}</span></p>
                           <p className="flex justify-between font-black text-[24px] text-rose-600 border-t-4 border-black pt-3 italic tracking-tighter leading-none mt-2">
                              <span>নিট বকেয়া:</span> <span>৳{(parseAmount(selectedBooking.total_amount) - parseAmount(selectedBooking.advance_amount)).toLocaleString()}</span>
                           </p>
                        </div>
                     </div>
                     <div className="mt-4 mb-10 border-[3px] border-black p-6 rounded-[2rem] bg-indigo-50 flex flex-col md:flex-row justify-between items-center gap-6 shadow-sm no-print">
                        <div className="flex flex-col text-center md:text-left">
                           <h3 className="text-[14px] font-black uppercase italic tracking-wider text-indigo-900 border-b-2 border-indigo-200 w-fit">পুরো স্লিপ (Unified Delivery Slip)</h3>
                           <p className="text-[9px] font-bold text-indigo-400 uppercase mt-2">সবগুলো আইটেম এবং আর্থিক হিসেব একসাথে প্রিন্ট করতে এখানে ক্লিক করুন</p>
                        </div>
                        <button
                           onClick={() => {
                              setSelectedSlipData({ ...selectedBooking, today_delivery_map: deliveryUpdates });
                              setShowSlipModal(true);
                           }}
                           className="w-full md:w-auto bg-slate-900 text-white px-12 py-5 rounded-2xl font-black uppercase text-[12px] tracking-widest hover:bg-slate-700 transition-all shadow-2xl border-b-4 border-black"
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
                                 <th className="p-4 text-center border-r border-black w-20 text-blue-600">গেছে (Delv)</th>
                                 <th className="p-4 text-center border-r border-black w-20 text-rose-600">বাকি (Bal)</th>
                                 <th className="p-4 text-right border-r border-black w-28">মোট বিল</th>
                              </tr>
                           </thead>
                           <tbody className="text-[14px] font-bold italic">
                              {selectedBooking.items.map((it) => {
                                 const currentQty = orderQtyUpdates[it.id] !== undefined ? orderQtyUpdates[it.id] : it.qty;
                                 return (
                                    <tr key={it.id} className="border-b border-black/30">
                                       <td className="p-4 border-r border-black/30 uppercase">{it.name}</td>
                                       <td className="p-4 border-r border-black/30 text-center">
                                          <div className="flex items-center justify-center gap-3 no-print">
                                             <button onClick={() => setOrderQtyUpdates({ ...orderQtyUpdates, [it.id]: Math.max(it.delivered_qty || 0, currentQty - 1) })} className="w-8 h-8 bg-slate-100 rounded-lg">-</button>
                                             <span className="font-black">{currentQty}</span>
                                             <button onClick={() => setOrderQtyUpdates({ ...orderQtyUpdates, [it.id]: currentQty + 1 })} className="w-8 h-8 bg-slate-100 rounded-lg">+</button>
                                          </div>
                                          <span className="only-print">{currentQty}</span>
                                       </td>
                                       <td className="p-4 text-center border-r border-black/30 text-blue-600 font-black">{it.delivered_qty}</td>
                                       <td className="p-4 text-center border-r border-black/30 text-rose-600 font-black">{currentQty - (it.delivered_qty || 0)}</td>
                                       <td className="p-4 text-right border-r border-black/30">৳{(currentQty * it.unitPrice).toLocaleString()}</td>
                                    </tr>
                                 );
                              })}
                           </tbody>
                        </table>
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
                           <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-4 italic">Dealer Actions</p>
                           <button onClick={() => handleCompanySettlement(selectedBooking)} className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-[9px] tracking-widest shadow-xl transition-all">🏦 টাকা কোম্পানিকে দিন</button>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
         )}

         {/* SLIP MODAL */}
         {showSlipModal && selectedSlipData && (() => {
            const totalOrderQty = (selectedSlipData.items || []).reduce((s: number, it: any) => s + parseAmount(it.qty || 0), 0);
            const totalPrevDel = (selectedSlipData.items || []).reduce((s: number, it: any) => s + parseAmount(it.delivered_qty || 0), 0);
            const totalTodayDel = (selectedSlipData.items || []).reduce((s: number, it: any) => s + parseAmount((selectedSlipData.today_delivery_map && selectedSlipData.today_delivery_map[it.id]) || 0), 0);
            const totalRemQty = Math.max(0, totalOrderQty - totalPrevDel - totalTodayDel);

            return (
               <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[6000] flex flex-col items-center p-4 overflow-y-auto no-print">
                  <div className="w-full max-w-[148mm] flex flex-wrap justify-between gap-4 mb-8 sticky top-0 z-[6001] bg-slate-900/95 p-6 rounded-3xl border border-white/10 shadow-2xl items-center">
                     <button onClick={() => setShowSlipModal(false)} className="text-white font-black uppercase text-[10px] px-5 py-2.5 bg-white/10 rounded-xl hover:bg-white/20 transition-all">← ফিরে যান</button>
                     {totalRemQty > 0 && (
                        <div className="flex items-center gap-2 bg-slate-800 px-3.5 py-2 rounded-xl border border-amber-500/40 flex-1 min-w-[220px]">
                           <span className="text-[10px] font-black uppercase text-amber-400 shrink-0">⏰ পরবর্তী ডেলিভারি সময়:</span>
                           <input 
                              type="text" 
                              placeholder="যেমন: ২৫ জুলাই, বিকেল ৫টা" 
                              className="bg-slate-900 text-white font-bold text-xs px-2.5 py-1 rounded-lg border border-white/20 outline-none w-full focus:border-amber-400"
                              value={nextDeliveryCommitment} 
                              onChange={e => setNextDeliveryCommitment(e.target.value)} 
                           />
                        </div>
                     )}
                     <button disabled={isDownloading} onClick={() => handleDownloadPDF(slipRef, 'Booking_Slip')} className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-black text-[10px] uppercase shadow-xl hover:bg-emerald-500 transition-all shrink-0">স্লিপ ⬇</button>
                  </div>
                  <div ref={slipRef} className="bg-white mx-auto w-[140mm] p-6 flex flex-col font-sans text-black shadow-2xl border-[3px] border-black">
                     {/* UPPER PART - MAIN BILL & CHALLAN */}
                     <div className="text-center mb-4 border-b-4 border-black pb-3">
                        <h1 className="text-[26px] font-black uppercase italic tracking-tighter leading-none mb-1">IFZA ELECTRONICS</h1>
                        <p className="text-md font-black uppercase italic">{company} DIVISION</p>
                        <div className="mt-1 inline-block px-5 py-0.5 bg-black text-white text-[8px] font-black uppercase rounded-full italic">DELIVERY CHALLAN & BILL</div>
                     </div>
                     <div className="flex justify-between items-start mb-4 text-[10px] font-bold">
                        <div>
                           <p className="text-[8px] font-black border-b border-black w-fit mb-1 uppercase opacity-60">Customer Info:</p>
                           <p className="text-lg font-black uppercase italic leading-none">{selectedSlipData.customer_name}</p>
                           <p className="text-[10px] font-bold mt-1">📍 {selectedSlipData.address || selectedBooking?.customer_address || 'N/A'}</p>
                           <p className="text-[10px] font-bold">📞 {selectedSlipData.phone || selectedBooking?.customer_phone || 'N/A'}</p>
                        </div>
                        <div className="text-right">
                           <p className="text-[11px] font-black">ID: #{String(selectedSlipData.booking_id || 'N/A').slice(-6).toUpperCase()}</p>
                           <p className="text-[10px] font-black">Date: {new Date().toLocaleDateString('bn-BD')}</p>
                           {selectedSlipData.delivery_date && <p className="text-[10px] font-black text-indigo-600">Target Delv: {selectedSlipData.delivery_date}</p>}
                        </div>
                     </div>
                     <table className="w-full border-collapse border-2 border-black mb-4">
                        <thead>
                           <tr className="bg-black text-white text-[9px] font-black uppercase italic">
                              <th className="p-1.5 text-left border border-black">Description</th>
                              <th className="p-1.5 text-center border border-black w-12">Order</th>
                              <th className="p-1.5 text-center border border-black w-12">Prev</th>
                              <th className="p-1.5 text-center border border-black w-12 bg-blue-600">Today</th>
                              <th className="p-1.5 text-center border border-black w-12">Bal</th>
                              <th className="p-1.5 text-right border border-black w-20">Amount</th>
                           </tr>
                        </thead>
                        <tbody>
                           {(selectedSlipData.items || []).map((item: any, idx: number) => {
                              const todayDelivery = (selectedSlipData.today_delivery_map && selectedSlipData.today_delivery_map[item.id]) || 0;
                              const bal = item.qty - (item.delivered_qty || 0) - todayDelivery;
                              return (
                                 <tr key={idx} className="border-b border-black text-[11px] font-black italic">
                                    <td className="p-1.5 uppercase border-r border-black">{item.name}</td>
                                    <td className="p-1.5 text-center border-r border-black">{item.qty}</td>
                                    <td className="p-1.5 text-center border-r border-black text-slate-500">{item.delivered_qty}</td>
                                    <td className="p-1.5 text-center border-r border-black bg-blue-50 text-blue-600 font-black">{todayDelivery}</td>
                                    <td className={`p-1.5 text-center border-r border-black ${bal > 0 ? 'text-rose-600 font-black' : 'text-emerald-600'}`}>{bal}</td>
                                    <td className="p-1.5 text-right">৳{(item.qty * (item.unitPrice || 0)).toLocaleString()}</td>
                                 </tr>
                              );
                           })}
                        </tbody>
                     </table>

                     <div className="grid grid-cols-2 gap-4 my-2">
                        <div className="border-2 border-black p-3 space-y-1 bg-slate-50 flex flex-col justify-between">
                           <div>
                              <p className="text-[9px] font-black uppercase text-slate-500 border-b border-black/20 pb-0.5 mb-1">📦 পণ্য ডেলিভারি সামারি (Pieces Summary)</p>
                              <div className="flex justify-between text-[11px] font-bold"><span>মোট অর্ডার (Total Order):</span><span>{totalOrderQty} Pcs</span></div>
                              <div className="flex justify-between text-[11px] font-black text-blue-600"><span>আজ ডেলিভারি হচ্ছে (Today):</span><span>{totalTodayDel} Pcs</span></div>
                              <div className="flex justify-between text-[12px] font-black text-rose-600 border-t border-black/10 pt-0.5 mt-0.5"><span>অবশিষ্ট পাওনা (Remaining):</span><span>{totalRemQty} Pcs</span></div>
                           </div>
                           {totalRemQty > 0 && (
                              <div className="mt-2 pt-1.5 border-t border-black/30 text-[9px] text-indigo-900 font-black leading-tight bg-amber-100 p-1 border border-amber-300">
                                 ⏰ পরবর্তী ডেলিভারির সময়:<br/>
                                 <span className="text-[10px] text-rose-700 underline">{nextDeliveryCommitment || '_______________________'}</span>
                              </div>
                           )}
                        </div>
                        <div className="border-2 border-black p-3 space-y-1 flex flex-col justify-between">
                           <div>
                              <p className="text-[9px] font-black uppercase text-slate-500 border-b border-black/20 pb-0.5 mb-1">💰 আর্থিক হিসাব (Financials)</p>
                              <div className="flex justify-between text-[11px] font-black"><span>TOTAL BILL:</span><span>৳{parseAmount(selectedSlipData.total_amount).toLocaleString()}</span></div>
                              <div className="flex justify-between text-[11px] font-black text-emerald-600"><span>TOTAL PAID:</span><span>৳{parseAmount(selectedSlipData.advance_amount).toLocaleString()}</span></div>
                           </div>
                           <div className="flex justify-between text-[14px] font-black border-t-2 border-black pt-1 mt-1"><span>NET PENDING:</span><span className="text-rose-600">৳{Math.abs(parseAmount(selectedSlipData.total_amount) - parseAmount(selectedSlipData.advance_amount)).toLocaleString()}</span></div>
                        </div>
                     </div>

                     <div className="mt-6 flex justify-between items-end px-2 mb-2">
                        <div className="text-center w-36 border-t-2 border-black pt-1 font-black italic text-[11px]">Buyer Signature</div>
                        <div className="text-center w-36 border-t-2 border-black pt-1 text-right font-black uppercase italic text-[11px]">Authority Sign</div>
                     </div>

                     {/* CUT-OFF LINE */}
                     <div className="my-5 border-t-2 border-dashed border-black flex items-center justify-between text-[8px] font-black text-slate-500 uppercase tracking-widest pt-1">
                        <span>✂️ এখান থেকে কেটে নিচের অংশ দোকানে রাখুন (Cut here for store record) ✂️</span>
                     </div>

                     {/* BOTTOM RECEIPT ACKNOWLEDGMENT SECTION */}
                     <div className="border-[2px] border-black p-4 bg-slate-50/50">
                        <div className="flex justify-between items-center border-b-2 border-black pb-2 mb-2">
                           <div>
                              <h3 className="text-[14px] font-black uppercase italic leading-none text-black">মাল প্রাপ্তি স্বীকারপত্র</h3>
                              <p className="text-[8px] font-black uppercase text-slate-500 mt-0.5">GOODS RECEIVED ACKNOWLEDGMENT (STORE COPY)</p>
                           </div>
                           <div className="text-right text-[10px] font-black">
                              <p>ID: #{String(selectedSlipData.booking_id || 'N/A').slice(-6).toUpperCase()}</p>
                              <p>Date: {new Date().toLocaleDateString('bn-BD')}</p>
                           </div>
                        </div>
                        
                        <div className="text-[11px] font-bold space-y-1 mb-2">
                           <p><span className="text-slate-500">গ্রাহকের নাম:</span> <span className="font-black uppercase">{selectedSlipData.customer_name}</span> ({selectedSlipData.phone || 'N/A'})</p>
                           <div className="grid grid-cols-2 gap-2 bg-white p-2 border border-black text-center my-2">
                              <div className="border-r border-black">
                                 <span className="text-[8px] text-slate-500 block font-bold uppercase">আজ বুঝে পেলাম (Received Today)</span>
                                 <span className="text-[15px] font-black text-blue-600">{totalTodayDel} পিস</span>
                              </div>
                              <div>
                                 <span className="text-[8px] text-slate-500 block font-bold uppercase">অবশিষ্ট পাওনা রইল (Remaining Balance)</span>
                                 <span className="text-[15px] font-black text-rose-600">{totalRemQty} পিস</span>
                              </div>
                           </div>
                           {totalRemQty > 0 && (
                              <p className="bg-amber-100 p-1.5 border border-amber-300 text-[10px] font-black text-amber-900 text-center">
                                 ⏰ পরবর্তী ডেলিভারি নেওয়ার নির্ধারিত সময়: <span className="underline">{nextDeliveryCommitment || '_________________________________'}</span>
                              </p>
                           )}
                        </div>

                        <div className="mt-8 flex justify-between items-end">
                           <p className="text-[9px] font-bold italic text-slate-500 max-w-[180px] leading-tight">
                              আমি উক্ত পণ্যসমূহ সঠিকভাবে এবং অক্ষত অবস্থায় বুঝে পেলাম।
                           </p>
                           <div className="text-center w-40 border-t-2 border-black pt-1 font-black italic text-[11px]">
                              গ্রাহকের স্বাক্ষর ও তারিখ (Sign)
                           </div>
                        </div>
                     </div>
                  </div>
               </div>
            );
         })()}
      </div>
   );
};

export default Bookings;
