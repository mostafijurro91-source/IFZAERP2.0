import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Company, User, Customer, CompanyRecord, formatCurrency } from '../types';
import { supabase, mapToDbCompany, db } from '../lib/supabase';

interface CollectionsProps {
   company: Company;
   user: User;
   companies: CompanyRecord[];
}

interface MultiBalance {
   reg: number;
   book: number;
}

const Collections: React.FC<CollectionsProps> = ({ company, user, companies }) => {
   const [pendingRequests, setPendingRequests] = useState<any[]>([]);
   const [confirmedToday, setConfirmedToday] = useState<any[]>([]);
   const [customers, setCustomers] = useState<Customer[]>([]);
   const [loading, setLoading] = useState(true);
   const [isSaving, setIsSaving] = useState(false);

   const [selectedArea, setSelectedArea] = useState<string>("");
   const [selectedCust, setSelectedCust] = useState<Customer | null>(null);
   const [targetCompany, setTargetCompany] = useState<Company>(company);
   const [amount, setAmount] = useState<string>("");
   const [collectionType, setCollectionType] = useState<'REGULAR' | 'BOOKING'>('REGULAR');
   const [showAreaDropdown, setShowAreaDropdown] = useState<boolean>(false);
   const [areaSearch, setAreaSearch] = useState<string>("");
   const [showCustDropdown, setShowCustDropdown] = useState<boolean>(false);
   const [custSearch, setCustSearch] = useState<string>("");
   const dropdownRef = useRef<HTMLDivElement>(null);

   const [custBalances, setCustBalances] = useState<Record<string, MultiBalance>>({});

   const [globalStats, setGlobalStats] = useState<any>({
      todayTotal: 0,
      coTotals: {}, // Dynamic map for company totals
      salesTotal: 0,
      pendingTotal: 0
   });

   const isAdmin: boolean = user.role === 'ADMIN';
   const isStaff: boolean = user.role === 'STAFF';

   useEffect(() => { fetchData(); }, [user.company, company]);
   useEffect(() => {
      if (isAdmin) setTargetCompany(company);
   }, [company, isAdmin]);
   useEffect(() => {
      if (selectedCust) fetchCustomerBalances(selectedCust.id);
      else {
         const initial: Record<string, MultiBalance> = {};
         companies.forEach(co => { initial[co.name] = { reg: 0, book: 0 }; });
         setCustBalances(initial);
      }
   }, [selectedCust, targetCompany]);

   useEffect(() => {
      const channel = supabase
         .channel("collection-realtime")
         .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "collection_requests" },
            () => fetchData()
         )
         .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "transactions" },
            () => fetchData()
         )
         .subscribe();

      return () => {
         supabase.removeChannel(channel);
      };
   }, [user.company, company, companies]);

   useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
         if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
            setShowAreaDropdown(false);
            setShowCustDropdown(false);
         }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
   }, []);

   const fetchData = async () => {
      setLoading(true);
      try {
         const today: string = new Date().toISOString().split('T')[0];
         const dbUserCompany: string = mapToDbCompany(user.company);
         const [custRes, reqRes, txRes] = await Promise.all([
            db.getCustomers(),
            supabase.from('collection_requests').select('*, customers(name, address, phone)').eq('status', 'PENDING').order('created_at', { ascending: false }),
            supabase.from('transactions').select('*, customers(name)').gte('created_at', today + 'T00:00:00.000Z').order('created_at', { ascending: false })
         ]);

         setCustomers(custRes || []);
         let filteredRequests: any[] = reqRes.data || [];
         if (isStaff) filteredRequests = filteredRequests.filter((r: any) => r.company === dbUserCompany);
         setPendingRequests(filteredRequests);

         let confirmed: any[] = (txRes.data || []).filter((tx: any) => tx.payment_type === 'COLLECTION');
         if (isStaff) confirmed = confirmed.filter((tx: any) => tx.company === dbUserCompany);
         setConfirmedToday(confirmed);

         let totalCollection: number = 0;
         const coTotals: Record<string, { collected: number, sales: number }> = {};
         
         companies.forEach(co => { coTotals[co.name] = { collected: 0, sales: 0 }; });

         txRes.data?.forEach((tx: any) => {
            const amt: number = Number(tx.amount) || 0;
            const co: string = mapToDbCompany(tx.company);
            if (!coTotals[co]) coTotals[co] = { collected: 0, sales: 0 };

            if (tx.payment_type === 'COLLECTION') {
               coTotals[co].collected += amt;
               totalCollection += amt;
            } else if (tx.payment_type === 'DUE') {
               coTotals[co].sales += amt;
            }
         });

         setGlobalStats({
            todayTotal: totalCollection,
            coTotals,
            salesTotal: Object.values(coTotals).reduce((sum, c) => sum + c.sales, 0),
            pendingTotal: filteredRequests.reduce((sum: number, r: any) => sum + Number(r.amount), 0)
         });
      } finally { setLoading(false); }
   };

   const fetchCustomerBalances = async (customerId: string) => {
      try {
         const dbUserCompany: string = mapToDbCompany(user.company);
         let query = supabase.from('transactions').select('amount, company, payment_type, meta, items').eq('customer_id', customerId);
         if (isStaff) query = query.eq('company', dbUserCompany);
         const { data: txs } = await query;
         const newBalances: Record<string, MultiBalance> = {};
         companies.forEach(co => { newBalances[co.name] = { reg: 0, book: 0 }; });
         txs?.forEach((tx: any) => {
            const amt: number = Number(tx.amount);
            const dbCo: string = mapToDbCompany(tx.company);
            const isBooking: boolean = tx.meta?.is_booking === true || tx.items?.[0]?.note?.includes('বুকিং');
            if (newBalances[dbCo]) {
               if (tx.payment_type === 'COLLECTION') {
                  if (isBooking) newBalances[dbCo].book += amt;
                  else newBalances[dbCo].reg -= amt;
               } else if (tx.payment_type === 'DUE') newBalances[dbCo].reg += amt;
            }
         });
         setCustBalances(newBalances);
      } catch (err) { }
   };

   const handleManualSubmit = async () => {
      const amountNum: number = parseFloat(amount);
      if (!selectedCust || isNaN(amountNum) || amountNum <= 0) return alert("দোকান এবং সঠিক অ্যামাউন্ট দিন!");
      setIsSaving(true);
      try {
         const submissionTag: string = collectionType === 'BOOKING' ? `[BOOKING] ${user.name}` : user.name;
         const { error } = await supabase.from('collection_requests').insert([{
            customer_id: selectedCust.id, 
            company: mapToDbCompany(targetCompany),
            amount: amountNum, 
            submitted_by: submissionTag, 
            status: 'PENDING'
            // meta ketch removed for hotfix
         }]);
         if (error) throw error;
         setAmount(""); alert("কালেকশন রিকোয়েস্ট পাঠানো হয়েছে! ✅"); fetchData();
      } catch (err: any) { alert("ত্রুটি: " + err.message); } finally { setIsSaving(false); }
   };

   const handleApprove = async (req: any) => {
      if (!isAdmin || isSaving) return;
      setIsSaving(true);
      try {
         const isBooking: boolean = req.submitted_by?.includes('[BOOKING]');
         const memoIdMatch: RegExpMatchArray | null = req.submitted_by?.match(/\[DH-MEMO-([^\]]+)\]/);
         const memoId: string | null = memoIdMatch ? memoIdMatch[1] : null;

         let cleanSubmittedBy: string = req.submitted_by || '';
         if (memoIdMatch) cleanSubmittedBy = cleanSubmittedBy.replace(memoIdMatch[0], '').trim();
         cleanSubmittedBy = cleanSubmittedBy.replace('[BOOKING]', '').trim();

         const { data: txData, error: txErr } = await supabase.from('transactions').insert([{
            customer_id: req.customer_id, 
            company: req.company, 
            amount: Number(req.amount),
            payment_type: 'COLLECTION', 
            submitted_by: cleanSubmittedBy,
            items: [{ note: isBooking ? `📅 বুকিং অগ্রিম জমা (${cleanSubmittedBy})` : `💰 নগদ আদায় অনুমোদন (${cleanSubmittedBy})` }]
         }]).select().single();
         if (txErr) throw txErr;

         // ১. ডেলিভারি হাব মেমো লিংক আপডেট
         
         if (memoId) {
            await supabase.from('delivery_tasks').upsert([{
               order_id: memoId,
               customer_id: req.customer_id,
               status: 'COMPLETED',
               collected_amount: Number(req.amount),
               company: req.company
            }], { onConflict: 'order_id' });
         }

         const txIdShort: string = String(txData.id).slice(-6).toUpperCase();
         await supabase.from('notifications').insert([{
            customer_id: req.customer_id, title: isBooking ? `বুকিং জমা #${txIdShort}` : `কালেকশন জমা #${txIdShort}`,
            message: `৳${Number(req.amount).toLocaleString()} ${isBooking ? 'বুকিং জমা' : 'হিসেবে গ্রহণ'} হয়েছে। (${req.company})`,
            type: 'PAYMENT'
         }]);
         await supabase.from('collection_requests').delete().eq('id', req.id);
         fetchData();
      } catch (err: any) { alert("ত্রুটি: " + err.message); } finally { setIsSaving(false); }
   };

   const handleDeleteRequest = async (reqId: string) => {
      if (!confirm("আপনি কি এই কালেকশন রিকোয়েস্টটি মুছে ফেলতে চান?")) return;
      setIsSaving(true);
      try {
         const { error } = await supabase.from('collection_requests').delete().eq('id', reqId);
         if (error) throw error;
         fetchData();
      } catch (err: any) { alert("ত্রুটি: " + err.message); } finally { setIsSaving(false); }
   };

   const handleDeleteTransaction = async (tx: any) => {
      if (!isAdmin && !isStaff) return;
      const txIdShort: string = String(tx.id).slice(-6).toUpperCase();
      if (!confirm(`আপনি কি নিশ্চিত এই জমার এন্ট্রিটি (#${txIdShort}) ডিলিট করতে চান?`)) return;
      setIsSaving(true);
      try {
         await supabase.from('notifications').delete().eq('customer_id', tx.customer_id).ilike('message', `%#${txIdShort}%`);
         const { error } = await supabase.from('transactions').delete().eq('id', tx.id);
         if (error) throw error;
         fetchData();
      } catch (err: any) { alert("ত্রুটি: " + err.message); } finally { setIsSaving(false); }
   };

   const safeFormat = (val: any): string => Number(val || 0).toLocaleString();

   // কে কত টাকা জমা দিল তার হিসাব (Staff-wise totals)
   const staffSummary = useMemo(() => {
      const summary: Record<string, number> = {};
      // পেন্ডিং এবং কনফার্মড সব ডাটা যোগ করে নাম অনুযায়ী সাজানো
      [...pendingRequests, ...confirmedToday].forEach((item: any) => {
         const rawName: string = item.submitted_by || '';
         const cleanName: string = rawName.replace(/\[DH-MEMO-[^\]]+\]/g, '').replace('[BOOKING]', '').trim();
         if (!cleanName) return;
         summary[cleanName] = (summary[cleanName] || 0) + Number(item.amount);
      });
      return Object.entries(summary).sort((a: [string, number], b: [string, number]) => b[1] - a[1]);
   }, [pendingRequests, confirmedToday]);

   const currentBalances = useMemo(() => {
      const dbCo: string = mapToDbCompany(targetCompany);
      return custBalances[dbCo] || { reg: 0, book: 0 };
   }, [targetCompany, custBalances]);

   const uniqueAreas = useMemo(() => Array.from(new Set(customers.map((c: Customer) => c.address?.trim()).filter(Boolean))).sort(), [customers]);
   const filteredAreas = useMemo(() => uniqueAreas.filter((a: string) => a.toLowerCase().includes(areaSearch.toLowerCase())), [uniqueAreas, areaSearch]);
   const filteredCustomers = useMemo(() => customers.filter((c: Customer) => !selectedArea || c.address === selectedArea), [customers, selectedArea]);
   const searchedCustomers = useMemo(() => filteredCustomers.filter((c: Customer) =>
      c.name.toLowerCase().includes(custSearch.toLowerCase()) || (c.phone && c.phone.includes(custSearch))
   ), [filteredCustomers, custSearch]);

   return (
      <div className="space-y-8 pb-40 animate-reveal text-slate-900 font-sans">

         {/* 👤 STAFF SUMMARY CARDS (কে কত জমা দিল) */}
         <div className="flex overflow-x-auto gap-4 pb-4 custom-scroll no-scrollbar">
            {staffSummary.map(([name, total]: [string, number]) => (
               <div key={name} className="min-w-[180px] bg-white p-6 rounded-[2rem] border border-blue-50 shadow-md flex flex-col items-center group hover:border-blue-500 transition-all">
                  <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 font-black mb-2 text-xs uppercase italic">{name.slice(0, 2)}</div>
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest text-center">{name}</p>
                  <p className="text-lg font-black italic text-blue-600 tracking-tighter">৳{safeFormat(total)}</p>
               </div>
            ))}
            {staffSummary.length === 0 && (
                <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic ml-4">আজকের জমার কোনো হিসাব নেই...</div>
            )}
         </div>

         {/* 📊 MAIN TOTALS */}
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden">
               <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3 italic">আজকের মোট আদায়</p>
               <p className="text-3xl font-black italic tracking-tighter">৳{safeFormat(globalStats.todayTotal)}</p>
            </div>
            <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-md">
                <p className="text-[10px] font-black text-orange-500 tracking-widest mb-1 italic">PENDING APPROVAL</p>
                <p className="text-2xl font-black italic text-slate-900 tracking-tighter">৳{safeFormat(globalStats.pendingTotal)}</p>
            </div>
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* 💰 COLLECTION FORM */}
            <div className="bg-white p-10 md:p-14 rounded-[4rem] border border-slate-100 shadow-2xl space-y-10 relative overflow-hidden h-fit">
               <div className="flex items-center gap-6 relative z-10">
                  <div className="w-16 h-16 bg-blue-600 rounded-[1.8rem] flex items-center justify-center text-white text-3xl font-black italic">C</div>
                  <div>
                     <h3 className="text-2xl font-black uppercase italic tracking-tighter text-slate-900">কালেকশন টার্মিনাল</h3>
                     <p className="text-[10px] text-slate-400 font-bold uppercase mt-2 tracking-widest italic">Secure Receipt Management</p>
                  </div>
               </div>

               <div className="space-y-8 relative z-10">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative" ref={dropdownRef}>
                     <div className="space-y-2 relative">
                        <button onClick={() => setShowAreaDropdown(!showAreaDropdown)} className={`w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-3xl text-left outline-none font-bold text-sm flex items-center justify-between ${selectedArea ? 'border-blue-500' : ''}`}>
                           {selectedArea ? <span className="font-black text-blue-700 text-xs uppercase">{selectedArea}</span> : <span className="text-xs font-bold text-slate-400 uppercase">এরিয়া...</span>}
                           <span>▼</span>
                        </button>
                        {showAreaDropdown && (
                           <div className="absolute top-[85px] left-0 right-0 z-[600] bg-white border-2 border-slate-100 rounded-3xl shadow-2xl overflow-hidden">
                              <input className="w-full p-4 border-b-2 border-slate-100 font-bold text-xs outline-none bg-slate-50" placeholder="এরিয়া সার্চ..." value={areaSearch} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAreaSearch(e.target.value)} />
                              <div className="max-h-60 overflow-y-auto">
                                 <div onClick={() => { setSelectedArea(""); setShowAreaDropdown(false); setAreaSearch(""); setSelectedCust(null); }} className="p-4 hover:bg-blue-50 cursor-pointer font-bold text-xs uppercase text-slate-400 italic">সকল এরিয়া</div>
                                 {filteredAreas.map((a: string) => <div key={a} onClick={() => { setSelectedArea(a); setShowAreaDropdown(false); setAreaSearch(""); setSelectedCust(null); setShowCustDropdown(true); }} className="p-4 hover:bg-blue-50 cursor-pointer font-black text-xs uppercase">{a}</div>)}
                              </div>
                           </div>
                        )}
                     </div>

                     <div className="space-y-2 relative">
                        <button onClick={() => setShowCustDropdown(!showCustDropdown)} className={`w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-3xl text-left outline-none font-black text-xs flex items-center justify-between ${selectedCust ? 'border-blue-500' : ''}`}>
                           {selectedCust ? <span className="font-black text-blue-700 text-xs uppercase">{selectedCust.name}</span> : <span className="text-xs font-bold text-slate-400 uppercase">দোকান...</span>}
                           <span>▼</span>
                        </button>
                        {showCustDropdown && (
                           <div className="absolute top-[85px] left-0 right-0 z-[500] bg-white border-2 border-slate-100 rounded-3xl shadow-2xl overflow-hidden">
                              <input className="w-full p-4 border-b-2 border-slate-100 font-bold text-xs outline-none bg-slate-50" placeholder="দোকান সার্চ..." value={custSearch} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustSearch(e.target.value)} />
                              <div className="max-h-60 overflow-y-auto">
                                 {searchedCustomers.map((c: Customer) => (
                                    <div key={c.id} onClick={() => { setSelectedCust(c); setShowCustDropdown(false); setCustSearch(""); }} className="p-4 hover:bg-blue-50 cursor-pointer font-black text-xs uppercase flex justify-between">
                                       <span>{c.name}</span>
                                       <span className="text-[9px] text-slate-400 font-bold italic">{c.address}</span>
                                    </div>
                                 ))}
                              </div>
                           </div>
                        )}
                     </div>
                  </div>

                  <div className="bg-slate-100 p-2 rounded-[2rem] flex gap-2">
                     <button onClick={() => setCollectionType('REGULAR')} className={`flex-1 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest ${collectionType === 'REGULAR' ? 'bg-white text-blue-600 shadow-xl' : 'text-slate-400'}`}>💰 সাধারণ জমা</button>
                     <button onClick={() => setCollectionType('BOOKING')} className={`flex-1 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest ${collectionType === 'BOOKING' ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-400'}`}>📅 বুকিং অগ্রিম</button>
                  </div>

                  <div className="bg-slate-900 p-8 rounded-[3rem] border border-white/5 shadow-2xl space-y-6">
                     <div className="flex flex-col items-center">
                        <p className="text-[10px] font-black text-rose-400 uppercase tracking-[0.4em] mb-2 italic">মালের বকেয়া</p>
                        <p className={`text-4xl font-black italic tracking-tighter ${currentBalances.reg > 1 ? 'text-rose-400' : 'text-emerald-400'}`}>৳{safeFormat(currentBalances.reg)}</p>
                     </div>
                     <div className="flex flex-wrap gap-2 mt-4">
                        {companies.map((co) => (
                           <button 
                             key={co.id} 
                             disabled={isStaff && user.company !== co.name} 
                             onClick={() => setTargetCompany(co.name)} 
                             className={`flex-1 min-w-[30%] py-3.5 px-2 rounded-2xl font-black uppercase text-[9px] border transition-all ${targetCompany === co.name ? 'bg-blue-600 border-blue-500 text-white shadow-lg' : 'bg-white/5 border-white/5 text-slate-500'} ${isStaff && user.company !== co.name ? 'hidden' : ''}`}
                           >
                              {co.name}
                           </button>
                        ))}
                     </div>
                  </div>

                  <div className="relative">
                     <input type="number" className="w-full p-10 bg-blue-50 border-none rounded-[3.5rem] text-center text-6xl font-black italic text-blue-600 outline-none shadow-inner" placeholder="0.00" value={amount} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)} />
                     <div className="absolute left-10 top-1/2 -translate-y-1/2 text-4xl font-black text-blue-200">৳</div>
                  </div>

                  <button disabled={isSaving || !amount || !selectedCust} onClick={handleManualSubmit} className={`w-full ${collectionType === 'REGULAR' ? 'bg-blue-600' : 'bg-indigo-600'} text-white py-8 rounded-[3rem] font-black uppercase text-xs tracking-[0.4em] shadow-2xl transition-all disabled:opacity-20`}>
                     {isSaving ? 'SYNCING...' : 'সেভ করুন ➔'}
                  </button>
               </div>
            </div>

            {/* ⏳ PENDING & TODAY'S LIST */}
            <div className="space-y-8 h-full">
               <div className="bg-white rounded-[3.5rem] border border-slate-100 shadow-xl overflow-hidden flex flex-col min-h-[700px] lg:min-h-[900px]">
                  <div className="p-10 border-b bg-slate-50/50 flex justify-between items-center">
                     <div>
                        <h4 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter">অপেক্ষমাণ রিকোয়েস্ট ({pendingRequests.length})</h4>
                     </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-8 space-y-4">
                     {pendingRequests.map((req: any) => (
                        <div key={req.id} className="bg-white p-6 rounded-[2.5rem] border-2 border-slate-50 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-6 group animate-reveal hover:border-blue-100">
                           <div className="min-w-0 flex-1">
                              <h4 className="font-black text-slate-800 uppercase italic text-[15px] truncate mb-1">{req.customers?.name}</h4>
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                 {req.company} • {req.submitted_by?.replace(/\[DH-MEMO-[^\]]+\]/g, '').replace('[BOOKING]', '').trim()}
                              </p>
                           </div>
                           <div className="flex items-center gap-3">
                              <p className="text-xl font-black italic tracking-tighter text-slate-900">৳{safeFormat(req.amount)}</p>
                              {isAdmin && (
                                 <button onClick={() => handleApprove(req)} className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-black text-[9px] uppercase shadow-md">APPROVE</button>
                              )}
                              {(isAdmin || req.submitted_by?.includes(user.name)) && (
                                 <button onClick={() => handleDeleteRequest(req.id)} className="w-10 h-10 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center font-bold hover:bg-rose-500 hover:text-white transition-all">✕</button>
                              )}
                           </div>
                        </div>
                     ))}
                     {pendingRequests.length === 0 && (
                         <div className="text-center py-20 opacity-20 italic font-black uppercase text-xs tracking-widest">সব রিকোয়েস্ট অনুমোদিত ✅</div>
                     )}
                  </div>

                  <div className="p-10 border-t bg-emerald-50/30">
                     <h4 className="text-[11px] font-black text-emerald-600 uppercase italic tracking-widest mb-6">আজকের কনফার্মড আদায়</h4>
                     <div className="space-y-4">
                        {confirmedToday.map((tx: any) => (
                           <div key={tx.id} className="p-5 rounded-[2rem] border-2 bg-white border-emerald-100 flex justify-between items-center group">
                              <div className="min-w-0 flex-1">
                                 <h4 className="font-black text-slate-700 uppercase italic text-[13px] truncate mb-1">{tx.customers?.name}</h4>
                                 <p className="text-[8px] font-bold text-slate-400 uppercase">{tx.company} • {tx.submitted_by}</p>
                              </div>
                              <div className="flex items-center gap-4">
                                 <p className="text-lg font-black italic text-emerald-700">৳{safeFormat(tx.amount)}</p>
                                 {(isAdmin || (isStaff && tx.submitted_by === user.name)) && (
                                    <button onClick={() => handleDeleteTransaction(tx)} className="text-rose-300 hover:text-rose-600 opacity-0 group-hover:opacity-100">🗑️</button>
                                 )}
                              </div>
                           </div>
                        ))}
                     </div>
                  </div>
               </div>
            </div>
         </div>

         {loading && (
            <div className="fixed inset-0 bg-white/60 backdrop-blur-sm z-[9999] flex flex-col items-center justify-center font-black uppercase italic text-blue-600 tracking-[0.4em]">
               Syncing Collection Nodes...
            </div>
         )}
      </div>
   );
};

export default Collections;
