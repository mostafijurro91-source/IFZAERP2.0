
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

  const handleDeleteTransaction = async (txId: string) => {
    if (!isAdmin) return;
    if (!confirm("আপনি কি নিশ্চিত এই লেনদেনটি চিরতরে মুছে ফেলতে চান?")) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('transactions').delete().eq('id', txId);
      if (error) throw error;
      if (selectedLedgerCust) fetchCustomerLedger(selectedLedgerCust);
      fetchCustomers();
    } finally { setIsSaving(false); }
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

  const handleDeleteCustomer = async (id: string) => {
    if (!isAdmin) return;
    if (!confirm("আপনি কি নিশ্চিত এই কাস্টমার প্রোফাইলটি ডিলিট করতে চান?")) return;
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
      fetchCustomers();
    } catch (err: any) { alert("ডিলিট করা যায়নি! আগে লেনদেনগুলো মুছুন।"); }
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
    <div className="space-y-4 pb-40 relative text-black">
      <div className="sticky top-0 z-[110] -mx-6 px-6 py-3 bg-white/70 backdrop-blur-xl border-b border-slate-200">
        <div className="max-w-7xl mx-auto space-y-4">
           <div className="flex flex-col md:flex-row gap-3 items-center animate-reveal">
              <div className="flex-[2] flex gap-2 items-center bg-slate-100 p-1.5 rounded-[1.8rem] shadow-inner border border-slate-200 w-full">
                 <div className="pl-4 text-slate-400">🔍</div>
                 <input autoFocus type="text" placeholder="দোকান বা ইউজার আইডি সার্চ..." className="flex-1 p-3 bg-transparent border-none text-[13px] font-bold uppercase outline-none text-black" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="flex-1 w-full md:w-auto">
                 <select className="w-full p-4 bg-white border-2 border-slate-200 rounded-[1.8rem] text-[11px] font-black uppercase italic outline-none shadow-sm focus:border-blue-600 transition-all" value={selectedArea} onChange={e => setSelectedArea(e.target.value)}>
                   <option value="">সকল এরিয়া</option>
                   {uniqueAreas.map(area => <option key={area} value={area}>{area}</option>)}
                 </select>
              </div>
              <div className="flex gap-2 shrink-0">
                 <button onClick={() => setIsCompact(!isCompact)} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">{isCompact ? "🔳" : "☰"}</button>
                 <button onClick={() => { setEditingCustomer(null); setFormData({name:'', phone:'', address:'', money_amount:'', portal_username:'', portal_password:''}); setShowModal(true); }} className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all">+ নতুন দোকান যোগ</button>
              </div>
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
                 <div className="hidden md:block col-span-3">Login User ID</div>
                 <div className="col-span-4 md:col-span-2 text-right">BALANCE</div>
                 <div className="col-span-3 md:col-span-3 text-right">Actions</div>
              </div>
           )}
           {filtered.map((c) => {
             const balance = companyDues[c.id] || 0;
             return (
               <div key={c.id} className={isCompact ? "grid grid-cols-12 p-5 border-b items-center animate-reveal hover:bg-slate-50 transition-all" : "bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm"}>
                  <div className={isCompact ? "col-span-5 md:col-span-4 pr-4" : "mb-4"}>
                     <p className="font-bold text-[12px] uppercase italic text-slate-800 truncate leading-none mb-1">{c.name}</p>
                     <p className="text-[8px] font-bold text-slate-400 tracking-tighter">📍 {c.address || "Area Missing"} • 📱 {c.phone}</p>
                  </div>
                  {isCompact && <div className="hidden md:block col-span-3 text-blue-600 font-black uppercase text-[10px] italic">{c.portal_username || "No ID"}</div>}
                  <div className={isCompact ? `col-span-4 md:col-span-2 text-right font-black italic text-base ${balance > 1 ? 'text-red-600' : 'text-emerald-600'}` : "mt-4 pt-4 border-t font-black"}>
                     {(balance || 0).toLocaleString()}৳
                  </div>
                  <div className={isCompact ? "col-span-3 md:col-span-3 flex justify-end gap-1.5" : "mt-4 flex gap-2"}>
                     <button onClick={() => fetchCustomerLedger(c)} className="w-9 h-9 bg-slate-900 text-white rounded-xl flex items-center justify-center text-xs shadow-lg active:scale-90 transition-transform">📑</button>
                     <button onClick={() => openEditModal(c)} className="w-9 h-9 bg-blue-600 text-white rounded-xl flex items-center justify-center text-xs shadow-lg active:scale-90 transition-transform">📝</button>
                     {isAdmin && <button onClick={() => handleDeleteCustomer(c.id)} className="w-9 h-9 bg-red-50 text-red-600 rounded-xl flex items-center justify-center text-xs hover:bg-red-600 hover:text-white transition-all active:scale-90">🗑️</button>}
                  </div>
               </div>
             );
           })}
        </div>
      )}

      {/* ➕ Add/Edit Shop Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl z-[2000] flex items-center justify-center p-4">
           <div className="bg-white p-8 md:p-12 rounded-[3.5rem] w-full max-w-lg shadow-2xl animate-reveal max-h-[90vh] overflow-y-auto custom-scroll text-black">
              <div className="flex justify-between items-center mb-8 border-b pb-6">
                 <h3 className="text-xl font-black uppercase italic tracking-tighter">{editingCustomer ? 'দোকান তথ্য এডিট' : 'নতুন দোকান রেজিস্টার'}</h3>
                 <button onClick={() => setShowModal(false)} className="text-slate-400 text-3xl font-black hover:text-red-500">×</button>
              </div>
              <form onSubmit={handleSave} className="space-y-5">
                 <div className="space-y-1">
                    <label className="ml-4 italic text-slate-400 uppercase text-[9px]">দোকানের নাম (Shop Name)</label>
                    <input required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold uppercase italic text-[13px] text-black" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                 </div>
                 <div className="space-y-1">
                    <label className="ml-4 italic text-slate-400 uppercase text-[9px]">মোবাইল নম্বর</label>
                    <input required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-black" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                 </div>
                 <div className="space-y-1">
                    <label className="ml-4 italic text-slate-400 uppercase text-[9px]">এরিয়া বা ঠিকানা</label>
                    <input className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-black" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                 </div>
                 <div className="p-6 bg-blue-50/50 rounded-3xl border-2 border-blue-100 space-y-4">
                    <p className="text-[10px] font-black text-blue-600 uppercase text-center italic">কাস্টমার পোর্টাল এক্সেস (Login Info)</p>
                    <div className="grid grid-cols-2 gap-3">
                       <input placeholder="User ID" className="p-4 bg-white rounded-xl font-bold text-[11px] uppercase outline-none focus:ring-2 ring-blue-300 text-black" value={formData.portal_username} onChange={e => setFormData({...formData, portal_username: e.target.value})} />
                       <input placeholder="Password" title="ডিফল্ট পাসওয়ার্ড: 123" className="p-4 bg-white rounded-xl font-bold text-[11px] outline-none focus:ring-2 ring-blue-300 text-black" value={formData.portal_password} onChange={e => setFormData({...formData, portal_password: e.target.value})} />
                    </div>
                 </div>
                 <div className="space-y-1">
                    <label className="ml-4 italic text-red-400 uppercase text-[9px]">পূর্বের বকেয়া (Opening Balance)</label>
                    <input type="number" placeholder="0.00" className="w-full p-4 bg-rose-50 border-2 border-rose-100 rounded-2xl font-black text-rose-600 italic" value={formData.money_amount} onChange={e => setFormData({...formData, money_amount: e.target.value})} />
                 </div>
                 <button disabled={isSaving} type="submit" className="w-full bg-blue-600 text-white py-6 rounded-3xl font-black uppercase text-xs tracking-widest shadow-2xl active:scale-95 transition-all">
                    {isSaving ? "সংরক্ষণ হচ্ছে..." : "কনফার্ম সেভ ➔"}
                 </button>
              </form>
           </div>
        </div>
      )}

      {showLedger && selectedLedgerCust && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[2000] flex items-center justify-center p-4">
           <div className="bg-white rounded-[3rem] w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl animate-reveal overflow-hidden">
              <div className="p-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <div><h3 className="text-xl font-black uppercase italic">{selectedLedgerCust.name}</h3><p className="text-[9px] text-slate-500 uppercase tracking-widest mt-1">Official Statement • {company}</p></div>
                 <div className="flex gap-3">
                   <button onClick={handleDownloadLedgerPDF} className="bg-emerald-600 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase">Download PDF ⬇</button>
                   <button onClick={() => setShowLedger(false)} className="text-slate-400 text-3xl font-black">×</button>
                 </div>
              </div>
              <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scroll bg-slate-50">
                <div ref={ledgerRef} className="bg-white p-10 border shadow-sm rounded-3xl min-h-full text-black">
                  <div className="text-center border-b-2 border-black pb-4 mb-8">
                     <h2 className="text-3xl font-black uppercase italic">IFZA ELECTRONICS</h2>
                     <p className="text-xs font-bold opacity-60 uppercase">{company} DIVISION</p>
                  </div>
                  <table className="w-full text-left border-collapse">
                    <thead>
                       <tr className="bg-slate-900 text-white text-[9px] font-black uppercase italic">
                          <th className="p-3 border border-slate-700">তারিখ</th>
                          <th className="p-3 border border-slate-700">বিবরণ</th>
                          <th className="p-3 border border-slate-700 text-right">ডেবিট</th>
                          <th className="p-3 border border-slate-700 text-right">ক্রেডিট</th>
                       </tr>
                    </thead>
                    <tbody className="text-[11px] font-bold">
                       {ledgerHistory.map((tx) => (
                         <tr key={tx.id} className="border-b border-slate-100 hover:bg-blue-50/50 transition-all">
                            <td className="p-3 text-black">{new Date(tx.created_at).toLocaleDateString('bn-BD')}</td>
                            <td className="p-3 uppercase text-black">
                               <p className="font-bold">{tx.payment_type === 'COLLECTION' ? '💰 নগদ জমা' : '📄 মালের ইনভয়েস'}</p>
                               <p className="text-[7px] text-slate-400">ID: #{tx.id.slice(-6).toUpperCase()}</p>
                            </td>
                            <td className="p-3 text-right text-red-600 font-black italic">{tx.payment_type !== 'COLLECTION' ? `৳${(Number(tx.amount) || 0).toLocaleString()}` : '—'}</td>
                            <td className="p-3 text-right text-emerald-600 font-black italic">{tx.payment_type === 'COLLECTION' ? `৳${(Number(tx.amount) || 0).toLocaleString()}` : '—'}</td>
                         </tr>
                       ))}
                    </tbody>
                  </table>
                </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
