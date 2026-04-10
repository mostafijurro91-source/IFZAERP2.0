
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Company, UserRole, formatCurrency, Transaction, Customer, CustomerFinancials } from '../types';
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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [regularDues, setRegularDues] = useState<Record<string, number>>({});
  const [bookingAdvances, setBookingAdvances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedArea, setSelectedArea] = useState("");
  const [isCompact, setIsCompact] = useState(true);
  const [uniqueAreas, setUniqueAreas] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showLedger, setShowLedger] = useState(false);
  const [selectedLedgerCust, setSelectedLedgerCust] = useState<Customer | null>(null);
  const [ledgerHistory, setLedgerHistory] = useState<Transaction[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showMemoModal, setShowMemoModal] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [selectedPolicyTx, setSelectedPolicyTx] = useState<Transaction | null>(null);
  const [newPolicyDate, setNewPolicyDate] = useState<string>("");
  const [newPolicyStatus, setNewPolicyStatus] = useState<string>('PENDING');

  const [currentLedgerStats, setCurrentLedgerStats] = useState<CustomerFinancials>({ regularDue: 0, bookingAdvance: 0, totalSales: 0, totalPaid: 0 });
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const [selectedMemo, setSelectedMemo] = useState<any>(null);
  const [areaSearch, setAreaSearch] = useState("");
  const [showAreaDropdown, setShowAreaDropdown] = useState(false);
  const areaDropdownRef = useRef<HTMLDivElement>(null);
  const ledgerRef = useRef<HTMLDivElement>(null);
  const memoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (areaDropdownRef.current && !areaDropdownRef.current.contains(event.target as Node)) {
        setShowAreaDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    money_amount: '',
    portal_username: '',
    portal_password: ''
  });

  const isAdmin = role.toUpperCase() === 'ADMIN';

  const getStaffContacts = (co: Company) => {
    switch (co) {
      case 'Transtec': return "01701551690";
      case 'SQ Light': return "+8801774105970";
      case 'SQ Cables': return "+8801709643451";
      default: return "";
    }
  };

  useEffect(() => { fetchCustomers(); }, [company]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const dbCompany = mapToDbCompany(company);
      const { data: custData, error: ce } = await supabase.from('customers').select('*').order('name');
      if (ce) console.error("Customer fetch error:", ce);
      const { data: txData, error: te } = await supabase.from('transactions').select('customer_id, amount, payment_type, meta, items').eq('company', dbCompany);
      if (te) console.error("Transaction fetch error:", te);

      const regMap: Record<string, number> = {};
      const bookMap: Record<string, number> = {};

      (txData as unknown as Transaction[])?.forEach(tx => {
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
      setUniqueAreas(Array.from(new Set(custData?.map((c: Customer) => c.address?.trim()).filter(Boolean) || [])).sort() as string[]);
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
        const { error: upError } = await supabase.from('customers').update(payload).eq('id', editingCustomer.id);
        if (upError) throw upError;
      } else {
        const { data, error: inError } = await supabase.from('customers').insert([payload]).select();
        if (inError) throw inError;
        if (!data || data.length === 0) {
          throw new Error("সার্ভার থেকে কোনো ডাটা ফেরত আসেনি। অনুগ্রহ করে চেক করুন আপনার ইনসার্ট পারমিশন আছে কিনা।");
        }
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
          const { error: upErr } = await supabase.from('transactions').update({ amount: newAmt }).eq('id', existingTx.id);
          if (upErr) throw upErr;
        } else if (newAmt !== 0) {
          const { error: inErr } = await supabase.from('transactions').insert([{
            customer_id: customerId,
            company: dbCompany,
            amount: newAmt,
            payment_type: 'DUE',
            items: [{ note: 'পূর্বের বকেয়া (Opening Balance)' }],
            submitted_by: userName
          }]);
          if (inErr) throw inErr;
        }
      }
      setShowModal(false);
      setEditingCustomer(null);
      setFormData({ name: '', phone: '', address: '', money_amount: '', portal_username: '', portal_password: '' });
      await fetchCustomers();
      alert(`তথ্য সফলভাবে সংরক্ষিত হয়েছে! ✅\nID: ${customerId}`);
    } catch (err: any) {
      console.error("Save Error:", err);
      alert("ত্রুটি (Save Error): " + (err.message || "Unknown error occurred"));
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

  const fetchCustomerLedger = async (cust: Customer) => {
    setSelectedLedgerCust(cust);
    setShowLedger(true);
    setLedgerHistory([]); // Clear previous ledger
    setCurrentLedgerStats({ regularDue: 0, bookingAdvance: 0, totalSales: 0, totalPaid: 0 }); // Clear previous stats

    try {
      const dbCo = mapToDbCompany(company); // Use 'company' from props
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('customer_id', cust.id) // Use cust.id
        .eq('company', dbCo)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLedgerHistory(data || []);

      // Calculate totals
      let totalR = 0;
      let totalB = 0;
      let lifetimeSales = 0;
      let lifetimePaid = 0;

      (data as unknown as Transaction[])?.forEach(tx => {
        const amt = Number(tx.amount);
        const isBooking = tx.meta?.is_booking === true || tx.items?.[0]?.note?.includes('বুকিং');
        
        if (tx.payment_type === 'COLLECTION') {
          lifetimePaid += amt;
          if (isBooking) {
            totalB += amt;
          } else {
            totalR -= amt;
          }
        } else if (tx.payment_type === 'DUE') {
          totalR += amt;
          const returnItem = tx.items?.find((it: any) => it.action === 'RETURN');
          if (!returnItem) {
            lifetimeSales += amt;
          }
        }
      });
      setCurrentLedgerStats({ regularDue: totalR, bookingAdvance: totalB, totalSales: lifetimeSales, totalPaid: lifetimePaid });
    } catch (err: any) {
      console.error('Error fetching ledger:', err);
    }
  };

  const handleCompleteCommission = async (tx: Transaction) => {
    if (!isAdmin || isSaving) return;
    if (!confirm("কমিশনটি সম্পন্ন (COMPLETED) হিসেবে মার্ক করতে চান?")) return;

    setIsSaving(true);
    try {
      const updatedMeta = { ...tx.meta, commission_status: 'COMPLETED' };
      const { error } = await supabase.from('transactions').update({ meta: updatedMeta }).eq('id', tx.id);
      if (error) throw error;
      alert("কমিশন সফলভাবে সম্পন্ন হয়েছে! ✅");
      if (selectedLedgerCust) fetchCustomerLedger(selectedLedgerCust);
    } catch (err: any) {
      alert("ত্রুটি: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdatePolicy = async () => {
    if (!selectedPolicyTx || isSaving || !isAdmin) return;
    setIsSaving(true);
    try {
      const updatedMeta = {
        ...(selectedPolicyTx.meta || {}),
        commission_type: newPolicyDate ? 'CONDITIONAL' : 'IMMEDIATE',
        expiry_date: newPolicyDate ? new Date(newPolicyDate).toISOString() : null,
        commission_status: newPolicyStatus
      };

      const { error } = await supabase
        .from('transactions')
        .update({ meta: updatedMeta })
        .eq('id', selectedPolicyTx.id);

      if (error) throw error;
      alert("পলিসি সফলভাবে আপডেট করা হয়েছে! ✅");
      setShowPolicyModal(false);
      if (selectedLedgerCust) fetchCustomerLedger(selectedLedgerCust);
    } catch (err: any) {
      alert("ত্রুটি: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevokeCommission = async (tx: Transaction) => {
    if (!isAdmin || isSaving) return;
    const memoIdShort = String(tx.id).slice(-6).toUpperCase();
    const commAmt = Number(tx.meta?.total_commission) || 0;

    if (!confirm(`কমিশন বাতিল নিশ্চিত? এতে কাস্টমারের বকেয়া ৳${commAmt.toLocaleString()} বেড়ে যাবে (মেমো #${memoIdShort})।`)) return;

    setIsSaving(true);
    try {
      const dbCo = mapToDbCompany(company);
      
      // 1. Create adjustment transaction to add back the commission
      const { error: txErr } = await supabase.from('transactions').insert([{
        customer_id: tx.customer_id,
        company: dbCo,
        amount: commAmt,
        payment_type: 'DUE',
        items: [{ note: `কমিশন বাতিল (মেমো #${memoIdShort} সময়মতো বিল না দেওয়ার কারণে)` }],
        submitted_by: userName,
        meta: { 
          related_tx_id: tx.id,
          adjustment_type: 'COMMISSION_REVOCATION'
        }
      }]);
      if (txErr) throw txErr;

      // 2. Update the original transaction status
      const updatedMeta = { ...tx.meta, commission_status: 'REVOKED' };
      const { error: upErr } = await supabase.from('transactions').update({ meta: updatedMeta }).eq('id', tx.id);
      if (upErr) throw upErr;

      alert("কমিশন সফলভাবে বাতিল করা হয়েছে! ✅");
      if (selectedLedgerCust) fetchCustomerLedger(selectedLedgerCust);
    } catch (err: any) { 
      alert("ত্রুটি: " + err.message); 
    } finally { 
      setIsSaving(false); 
    }
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

  const handleDownloadLedger = async () => {
    if (!ledgerRef.current || isDownloading) return;
    setIsDownloading(true);
    try {
      // Temporarily remove constraints for full capture
      const originalStyle = ledgerRef.current.style.cssText;
      ledgerRef.current.style.height = 'auto';
      ledgerRef.current.style.maxHeight = 'none';
      ledgerRef.current.style.overflow = 'visible';

      const canvas = await html2canvas(ledgerRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: ledgerRef.current.scrollWidth,
        windowHeight: ledgerRef.current.scrollHeight
      });

      // Restore style
      ledgerRef.current.style.cssText = originalStyle;

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = (canvas.height * pdfWidth) / imgWidth;
      
      let heightLeft = imgHeight;
      let position = 0;

      // Add first page
      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;

      // Add subsequent pages if needed
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save(`Statement_${selectedLedgerCust?.name}_${new Date().toLocaleDateString('bn-BD')}.pdf`);
    } catch (e) {
      console.error(e);
      alert("PDF তৈরি করা যায়নি।");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadIndividualMemo = async () => {
    if (!memoRef.current || isDownloading) return;
    setIsDownloading(true);
    try {
      const canvas = await html2canvas(memoRef.current, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a5');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save(`Memo_${selectedLedgerCust?.name}_${selectedMemo?.id?.slice(-6)}.pdf`);
    } catch (e) {
      alert("PDF তৈরি করা যায়নি।");
    } finally {
      setIsDownloading(false);
    }
  };

  const filtered = customers.filter((c: Customer) => {
    const q = (search || "").toLowerCase().trim();
    const name = (c.name || "").toLowerCase();
    const phone = (c.phone || "");
    const portalId = (c.portal_username || "").toLowerCase();

    const matchesSearch = !q || name.includes(q) || phone.includes(q) || portalId.includes(q);
    const matchesArea = !selectedArea || c.address === selectedArea;

    return matchesSearch && matchesArea;
  });

  return (
    <div className="space-y-6 pb-40 relative text-slate-900">
      <div className="sticky top-0 z-[110] -mx-6 px-6 py-4 bg-white/80 backdrop-blur-2xl border-b border-slate-200/50 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-4 items-center animate-reveal">
          <div className="flex-[2] flex gap-2 items-center bg-slate-100 p-2 rounded-3xl shadow-inner border border-slate-200 w-full group transition-all">
            <input autoFocus type="text" placeholder="দোকান বা ইউজার আইডি সার্চ..." className="flex-1 p-3 bg-transparent border-none text-[13px] font-bold uppercase outline-none text-slate-900" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-2 w-full md:w-auto shrink-0 relative" ref={areaDropdownRef}>
            <div className="relative flex-1 md:flex-none">
              <button
                onClick={() => setShowAreaDropdown(!showAreaDropdown)}
                className="w-full md:w-48 p-4 bg-white border border-slate-200 rounded-3xl text-[10px] font-black uppercase outline-none shadow-sm focus:border-blue-600 transition-all text-left flex justify-between items-center"
              >
                <span>{selectedArea || "সকল এরিয়া"}</span>
                <span className="text-[8px] opacity-40">▼</span>
              </button>

              {showAreaDropdown && (
                <div className="absolute top-full mt-2 left-0 w-64 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[5000] overflow-hidden animate-reveal">
                  <input
                    type="text"
                    placeholder="এরিয়া খুঁজুন..."
                    className="w-full p-4 border-b border-slate-100 text-[11px] font-bold outline-none bg-slate-50"
                    value={areaSearch}
                    onChange={e => setAreaSearch(e.target.value)}
                    autoFocus
                  />
                  <div className="max-h-60 overflow-y-auto custom-scroll">
                    <div
                      className="p-4 hover:bg-slate-50 cursor-pointer text-[10px] font-black uppercase text-slate-400"
                      onClick={() => { setSelectedArea(""); setShowAreaDropdown(false); }}
                    >
                      সকল এরিয়া
                    </div>
                    {uniqueAreas.filter(a => a.toLowerCase().includes(areaSearch.toLowerCase())).map(area => (
                      <div
                        key={area}
                        className="p-4 hover:bg-blue-50 cursor-pointer text-[10px] font-black uppercase text-slate-700 border-t border-slate-50"
                        onClick={() => { setSelectedArea(area); setShowAreaDropdown(false); setAreaSearch(""); }}
                      >
                        {area}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
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
                          phone: c.phone || '',
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
              <div className="flex items-center gap-4">
                <button
                  onClick={handleDownloadLedger}
                  disabled={isDownloading}
                  className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2 border border-white/10"
                >
                  {isDownloading ? 'প্রসেসিং...' : 'প্রিন্ট স্টেটমেন্ট ⎙'}
                </button>
                <button onClick={() => setShowLedger(false)} className="text-4xl text-slate-500 hover:text-white font-black">✕</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scroll p-1" ref={ledgerRef}>
              <div className="p-10 text-black">
                {/* 📊 LEDGER STATS */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                  <div className="bg-blue-50 p-6 rounded-[2.5rem] border border-blue-100 shadow-sm text-center">
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2 italic">মোট ক্রয় (Lifetime Sales)</p>
                    <p className="text-2xl font-black italic tracking-tighter text-blue-700">৳{currentLedgerStats.totalSales.toLocaleString()}</p>
                  </div>
                  <div className="bg-emerald-50 p-6 rounded-[2.5rem] border border-emerald-100 shadow-sm text-center">
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2 italic">মোট জমা (Lifetime Paid)</p>
                    <p className="text-2xl font-black italic tracking-tighter text-emerald-700">৳{currentLedgerStats.totalPaid.toLocaleString()}</p>
                  </div>
                  <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-white/5 shadow-xl text-center">
                    <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-2 italic">বকেয়া (Regular Due)</p>
                    <p className="text-2xl font-black italic tracking-tighter text-rose-400">৳{currentLedgerStats.regularDue.toLocaleString()}</p>
                  </div>
                  <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-white/5 shadow-xl text-center">
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2 italic">বুকিং জমা (Booking)</p>
                    <p className="text-2xl font-black italic tracking-tighter text-indigo-400">৳{currentLedgerStats.bookingAdvance.toLocaleString()}</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b-2 border-slate-100 italic">
                        <th className="py-4 text-[11px] font-black uppercase text-slate-400 tracking-widest pl-4">তারিখ</th>
                        <th className="py-4 text-[11px] font-black uppercase text-slate-400 tracking-widest">বিবরণ</th>
                        <th className="py-4 text-[11px] font-black uppercase text-slate-400 tracking-widest text-right">বকেয়া</th>
                        <th className="py-4 text-[11px] font-black uppercase text-slate-400 tracking-widest text-right">ফেরত</th>
                        <th className="py-4 text-[11px] font-black uppercase text-slate-400 tracking-widest text-right">আদায়</th>
                        <th className="py-4 text-[11px] font-black uppercase text-slate-400 tracking-widest text-center pr-4">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {ledgerHistory.length === 0 ? (
                        <tr><td colSpan={6} className="py-20 text-center opacity-30 font-black uppercase italic">কোনো লেনদেন রেকর্ড পাওয়া যায়নি</td></tr>
                      ) : ledgerHistory.map((tx) => {
                        const returnItem = tx.items?.find((it: any) => it.action === 'RETURN');
                        const returnAmount = returnItem ? Math.abs(tx.items?.reduce((s: number, it: any) => it.action === 'RETURN' ? s + (Number(it.total) || 0) : s, 0) || 0) : 0;

                        return (
                          <tr key={tx.id} className="group hover:bg-slate-50/50 transition-colors">
                            <td className="py-4 text-[11px] font-bold text-slate-400 pl-4">{new Date(tx.created_at).toLocaleDateString('bn-BD')}</td>
                            <td className="py-4">
                              <p className="text-[13px] font-black text-slate-700 italic leading-none">{tx.items?.[0]?.note || (returnItem ? `ফেরত: ${returnItem.name}` : 'Transaction')}</p>
                              <p className="text-[9px] font-bold text-slate-300 uppercase mt-1">ID: {String(tx.id).slice(-6).toUpperCase()}</p>
                            </td>
                            <td className="py-4 text-right pr-2">
                              {tx.payment_type === 'DUE' && !returnItem ? (
                                <span className="text-[14px] font-black italic text-rose-600">৳{Number(tx.amount).toLocaleString()}</span>
                              ) : '-'}
                            </td>
                            <td className="py-4 text-right pr-2">
                              {returnAmount > 0 ? (
                                <span className="text-[14px] font-black italic text-orange-600">৳{returnAmount.toLocaleString()}</span>
                              ) : '-'}
                            </td>
                            <td className="py-4 text-right pr-2">
                              {tx.payment_type === 'COLLECTION' ? (
                                <span className="text-[14px] font-black italic text-emerald-600">৳{Number(tx.amount).toLocaleString()}</span>
                              ) : '-'}
                            </td>
                            <td className="py-4 text-center pr-4">
                              <div className="flex gap-1 justify-center items-center">
                                {tx.meta?.total_commission > 0 && (
                                  <div className="flex flex-col items-center mr-2">
                                    <div className="flex items-center gap-1">
                                      <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${
                                        tx.meta.commission_status === 'REVOKED' ? 'bg-rose-100 text-rose-600' : 
                                        tx.meta.commission_status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'
                                      }`}>
                                        Com: ৳{Math.round(tx.meta.total_commission).toLocaleString()}
                                      </span>
                                      {isAdmin && (
                                        <button 
                                          onClick={() => {
                                            setSelectedPolicyTx(tx);
                                            setNewPolicyDate(tx.meta.expiry_date ? new Date(tx.meta.expiry_date).toISOString().split('T')[0] : "");
                                            setNewPolicyStatus(tx.meta.commission_status || 'PENDING');
                                            setShowPolicyModal(true);
                                          }}
                                          className="text-[10px] opacity-40 hover:opacity-100 transition-opacity"
                                          title="পলিসি পরিবর্তন"
                                        >
                                          ⚙️
                                        </button>
                                      )}
                                    </div>
                                    {tx.meta.commission_status === 'PENDING' && (
                                      <div className="flex flex-col gap-1 mt-2">
                                        <div className="flex gap-1">
                                          <button 
                                            onClick={() => handleCompleteCommission(tx)}
                                            className="bg-emerald-600 text-white text-[7px] font-black px-2 py-1.5 rounded shadow-lg hover:bg-emerald-700 transition-all flex-1"
                                          >
                                            COMPLETE (সম্পন্ন)
                                          </button>
                                          <button 
                                            onClick={() => handleRevokeCommission(tx)}
                                            className="bg-rose-600 text-white text-[7px] font-black px-2 py-1.5 rounded shadow-lg hover:bg-rose-700 transition-all flex-1"
                                          >
                                            REVOKE (বাতিল)
                                          </button>
                                        </div>
                                        {tx.meta.expiry_date && (
                                          <p className={`text-[7px] font-black italic uppercase text-center ${new Date(tx.meta.expiry_date) < new Date() ? 'text-rose-600 animate-pulse' : 'text-slate-400'}`}>
                                            Deadline: {new Date(tx.meta.expiry_date).toLocaleDateString('bn-BD')}
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {tx.items && tx.items.length > 0 && (
                                  <button
                                    onClick={() => { setSelectedMemo(tx); setShowMemoModal(true); }}
                                    className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-all hover:bg-indigo-600 hover:text-white"
                                    title="মেমো দেখুন"
                                  >
                                    📄
                                  </button>
                                )}
                                {isAdmin && (
                                  <button
                                    onClick={() => handleDeleteLedgerEntry(tx)}
                                    className="w-8 h-8 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-500 hover:text-white"
                                    title="এন্ট্রি মুছুন"
                                  >
                                    🗑️
                                  </button>
                                )}
                              </div>
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
        </div>
      )}
      {/* 🧾 INDIVIDUAL MEMO PREVIEW MODAL */}
      {showMemoModal && selectedMemo && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-3xl z-[5000] flex flex-col items-center p-4 overflow-y-auto no-print">
          <div className="w-full max-w-[148mm] flex justify-between items-center mb-8 sticky top-0 z-[5001] bg-slate-900/90 p-6 rounded-[2.5rem] border border-white/10">
            <button onClick={() => setShowMemoModal(false)} className="text-white font-black uppercase text-[10px] px-6 transition-colors hover:text-blue-400">← ফিরে যান</button>
            <button disabled={isDownloading} onClick={handleDownloadIndividualMemo} className="bg-white text-slate-900 px-8 py-4 rounded-xl font-black text-[10px] uppercase shadow-xl active:scale-95">PDF ডাউনলোড ⎙</button>
          </div>

          <div ref={memoRef} className="bg-white w-[148mm] min-h-fit p-10 flex flex-col font-sans text-black relative overflow-hidden">
            <p className="text-center font-bold text-[11px] mb-2 italic leading-tight text-black">বিসমিল্লাহির রাহমানির রাহিম</p>

            <div className="text-center border-b border-black pb-4 mb-4">
              <h1 className="text-[26px] font-black uppercase italic tracking-tighter leading-none mb-1 text-blue-600">IFZA ELECTRONICS</h1>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-1 text-black">{company} DIVISION</p>
              <p className="text-[8px] font-bold text-black italic">যোগাযোগ: {getStaffContacts(company)}</p>
            </div>

            <div className="flex justify-between items-start mb-6">
              <div className="space-y-1 flex-1">
                <p className="text-[18px] font-black uppercase italic leading-tight text-blue-600">{selectedLedgerCust?.name}</p>
                <p className="text-[10px] font-bold text-black">📍 ঠিকানা: {selectedLedgerCust?.address} | 📱 {selectedLedgerCust?.phone}</p>
              </div>

              <div className="text-right space-y-1 w-44">
                <p className="text-[9px] font-black uppercase text-black mb-2">তারিখ: {new Date(selectedMemo.created_at).toLocaleDateString('bn-BD')}</p>
                <p className="text-[10px] font-black uppercase text-black">মেমো আইডি: #{selectedMemo.id.slice(-6).toUpperCase()}</p>
              </div>
            </div>

            <div className="flex-1 mt-4">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-[10px] font-black uppercase italic border-b-2 border-black text-left text-black">
                    <th className="py-2 w-8">Sl</th>
                    <th className="py-2">বিবরণ (Description)</th>
                    <th className="py-2 text-center w-16">দর</th>
                    <th className="py-2 text-center w-12">Qty</th>
                    <th className="py-2 text-right w-20">মোট</th>
                  </tr>
                </thead>
                <tbody className="text-[10px] text-black">
                  {selectedMemo.items?.map((it: any, idx: number) => (
                    <tr key={idx} className={`font-bold italic border-b border-black ${it.action === 'RETURN' ? 'text-red-600' : it.action === 'REPLACE' ? 'text-blue-600' : 'text-black'}`}>
                      <td className="py-2">{idx + 1}</td>
                      <td className="py-2 uppercase">
                        <span>{it.name}</span>
                        {it.mrp && <span className="ml-2 text-[7px] font-black">MRP: ৳{it.mrp}</span>}
                        {it.action !== 'SALE' && <span className="ml-2 text-[7px] border border-black px-1 rounded uppercase">[{it.action}]</span>}
                      </td>
                      <td className="py-2 text-center">৳{it.action === 'REPLACE' ? '0' : it.price}</td>
                      <td className="py-2 text-center">{it.qty}</td>
                      <td className="py-2 text-right">
                        {it.action === 'REPLACE' ? '৳0' : (it.action === 'RETURN' ? '-' : '') + '৳' + Math.round(Number(it.total) || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-8 flex justify-end">
              <div className="w-56 space-y-1 font-black italic text-[10px] text-black">
                <div className="flex justify-between border-t-2 border-black pt-2 text-[15px] text-blue-600">
                  <span className="uppercase">নিট বিল:</span>
                  <span>৳{Math.round(Number(selectedMemo.amount) || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="mt-16 flex justify-between items-end px-4 mb-4 text-black">
              <div className="text-center w-40 border-t border-black pt-2 font-black uppercase italic text-[9px]">ক্রেতার স্বাক্ষর</div>
              <div className="text-center w-48 border-t border-black pt-2 font-black uppercase italic text-[9px]">কর্তৃপক্ষের স্বাক্ষর</div>
            </div>

            <div className="text-center mt-auto pt-10">
              <p className="text-[7px] font-bold uppercase italic tracking-[0.2em] text-black">POWERED BY IFZAERP.COM</p>
            </div>
          </div>
        </div>
      )}
      {/* ⚙️ COMMISSION POLICY EDIT MODAL */}
      {showPolicyModal && selectedPolicyTx && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[6000] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-sm shadow-2xl overflow-hidden animate-reveal border border-white/20">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="text-sm font-black uppercase italic tracking-tighter">কমিশন পলিসি পরিবর্তন</h3>
              <button onClick={() => setShowPolicyModal(false)} className="text-xl font-black">✕</button>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-400 uppercase italic ml-2">পেমেন্ট ডেডলাইন (শর্ত)</label>
                <input 
                  type="date"
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-sm"
                  value={newPolicyDate}
                  onChange={e => setNewPolicyDate(e.target.value)}
                />
                {!newPolicyDate && <p className="text-[8px] text-slate-500 italic mt-1 uppercase text-center">নগদ (Instant / Immediate)</p>}
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-400 uppercase italic ml-2">বর্তমান স্থিতি (Status)</label>
                <select 
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-sm"
                  value={newPolicyStatus}
                  onChange={e => setNewPolicyStatus(e.target.value)}
                >
                  <option value="PENDING">বাকি (Pending)</option>
                  <option value="COMPLETED">পরিশোধিত (Completed)</option>
                  <option value="REVOKED">বাতিল (Revoked)</option>
                </select>
              </div>

              <button 
                onClick={handleUpdatePolicy}
                disabled={isSaving}
                className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all"
              >
                {isSaving ? 'আপডেট হচ্ছে...' : 'পরিবর্তন সেভ করুন ➔'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
