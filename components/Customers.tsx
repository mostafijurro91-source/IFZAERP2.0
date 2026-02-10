
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Company, UserRole, formatCurrency } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';
import * as XLSX from 'xlsx';

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
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const handleDeleteCustomer = async (id: string) => {
    if (!isAdmin) return;
    if (!confirm("আপনি কি নিশ্চিত এই কাস্টমার প্রোফাইলটি ডিলিট করতে চান? এর ফলে তার সকল লেনদেনের রেকর্ডও মুছে যেতে পারে।")) return;
    
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
      alert("কাস্টমার সফলভাবে ডিলিট হয়েছে!");
      fetchCustomers();
    } catch (err: any) {
      alert("ডিলিট করা যায়নি: " + err.message);
    }
  };

  const handleExport = () => {
    const exportData = customers.map(c => ({
      'Shop Name': c.name,
      'Proprietor Name': c.proprietor_name,
      'Phone': c.phone,
      'Area/Address': c.address,
      'Current Due': companyDues[c.id] || 0
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    XLSX.writeFile(wb, `IFZA_Customers_Backup_${new Date().toLocaleDateString()}.xlsx`);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        if (data.length === 0) return alert("ফাইলটি খালি!");

        setIsSaving(true);
        for (const item of data) {
          const phoneStr = String(item['Phone'] || item['phone'] || '');
          if (!phoneStr) continue;

          const payload = {
            name: item['Shop Name'] || item['name'] || 'Unknown Shop',
            proprietor_name: item['Proprietor Name'] || item['proprietor_name'] || '',
            phone: phoneStr,
            address: item['Area/Address'] || item['address'] || '',
            portal_username: phoneStr,
            portal_password: '123'
          };

          await supabase.from('customers').upsert([payload], { onConflict: 'phone' });
        }
        
        alert("কাস্টমার ডাটা ইমপোর্ট হয়েছে!");
        fetchCustomers();
      } catch (err) {
        alert("ইমপোর্ট ব্যর্থ হয়েছে।");
      } finally {
        setIsSaving(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsBinaryString(file);
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
        .order('created_at', { ascending: false });
      setLedgerHistory(data || []);
    } catch (err) { console.error(err); }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      const payload = { 
        name: formData.name.trim(), 
        proprietor_name: formData.proprietor_name.trim(),
        phone: formData.phone.trim(), 
        address: formData.address.trim(), 
        portal_username: formData.portal_username.toLowerCase() || formData.phone,
        portal_password: formData.portal_password || '123'
      };
      
      let customerId = '';
      if (editingCustomer) {
        await supabase.from('customers').update(payload).eq('id', editingCustomer.id);
        customerId = editingCustomer.id;
      } else {
        const { data, error } = await supabase.from('customers').insert([payload]).select();
        if (error) throw error;
        customerId = data[0].id;
        
        if (Number(formData.money_amount) > 0) {
          await supabase.from('transactions').insert([{
            customer_id: customerId,
            company: mapToDbCompany(company),
            amount: Number(formData.money_amount),
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

  const filtered = customers.filter(c => (!search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)) && (!selectedArea || c.address === selectedArea));

  return (
    <div className="space-y-4 pb-40 relative">
      <div className="sticky top-0 z-[110] -mx-6 px-6 py-3 bg-white/70 backdrop-blur-xl border-b border-slate-200">
        <div className="max-w-7xl mx-auto space-y-4">
           <div className="flex flex-col md:flex-row gap-4 items-center animate-reveal">
              <div className="flex-1 flex gap-2 items-center bg-slate-100 p-1.5 rounded-[1.8rem] shadow-inner border border-slate-200 w-full focus-within:ring-2 ring-blue-500/20 transition-all">
                 <div className="pl-4 text-slate-400">🔍</div>
                 <input autoFocus type="text" placeholder="দোকান সার্চ..." className="flex-1 p-3 bg-transparent border-none text-[13px] font-bold uppercase outline-none" value={search} onChange={e => setSearch(e.target.value)} />
                 <button onClick={() => setIsCompact(!isCompact)} className="bg-white p-3 rounded-2xl shadow-sm text-lg active:scale-90 transition-transform">
                   {isCompact ? "🔳" : "☰"}
                 </button>
              </div>
              <div className="flex gap-2 shrink-0">
                 <button onClick={handleExport} className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all hover:bg-emerald-700">📥 Export</button>
                 {isAdmin && (
                   <>
                     <input type="file" ref={fileInputRef} onChange={handleImport} accept=".xlsx, .xls, .csv" className="hidden" />
                     <button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all hover:bg-blue-700">📤 Import</button>
                   </>
                 )}
                 <button onClick={() => { setEditingCustomer(null); setFormData({name:'', proprietor_name:'', phone:'', address:'', money_amount:'', portal_username:'', portal_password:''}); setShowModal(true); }} className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black uppercase text-[10px] shadow-lg hover:bg-black active:scale-95 transition-all">+ Add</button>
              </div>
           </div>
           <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar animate-reveal" style={{ animationDelay: '0.1s' }}>
              <button onClick={() => setSelectedArea("")} className={`px-5 py-2 rounded-full text-[9px] font-black uppercase whitespace-nowrap border transition-all ${!selectedArea ? 'bg-blue-600 text-white border-blue-600 shadow-lg scale-105' : 'bg-white text-slate-400 border-slate-100 hover:border-blue-200'}`}>All Areas</button>
              {uniqueAreas.map(area => (
                <button key={area} onClick={() => setSelectedArea(area)} className={`px-5 py-2 rounded-full text-[9px] font-black uppercase whitespace-nowrap border transition-all ${selectedArea === area ? 'bg-blue-600 text-white border-blue-600 shadow-lg scale-105' : 'bg-white text-slate-400 border-slate-100 hover:border-blue-200'}`}>{area}</button>
              ))}
           </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center animate-pulse text-slate-300 font-black uppercase italic">লোড হচ্ছে...</div>
      ) : (
        <div className={isCompact ? "bg-white rounded-[2.5rem] border shadow-sm overflow-hidden" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"}>
           {isCompact && (
              <div className="grid grid-cols-12 bg-slate-50 p-5 text-[8px] font-black uppercase tracking-widest text-slate-400 border-b">
                 <div className="col-span-5 md:col-span-4">Shop Identity</div>
                 <div className="hidden md:block col-span-3">Owner Name</div>
                 <div className="col-span-4 md:col-span-2 text-right">BALANCE</div>
                 <div className="col-span-3 md:col-span-3 text-right">Actions</div>
              </div>
           )}
           {filtered.map((c, idx) => {
             const balance = companyDues[c.id] || 0;
             return (
               <div key={c.id} 
                    style={{ animationDelay: `${idx * 0.05}s` }}
                    className={isCompact ? "grid grid-cols-12 p-5 border-b hover:bg-blue-50/50 transition-all items-center animate-reveal" : "bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group animate-reveal"}>
                  <div className={isCompact ? "col-span-5 md:col-span-4 min-w-0 pr-4" : "flex justify-between items-start mb-4"}>
                     {isCompact ? (
                       <>
                         <p className="font-black text-[12px] uppercase italic text-slate-800 leading-none truncate mb-1">{c.name}</p>
                         <p className="text-[8px] font-bold text-slate-400 tracking-tighter">📍 {c.address || "Area Missing"}</p>
                       </>
                     ) : (
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black bg-blue-600 text-white shadow-lg group-hover:scale-110 transition-transform">{c.name.charAt(0)}</div>
                     )}
                  </div>
                  {isCompact ? (
                    <div className="hidden md:block col-span-3 truncate text-slate-500 font-bold uppercase text-[9px] italic">{c.proprietor_name || "—"}</div>
                  ) : (
                    <div className="mt-4">
                       <h4 className="text-sm font-black uppercase italic text-slate-800">{c.name}</h4>
                       <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">📱 {c.phone}</p>
                    </div>
                  )}
                  <div className={isCompact ? `col-span-4 md:col-span-2 text-right font-black italic text-base ${balance > 1 ? 'text-red-500' : 'text-emerald-600'}` : "mt-6 pt-6 border-t flex justify-between items-end"}>
                     {isCompact ? `${balance.toLocaleString()}৳` : (
                       <>
                          <div><p className="text-[8px] font-black text-slate-300 uppercase mb-1">Market Due</p><p className={`text-xl font-black italic ${balance > 1 ? 'text-red-600' : 'text-emerald-600'}`}>{balance.toLocaleString()}৳</p></div>
                          <p className="text-[8px] font-black text-slate-300 italic uppercase">📍 {c.address}</p>
                       </>
                     )}
                  </div>
                  <div className={isCompact ? "col-span-3 md:col-span-3 flex justify-end gap-1.5" : "mt-6 flex gap-2"}>
                     <button onClick={() => fetchCustomerLedger(c)} className="w-9 h-9 bg-slate-900 text-white rounded-xl flex items-center justify-center text-xs shadow-lg active:scale-90 hover:bg-black transition-all" title="Ledger">📑</button>
                     <button onClick={() => { setEditingCustomer(c); setFormData({name:c.name, proprietor_name:c.proprietor_name||'', phone:c.phone, address:c.address||'', money_amount:'', portal_username:c.portal_username||'', portal_password:c.portal_password||''}); setShowModal(true); }} className="w-9 h-9 bg-blue-600 text-white rounded-xl flex items-center justify-center text-xs shadow-lg active:scale-90 hover:bg-blue-700 transition-all" title="Edit">📝</button>
                     {isAdmin && <button onClick={() => handleDeleteCustomer(c.id)} className="w-9 h-9 bg-red-100 text-red-500 rounded-xl flex items-center justify-center text-xs hover:bg-red-500 hover:text-white transition-all shadow-sm active:scale-90" title="Delete">🗑️</button>}
                  </div>
               </div>
             );
           })}
        </div>
      )}

      {/* Ledger Modal */}
      {showLedger && selectedLedgerCust && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[2000] flex items-center justify-center p-4">
           <div className="bg-white rounded-[4rem] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-reveal">
              <div className="p-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <div>
                    <h3 className="text-xl font-black uppercase italic">কাস্টমার লেজার স্টেটমেন্ট</h3>
                    <p className="text-[10px] text-slate-500 font-black uppercase mt-1 tracking-widest">{selectedLedgerCust.name} • {company} Division</p>
                 </div>
                 <button onClick={() => setShowLedger(false)} className="text-4xl text-slate-500 font-black hover:text-white transition-colors">✕</button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scroll p-8 space-y-6">
                 <table className="w-full text-left">
                    <thead>
                       <tr className="text-[10px] font-black text-slate-900 uppercase tracking-widest border-b">
                          <th className="py-4">তারিখ</th>
                          <th className="py-4">বিবরণ</th>
                          <th className="py-4 text-right">ডেবিট (বাকি)</th>
                          <th className="py-4 text-right">ক্রেডিট (জমা)</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-900">
                       {ledgerHistory.map((tx, i) => (
                         <tr key={i} className="hover:bg-slate-50 transition-all animate-reveal" style={{ animationDelay: `${i * 0.05}s` }}>
                            <td className="py-6 text-[11px] font-bold">{new Date(tx.created_at).toLocaleDateString('bn-BD')}</td>
                            <td className="py-6 text-[11px] font-black uppercase italic">{tx.payment_type === 'COLLECTION' ? '💰 নগদ পেমেন্ট জমা' : '📄 মালের মেমো'}</td>
                            <td className="py-6 text-right font-black italic text-red-600">{tx.payment_type !== 'COLLECTION' ? `৳${tx.amount.toLocaleString()}` : '—'}</td>
                            <td className="py-6 text-right font-black italic text-emerald-600">{tx.payment_type === 'COLLECTION' ? `৳${tx.amount.toLocaleString()}` : '—'}</td>
                         </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[2000] flex items-center justify-center p-4">
           <div className="bg-white p-10 md:p-14 rounded-[4rem] w-full max-w-lg shadow-2xl animate-reveal text-slate-900 overflow-y-auto max-h-[95vh] custom-scroll">
              <div className="flex justify-between items-center mb-8 border-b pb-4">
                 <h3 className="text-2xl font-black uppercase italic">{editingCustomer ? 'তথ্য আপডেট' : 'নতুন কাস্টমার যোগ'}</h3>
                 <button onClick={() => setShowModal(false)} className="text-3xl text-slate-300 font-black hover:text-red-500 transition-colors">✕</button>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-4 italic">দোকানের নাম</label>
                    <input required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold uppercase italic text-sm focus:border-blue-500 focus:bg-white transition-all" placeholder="দোকানের নাম" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-4 italic">মালিকের নাম</label>
                    <input className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold uppercase italic text-sm focus:border-blue-500 focus:bg-white transition-all" placeholder="মালিকের নাম" value={formData.proprietor_name} onChange={e => setFormData({...formData, proprietor_name: e.target.value})} />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-4 italic">মোবাইল নম্বর</label>
                    <input required className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold italic text-sm focus:border-blue-500 focus:bg-white transition-all" placeholder="মোবাইল নম্বর" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-4 italic">এরিয়া/ঠিকানা</label>
                    <input className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold uppercase italic text-sm focus:border-blue-500 focus:bg-white transition-all" placeholder="এরিয়া/ঠিকানা" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                 </div>
                 
                 <div className="pt-4 border-t space-y-4">
                    <div className="space-y-1">
                       <label className="text-[9px] font-black text-red-400 uppercase ml-4 italic">পূর্বের বকেয়া (টাকা)</label>
                       <input disabled={!!editingCustomer} type="number" className="w-full p-4 bg-red-50 border-2 border-red-100 rounded-2xl outline-none font-black text-red-600 text-sm focus:border-red-500 focus:bg-white transition-all disabled:opacity-50" placeholder="Opening Balance" value={formData.money_amount} onChange={e => setFormData({...formData, money_amount: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase ml-4 italic">ইউজার আইডি</label>
                          <input className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold italic text-sm focus:border-blue-500 transition-all" placeholder="Portal ID" value={formData.portal_username} onChange={e => setFormData({...formData, portal_username: e.target.value})} />
                       </div>
                       <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase ml-4 italic">সিক্রেট কি (পাসওয়ার্ড)</label>
                          <input className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold italic text-sm focus:border-blue-500 transition-all" placeholder="Security Key" value={formData.portal_password} onChange={e => setFormData({...formData, portal_password: e.target.value})} />
                       </div>
                    </div>
                 </div>

                 <button disabled={isSaving} type="submit" className="w-full bg-blue-600 text-white py-6 rounded-3xl font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all mt-6 hover:bg-blue-700">
                    {isSaving ? "সংরক্ষণ হচ্ছে..." : "সংরক্ষণ করুন ➔"}
                 </button>
                 <button type="button" onClick={() => setShowModal(false)} className="w-full py-2 text-slate-400 font-black uppercase text-[10px] hover:text-red-500 transition-colors">বাতিল করুন</button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
