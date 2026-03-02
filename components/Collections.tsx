
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Company, User, formatCurrency } from '../types';
import { supabase, mapToDbCompany, db } from '../lib/supabase';

interface CollectionsProps {
   company: Company;
   user: User;
}

interface MultiBalance {
   reg: number;
   book: number;
}

const Collections: React.FC<CollectionsProps> = ({ company, user }) => {
   const [pendingRequests, setPendingRequests] = useState<any[]>([]);
   const [confirmedToday, setConfirmedToday] = useState<any[]>([]);
   const [customers, setCustomers] = useState<any[]>([]);
   const [loading, setLoading] = useState(true);
   const [isSaving, setIsSaving] = useState(false);

   const [selectedArea, setSelectedArea] = useState("");
   const [areaSearch, setAreaSearch] = useState("");
   const [showAreaDropdown, setShowAreaDropdown] = useState(false);
   const dropdownRef = useRef<HTMLDivElement>(null);
   const [selectedCust, setSelectedCust] = useState<any>(null);
   const [targetCompany, setTargetCompany] = useState<Company>(user.role === 'STAFF' ? user.company : 'SQ Cables');
   const [amount, setAmount] = useState<string>("");
   const [collectionType, setCollectionType] = useState<'REGULAR' | 'BOOKING'>('REGULAR');

   useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
         if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
            setShowAreaDropdown(false);
         }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
   }, []);

   const [custBalances, setCustBalances] = useState<Record<string, MultiBalance>>({
      'Transtec': { reg: 0, book: 0 },
      'SQ Light': { reg: 0, book: 0 },
      'SQ Cables': { reg: 0, book: 0 }
   });

   const [globalStats, setGlobalStats] = useState({ todayTotal: 0, transtec: 0, sqLight: 0, sqCables: 0, pendingTotal: 0 });

   const isAdmin = user.role === 'ADMIN';
   const isStaff = user.role === 'STAFF';

   useEffect(() => { fetchData(); }, [user.company]);
   useEffect(() => {
      if (selectedCust) fetchCustomerBalances(selectedCust.id);
      else setCustBalances({
         'Transtec': { reg: 0, book: 0 },
         'SQ Light': { reg: 0, book: 0 },
         'SQ Cables': { reg: 0, book: 0 }
      });
   }, [selectedCust]);

   const fetchData = async () => {
      setLoading(true);
      try {
         const today = new Date().toISOString().split('T')[0];
         const dbUserCompany = mapToDbCompany(user.company);
         const [custRes, reqRes, txRes] = await Promise.all([
            db.getCustomers(),
            supabase.from('collection_requests').select('*, customers(name, address, phone)').eq('status', 'PENDING').order('created_at', { ascending: false }),
            supabase.from('transactions').select('*, customers(name)').gte('created_at', today + 'T00:00:00.000Z').order('created_at', { ascending: false })
         ]);

         setCustomers(custRes || []);
         let filteredRequests = reqRes.data || [];
         if (isStaff) filteredRequests = filteredRequests.filter(r => r.company === dbUserCompany);
         setPendingRequests(filteredRequests);

         let confirmed = (txRes.data || []).filter(tx => tx.payment_type === 'COLLECTION');
         if (isStaff) confirmed = confirmed.filter(tx => tx.company === dbUserCompany);
         setConfirmedToday(confirmed);

         let t_tr = 0, t_sl = 0, t_sc = 0;
         txRes.data?.forEach(tx => {
            const amt = Number(tx.amount) || 0;
            const co = mapToDbCompany(tx.company);
            if (tx.payment_type === 'COLLECTION') {
               if (co === 'Transtec') t_tr += amt;
               else if (co === 'SQ Light') t_sl += amt;
               else if (co === 'SQ Cables') t_sc += amt;
            }
         });
         setGlobalStats({
            todayTotal: t_tr + t_sl + t_sc, transtec: t_tr, sqLight: t_sl, sqCables: t_sc,
            pendingTotal: filteredRequests.reduce((sum: number, r: any) => sum + Number(r.amount), 0)
         });
      } finally { setLoading(false); }
   };

   const fetchCustomerBalances = async (customerId: string) => {
      try {
         const { data: txs } = await supabase.from('transactions').select('amount, company, payment_type, meta, items').eq('customer_id', customerId);
         const newBalances: Record<string, MultiBalance> = {
            'Transtec': { reg: 0, book: 0 },
            'SQ Light': { reg: 0, book: 0 },
            'SQ Cables': { reg: 0, book: 0 }
         };

         txs?.forEach(tx => {
            const amt = Number(tx.amount);
            const dbCo = mapToDbCompany(tx.company);
            const isBooking = tx.meta?.is_booking === true || tx.items?.[0]?.note?.includes('বুকিং');

            if (newBalances[dbCo]) {
               if (tx.payment_type === 'COLLECTION') {
                  if (isBooking) newBalances[dbCo].book += amt;
                  else newBalances[dbCo].reg -= amt;
               } else if (tx.payment_type === 'DUE') {
                  newBalances[dbCo].reg += amt;
               }
            }
         });
         setCustBalances(newBalances);
      } catch (err) { }
   };

   const handleManualSubmit = async () => {
      if (!selectedCust || !amount || Number(amount) <= 0) return alert("দোকান এবং সঠিক অ্যামাউন্ট দিন!");
      setIsSaving(true);
      try {
         const submissionTag = collectionType === 'BOOKING' ? `[BOOKING] ${user.name}` : user.name;
         const { error } = await supabase.from('collection_requests').insert([{
            customer_id: selectedCust.id,
            company: mapToDbCompany(targetCompany),
            amount: Number(amount),
            submitted_by: submissionTag,
            status: 'PENDING'
         }]);
         if (error) throw error;
         setAmount("");
         alert("কালেকশন রিকোয়েস্ট পাঠানো হয়েছে! ✅");
         fetchData();
      } catch (err: any) { alert("ত্রুটি: " + err.message); } finally { setIsSaving(false); }
   };

   const handleApprove = async (req: any) => {
      if (!isAdmin || isSaving) return;
      setIsSaving(true);
      try {
         const isBooking = req.submitted_by?.includes('[BOOKING]');
         const cleanSubmittedBy = req.submitted_by?.replace('[BOOKING] ', '');
         const { data: txData, error: txErr } = await supabase.from('transactions').insert([{
            customer_id: req.customer_id, company: req.company, amount: Number(req.amount),
            payment_type: 'COLLECTION', submitted_by: user.name, meta: { is_booking: isBooking },
            items: [{ note: isBooking ? `📅 বুকিং অগ্রিম জমা (${cleanSubmittedBy})` : `💰 নগদ আদায় অনুমোদন (${cleanSubmittedBy})` }]
         }]).select().single();
         if (txErr) throw txErr;
         const txIdShort = String(txData.id).slice(-6).toUpperCase();
         await supabase.from('notifications').insert([{
            customer_id: req.customer_id, title: isBooking ? `বুকিং জমা #${txIdShort}` : `কালেকশন জমা #${txIdShort}`,
            message: `৳${Number(req.amount).toLocaleString()} ${isBooking ? 'বুকিং জমা' : 'হিসেবে গ্রহণ'} হয়েছে। (${req.company})`,
            type: 'PAYMENT'
         }]);
         await supabase.from('collection_requests').delete().eq('id', req.id);
         fetchData();
      } catch (err: any) { alert("ত্রুটি: " + err.message); } finally { setIsSaving(false); }
   };

   const handleDeleteTransaction = async (tx: any) => {
      if (!isAdmin && !isStaff) return;
      const txIdShort = String(tx.id).slice(-6).toUpperCase();
      if (!confirm(`আপনি কি নিশ্চিত এই জমার এন্ট্রিটি (#${txIdShort}) ডিলিট করতে চান?`)) return;

      setIsSaving(true);
      try {
         await supabase.from('notifications').delete().eq('customer_id', tx.customer_id).ilike('message', `%#${txIdShort}%`);
         const { error } = await supabase.from('transactions').delete().eq('id', tx.id);
         if (error) throw error;
         alert("এন্ট্রিটি সফলভাবে মুছে ফেলা হয়েছে!");
         fetchData();
      } catch (err: any) { alert("ত্রুটি: " + err.message); } finally { setIsSaving(false); }
   };

   const safeFormat = (val: any) => Number(val || 0).toLocaleString();

   const currentBalances = useMemo(() => {
      const dbCo = mapToDbCompany(targetCompany);
      return custBalances[dbCo] || { reg: 0, book: 0 };
   }, [targetCompany, custBalances]);

   const uniqueAreas = useMemo(() => Array.from(new Set(customers.map(c => c.address?.trim()).filter(Boolean))).sort(), [customers]);
   const filteredCustomers = customers.filter(c => !selectedArea || c.address === selectedArea);

   return (
      <div className="space-y-8 pb-40 animate-reveal text-slate-900 font-sans">

         {/* 📊 LARGE TOP STATS GRID */}
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-1 bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
               <div className="absolute -right-4 -bottom-4 text-7xl opacity-10 group-hover:scale-110 transition-transform">💰</div>
               <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3 italic">আজকের মোট আদায়</p>
               <p className="text-3xl font-black italic tracking-tighter">৳{safeFormat(isStaff ? globalStats[mapToDbCompany(user.company).toLowerCase().replace(' ', '')] : globalStats.todayTotal)}</p>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-md group hover:shadow-xl transition-all">
               <div className="flex items-center gap-3 mb-3">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
                  <p className="text-[10px] font-black uppercase text-amber-500 tracking-widest italic">TRANSTEC</p>
               </div>
               <p className="text-3xl font-black italic text-slate-900 tracking-tighter">৳{safeFormat(globalStats.transtec)}</p>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-md group hover:shadow-xl transition-all">
               <div className="flex items-center gap-3 mb-3">
                  <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></div>
                  <p className="text-[10px] font-black uppercase text-cyan-500 tracking-widest italic">SQ LIGHT</p>
               </div>
               <p className="text-3xl font-black italic text-slate-900 tracking-tighter">৳{safeFormat(globalStats.sqLight)}</p>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-md group hover:shadow-xl transition-all">
               <div className="flex items-center gap-3 mb-3">
                  <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
                  <p className="text-[10px] font-black uppercase text-rose-500 tracking-widest italic">SQ CABLES</p>
               </div>
               <p className="text-3xl font-black italic text-slate-900 tracking-tighter">৳{safeFormat(globalStats.sqCables)}</p>
            </div>

            <div className="bg-orange-50 p-8 rounded-[2.5rem] border border-orange-100 shadow-md">
               <p className="text-[10px] font-black uppercase text-orange-500 tracking-widest mb-3 italic">পেন্ডিং এন্ট্রি</p>
               <p className="text-3xl font-black italic text-orange-600 tracking-tighter">৳{safeFormat(globalStats.pendingTotal)}</p>
            </div>
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* 💰 PREMIUM COLLECTION FORM */}
            <div className="bg-white p-10 md:p-14 rounded-[4rem] border border-slate-100 shadow-2xl space-y-10 relative overflow-hidden h-fit">
               <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/50 rounded-bl-full -z-0"></div>

               <div className="flex items-center gap-6 relative z-10">
                  <div className="w-16 h-16 bg-blue-600 rounded-[1.8rem] flex items-center justify-center text-white text-3xl font-black italic shadow-xl">C</div>
                  <div>
                     <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none text-slate-900">কালেকশন টার্মিনাল</h3>
                     <p className="text-[10px] text-slate-400 font-bold uppercase mt-2 tracking-widest italic">Secure Receipt Management System</p>
                  </div>
               </div>

               <div className="space-y-8 relative z-10">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div className="space-y-2 relative" ref={dropdownRef}>
                        <label className="text-[9px] font-black uppercase text-slate-400 ml-4 italic">এরিয়া বাছাই</label>
                        <div className="relative">
                           <button
                              onClick={() => setShowAreaDropdown(!showAreaDropdown)}
                              className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none font-bold text-sm shadow-inner focus:border-blue-500 transition-all text-left flex justify-between items-center"
                           >
                              <span className="uppercase">{selectedArea || "সকল এরিয়া"}</span>
                              <span className="text-[8px] opacity-40">▼</span>
                           </button>

                           {showAreaDropdown && (
                              <div className="absolute top-full mt-2 left-0 w-full bg-white border border-slate-200 rounded-3xl shadow-2xl z-[5000] overflow-hidden animate-reveal">
                                 <input
                                    type="text"
                                    placeholder="এরিয়া খুঁজুন..."
                                    className="w-full p-4 border-b border-slate-100 text-[11px] font-bold outline-none bg-slate-50"
                                    value={areaSearch}
                                    onChange={e => setAreaSearch(e.target.value)}
                                    autoFocus
                                 />
                                 <div className="max-h-60 overflow-y-auto custom-scroll text-black">
                                    <div
                                       className="p-4 hover:bg-slate-50 cursor-pointer text-[10px] font-black uppercase text-slate-400"
                                       onClick={() => { setSelectedArea(""); setShowAreaDropdown(false); setSelectedCust(null); }}
                                    >
                                       সকল এরিয়া
                                    </div>
                                    {uniqueAreas.filter(a => String(a).toLowerCase().includes(areaSearch.toLowerCase())).map(area => (
                                       <div
                                          key={String(area)}
                                          className="p-4 hover:bg-blue-50 cursor-pointer text-[10px] font-black uppercase text-slate-700 border-t border-slate-50"
                                          onClick={() => { setSelectedArea(String(area)); setShowAreaDropdown(false); setSelectedCust(null); setAreaSearch(""); }}
                                       >
                                          {area}
                                       </div>
                                    ))}
                                 </div>
                              </div>
                           )}
                        </div>
                     </div>
                     <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase text-slate-400 ml-4 italic">দোকান বাছাই</label>
                        <select className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none font-black uppercase text-xs shadow-inner focus:border-blue-500 transition-all" value={selectedCust?.id || ""} onChange={e => setSelectedCust(customers.find(c => c.id === e.target.value))}>
                           <option value="">দোকান সিলেক্ট করুন...</option>
                           {filteredCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                     </div>
                  </div>

                  <div className="bg-slate-100 p-2 rounded-[2rem] flex gap-2 border shadow-inner">
                     <button onClick={() => setCollectionType('REGULAR')} className={`flex-1 py-4 rounded-2xl font-black uppercase text-[10px] transition-all tracking-widest ${collectionType === 'REGULAR' ? 'bg-white text-blue-600 shadow-xl scale-[1.02]' : 'text-slate-400 hover:text-slate-600'}`}>💰 সাধারণ জমা</button>
                     <button onClick={() => setCollectionType('BOOKING')} className={`flex-1 py-4 rounded-2xl font-black uppercase text-[10px] transition-all tracking-widest ${collectionType === 'BOOKING' ? 'bg-indigo-600 text-white shadow-xl scale-[1.02]' : 'text-slate-400 hover:text-slate-600'}`}>📅 বুকিং অগ্রিম</button>
                  </div>

                  {/* Split Balance Display */}
                  <div className="bg-slate-900 p-8 rounded-[3rem] border border-white/5 shadow-2xl space-y-6">
                     <div className="flex flex-col items-center border-b border-white/10 pb-6">
                        <p className="text-[10px] font-black text-rose-400 uppercase tracking-[0.4em] mb-3 italic">মালের বকেয়া (Regular Due)</p>
                        <p className={`text-4xl font-black italic tracking-tighter ${currentBalances.reg > 1 ? 'text-rose-400' : 'text-emerald-400'}`}>
                           ৳{safeFormat(currentBalances.reg)}
                        </p>
                     </div>
                     <div className="flex flex-col items-center">
                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] mb-3 italic">বুকিং জমা (Booking Advance)</p>
                        <p className="text-4xl font-black italic tracking-tighter text-indigo-400">
                           ৳{safeFormat(currentBalances.book)}
                        </p>
                     </div>

                     <div className="flex gap-2 mt-4 w-full">
                        {['Transtec', 'SQ Light', 'SQ Cables'].map(co => (
                           <button
                              key={co}
                              disabled={isStaff && user.company !== co}
                              onClick={() => setTargetCompany(co as Company)}
                              className={`flex-1 py-3.5 rounded-2xl font-black uppercase text-[9px] transition-all border ${targetCompany === co ? 'bg-blue-600 border-blue-500 text-white shadow-lg' : 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10'} ${isStaff && user.company !== co ? 'hidden' : ''}`}
                           >
                              {co}
                           </button>
                        ))}
                     </div>
                  </div>

                  <div className="space-y-4">
                     <label className="text-[10px] font-black uppercase text-slate-400 ml-6 italic block">জমার পরিমাণ (টাকা)</label>
                     <div className="relative">
                        <input
                           type="number"
                           className="w-full p-10 bg-blue-50 border-none rounded-[3.5rem] text-center text-6xl font-black italic text-blue-600 outline-none shadow-inner focus:ring-8 ring-blue-100 transition-all"
                           placeholder="0.00"
                           value={amount}
                           onChange={e => setAmount(e.target.value)}
                        />
                        <div className="absolute left-10 top-1/2 -translate-y-1/2 text-4xl font-black text-blue-200">৳</div>
                     </div>
                  </div>

                  <button
                     disabled={isSaving || !amount || !selectedCust}
                     onClick={handleManualSubmit}
                     className={`w-full ${collectionType === 'REGULAR' ? 'bg-blue-600' : 'bg-indigo-600'} text-white py-8 rounded-[3rem] font-black uppercase text-xs tracking-[0.4em] shadow-2xl active:scale-95 transition-all disabled:opacity-20 mt-4`}
                  >
                     {isSaving ? 'SYNCING DATA...' : 'কনফার্ম ও ডাটা সেভ করুন ➔'}
                  </button>
               </div>
            </div>

            {/* ⏳ SIDE LISTS: Pending & History */}
            <div className="space-y-8 h-full">
               <div className="bg-white rounded-[3.5rem] border border-slate-100 shadow-xl overflow-hidden flex flex-col min-h-[700px] lg:min-h-[900px]">
                  <div className="p-10 border-b bg-slate-50/50 flex justify-between items-center shrink-0">
                     <div>
                        <h4 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter">অপেক্ষমাণ অনুমোদন</h4>
                        <p className="text-[11px] font-bold text-slate-400 uppercase mt-2 tracking-widest">Pending Approvals ({pendingRequests.length})</p>
                     </div>
                     <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center text-orange-600 animate-pulse font-black italic text-xl">!</div>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scroll p-8 space-y-4">
                     {pendingRequests.map(req => {
                        const isBooking = req.submitted_by?.includes('[BOOKING]');
                        const name = req.submitted_by?.replace('[BOOKING] ', '');
                        return (
                           <div key={req.id} className={`bg-white p-8 rounded-[3rem] border-2 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 group animate-reveal ${isBooking ? 'border-indigo-100' : 'border-slate-50 hover:border-blue-100'} transition-all`}>
                              <div className="min-w-0 pr-4">
                                 <h4 className="font-black text-slate-800 uppercase italic text-[16px] truncate leading-none mb-3">{req.customers?.name}</h4>
                                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{req.company} • {name}</p>
                                 {isBooking && <span className="inline-block mt-3 px-4 py-1.5 bg-indigo-50 text-indigo-600 text-[9px] font-black rounded-xl uppercase italic">Booking Advance</span>}
                              </div>
                              <div className="text-right flex items-center gap-6 shrink-0 w-full sm:w-auto border-t sm:border-t-0 pt-4 sm:pt-0">
                                 <p className={`text-2xl font-black italic tracking-tighter ${isBooking ? 'text-indigo-600' : 'text-slate-900'}`}>৳{safeFormat(req.amount)}</p>
                                 {isAdmin && (
                                    <button onClick={() => handleApprove(req)} className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black text-[11px] uppercase shadow-lg active:scale-95 hover:bg-emerald-700 transition-all tracking-widest">APPROVE</button>
                                 )}
                              </div>
                           </div>
                        );
                     })}
                     {pendingRequests.length === 0 && (
                        <div className="py-32 text-center opacity-10 flex flex-col items-center">
                           <span className="text-8xl mb-6">✅</span>
                           <p className="text-sm font-black uppercase tracking-[0.4em]">সব রিকোয়েস্ট অনুমোদিত</p>
                        </div>
                     )}
                  </div>

                  <div className="p-10 border-t bg-emerald-50/30 shrink-0">
                     <h4 className="text-[11px] font-black text-emerald-600 uppercase italic tracking-widest mb-8 ml-2">আজকের কনফার্মড আদায়</h4>
                     <div className="space-y-4">
                        {confirmedToday.map(tx => {
                           const isBookingTx = tx.meta?.is_booking === true || tx.items?.[0]?.note?.includes('বুকিং');
                           return (
                              <div key={tx.id} className={`p-6 rounded-[2.5rem] border-2 flex justify-between items-center animate-reveal group ${isBookingTx ? 'bg-indigo-50 border-indigo-100' : 'bg-white border-emerald-100'} hover:shadow-lg transition-all`}>
                                 <div className="min-w-0 pr-4">
                                    <h4 className="font-black text-slate-700 uppercase italic text-[14px] truncate leading-none mb-2">{tx.customers?.name}</h4>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{tx.company} • {isBookingTx ? 'বুকিং জমা' : 'নগদ আদায়'}</p>
                                 </div>
                                 <div className="flex items-center gap-6">
                                    <p className={`text-xl font-black italic tracking-tighter ${isBookingTx ? 'text-indigo-700' : 'text-emerald-700'}`}>৳{safeFormat(tx.amount)}</p>
                                    {(isAdmin || isStaff) && (
                                       <button
                                          onClick={() => handleDeleteTransaction(tx)}
                                          className="w-10 h-10 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center text-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-500 hover:text-white"
                                          title="Delete Entry"
                                       >
                                          🗑️
                                       </button>
                                    )}
                                 </div>
                              </div>
                           );
                        })}
                        {confirmedToday.length === 0 && (
                           <p className="text-center py-10 text-[11px] font-black text-slate-300 uppercase italic tracking-widest">আজ কোনো আদায় নেই</p>
                        )}
                     </div>
                  </div>
               </div>
            </div>
         </div>

         {loading && (
            <div className="fixed inset-0 bg-white/60 backdrop-blur-sm z-[9999] flex flex-col items-center justify-center font-black uppercase italic text-blue-600 animate-pulse tracking-[0.4em]">
               <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
               Syncing Collection Nodes...
            </div>
         )}
      </div>
   );
};

export default Collections;
