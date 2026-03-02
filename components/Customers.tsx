
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

  const [currentLedgerStats, setCurrentLedgerStats] = useState({ reg: 0, book: 0 });
  const [editingCustomer, setEditingCustomer] = useState<any>(null);

  const ledgerRef = useRef<HTMLDivElement>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    money_amount: '',
    portal_username: '',
    portal_password: ''
  });

  const isAdmin = role.toUpperCase() === 'ADMIN';

  useEffect(() => { fetchCustomers(); }, [company]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const dbCompany = mapToDbCompany(company);
      const { data: custData } = await supabase.from('customers').select('*').order('name');
      const { data: txData } = await supabase.from('transactions').select('customer_id, amount, payment_type, meta, items').eq('company', dbCompany);

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
      setUniqueAreas(Array.from(new Set(custData?.map(c => c.address?.trim()).filter(Boolean) || [])).sort() as string[]);
    } catch (err) { console.error(err); } finally { setLoading(false); }
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
        await supabase.from('customers').update(payload).eq('id', editingCustomer.id);
      } else {
        const { data } = await supabase.from('customers').insert([payload]).select();
        customerId = data?.[0].id;
      }

      // Handle Opening Balance Adjustment
      if (formData.money_amount !== '' && customerId) {
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
      setEditingCustomer(null);
      setFormData({ name: '', phone: '', address: '', money_amount: '', portal_username: '', portal_password: '' });
      await fetchCustomers();
      alert("তথ্য সফলভাবে সংরক্ষিত হয়েছে! ✅");
    } catch (err: any) {
      alert("ত্রুটি: " + err.message);
    } finally { setIsSaving(false); }
  };

  const handleDeleteCustomer = async (id: string, name: string) => {
    if (!isAdmin) return;
    const confirmMsg = `আপনি কি নিশ্চিত যে "${name}" কে ডিলিট করতে চান? এর ফলে তার সকল লেনদেন এবং পোর্টাল এক্সেস মুছে যাবে।`;
    if (!confirm(confirmMsg)) return;

    try {
      setIsSaving(true);
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
      alert("কাস্টমার সফলভাবে ডিলিট করা হয়েছে।");
      fetchCustomers();
    } catch (err: any) {
      alert("ডিলিট করা যায়নি: " + err.message);
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
      const { data } = await supabase.from('transactions').select('*').eq('customer_id', cust.id).eq('company', dbCo).order('created_at', { ascending: false });

      // Filter for booking deposits only as requested
      const bookingOnly = data?.filter(tx => tx.payment_type === 'COLLECTION' && (tx.meta?.is_booking === true || tx.items?.[0]?.note?.includes('বুকিং'))) || [];

      let b = 0;
      bookingOnly.forEach(tx => {
        b += (Number(tx.amount) || 0);
      });

      setCurrentLedgerStats({ reg: 0, book: b });
      setLedgerHistory(bookingOnly);
    } catch (err) { console.error(err); }
  };

  const handleDeleteLedgerEntry = async (tx: any) => {
    if (!isAdmin) return;
    const txIdShort = String(tx.id).slice(-6).toUpperCase();
    if (!confirm(`আপনি কি নিশ্চিত এই জমার এন্ট্রিটি (#${txIdShort}) ডিলিট করতে চান?`)) return;

    setIsSaving(true);
    try {
      // Delete notification first if exists
      await supabase.from('notifications').delete().eq('customer_id', tx.customer_id).ilike('message', `%#${txIdShort}%`);
      const { error } = await supabase.from('transactions').delete().eq('id', tx.id);
      if (error) throw error;
      alert("এন্ট্রিটি সফলভাবে মুছে ফেলা হয়েছে! ✅");
      if (selectedLedgerCust) fetchCustomerLedger(selectedLedgerCust);
    } catch (err: any) { alert("ত্রুটি: " + err.message); } finally { setIsSaving(false); }
  };

  const filtered = customers.filter(c => (!search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)) && (!selectedArea || c.address === selectedArea));

  return (
    <div className="space-y-6 pb-40 relative text-slate-900">
      <div className="sticky top-0 z-[110] -mx-6 px-6 py-4 bg-white/80 backdrop-blur-2xl border-b border-slate-200/50 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-4 items-center animate-reveal">
          <div className="flex-[2] flex gap-2 items-center bg-slate-100 p-2 rounded-3xl shadow-inner border border-slate-200 w-full group transition-all">
            <input autoFocus type="text" placeholder="দোকান বা ইউজার আইডি সার্চ..." className="flex-1 p-3 bg-transparent border-none text-[13px] font-bold uppercase outline-none text-slate-900" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-2 w-full md:w-auto shrink-0">
            <select className="flex-1 md:flex-none p-4 bg-white border border-slate-200 rounded-3xl text-[10px] font-black uppercase outline-none shadow-sm focus:border-blue-600 transition-all" value={selectedArea} onChange={e => setSelectedArea(e.target.value)}>
              <option value="">সকল এরিয়া</option>
              {uniqueAreas.map(area => <option key={area} value={area}>{area}</option>)}
            </select>
            <button onClick={() => setIsCompact(!isCompact)} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 text-xl active:scale-90 transition-transform">{isCompact ? "🔳" : "☰"}</button>
            {isAdmin && <button onClick={() => { setEditingCustomer(null); setFormData({ name: '', phone: '', address: '', money_amount: '', portal_username: '', portal_password: '' }); setShowModal(true); }} className="bg-blue-600 text-white px-8 py-4 rounded-3xl font-black uppercase text-[10px] shadow-xl">+ দোকান যোগ</button>}
          </div>
        </div>
      </div>

      {loading ? (<div className="py-20 text-center animate-pulse text-slate-300 font-bold uppercase italic text-xs tracking-[0.4em]">Node Syncing...</div>) : (
        <div className={isCompact ? "bg-white rounded-[3.5rem] border border-slate-100 shadow-xl overflow-hidden" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"}>
          {isCompact && (
            <div className="grid grid-cols-12 bg-slate-900 text-white/50 p-6 text-[8px] font-black uppercase tracking-widest border-b border-white/5">
              <div className="col-span-3">Shop Identity</div>
              <div className="col-span-3 text-right">Regular Due (isolated)</div>
              <div className="col-span-3 text-right">Booking Depo (isolated)</div>
              <div className="col-span-3 text-right">Actions</div>
            </div>
          )}
          {filtered.map((c, idx) => {
            const regBal = regularDues[c.id] || 0;
            const bookBal = bookingAdvances[c.id] || 0;
            return (
              <div key={c.id} className={isCompact ? "grid grid-cols-12 p-6 border-b border-slate-50 items-center animate-reveal hover:bg-slate-50 transition-all group" : "bg-white p-8 rounded-[3.5rem] border border-slate-100 shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-1 animate-reveal relative overflow-hidden"} style={{ animationDelay: `${idx * 0.03}s` }}>
                <div className={isCompact ? "col-span-3 pr-4" : "mb-6 relative z-10"}>
                  <p className="font-black text-[13px] uppercase italic text-slate-800 truncate mb-1 group-hover:text-blue-600 transition-colors">{c.name}</p>
                  <p className="text-[9px] font-bold text-slate-400 tracking-widest uppercase italic">📱 {c.phone}</p>
                </div>
                <div className={isCompact ? `col-span-3 text-right font-black italic text-[14px] ${regBal > 1 ? 'text-rose-600' : 'text-emerald-600'}` : "mt-6 pt-6 border-t relative z-10 flex justify-between"}>
                  {!isCompact && <p className="text-[8px] text-slate-400 uppercase tracking-widest italic">Regular Due</p>}
                  <span className={!isCompact ? `text-2xl tracking-tighter ${regBal > 1 ? 'text-rose-600' : 'text-emerald-600'}` : ""}>{regBal.toLocaleString()}৳</span>
                </div>
                <div className={isCompact ? `col-span-3 text-right font-black italic text-[14px] text-indigo-600` : "mt-2 relative z-10 flex justify-between"}>
                  {!isCompact && <p className="text-[8px] text-indigo-400 uppercase tracking-widest italic">Booking Deposit</p>}
                  <span className={!isCompact ? `text-2xl tracking-tighter text-indigo-600` : ""}>{bookBal.toLocaleString()}৳</span>
                </div>
                <div className={isCompact ? "col-span-3 flex justify-end gap-2" : "mt-8 flex gap-3 relative z-10"}>
                  <button onClick={() => fetchCustomerLedger(c)} className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center text-xs shadow-xl active:scale-90 hover:bg-indigo-600" title="লেজার দেখুন">📑</button>
                  {isAdmin && (
                    <>
                      <button onClick={async () => {
                        const dbCo = mapToDbCompany(company);
                        const { data: tx } = await supabase.from('transactions').select('amount').eq('customer_id', c.id).eq('company', dbCo).ilike('items->0->note', '%পূর্বের বকেয়া%').maybeSingle();
                        setEditingCustomer(c);
                        setFormData({
                          name: c.name,
                          phone: c.phone,
                          address: c.address || '',
                          money_amount: tx ? tx.amount.toString() : '',
                          portal_username: c.portal_username || '',
                          portal_password: c.portal_password || ''
                        });
                        setShowModal(true);
                      }} className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center text-xs shadow-xl hover:bg-blue-700" title="তথ্য এডিট">📝</button>

                      <button onClick={() => handleDeleteCustomer(c.id, c.name)} className="w-10 h-10 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center text-xs shadow-xl hover:bg-rose-500 hover:text-white transition-all" title="কাস্টমার ডিলিট">🗑️</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 📝 ADD/EDIT CUSTOMER MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[4000] flex items-center justify-center p-4">
          <div className="bg-white rounded-[4rem] w-full max-w-xl shadow-2xl overflow-hidden animate-reveal border border-white/20">
            <div className="p-8 bg-blue-600 text-white flex justify-between items-center shrink-0">
              <h3 className="text-xl font-black uppercase italic tracking-tighter">{editingCustomer ? 'তথ্য পরিবর্তন করুন' : 'নতুন কাস্টমার যোগ'}</h3>
              <button onClick={() => setShowModal(false)} className="text-3xl text-white/50 hover:text-white font-black">✕</button>
            </div>
            <form onSubmit={handleSave} className="p-10 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-4 italic">দোকানের নাম</label>
                  <input required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-sm" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-4 italic">মোবাইল নাম্বার</label>
                  <input required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-sm" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-4 italic">ঠিকানা (রুট এরিয়া)</label>
                <input required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-sm" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} />
              </div>

              <div className="p-6 bg-slate-900 rounded-3xl space-y-4">
                <p className="text-[10px] font-black text-blue-400 uppercase italic tracking-widest text-center border-b border-white/10 pb-3">পোর্টাল এক্সেস (User Credentials)</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase ml-2 italic">ইউজার আইডি (Auto Lowercase)</label>
                    <input
                      placeholder="username"
                      className="w-full p-4 bg-white/5 border border-white/10 rounded-xl outline-none text-white font-black italic text-sm focus:border-blue-500 transition-all"
                      value={formData.portal_username}
                      onChange={e => setFormData({ ...formData, portal_username: e.target.value.toLowerCase() })}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase ml-2 italic">পাসওয়ার্ড</label>
                    <input
                      type="text"
                      placeholder="password"
                      className="w-full p-4 bg-white/5 border border-white/10 rounded-xl outline-none text-white font-black italic text-sm focus:border-blue-500 transition-all"
                      value={formData.portal_password}
                      onChange={e => setFormData({ ...formData, portal_password: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-4 italic">ওপেনিং বকেয়া (ঐচ্ছিক)</label>
                <input type="number" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-sm" placeholder="0.00" value={formData.money_amount} onChange={e => setFormData({ ...formData, money_amount: e.target.value })} />
              </div>

              <button disabled={isSaving} className="w-full bg-blue-600 text-white py-6 rounded-[2.5rem] font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all mt-4">
                {isSaving ? 'প্রসেসিং...' : (editingCustomer ? 'আপডেট সেভ করুন ➔' : 'কাস্টমার যোগ করুন ➔')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 📑 LEDGER MODAL */}
      {showLedger && selectedLedgerCust && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[3000] flex items-center justify-center p-4">
          <div className="bg-white rounded-[4rem] w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl animate-reveal overflow-hidden border border-white/10">
            <div className="p-8 md:p-10 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-2xl font-black uppercase italic tracking-tighter">কাস্টমার স্টেটমেন্ট (লেজার)</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase mt-1.5 tracking-widest">{selectedLedgerCust.name} • {company}</p>
              </div>
              <button onClick={() => setShowLedger(false)} className="text-4xl text-slate-500 hover:text-white font-black">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scroll p-1" ref={ledgerRef}>
              <div className="p-10 text-black">
                <div className="flex justify-center mb-10">
                  <div className="w-full max-w-md p-8 bg-indigo-50 border-2 border-indigo-600 rounded-[2.5rem] text-center shadow-xl">
                    <p className="text-[11px] font-black uppercase italic mb-3 text-indigo-600 tracking-[0.2em]">মোট বুকিং জমা (Total Booking Deposit)</p>
                    <p className="text-5xl font-black italic text-indigo-700 tracking-tighter">৳{currentLedgerStats.book.toLocaleString()}</p>
                  </div>
                </div>
                <table className="w-full border-collapse border-2 border-black">
                  <thead>
                    <tr className="bg-slate-100 text-[10px] font-black uppercase italic border-b-2 border-black text-left">
                      <th className="p-4 border border-black">তারিখ</th>
                      <th className="p-4 border border-black">বিস্তারিত বিবরণ</th>
                      <th className="p-4 border border-black text-right">জমার পরিমাণ</th>
                      <th className="p-4 border border-black text-center">অ্যাকশন</th>
                    </tr>
                  </thead>
                  <tbody className="text-[11px] font-bold">
                    {ledgerHistory.length === 0 ? (
                      <tr><td colSpan={4} className="py-20 text-center opacity-30 font-black uppercase italic">কোনো বুকিং রেকর্ড পাওয়া যায়নি</td></tr>
                    ) : ledgerHistory.map((tx, i) => {
                      const isBank = tx.meta?.is_bank_deposit === true;
                      return (
                        <tr key={tx.id} className="border border-black hover:bg-indigo-50/10 transition-colors">
                          <td className="p-4 border border-black">{new Date(tx.created_at).toLocaleDateString('bn-BD')}</td>
                          <td className="p-4 border border-black uppercase italic font-black">
                            <span className="text-indigo-600">
                              📅 বুকিং {isBank ? 'ব্যাংক' : 'ক্যাশ'} জমা
                            </span>
                            <p className="text-[8px] text-slate-400 mt-1 uppercase italic">{tx.items?.[0]?.note || 'বুকিং অগ্রিম'}</p>
                          </td>
                          <td className="p-4 text-right border border-black text-emerald-600 font-extrabold text-base italic"> ৳{Number(tx.amount).toLocaleString()} </td>
                          <td className="p-4 text-center border border-black">
                            {isAdmin && (
                              <button
                                onClick={() => handleDeleteLedgerEntry(tx)}
                                className="w-10 h-10 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center text-sm hover:bg-rose-500 hover:text-white transition-all shadow-sm mx-auto"
                                title="এন্ট্রি মুছুন"
                              >
                                🗑️
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
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
