
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
  const [companyDues, setCompanyDues] = useState<Record<string, number>>({});
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
        .select('customer_id, amount, payment_type')
        .eq('company', dbCompany);
      
      const duesMap: Record<string, number> = {};
      txData?.forEach(tx => {
        const amt = Number(tx.amount) || 0;
        duesMap[tx.customer_id] = (duesMap[tx.customer_id] || 0) + (tx.payment_type === 'COLLECTION' ? -amt : amt);
      });

      setCustomers(custData || []);
      setCompanyDues(duesMap);
      const areas = Array.from(new Set(custData?.map(c => c.address?.trim()).filter(Boolean) || [])).sort() as string[];
      setUniqueAreas(areas);
    } catch (err) {
        console.error(err);
    } finally { setLoading(false); }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
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
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('customer_id', cust.id)
        .eq('company', mapToDbCompany(company))
        .order('created_at', { ascending: true });
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

  const openEditModal = async (cust: any) => {
    setEditingCustomer(cust);
    const dbCompany = mapToDbCompany(company);
    const { data: tx } = await supabase
      .from('transactions')
      .select('amount')
      .eq('customer_id', cust.id)
      .eq('company', dbCompany)
      .ilike('items->0->note', '%পূর্বের বকেয়া%')
      .maybeSingle();

    setFormData({
      name: cust.name, 
      phone: cust.phone, 
      address: cust.address || '', 
      money_amount: tx ? tx.amount.toString() : '', 
      portal_username: cust.portal_username || '', 
      portal_password: cust.portal_password || ''
    });
    setShowModal(true);
  };

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
              <button onClick={() => { setEditingCustomer(null); setFormData({name:'', phone:'', address:'', money_amount:'', portal_username:'', portal_password:''}); setShowModal(true); }} className="bg-blue-600 text-white px-8 py-4 rounded-3xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all">+ নতুন দোকান যোগ</button>
           </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center animate-pulse text-slate-300 font-bold uppercase italic text-xs tracking-[0.4em]">Node Fetching Data...</div>
      ) : (
        <div className={isCompact ? "bg-white rounded-[3.5rem] border border-slate-100 shadow-xl overflow-hidden" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"}>
           {isCompact && (
              <div className="grid grid-cols-12 bg-slate-900 text-white/50 p-6 text-[8px] font-black uppercase tracking-widest italic border-b border-white/5">
                 <div className="col-span-5 md:col-span-4">Shop & Identity</div>
                 <div className="hidden md:block col-span-3">Login User ID</div>
                 <div className="col-span-4 md:col-span-2 text-right">BALANCE</div>
                 <div className="col-span-3 md:col-span-3 text-right">Actions</div>
              </div>
           )}
           {filtered.map((c, idx) => {
             const balance = companyDues[c.id] || 0;
             return (
               <div key={c.id} className={isCompact ? "grid grid-cols-12 p-6 border-b border-slate-50 items-center animate-reveal hover:bg-slate-50 transition-all group" : "bg-white p-8 rounded-[3.5rem] border border-slate-100 shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-1 animate-reveal relative overflow-hidden"} style={{ animationDelay: `${idx * 0.03}s` }}>
                  {!isCompact && <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-[4rem] -z-0 opacity-40 group-hover:scale-110 transition-transform"></div>}
                  <div className={isCompact ? "col-span-5 md:col-span-4 pr-4" : "mb-6 relative z-10"}>
                     <p className="font-black text-[13px] uppercase italic text-slate-800 truncate mb-1 group-hover:text-blue-600 transition-colors">{c.name}</p>
                     <p className="text-[9px] font-bold text-slate-400 tracking-widest uppercase italic">📍 {c.address || "Area Missing"} • 📱 {c.phone}</p>
                  </div>
                  {isCompact && <div className="hidden md:block col-span-3 text-blue-600 font-black uppercase text-[10px] italic">{c.portal_username || "No ID"}</div>}
                  <div className={isCompact ? `col-span-4 md:col-span-2 text-right font-black italic text-base ${balance > 1 ? 'text-rose-600' : 'text-emerald-600'}` : "mt-6 pt-6 border-t font-black relative z-10"}>
                     {!isCompact && <p className="text-[8px] text-slate-400 uppercase tracking-widest mb-1 italic">Active Balance</p>}
                     <span className={!isCompact ? `text-4xl tracking-tighter ${balance > 1 ? 'text-rose-600' : 'text-emerald-600'}` : ""}>{(balance || 0).toLocaleString()}৳</span>
                  </div>
                  <div className={isCompact ? "col-span-3 md:col-span-3 flex justify-end gap-2" : "mt-8 flex gap-3 relative z-10"}>
                     <button onClick={() => fetchCustomerLedger(c)} className="w-11 h-11 bg-slate-900 text-white rounded-2xl flex items-center justify-center text-xs shadow-xl active:scale-90 transition-all hover:bg-indigo-600">📑</button>
                     <button onClick={() => openEditModal(c)} className="w-11 h-11 bg-blue-600 text-white rounded-2xl flex items-center justify-center text-xs shadow-xl active:scale-90 transition-all hover:bg-blue-700">📝</button>
                     {isAdmin && <button onClick={async () => { if(confirm("ডিলিট?")) { await supabase.from('customers').delete().eq('id', c.id); fetchCustomers(); } }} className="w-11 h-11 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center text-xs hover:bg-rose-500 hover:text-white transition-all shadow-sm active:scale-90">🗑️</button>}
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
                    <div className="text-center mb-10 border-b-4 border-black pb-4">
                       <h1 className="text-4xl font-black uppercase italic mb-1">IFZA ELECTRONICS</h1>
                       <p className="text-md font-black uppercase tracking-[0.4em] mb-2">{company} DIVISION</p>
                       <p className="text-xs font-bold italic">Official Account Ledger Summary</p>
                    </div>

                    <div className="flex justify-between items-start mb-8 text-[12px] font-bold">
                       <div>
                          <p className="text-[10px] font-black opacity-50 uppercase border-b border-black w-fit mb-2">ক্রেতা তথ্য:</p>
                          <p className="text-2xl font-black uppercase italic leading-none">{selectedLedgerCust.name}</p>
                          <p className="mt-2 font-black italic">📍 ঠিকানা: {selectedLedgerCust.address}</p>
                          <p className="font-black italic">📱 মোবাইল: {selectedLedgerCust.phone}</p>
                       </div>
                       <div className="text-right">
                          <p className="text-[10px] font-black opacity-50 uppercase border-b border-black w-fit ml-auto mb-2">বিবরণী তারিখ:</p>
                          <p className="text-lg font-black">{new Date().toLocaleDateString('bn-BD')}</p>
                       </div>
                    </div>

                    <table className="w-full border-collapse border-2 border-black">
                       <thead>
                          <tr className="bg-slate-100 text-[10px] font-black uppercase italic border-b-2 border-black">
                             <th className="p-4 text-left border border-black">তারিখ</th>
                             <th className="p-4 text-left border border-black">বিবরণ</th>
                             <th className="p-4 text-right border border-black">ডেবিট (বাকি)</th>
                             <th className="p-4 text-right border border-black">ক্রেডিট (জমা)</th>
                          </tr>
                       </thead>
                       <tbody className="text-[11px] font-bold">
                          {ledgerHistory.length === 0 ? (
                            <tr><td colSpan={4} className="p-20 text-center italic opacity-30">কোন লেনদেন পাওয়া যায়নি</td></tr>
                          ) : ledgerHistory.map((tx, i) => {
                             const isColl = tx.payment_type === 'COLLECTION';
                             return (
                               <tr key={tx.id} className="border border-black">
                                  <td className="p-4 border border-black italic">{new Date(tx.created_at).toLocaleDateString('bn-BD')}</td>
                                  <td className="p-4 border border-black uppercase italic font-black">
                                     {isColl ? '💰 নগদ জমা' : '📄 সেলস মেমো'}
                                     <p className="text-[7px] mt-1 opacity-40">REF: #{tx.id.slice(-6).toUpperCase()}</p>
                                  </td>
                                  <td className="p-4 text-right border border-black text-rose-600 font-black italic">
                                     {!isColl ? `৳${Number(tx.amount).toLocaleString()}` : '—'}
                                  </td>
                                  <td className="p-4 text-right border border-black text-emerald-600 font-black italic">
                                     {isColl ? `৳${Number(tx.amount).toLocaleString()}` : '—'}
                                  </td>
                               </tr>
                             );
                          })}
                       </tbody>
                    </table>

                    <div className="mt-10 flex justify-end">
                       <div className="w-72 space-y-2">
                          <div className="flex justify-between text-2xl font-black border-4 border-black p-4 bg-black text-white italic tracking-tighter">
                             <span className="text-[10px] self-center uppercase mr-4 tracking-widest font-black italic">Net Balance:</span>
                             <span>৳{(companyDues[selectedLedgerCust.id] || 0).toLocaleString()}</span>
                          </div>
                          <p className="text-[8px] font-black text-right uppercase opacity-40 mt-1 italic tracking-widest">Total Market Due to {company}</p>
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

      {/* ➕ Premium Add/Edit Shop Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-3xl z-[2000] flex items-center justify-center p-4">
           <div className="bg-white p-10 md:p-14 rounded-[4.5rem] w-full max-w-xl shadow-2xl animate-reveal max-h-[90vh] overflow-y-auto custom-scroll text-slate-900 border border-white/20">
              <div className="flex justify-between items-center mb-10 border-b pb-8">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-xl font-black italic shadow-xl">ই</div>
                    <div>
                       <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none">{editingCustomer ? 'তথ্য এডিট করুন' : 'নতুন দোকান রেজিস্টার'}</h3>
                       <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">IFZA Enterprise Cloud Node</p>
                    </div>
                 </div>
                 <button onClick={() => setShowModal(false)} className="text-slate-300 text-4xl font-black hover:text-rose-500 transition-colors">×</button>
              </div>
              <form onSubmit={handleSave} className="space-y-6">
                 <div className="space-y-1.5">
                    <label className="ml-5 italic text-slate-400 uppercase text-[9px] font-black tracking-widest">দোকানের নাম (Shop Identity)</label>
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
                 <div className="p-8 bg-blue-50 rounded-[3rem] border border-blue-100 space-y-5 shadow-inner">
                    <p className="text-[10px] font-black text-blue-600 uppercase text-center italic tracking-widest">Customer Portal Credentials</p>
                    <div className="grid grid-cols-2 gap-4">
                       <input placeholder="USER ID" className="p-5 bg-white rounded-2xl font-black text-[11px] uppercase outline-none focus:ring-4 ring-blue-100 shadow-sm" value={formData.portal_username} onChange={e => setFormData({...formData, portal_username: e.target.value})} />
                       <input placeholder="PASS KEY" title="ডিফল্ট: 123" className="p-5 bg-white rounded-2xl font-black text-[11px] outline-none focus:ring-4 ring-blue-100 shadow-sm" value={formData.portal_password} onChange={e => setFormData({...formData, portal_password: e.target.value})} />
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
