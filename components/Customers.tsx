
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Company, UserRole, formatCurrency } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';
import * as XLSX from 'xlsx';
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
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ledgerRef = useRef<HTMLDivElement>(null);
  
  const [formData, setFormData] = useState({
    name: '', proprietor_name: '', phone: '', address: '', money_amount: '', portal_username: '', portal_password: ''
  });

  const isAdmin = role === 'ADMIN';

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
    } finally { setLoading(false); }
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
      pdf.save(`Ledger_${selectedLedgerCust?.name}_${new Date().getTime()}.pdf`);
    } catch (err) {
      alert("পিডিএফ ডাউনলোড ব্যর্থ হয়েছে।");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    if (!isAdmin) return;
    if (!confirm("আপনি কি নিশ্চিত এই কাস্টমার প্রোফাইলটি ডিলিট করতে চান? এর ফলে তার সকল লেনদেনের রেকর্ডও মুছে যেতে পারে।")) return;
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
      alert("কাস্টমার সফলভাবে ডিলিট হয়েছে!");
      fetchCustomers();
    } catch (err: any) { alert("ডিলিট করা যায়নি: " + err.message); }
  };

  const handleExport = () => {
    const exportData = customers.map(c => ({
      'Shop Name': c.name, 'Proprietor Name': c.proprietor_name, 'Phone': c.phone, 'Area/Address': c.address, 'Current Due': companyDues[c.id] || 0
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    XLSX.writeFile(wb, `IFZA_Customers_Backup_${new Date().toLocaleDateString()}.xlsx`);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      const dbCompany = mapToDbCompany(company);
      const payload = { 
        name: formData.name.trim(), 
        proprietor_name: formData.proprietor_name.trim(), 
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

      // Robust Opening Balance Adjustment logic
      if (formData.money_amount !== '') {
        const newAmt = Number(formData.money_amount);
        
        // Find existing opening balance transaction strictly
        const { data: existingTxs } = await supabase
          .from('transactions')
          .select('id')
          .eq('customer_id', customerId)
          .eq('company', dbCompany)
          .eq('payment_type', 'DUE')
          .filter('items->0->note', 'ilike', '%পূর্বের বকেয়া%');

        if (existingTxs && existingTxs.length > 0) {
          // Update the first matching one
          await supabase.from('transactions').update({ amount: newAmt }).eq('id', existingTxs[0].id);
        } else {
          // Create new one if none exists
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

      setShowModal(false); fetchCustomers();
      alert("সফলভাবে সংরক্ষিত হয়েছে!");
    } catch (err: any) { alert("ত্রুটি: " + err.message); } finally { setIsSaving(false); }
  };

  const filtered = customers.filter(c => (!search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search) || (c.portal_username && c.portal_username.includes(search.toLowerCase()))) && (!selectedArea || c.address === selectedArea));

  let runningBalance = 0;
  const processedLedger = ledgerHistory.map(tx => {
    const amt = Number(tx.amount) || 0;
    const isCredit = tx.payment_type === 'COLLECTION';
    if (isCredit) runningBalance -= amt;
    else runningBalance += amt;
    return { ...tx, debit: !isCredit ? amt : 0, credit: isCredit ? amt : 0, balance: runningBalance };
  }).reverse();

  const openEditModal = async (cust: any) => {
    setEditingCustomer(cust);
    const dbCompany = mapToDbCompany(company);
    
    // Fetch specifically the opening balance for this customer
    const { data: txs } = await supabase
      .from('transactions')
      .select('amount')
      .eq('customer_id', cust.id)
      .eq('company', dbCompany)
      .eq('payment_type', 'DUE')
      .filter('items->0->note', 'ilike', '%পূর্বের বকেয়া%');

    setFormData({
      name: cust.name, 
      proprietor_name: cust.proprietor_name || '', 
      phone: cust.phone, 
      address: cust.address || '', 
      money_amount: (txs && txs.length > 0) ? txs[0].amount.toString() : '', 
      portal_username: cust.portal_username || '', 
      portal_password: cust.portal_password || ''
    });
    setShowModal(true);
  };

  return (
    <div className="space-y-4 pb-40 relative text-black">
      <div className="sticky top-0 z-[110] -mx-6 px-6 py-3 bg-white/70 backdrop-blur-xl border-b border-slate-200">
        <div className="max-w-7xl mx-auto space-y-4">
           <div className="flex flex-col md:flex-row gap-4 items-center animate-reveal">
              <div className="flex-1 flex gap-2 items-center bg-slate-100 p-1.5 rounded-[1.8rem] shadow-inner border border-slate-200 w-full focus-within:ring-2 ring-blue-500/20 transition-all">
                 <div className="pl-4 text-slate-400">🔍</div>
                 <input autoFocus type="text" placeholder="দোকান বা ইউজার আইডি সার্চ..." className="flex-1 p-3 bg-transparent border-none text-[13px] font-bold uppercase outline-none text-black" value={search} onChange={e => setSearch(e.target.value)} />
                 <button onClick={() => setIsCompact(!isCompact)} className="bg-white p-3 rounded-2xl shadow-sm text-lg active:scale-90 transition-transform">
                   {isCompact ? "🔳" : "☰"}
                 </button>
              </div>
              <div className="flex gap-2 shrink-0">
                 <button onClick={handleExport} className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold uppercase text-[10px] shadow-lg active:scale-95 transition-all hover:bg-emerald-700">📥 Export</button>
                 <button onClick={() => { setEditingCustomer(null); setFormData({name:'', proprietor_name:'', phone:'', address:'', money_amount:'', portal_username:'', portal_password:''}); setShowModal(true); }} className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold uppercase text-[10px] shadow-lg hover:bg-blue-700 active:scale-95 transition-all">+ Add Shop</button>
              </div>
           </div>
           <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar animate-reveal">
              <button onClick={() => setSelectedArea("")} className={`px-5 py-2 rounded-full text-[9px] font-bold uppercase whitespace-nowrap border transition-all ${!selectedArea ? 'bg-blue-600 text-white border-blue-600 shadow-lg scale-105' : 'bg-white text-slate-400 border-slate-100 hover:border-blue-200'}`}>All Areas</button>
              {uniqueAreas.map(area => (
                <button key={area} onClick={() => setSelectedArea(area)} className={`px-5 py-2 rounded-full text-[9px] font-bold uppercase whitespace-nowrap border transition-all ${selectedArea === area ? 'bg-blue-600 text-white border-blue-600 shadow-lg scale-105' : 'bg-white text-slate-400 border-slate-100 hover:border-blue-200'}`}>{area}</button>
              ))}
           </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center animate-pulse text-slate-300 font-bold uppercase italic">লোড হচ্ছে...</div>
      ) : (
        <div className={isCompact ? "bg-white rounded-[2.5rem] border shadow-sm overflow-hidden" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"}>
           {isCompact && (
              <div className="grid grid-cols-12 bg-slate-50 p-5 text-[8px] font-bold uppercase tracking-widest text-slate-400 border-b">
                 <div className="col-span-5 md:col-span-4">Shop Identity</div>
                 <div className="hidden md:block col-span-3">User ID / Name</div>
                 <div className="col-span-4 md:col-span-2 text-right">BALANCE</div>
                 <div className="col-span-3 md:col-span-3 text-right">Actions</div>
              </div>
           )}
           {filtered.map((c) => {
             const balance = companyDues[c.id] || 0;
             const hasPortal = !!c.portal_username;
             return (
               <div key={c.id} className={isCompact ? "grid grid-cols-12 p-5 border-b hover:bg-blue-50/50 transition-all items-center animate-reveal" : "bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group animate-reveal"}>
                  <div className={isCompact ? "col-span-5 md:col-span-4 min-w-0 pr-4" : "flex justify-between items-start mb-4"}>
                     {isCompact ? (
                       <>
                         <div className="flex items-center gap-2 mb-1">
                            <p className="font-bold text-[12px] uppercase italic text-slate-800 leading-none truncate">{c.name}</p>
                         </div>
                         <p className="text-[8px] font-bold text-slate-400 tracking-tighter">📍 {c.address || "Area Missing"}</p>
                       </>
                     ) : (
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold bg-blue-600 text-white shadow-lg group-hover:scale-110 transition-transform">{c.name.charAt(0)}</div>
                     )}
                  </div>
                  {isCompact ? (
                    <div className="hidden md:block col-span-3 truncate">
                      <p className="text-blue-600 font-black uppercase text-[10px] italic leading-none">{c.portal_username || "No ID Set"}</p>
                      <p className="text-[7px] text-slate-400 mt-1 font-bold">{c.proprietor_name || "—"}</p>
                    </div>
                  ) : (
                    <div className="mt-4">
                       <h4 className="text-sm font-bold uppercase italic text-slate-800">{c.name}</h4>
                       <div className="flex items-center gap-2 mt-2">
                          <span className="bg-blue-100 text-blue-600 text-[8px] font-black px-2 py-0.5 rounded uppercase">ID: {c.portal_username || 'N/A'}</span>
                          <span className="text-[9px] font-bold text-slate-400">📱 {c.phone}</span>
                       </div>
                    </div>
                  )}
                  <div className={isCompact ? `col-span-4 md:col-span-2 text-right font-bold italic text-base ${balance > 1 ? 'text-red-600' : 'text-emerald-600'}` : "mt-6 pt-6 border-t flex justify-between items-end"}>
                     {balance.toLocaleString()}৳
                  </div>
                  <div className={isCompact ? "col-span-3 md:col-span-3 flex justify-end gap-1.5" : "mt-6 flex gap-2"}>
                     <button onClick={() => fetchCustomerLedger(c)} className="w-9 h-9 bg-slate-900 text-white rounded-xl flex items-center justify-center text-xs shadow-lg active:scale-90 hover:bg-black transition-all" title="Ledger">📑</button>
                     <button onClick={() => openEditModal(c)} className="w-9 h-9 bg-blue-600 text-white rounded-xl flex items-center justify-center text-xs shadow-lg active:scale-90 hover:bg-blue-700 transition-all" title="Edit">📝</button>
                     {isAdmin && <button onClick={() => handleDeleteCustomer(c.id)} className="w-9 h-9 bg-red-100 text-red-600 rounded-xl flex items-center justify-center text-xs hover:bg-red-600 hover:text-white transition-all shadow-sm active:scale-90">🗑️</button>}
                  </div>
               </div>
             );
           })}
        </div>
      )}

      {/* Ledger Modal */}
      {showLedger && selectedLedgerCust && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[2000] flex flex-col items-center p-4 overflow-y-auto no-print">
           <div className="w-full max-w-[148mm] flex justify-between gap-6 mb-8 sticky top-0 z-[2001] bg-slate-900/90 p-6 rounded-3xl border border-white/10 shadow-2xl items-center">
              <button onClick={() => setShowLedger(false)} className="text-white font-black uppercase text-[10px] px-6">← ফিরে যান</button>
              <button disabled={isDownloading} onClick={handleDownloadLedgerPDF} className="bg-emerald-600 text-white px-10 py-4 rounded-xl font-black text-[10px] uppercase shadow-xl active:scale-95 transition-all">
                 {isDownloading ? "ডাউনলোড..." : "PDF ডাউনলোড করুন ⬇"}
              </button>
           </div>

           <div ref={ledgerRef} className="bg-white w-[148mm] min-h-fit p-8 flex flex-col font-sans text-black shadow-2xl border-[3px] border-black">
              <div className="text-center mb-8 border-b-4 border-black pb-6">
                 <h1 className="text-[40px] font-black uppercase italic tracking-tighter leading-none mb-1">IFZA ELECTRONICS</h1>
                 <p className="text-xl font-black uppercase italic">{company} DIVISION</p>
                 <div className="mt-4 inline-block px-8 py-1.5 bg-black text-white text-[10px] font-black uppercase rounded-full italic">CUSTOMER LEDGER STATEMENT (লেজার)</div>
              </div>

              <div className="flex justify-between items-start mb-8 text-[11px] font-bold">
                 <div className="space-y-1">
                    <p className="text-[9px] font-black border-b border-black w-fit mb-1 uppercase opacity-60 italic">হিসাব পরিচিতি:</p>
                    <p className="text-2xl font-black uppercase italic leading-none">{selectedLedgerCust.name}</p>
                    <p className="mt-2">📍 {selectedLedgerCust.address}</p>
                    <p>📱 {selectedLedgerCust.phone}</p>
                    <p className="text-blue-700 font-black">ID: {selectedLedgerCust.portal_username}</p>
                 </div>
                 <div className="text-right space-y-1">
                    <p className="text-[9px] font-black border-b border-black w-fit ml-auto mb-1 uppercase opacity-60 italic">রিপোর্ট তথ্য:</p>
                    <p className="text-[12px] font-black">তারিখ: {new Date().toLocaleDateString('bn-BD')}</p>
                    <p className="text-red-600 font-black">মোট বকেয়া: {formatCurrency(companyDues[selectedLedgerCust.id] || 0)}</p>
                 </div>
              </div>

              <div className="flex-1">
                 <table className="w-full border-collapse border-2 border-black">
                    <thead>
                       <tr className="bg-black text-white text-[9px] font-black uppercase italic">
                          <th className="p-2 border border-black text-left w-20">তারিখ</th>
                          <th className="p-2 border border-black text-left">বিবরণ</th>
                          <th className="p-2 border border-black text-right w-16 text-red-300">ডেবিট (Debit)</th>
                          <th className="p-2 border border-black text-right w-16 text-emerald-300">ক্রেডিট (Credit)</th>
                          <th className="p-2 border border-black text-right w-20">বাকি (Balance)</th>
                       </tr>
                    </thead>
                    <tbody>
                       {processedLedger.map((tx, idx) => (
                          <tr key={idx} className="border-b border-black text-[10px] font-bold">
                             <td className="p-2 border-r border-black">{new Date(tx.created_at).toLocaleDateString('bn-BD')}</td>
                             <td className="p-2 border-r border-black uppercase italic truncate max-w-[120px]">
                                {tx.payment_type === 'COLLECTION' ? '💸 Cash Collected' : '📦 Sales Memo'}
                                <p className="text-[7px] opacity-40 font-black">ID: {tx.id.slice(-6).toUpperCase()}</p>
                             </td>
                             <td className="p-2 border-r border-black text-right">{tx.debit > 0 ? tx.debit.toLocaleString() : '—'}</td>
                             <td className="p-2 border-r border-black text-right text-emerald-600">{tx.credit > 0 ? tx.credit.toLocaleString() : '—'}</td>
                             <td className="p-2 text-right font-black">৳{tx.balance.toLocaleString()}</td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>

              <div className="mt-16 flex justify-between items-end px-4 mb-4">
                 <div className="text-center w-40 border-t-2 border-black pt-2 font-black italic text-[11px]">ক্রেতার স্বাক্ষর</div>
                 <div className="text-center w-52 border-t-2 border-black pt-2 text-right">
                    <p className="text-[14px] font-black uppercase italic tracking-tighter">কর্তৃপক্ষের স্বাক্ষর</p>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[2000] flex items-center justify-center p-4">
           <div className="bg-white p-10 md:p-14 rounded-[4rem] w-full max-w-lg shadow-2xl animate-reveal text-slate-900 overflow-y-auto max-h-[95vh] custom-scroll">
              <div className="flex justify-between items-center mb-8 border-b pb-4">
                 <h3 className="text-2xl font-bold uppercase italic">{editingCustomer ? 'তথ্য আপডেট' : 'নতুন কাস্টমার যোগ'}</h3>
                 <button onClick={() => setShowModal(false)} className="text-3xl text-slate-300 font-bold hover:text-red-500">✕</button>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                 <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase ml-4 italic">দোকানের নাম</label>
                    <input required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold uppercase italic text-sm focus:border-blue-500 transition-all text-black" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase ml-4 italic">মালিকের নাম</label>
                    <input className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold uppercase italic text-sm focus:border-blue-500 transition-all text-black" value={formData.proprietor_name} onChange={e => setFormData({...formData, proprietor_name: e.target.value})} />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase ml-4 italic">মোবাইল নম্বর</label>
                    <input required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold italic text-sm focus:border-blue-500 transition-all text-black" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase ml-4 italic">এরিয়া/ঠিকানা</label>
                    <input className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold uppercase italic text-sm focus:border-blue-500 transition-all text-black" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                 </div>
                 
                 <div className="pt-6 border-t mt-6 space-y-4">
                    <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest italic ml-2">Shop Portal Credentials</h4>
                    <div className="grid grid-cols-2 gap-3">
                       <div className="space-y-1">
                          <label className="text-[8px] font-bold text-slate-400 uppercase ml-4 italic">Login User ID (ইউজার আইডি)</label>
                          <input required className="w-full p-4 bg-blue-50/50 border-2 border-blue-100 rounded-2xl outline-none font-bold text-xs focus:border-blue-500 transition-all text-black" placeholder="যেমন: ajifa123" value={formData.portal_username} onChange={e => setFormData({...formData, portal_username: e.target.value})} />
                       </div>
                       <div className="space-y-1">
                          <label className="text-[8px] font-bold text-slate-400 uppercase ml-4 italic">Password (পাসওয়ার্ড)</label>
                          <input required className="w-full p-4 bg-blue-50/50 border-2 border-blue-100 rounded-2xl outline-none font-bold text-xs focus:border-blue-500 transition-all text-black" placeholder="Default: 123" value={formData.portal_password} onChange={e => setFormData({...formData, portal_password: e.target.value})} />
                       </div>
                    </div>
                 </div>

                 <div className="pt-4 border-t space-y-4">
                    <div className="space-y-1">
                       <label className="text-[9px] font-bold text-red-400 uppercase ml-4 italic">পূর্বের বকেয়া (Edit Money Amount)</label>
                       <input type="number" className="w-full p-4 bg-red-50 border-2 border-red-100 rounded-2xl outline-none font-bold text-red-600 text-sm focus:border-red-500 transition-all" value={formData.money_amount} onChange={e => setFormData({...formData, money_amount: e.target.value})} />
                       <p className="text-[7px] text-slate-400 ml-4">* টাকা পরিবর্তন করলে স্বয়ংক্রিয়ভাবে লেজার আপডেট হবে।</p>
                    </div>
                 </div>

                 <button disabled={isSaving} type="submit" className="w-full bg-blue-600 text-white py-6 rounded-3xl font-bold uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all mt-6">
                    {isSaving ? "সংরক্ষণ হচ্ছে..." : "সংরক্ষণ করুন ➔"}
                 </button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
