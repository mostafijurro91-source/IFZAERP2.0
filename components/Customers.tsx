
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
    } catch (err) {
        console.error(err);
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
    const confirmDelete = confirm("আপনি কি নিশ্চিত এই কাস্টমার প্রোফাইলটি ডিলিট করতে চান?\n\nসতর্কতা: যদি এই কাস্টমারের নামে কোনো সেলস মেমো বা লেনদেন থাকে, তবে ডাটাবেস এটি ডিলিট করতে দেবে না। সেক্ষেত্রে আগে তার সকল লেনদেন ডিলিট করতে হবে।");
    if (!confirmDelete) return;

    try {
      setLoading(true);
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) {
          if (error.message.includes("foreign key constraint")) {
              throw new Error("এই কাস্টমারের নামে লেনদেন (Transactions) জমা আছে, তাই ডিলিট করা যাচ্ছে না। প্রথমে তার লেজার থেকে সব ডিলিট করুন।");
          }
          throw error;
      }
      alert("কাস্টমার সফলভাবে ডিলিট হয়েছে!");
      await fetchCustomers();
    } catch (err: any) { 
        alert("ডিলিট করা যায়নি: " + err.message); 
    } finally {
        setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      const dbCompany = mapToDbCompany(company);
      
      // Removed 'proprietor_name' to strictly follow DB schema
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

      // Opening Balance Adjustment
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
      await fetchCustomers();
      alert("সফলভাবে সংরক্ষিত হয়েছে!");
    } catch (err: any) { 
        alert("ত্রুটি: " + err.message); 
    } finally { 
        setIsSaving(false); 
    }
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
           <div className="flex flex-col md:flex-row gap-4 items-center animate-reveal">
              <div className="flex-1 flex gap-2 items-center bg-slate-100 p-1.5 rounded-[1.8rem] shadow-inner border border-slate-200 w-full focus-within:ring-2 ring-blue-500/20 transition-all">
                 <div className="pl-4 text-slate-400">🔍</div>
                 <input autoFocus type="text" placeholder="দোকান বা ইউজার আইডি সার্চ..." className="flex-1 p-3 bg-transparent border-none text-[13px] font-bold uppercase outline-none text-black" value={search} onChange={e => setSearch(e.target.value)} />
                 <button onClick={() => setIsCompact(!isCompact)} className="bg-white p-3 rounded-2xl shadow-sm text-lg active:scale-90 transition-transform">
                   {isCompact ? "🔳" : "☰"}
                 </button>
              </div>
              <div className="flex gap-2 shrink-0">
                 <button onClick={() => { setEditingCustomer(null); setFormData({name:'', phone:'', address:'', money_amount:'', portal_username:'', portal_password:''}); setShowModal(true); }} className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all">+ নতুন দোকান যোগ</button>
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
                  {isCompact && (
                    <div className="hidden md:block col-span-3 text-blue-600 font-black uppercase text-[10px] italic">{c.portal_username || "No ID"}</div>
                  )}
                  <div className={isCompact ? `col-span-4 md:col-span-2 text-right font-black italic text-base ${balance > 1 ? 'text-red-600' : 'text-emerald-600'}` : "mt-4 pt-4 border-t font-black"}>
                     {balance.toLocaleString()}৳
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

      {/* Modal */}
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
                    <input required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold uppercase text-sm focus:border-blue-500 transition-all text-black" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase ml-4 italic">মোবাইল নম্বর</label>
                    <input required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold text-sm focus:border-blue-500 transition-all text-black" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase ml-4 italic">এরিয়া/ঠিকানা</label>
                    <input className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold uppercase text-sm focus:border-blue-500 transition-all text-black" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                 </div>
                 
                 <div className="pt-6 border-t mt-6 space-y-4">
                    <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest italic ml-2">Login Credentials (পোর্টালে লগইন করার জন্য)</h4>
                    <div className="grid grid-cols-2 gap-3">
                       <div className="space-y-1">
                          <label className="text-[8px] font-bold text-slate-400 uppercase ml-4 italic">User ID (ইউজার আইডি)</label>
                          <input required className="w-full p-4 bg-blue-50/50 border-2 border-blue-100 rounded-2xl outline-none font-bold text-xs focus:border-blue-500 transition-all text-black" placeholder="যেমন: shop123" value={formData.portal_username} onChange={e => setFormData({...formData, portal_username: e.target.value})} />
                       </div>
                       <div className="space-y-1">
                          <label className="text-[8px] font-bold text-slate-400 uppercase ml-4 italic">Password (পাসওয়ার্ড)</label>
                          <input required className="w-full p-4 bg-blue-50/50 border-2 border-blue-100 rounded-2xl outline-none font-bold text-xs focus:border-blue-500 transition-all text-black" placeholder="পাসওয়ার্ড দিন" value={formData.portal_password} onChange={e => setFormData({...formData, portal_password: e.target.value})} />
                       </div>
                    </div>
                 </div>

                 <div className="pt-4 border-t space-y-4">
                    <div className="space-y-1">
                       <label className="text-[9px] font-bold text-red-400 uppercase ml-4 italic">পূর্বের বকেয়া/টাকা (Edit Money Amount)</label>
                       <input type="number" className="w-full p-4 bg-red-50 border-2 border-red-100 rounded-2xl outline-none font-bold text-red-600 text-sm focus:border-red-500 transition-all" value={formData.money_amount} onChange={e => setFormData({...formData, money_amount: e.target.value})} />
                       <p className="text-[7px] text-slate-400 ml-4 italic">* টাকা পরিবর্তন করলে অটোমেটিক লেজারে 'পূর্বের বকেয়া' আপডেট হবে।</p>
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
