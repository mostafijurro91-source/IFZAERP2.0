
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Company, UserRole, formatCurrency } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';
import { jsPDF } from 'jspdf';
import * as html2canvasModule from 'html2canvas';

const html2canvas = (html2canvasModule as any).default || html2canvasModule;

interface CustomerProps {
  company: Company;
  role: UserRole;
  userName: string;
}

const Customers: React.FC<CustomerProps> = ({ company, role, userName }) => {
  const [customers, setCustomers] = useState<any[]>([]);
  const [regularDues, setRegularDues] = useState<Record<string, number>>({});
  const [bookingAdvances, setBookingAdvances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedArea, setSelectedArea] = useState("");
  const [isCompact, setIsCompact] = useState(true);
  const [uniqueAreas, setUniqueAreas] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showLedger, setShowLedger] = useState(false);
  const [selectedLedgerCust, setSelectedLedgerCust] = useState<any>(null);
  const [ledgerHistory, setLedgerHistory] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  
  // Ledger Detail Breakdown
  const [currentLedgerStats, setCurrentLedgerStats] = useState({ reg: 0, book: 0 });
  
  // Memo Detail State
  const [selectedMemoItems, setSelectedMemoItems] = useState<any[] | null>(null);
  const [selectedMemoMeta, setSelectedMemoMeta] = useState<any>(null);
  
  const ledgerRef = useRef<HTMLDivElement>(null);
  
  const [formData, setFormData] = useState({
    name: '', phone: '', address: '', money_amount: '', portal_username: '', portal_password: ''
  });

  const isAdmin = role.toUpperCase() === 'ADMIN';

  useEffect(() => { fetchCustomers(); }, [company]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const dbCompany = mapToDbCompany(company);
      const { data: custData } = await supabase.from('customers').select('*').order('name');
      
      const { data: txData } = await supabase
        .from('transactions')
        .select('customer_id, amount, payment_type, meta, items')
        .eq('company', dbCompany);
      
      const regMap: Record<string, number> = {};
      const bookMap: Record<string, number> = {};

      txData?.forEach(tx => {
        const amt = Number(tx.amount) || 0;
        const cid = tx.customer_id;
        const isBooking = tx.meta?.is_booking === true || tx.items?.[0]?.note?.includes('বুকিং');

        if (tx.payment_type === 'DUE') {
          regMap[cid] = (regMap[cid] || 0) + amt;
        } else if (tx.payment_type === 'COLLECTION') {
          if (isBooking) {
            bookMap[cid] = (bookMap[cid] || 0) + amt;
          } else {
            regMap[cid] = (regMap[cid] || 0) - amt;
          }
        }
      });

      setCustomers(custData || []);
      setRegularDues(regMap);
      setBookingAdvances(bookMap);
      
      const areas = Array.from(new Set(custData?.map(c => c.address?.trim()).filter(Boolean) || [])).sort() as string[];
      setUniqueAreas(areas);
    } catch (err) {
        console.error(err);
    } finally { setLoading(false); }
  };

  const handleDeleteCustomer = async (id: string) => {
    if (!isAdmin) return;
    if (!confirm("আপনি কি নিশ্চিত এই কাস্টমার প্রোফাইলটি ডিলিট করতে চান? এর সাথে সম্পর্কিত সকল ডাটা মুছে যেতে পারে।")) return;
    
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
      alert("কাস্টমার সফলভাবে ডিলিট হয়েছে।");
      fetchCustomers();
    } catch (err: any) {
      alert("ত্রুটি: " + err.message);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || !isAdmin) return;
    setIsSaving(true);
    try {
      const dbCompany = mapToDbCompany(company);
      const payload = { 
        name: formData.name.trim(), 
        phone: formData.phone.trim(), 
        address: formData.address.trim(), 
        portal_username: formData.portal_username.toLowerCase().trim(), 
        portal_password: formData.portal_password.trim() || '123'
      };
      
      let customerId = editingCustomer?.id;

      if (editingCustomer) {
        const { error } = await supabase.from('customers').update(payload).eq('id', editingCustomer.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('customers').insert([payload]).select();
        if (error) throw error;
        customerId = data[0].id;
      }

      if (formData.money_amount !== '') {
        const newAmt = Number(formData.money_amount) || 0;
        const { data: existingTx } = await supabase
          .from('transactions')
          .select('id')
          .eq('customer_id', customerId)
          .eq('company', dbCompany)
          .ilike('items->0->note', '%পূর্বের বকেয়া%')
          .maybeSingle();

        if (existingTx) {
          await supabase.from('transactions').update({ amount: newAmt }).eq('id', existingTx.id);
        } else if (newAmt !== 0) {
          await supabase.from('transactions').insert([{
            customer_id: customerId, 
            company: dbCompany, 
            amount: newAmt,
            payment_type: 'DUE', 
            items: [{ note: 'পূর্বের বকেয়া (Opening Balance)' }], 
            submitted_by: userName
          }]);
        }
      }

      setShowModal(false); 
      setFormData({ name: '', phone: '', address: '', money_amount: '', portal_username: '', portal_password: '' });
      await fetchCustomers();
      alert("সফলভাবে সংরক্ষিত হয়েছে!");
    } catch (err: any) { 
        alert("ত্রুটি: " + err.message); 
    } finally { 
        setIsSaving(false); 
    }
  };

  const fetchCustomerLedger = async (cust: any) => {
    setSelectedLedgerCust(cust);
    setShowLedger(true);
    setLedgerHistory([]);
    try {
      const dbCo = mapToDbCompany(company);
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('customer_id', cust.id)
        .eq('company', dbCo)
        .order('created_at', { ascending: true });
      
      let r = 0, b = 0;
      data?.forEach(tx => {
        const amt = Number(tx.amount) || 0;
        const isBooking = tx.meta?.is_booking === true || tx.items?.[0]?.note?.includes('বুকিং');
        if (tx.payment_type === 'DUE') r += amt;
        else {
          if (isBooking) b += amt;
          else r -= amt;
        }
      });
      
      setCurrentLedgerStats({ reg: r, book: b });
      setLedgerHistory(data || []);
    } catch (err) { console.error(err); }
  };

  const handleDownloadLedgerPDF = async () => {
    if (!ledgerRef.current || isDownloading) return;
    setIsDownloading(true);
    try {
      const element = ledgerRef.current;
      const canvas = await html2canvas(element, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      const pdf = new jsPDF('p', 'mm', 'a5');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, imgHeight);
      pdf.save(`Ledger_${selectedLedgerCust?.name}.pdf`);
    } finally { setIsDownloading(false); }
  };

  const filtered = customers.filter(c => 
    (!search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search) || (c.portal_username && c.portal_username.includes(search.toLowerCase()))) && 
    (!selectedArea || c.address === selectedArea)
  );

  return (
    <div className="space-y-6 pb-40 relative text-slate-900">
      
      {/* 🚀 Premium Search Header */}
      <div className="sticky top-0 z-[110] -mx-6 px-6 py-4 bg-white/80 backdrop-blur-2xl border-b border-slate-200/50 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-4 items-center animate-reveal">
           <div className="flex-[2] flex gap-2 items-center bg-slate-100 p-2 rounded-3xl shadow-inner border border-slate-200 w-full group focus-within:ring-4 ring-blue-50 transition-all">
              <div className="pl-4 text-slate-400 group-focus-within:text-blue-500 transition-colors">🔍</div>
              <input autoFocus type="text" placeholder="দোকান বা ইউজার আইডি সার্চ..." className="flex-1 p-3 bg-transparent border-none text-[13px] font-bold uppercase outline-none text-slate-900" value={search} onChange={e => setSearch(e.target.value)} />
           </div>
           <div className="flex gap-2 w-full md:w-auto shrink-0">
              <select className="flex-1 md:flex-none p-4 bg-white border border-slate-200 rounded-3xl text-[10px] font-black uppercase italic outline-none shadow-sm focus:border-blue-600 transition-all" value={selectedArea} onChange={e => setSelectedArea(e.target.value)}>
                <option value="">সকল এরিয়া</option>
                {uniqueAreas.map(area => <option key={area} value={area}>{area}</option>)}
              </select>
              <button onClick={() => setIsCompact(!isCompact)} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 text-xl active:scale-90 transition-transform">{isCompact ? "🔳" : "☰"}</button>
              {isAdmin && (
                <button onClick={() => { setEditingCustomer(null); setFormData({name:'', phone:'', address:'', money_amount:'', portal_username:'', portal_password:''}); setShowModal(true); }} className="bg-blue-600 text-white px-8 py-4 rounded-3xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all">+ নতুন দোকান যোগ</button>
              )}
           </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center animate-pulse text-slate-300 font-bold uppercase italic text-xs tracking-[0.4em]">Node Fetching Data...</div>
      ) : (
        <div className={isCompact ? "bg-white rounded-[3.5rem] border border-slate-100 shadow-xl overflow-hidden" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"}>
           {isCompact && (
              <div className="grid grid-cols-12 bg-slate-900 text-white/50 p-6 text-[8px] font-black uppercase tracking-widest italic border-b border-white/5">
                 <div className="col-span-3 md:col-span-3">Shop Identity</div>
                 <div className="hidden md:block col-span-2 text-center">Login ID</div>
                 <div className="col-span-3 text-right">Regular Due</div>
                 <div className="col-span-2 text-right">Booking Deposit</div>
                 <div className="col-span-2 md:col-span-2 text-right">Actions</div>
              </div>
           )}
           {filtered.map((c, idx) => {
             const regBal = regularDues[c.id] || 0;
             const bookBal = bookingAdvances[c.id] || 0;
             return (
               <div key={c.id} className={isCompact ? "grid grid-cols-12 p-6 border-b border-slate-50 items-center animate-reveal hover:bg-slate-50 transition-all group" : "bg-white p-8 rounded-[3.5rem] border border-slate-100 shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-1 animate-reveal relative overflow-hidden"} style={{ animationDelay: `${idx * 0.03}s` }}>
                  {!isCompact && <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-[4rem] -z-0 opacity-40 group-hover:scale-110 transition-transform"></div>}
                  <div className={isCompact ? "col-span-3 md:col-span-3 pr-4" : "mb-6 relative z-10"}>
                     <p className="font-black text-[13px] uppercase italic text-slate-800 truncate mb-1 group-hover:text-blue-600 transition-colors">{c.name}</p>
                     <p className="text-[9px] font-bold text-slate-400 tracking-widest uppercase italic truncate">📱 {c.phone}</p>
                  </div>
                  {isCompact && <div className="hidden md:block col-span-2 text-center text-blue-600 font-black uppercase text-[10px] italic">{c.portal_username || "No ID"}</div>}
                  
                  <div className={isCompact ? `col-span-3 text-right font-black italic text-[14px] ${regBal > 1 ? 'text-rose-600' : 'text-emerald-600'}` : "mt-6 pt-6 border-t relative z-10 flex justify-between"}>
                     {!isCompact && <p className="text-[8px] text-slate-400 uppercase tracking-widest mb-1 italic">Regular Due</p>}
                     <span className={!isCompact ? `text-2xl tracking-tighter ${regBal > 1 ? 'text-rose-600' : 'text-emerald-600'}` : ""}>{regBal.toLocaleString()}৳</span>
                  </div>

                  <div className={isCompact ? `col-span-2 text-right font-black italic text-[14px] text-indigo-600` : "mt-2 relative z-10 flex justify-between"}>
                     {!isCompact && <p className="text-[8px] text-indigo-400 uppercase tracking-widest mb-1 italic">Booking Advance</p>}
                     <span className={!isCompact ? `text-2xl tracking-tighter text-indigo-600` : ""}>{bookBal.toLocaleString()}৳</span>
                  </div>

                  <div className={isCompact ? "col-span-2 md:col-span-2 flex justify-end gap-2" : "mt-8 flex gap-3 relative z-10"}>
                     <button onClick={() => fetchCustomerLedger(c)} title="View Ledger" className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center text-xs shadow-xl active:scale-90 transition-all hover:bg-indigo-600">📑</button>
                     {isAdmin && (
                       <>
                         <button onClick={async () => {
                            const dbCo = mapToDbCompany(company);
                            const { data: tx } = await supabase.from('transactions').select('amount').eq('customer_id', c.id).eq('company', dbCo).ilike('items->0->note', '%পূর্বের বকেয়া%').maybeSingle();
                            setEditingCustomer(c);
                            setFormData({ name: c.name, phone: c.phone, address: c.address || '', money_amount: tx ? tx.amount.toString() : '', portal_username: c.portal_username || '', portal_password: c.portal_password || '' });
                            setShowModal(true);
                         }} title="Edit Shop" className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center text-xs shadow-xl active:scale-90 transition-all hover:bg-blue-700">📝</button>
                         <button onClick={() => handleDeleteCustomer(c.id)} title="Delete Customer" className="w-10 h-10 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center text-xs border border-rose-100 hover:bg-rose-500 hover:text-white transition-all shadow-sm">🗑️</button>
                       </>
                     )}
                  </div>
               </div>
             );
           })}
        </div>
      )}

      {/* 📑 LEDGER MODAL */}
      {showLedger && selectedLedgerCust && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[3000] flex items-center justify-center p-4">
           <div className="bg-white rounded-[4rem] w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl animate-reveal overflow-hidden border border-white/10">
              <div className="p-8 md:p-10 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <div>
                    <h3 className="text-2xl font-black uppercase italic tracking-tighter">কাস্টমার স্টেটমেন্ট (লেজার)</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-widest">{selectedLedgerCust.name} • {company}</p>
                 </div>
                 <div className="flex gap-4">
                    <button onClick={handleDownloadLedgerPDF} className="bg-emerald-600 text-white px-6 py-3 rounded-2xl text-[9px] font-black uppercase shadow-xl active:scale-95">PDF ডাউনলোড ⎙</button>
                    <button onClick={() => setShowLedger(false)} className="text-4xl text-slate-500 hover:text-white font-black transition-colors">✕</button>
                 </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scroll p-1" ref={ledgerRef}>
                 <div className="p-10 text-black">
                    <div className="text-center mb-8 border-b-4 border-black pb-4">
                       <h1 className="text-4xl font-black uppercase italic mb-1">IFZA ELECTRONICS</h1>
                       <p className="text-md font-black uppercase tracking-[0.4em]">{company} DIVISION</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-10">
                       <div className="p-6 bg-slate-50 border-2 border-black rounded-3xl text-center">
                          <p className="text-[10px] font-black uppercase italic mb-2">মালের বকেয়া (Regular Due):</p>
                          <p className={`text-4xl font-black italic ${currentLedgerStats.reg > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>৳{currentLedgerStats.reg.toLocaleString()}</p>
                       </div>
                       <div className="p-6 bg-indigo-50 border-2 border-indigo-600 rounded-3xl text-center">
                          <p className="text-[10px] font-black uppercase italic mb-2 text-indigo-600">বুকিং জমা (Booking Advance):</p>
                          <p className="text-4xl font-black italic text-indigo-600">৳{currentLedgerStats.book.toLocaleString()}</p>
                       </div>
                    </div>

                    <table className="w-full border-collapse border-2 border-black">
                       <thead>
                          <tr className="bg-slate-100 text-[10px] font-black uppercase italic border-b-2 border-black">
                             <th className="p-4 text-left border border-black">তারিখ</th>
                             <th className="p-4 text-left border border-black">বিবরণ</th>
                             <th className="p-4 text-right border border-black">বাকি (Debit)</th>
                             <th className="p-4 text-right border border-black">জমা (Credit)</th>
                             <th className="p-2 text-center no-print">...</th>
                          </tr>
                       </thead>
                       <tbody className="text-[11px] font-bold">
                          {ledgerHistory.length === 0 ? (
                            <tr><td colSpan={5} className="p-20 text-center italic opacity-30">কোন লেনদেন পাওয়া যায়নি</td></tr>
                          ) : ledgerHistory.map((tx, i) => {
                             const isColl = tx.payment_type === 'COLLECTION';
                             const isBooking = tx.meta?.is_booking === true || tx.items?.[0]?.note?.includes('বুকিং');
                             
                             return (
                               <tr key={tx.id} className={`border border-black hover:bg-slate-50 transition-colors group ${isBooking ? 'bg-indigo-50/30' : ''}`}>
                                  <td className="p-4 border border-black italic">{new Date(tx.created_at).toLocaleDateString('bn-BD')}</td>
                                  <td className="p-4 border border-black uppercase italic font-black">
                                     {isColl ? (
                                       <span className={isBooking ? "text-indigo-600" : "text-emerald-600"}>
                                         {isBooking ? '📅 বুকিং অগ্রিম জমা' : '💰 নগদ আদায়'}
                                       </span>
                                     ) : (
                                       <span className="text-slate-900">📄 সেলস মেমো</span>
                                     )}
                                     <p className="text-[7px] mt-1 opacity-40">ID: #{tx.id.slice(-6).toUpperCase()} | BY: {tx.submitted_by}</p>
                                  </td>
                                  <td className="p-4 text-right border border-black text-rose-600 font-black italic">
                                     {!isColl ? `৳${Number(tx.amount).toLocaleString()}` : '—'}
                                  </td>
                                  <td className="p-4 text-right border border-black text-emerald-600 font-black italic">
                                     {isColl ? `৳${Number(tx.amount).toLocaleString()}` : '—'}
                                  </td>
                                  <td className="p-2 text-center border border-black no-print">
                                     {!isColl && tx.items && (
                                       <button onClick={() => { setSelectedMemoItems(tx.items); setSelectedMemoMeta(tx); }} className="text-blue-500 opacity-20 group-hover:opacity-100 transition-all text-sm" title="View Memo Details">👁️</button>
                                     )}
                                  </td>
                               </tr>
                             );
                          })}
                       </tbody>
                    </table>

                    <div className="mt-10 flex flex-col items-end">
                       <div className="w-80 space-y-4">
                          <div className="flex justify-between text-2xl font-black border-4 border-black p-4 bg-black text-white italic tracking-tighter">
                             <span className="text-[10px] self-center uppercase mr-4 tracking-widest font-black italic">Net Due:</span>
                             <span>৳{(currentLedgerStats.reg - currentLedgerStats.book).toLocaleString()}</span>
                          </div>
                          <p className="text-[8px] font-bold text-slate-400 text-right uppercase tracking-widest italic">* নিট বকেয়া = (মালের মোট বকেয়া - বুকিং জমা টাকা)</p>
                       </div>
                    </div>
                    
                    <div className="mt-20 text-center opacity-20 text-[8px] font-black uppercase tracking-[0.5em] italic">
                       Report Generated by IFZAERP Cloud Architecture
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* 🔍 Itemized Memo Details Modal */}
      {selectedMemoItems && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[5000] flex items-center justify-center p-4">
           <div className="bg-white rounded-[3rem] w-full max-w-lg shadow-2xl animate-reveal overflow-hidden">
              <div className="p-8 bg-blue-600 text-white flex justify-between items-center">
                 <div>
                    <h4 className="font-black uppercase italic text-sm tracking-tighter leading-none">পুরাতন মেমো ডিটেইলস</h4>
                    {selectedMemoMeta && <p className="text-[8px] font-bold uppercase mt-1.5 opacity-60">ID: #{selectedMemoMeta.id.slice(-6).toUpperCase()} • {new Date(selectedMemoMeta.created_at).toLocaleDateString('bn-BD')}</p>}
                 </div>
                 <button onClick={() => { setSelectedMemoItems(null); setSelectedMemoMeta(null); }} className="text-3xl font-black opacity-50 hover:opacity-100 transition-opacity">✕</button>
              </div>
              <div className="p-8 max-h-[60vh] overflow-y-auto custom-scroll">
                 <table className="w-full text-left">
                    <thead className="border-b-2">
                       <tr className="text-[9px] font-black uppercase text-slate-400 italic">
                          <th className="pb-4">Product Name</th>
                          <th className="pb-4 text-center">Qty</th>
                          <th className="pb-4 text-right">Total</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y">
                       {selectedMemoItems.map((item, idx) => (
                          <tr key={idx} className="group">
                             <td className="py-4 font-black uppercase italic text-[11px] text-slate-700">
                                {item.name}
                                {item.action && item.action !== 'SALE' && <span className={`ml-2 text-[7px] px-1.5 py-0.5 rounded border ${item.action === 'RETURN' ? 'text-red-500 border-red-100' : 'text-cyan-500 border-cyan-100'}`}>[{item.action}]</span>}
                             </td>
                             <td className="py-4 text-center font-black text-xs">{item.qty}</td>
                             <td className="py-4 text-right font-black italic text-xs">৳{Math.round(item.total || 0).toLocaleString()}</td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
                 <div className="mt-4 flex justify-between border-t-4 border-slate-900 pt-4">
                    <span className="text-[11px] font-black uppercase italic">নিট বিল (Net Total):</span>
                    <span className="font-black italic text-base text-blue-600">৳{Number(selectedMemoMeta?.amount || 0).toLocaleString()}</span>
                 </div>
              </div>
              <div className="p-8 bg-slate-50 border-t flex justify-center">
                 <button onClick={() => { setSelectedMemoItems(null); setSelectedMemoMeta(null); }} className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-black uppercase text-[10px] shadow-lg active:scale-95">বন্ধ করুন</button>
              </div>
           </div>
        </div>
      )}

      {/* ➕ Add/Edit Shop Modal */}
      {showModal && isAdmin && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-3xl z-[2000] flex items-center justify-center p-4">
           <div className="bg-white p-10 md:p-14 rounded-[4.5rem] w-full max-w-xl shadow-2xl animate-reveal max-h-[90vh] overflow-y-auto custom-scroll text-slate-900 border border-white/20">
              <div className="flex justify-between items-center mb-10 border-b pb-8">
                 <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none">{editingCustomer ? 'তথ্য এডিট করুন' : 'নতুন দোকান রেজিস্টার'}</h3>
                 <button onClick={() => setShowModal(false)} className="text-slate-300 text-4xl font-black hover:text-rose-500 transition-colors">×</button>
              </div>
              <form onSubmit={handleSave} className="space-y-6">
                 <div className="space-y-1.5">
                    <label className="ml-5 italic text-slate-400 uppercase text-[9px] font-black tracking-widest">দোকানের নাম</label>
                    <input required className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none font-black uppercase italic text-[14px] text-slate-900 focus:border-blue-500 transition-all shadow-inner" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <label className="ml-5 italic text-slate-400 uppercase text-[9px] font-black tracking-widest">মোবাইল</label>
                       <input required className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-3xl font-black text-slate-900 shadow-inner" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                    </div>
                    <div className="space-y-1.5">
                       <label className="ml-5 italic text-slate-400 uppercase text-[9px] font-black tracking-widest">এরিয়া</label>
                       <input className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-3xl font-black text-slate-900 shadow-inner" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                    </div>
                 </div>
                 <div className="p-8 bg-blue-50 rounded-[3rem] border border-blue-100 space-y-4 shadow-inner">
                    <p className="text-[10px] font-black text-blue-600 uppercase text-center italic tracking-widest">Customer Portal Access</p>
                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-1">
                          <label className="text-[8px] font-black uppercase text-slate-400 ml-2">User ID</label>
                          <input placeholder="USER ID" className="w-full p-4 bg-white rounded-2xl font-black text-[11px] uppercase outline-none focus:ring-4 ring-blue-100" value={formData.portal_username} onChange={e => setFormData({...formData, portal_username: e.target.value})} />
                       </div>
                       <div className="space-y-1">
                          <label className="text-[8px] font-black uppercase text-slate-400 ml-2">Password</label>
                          <input placeholder="PASS KEY" className="w-full p-4 bg-white rounded-2xl font-black text-[11px] outline-none focus:ring-4 ring-blue-100" value={formData.portal_password} onChange={e => setFormData({...formData, portal_password: e.target.value})} />
                       </div>
                    </div>
                 </div>
                 <div className="space-y-1.5">
                    <label className="ml-5 italic text-rose-500 uppercase text-[9px] font-black tracking-widest">পূর্বের বকেয়া (Opening Due)</label>
                    <input type="number" placeholder="0.00" className="w-full p-5 bg-rose-50 border-2 border-rose-100 rounded-3xl font-black text-rose-600 italic text-2xl shadow-inner text-center" value={formData.money_amount} onChange={e => setFormData({...formData, money_amount: e.target.value})} />
                 </div>
                 <button disabled={isSaving} type="submit" className="w-full bg-[#0f172a] text-white py-8 rounded-[2.5rem] font-black uppercase text-xs tracking-[0.4em] shadow-2xl active:scale-95 transition-all">
                    {isSaving ? "SYNCING..." : "কনফার্ম ও সেভ ➔"}
                 </button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
