
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

  // Helper for number formatting
  const safeFormat = (val: any) => Math.round(Number(val || 0)).toLocaleString();

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('booking-sync-isolated-v3')
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

  const totalPendingPieces = useMemo(() => {
    return filteredBookings.reduce((sum, b) => {
      const ord = b.items?.reduce((s, i) => s + i.qty, 0) || 0;
      const del = b.items?.reduce((s, i) => s + (i.delivered_qty || 0), 0) || 0;
      return sum + Math.max(0, ord - del);
    }, 0);
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
           <p className="text-[9px] font-black text-indigo-100 uppercase tracking-widest mb-1 italic relative z-10">বাকি মালের মোট সংখ্যা</p>
           <h3 className="text-3xl md:text-4xl font-black italic tracking-tighter relative z-10">{totalPendingPieces} <span className="text-xs font-normal uppercase tracking-normal opacity-50">পিস</span></h3>
        </div>
        <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-between">
           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Total Order Value</p>
           <h3 className="text-2xl md:text-3xl font-black italic tracking-tighter text-slate-900">৳{safeFormat(filteredBookings.reduce((s, b) => s + Number(b.total_amount), 0))}</h3>
        </div>
        <div className="bg-slate-900 p-6 md:p-8 rounded-[2rem] shadow-xl flex flex-col justify-between text-white">
           <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1 italic">বুকিং জমা (Dealer Hand)</p>
           <h3 className="text-2xl md:text-3xl font-black italic tracking-tighter text-emerald-400">৳{safeFormat(filteredBookings.reduce((s, b) => s + Number(b.advance_amount), 0))}</h3>
        </div>
        <div className="bg-rose-50 p-6 md:p-8 rounded-[2rem] border border-rose-100 shadow-sm flex flex-col justify-between">
           <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-1 italic">নিট বকেয়া টাকা</p>
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
            
            const isFull = totalOrdered > 0 && totalDelivered >= totalOrdered;
            const netBalance = b.total_amount - b.advance_amount;
            const isExcess = netBalance < 0;

            return (
            <div key={b.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-md hover:shadow-2xl transition-all duration-500 group relative flex flex-col justify-between animate-reveal overflow-hidden" style={{ animationDelay: `${idx * 0.05}s` }}>
               <div className="mb-6">
                  <div className="flex justify-between items-start mb-4">
                     <span className={`px-4 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest shadow-sm ${
                       isFull ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-orange-50 text-orange-600 border border-orange-100'
                     }`}>{isFull ? 'সম্পন্ন (FULL)' : 'চলমান (PARTIAL)'}</span>
                     <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleCompanySettlement(b)}
                          title="কোম্পানিকে টাকা পাঠান"
                          className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-lg shadow-sm hover:bg-emerald-600 hover:text-white transition-all active:scale-90"
                        >
                          🏦
                        </button>
                        <span className="text-[9px] font-black text-slate-300">#{b.id.slice(-4).toUpperCase()}</span>
                     </div>
                  </div>
                  <h4 onClick={() => { setSelectedBooking(b); setShowDetailModal(true); }} className="font-black text-slate-800 text-lg uppercase italic leading-tight truncate mb-2 group-hover:text-indigo-600 transition-colors cursor-pointer">{b.customer_name}</h4>
                  
                  {/* 📦 QUANTITY STATS */}
                  <div className="grid grid-cols-3 gap-2 mt-4 bg-slate-50 p-3 rounded-2xl border border-slate-100 shadow-inner">
                     <div className="text-center">
                        <p className="text-[7px] font-black text-slate-400 uppercase italic">অর্ডার</p>
                        <p className="text-[13px] font-black italic">{totalOrdered}</p>
                     </div>
                     <div className="text-center border-x border-slate-200">
                        <p className="text-[7px] font-black text-emerald-500 uppercase italic">গেছে</p>
                        <p className="text-[13px] font-black italic text-emerald-600">{totalDelivered}</p>
                     </div>
                     <div className="text-center">
                        <p className="text-[7px] font-black text-rose-500 uppercase italic">বাকি</p>
                        <p className={`text-[13px] font-black italic ${remainingQty > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{remainingQty}</p>
                     </div>
                  </div>
               </div>

               <div className="mb-8 space-y-2 px-1">
                  <div className="flex justify-between text-[8px] font-black uppercase italic text-slate-400">
                     <span>ডেলিভারি প্রগতি</span>
                     <span className={isFull ? 'text-emerald-500' : 'text-indigo-500'}>{totalDelivered} / {totalOrdered} Pcs</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                     <div className={`h-full transition-all duration-1000 ${isFull ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${deliveryPercent}%` }}></div>
                  </div>
               </div>

               <div className="flex justify-between items-end border-t pt-6">
                  <div>
                    <p className="text-[8px] font-black text-slate-300 uppercase mb-1 italic">বুকিং বিল</p>
                    <p className="text-xl font-black italic text-slate-900 leading-none tracking-tighter">৳{safeFormat(b.total_amount)}</p>
                  </div>
                  <div className="text-right">
                     <p className={`text-[8px] font-black uppercase mb-1 italic ${isExcess ? 'text-emerald-500 animate-pulse' : 'text-rose-300'}`}>
                        {isExcess ? 'Extra Deposit' : 'বাকি টাকা'}
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

      {/* ➕ ADD BOOKING MODAL (Existing logic remains) */}
      {/* ... */}

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
                    <div className="inline-block px-10 py-2 bg-black text-white text-[11px] font-black uppercase rounded-full italic">Remaining Quantity & Balance Tracking</div>
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

                 <table className="w-full border-collapse border-2 border-black">
                    <thead>
                       <tr className="bg-slate-100 text-[11px] font-black uppercase italic border-b-2 border-black">
                          <th className="p-4 text-left border-r border-black">পণ্যের নাম</th>
                          <th className="p-4 text-center border-r border-black w-24">অর্ডার পিস</th>
                          <th className="p-4 text-center border-r border-black w-24 text-emerald-600">গেছে</th>
                          <th className="p-4 text-center border-r border-black w-24 text-rose-600">বাকি (পিস)</th>
                          <th className="p-4 text-right border-black w-28">মূল্য (Total)</th>
                       </tr>
                    </thead>
                    <tbody className="text-[14px] font-bold italic">
                       {selectedBooking.items.map((it) => {
                          const currentQty = orderQtyUpdates[it.id] !== undefined ? orderQtyUpdates[it.id] : it.qty;
                          const currentDelivered = (it.delivered_qty || 0) + (deliveryUpdates[it.id] || 0);
                          const remainingItemQty = Math.max(0, currentQty - currentDelivered);
                          
                          return (
                          <tr key={it.id} className="border-b border-black/30">
                             <td className="p-4 border-r border-black/30 uppercase">
                                {it.name}
                                <div className="md:hidden mt-2 flex gap-4">
                                   <div className="flex items-center gap-2">
                                      <button onClick={() => setOrderQtyUpdates({...orderQtyUpdates, [it.id]: Math.max(it.delivered_qty || 0, currentQty - 1)})} className="w-6 h-6 bg-slate-100 rounded flex items-center justify-center">-</button>
                                      <span>Ord: {currentQty}</span>
                                      <button onClick={() => setOrderQtyUpdates({...orderQtyUpdates, [it.id]: currentQty + 1})} className="w-6 h-6 bg-slate-100 rounded flex items-center justify-center">+</button>
                                   </div>
                                </div>
                             </td>
                             <td className="p-4 border-r border-black/30 text-center hidden md:table-cell">
                                <div className="flex items-center justify-center gap-3">
                                   <button onClick={() => setOrderQtyUpdates({...orderQtyUpdates, [it.id]: Math.max(it.delivered_qty || 0, currentQty - 1)})} className="w-8 h-8 bg-slate-100 rounded-lg font-black text-slate-400">-</button>
                                   <span className="min-w-[30px] font-black text-lg">{currentQty}</span>
                                   <button onClick={() => setOrderQtyUpdates({...orderQtyUpdates, [it.id]: currentQty + 1})} className="w-8 h-8 bg-slate-100 rounded-lg font-black text-slate-400">+</button>
                                </div>
                             </td>
                             <td className="p-4 text-center border-r border-black/30 text-emerald-600 font-black text-lg">{currentDelivered}</td>
                             <td className={`p-4 text-center border-r border-black/30 font-black text-lg ${remainingItemQty > 0 ? 'text-rose-600 bg-rose-50/50' : 'text-slate-300'}`}>{remainingItemQty}</td>
                             <td className="p-4 text-right">৳{(currentQty * it.unitPrice).toLocaleString()}</td>
                          </tr>
                          );
                       })}
                    </tbody>
                 </table>
              </div>

              <div className="bg-slate-900 p-8 border-t-2 border-white/10 no-print">
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-4">
                       <p className="text-[9px] font-black text-indigo-400 uppercase italic">১. নতুন মাল ডেলিভারি দিন</p>
                       {selectedBooking.items.map(it => {
                         const currentQty = orderQtyUpdates[it.id] !== undefined ? orderQtyUpdates[it.id] : it.qty;
                         const currentDelivery = deliveryUpdates[it.id] || 0;
                         const remainingForThisItem = currentQty - (it.delivered_qty || 0);
                         
                         return (
                           <div key={it.id} className="bg-white/5 p-3 rounded-xl flex justify-between items-center border border-white/5">
                              <div className="min-w-0 pr-4">
                                 <span className="text-[9px] font-bold text-white uppercase truncate block">{it.name}</span>
                                 <span className="text-[7px] text-rose-400 font-black uppercase">বাকি: {remainingForThisItem} Pcs</span>
                              </div>
                              <div className="flex items-center gap-3 bg-black/40 p-1 rounded-lg">
                                 <button onClick={() => setDeliveryUpdates({...deliveryUpdates, [it.id]: Math.max(0, currentDelivery - 1)})} className="w-7 h-7 text-white font-black">-</button>
                                 <span className="text-white text-xs font-black w-5 text-center">{currentDelivery}</span>
                                 <button onClick={() => { if (currentDelivery < remainingForThisItem) setDeliveryUpdates({...deliveryUpdates, [it.id]: currentDelivery + 1}); }} className="w-7 h-7 text-white font-black">+</button>
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
                          <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-4 italic">অ্যাকশন</p>
                          <button 
                            onClick={() => handleCompanySettlement(selectedBooking)}
                            className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-[9px] tracking-widest shadow-xl active:scale-95 transition-all"
                          >
                            🏦 কোম্পানিকে টাকা দিন
                          </button>
                          <p className="text-[7px] text-slate-500 mt-4 uppercase">টাকা কোম্পানিকে দিলে কাস্টমারের অগ্রিম ০ হবে</p>
                       </div>
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
