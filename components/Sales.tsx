
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Company, UserRole, User, Product, formatCurrency } from '../types';
import { supabase, db, mapToDbCompany } from '../lib/supabase';
import { jsPDF } from 'jspdf';
import * as html2canvasModule from 'html2canvas';

const html2canvas = (html2canvasModule as any).default || html2canvasModule;

type ItemAction = 'SALE' | 'RETURN' | 'REPLACE';

interface CartItem extends Product {
  qty: number;
  sellingPrice: number;
  discountPercent: number;
  action: ItemAction;
}

interface SalesProps {
  company: Company;
  role: string; // Changed from UserRole to string
  user: User;
}

const Sales: React.FC<SalesProps> = ({ company, role, user }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);

  const [selectedCust, setSelectedCust] = useState<any>(null);
  const [custSearch, setCustSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [prodSearch, setProdSearch] = useState("");
  const [showCustDropdown, setShowCustDropdown] = useState(false);
  const [areaSearch, setAreaSearch] = useState("");
  const [showAreaDropdown, setShowAreaDropdown] = useState(false);

  const [globalCommission, setGlobalCommission] = useState<number>(0);
  const [cashReceived, setCashReceived] = useState<number>(0);
  const [prevDue, setPrevDue] = useState<number>(0);
  const [lastPaymentFromDb, setLastPaymentFromDb] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);

  // New state for History tracking
  const [recentMemos, setRecentMemos] = useState<any[]>([]);
  const [historyDate, setHistoryDate] = useState(new Date().toISOString().split('T')[0]);

  // New states for Commission & Deadline
  const [deadlineDate, setDeadlineDate] = useState<string>(""); 
  const [giftAmount, setGiftAmount] = useState<number>(0); 
  const [showGift, setShowGift] = useState(false); 
  const [viewingArchiveMemo, setViewingArchiveMemo] = useState<any>(null);

  const invoiceRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const dbCo = mapToDbCompany(company);

  useEffect(() => { loadData(); }, [company]);
  useEffect(() => { fetchRecentMemos(); }, [company, historyDate]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (areaRef.current && !areaRef.current.contains(event.target as Node)) {
        setShowAreaDropdown(false);
      }
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCustDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (selectedCust) {
      fetchCustomerStats(selectedCust.id);
    } else {
      setPrevDue(0);
      setLastPaymentFromDb(0);
    }
  }, [selectedCust, company]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        supabase.from('products').select('*').eq('company', dbCo).order('name'),
        supabase.from('customers').select('*').order('name')
      ]);
      setProducts(pRes.data || []);
      setCustomers(cRes.data || []);
    } finally { setLoading(false); }
  };

  const fetchRecentMemos = async () => {
    try {
      // Fetch full day range inclusive of local timezone
      const start = `${historyDate}T00:00:00.000Z`;
      const end = `${historyDate}T23:59:59.999Z`;
      
      const { data, error } = await supabase
        .from('transactions')
        .select('*, customers(name, address, phone)')
        .eq('company', dbCo)
        .eq('payment_type', 'DUE')
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Fetch Error:", error);
      }
      setRecentMemos(data || []);
    } catch (err) { 
      console.error("Catch Error:", err);
    }
  };

  const handleViewArchiveMemo = (memo: any) => {
    // We recreate the state for the preview modal but marked as archive
    setViewingArchiveMemo(memo);
    setShowInvoicePreview(true);
  };

  const fetchCustomerStats = async (customerId: string) => {
    try {
      const { data } = await supabase
        .from('transactions')
        .select('amount, payment_type, created_at, meta, items')
        .eq('customer_id', customerId)
        .eq('company', dbCo)
        .order('created_at', { ascending: false });

      let due = 0;
      let lastColl = 0;
      let foundLastColl = false;

      data?.forEach(tx => {
        const amt = Number(tx.amount);
        const isBooking = tx.meta?.is_booking === true || tx.items?.[0]?.note?.includes('বুকিং');

        if (tx.payment_type === 'COLLECTION') {
          if (!isBooking) {
            due -= amt;
            if (!foundLastColl) {
              lastColl = amt;
              foundLastColl = true;
            }
          }
        } else {
          due += amt;
        }
      });
      setPrevDue(due);
      setLastPaymentFromDb(lastColl);
    } catch (err) { }
  };

  const getStaffContacts = (co: Company) => {
    switch (co) {
      case 'Transtec': return "01701551690";
      case 'SQ Light': return "+8801774105970";
      case 'SQ Cables': return "+8801709643451";
      default: return "";
    }
  };

  const addToCart = (p: Product) => {
    const existing = cart.find(i => i.id === p.id && i.action === 'SALE');
    const defaultComm = p.commission_percent || 0;
    
    if (existing) {
      setCart(cart.map(i => (i.id === p.id && i.action === 'SALE') ? { ...i, qty: i.qty + 1 } : i));
    } else {
      setCart([...cart, { ...p, qty: 1, sellingPrice: p.tp, discountPercent: defaultComm, action: 'SALE' }]);
    }
    setProdSearch("");
  };

  const updateCartItem = (idx: number, updates: Partial<CartItem>) => {
    setCart(prev => {
      const next = [...prev];
      const item = { ...next[idx], ...updates };

      if (updates.sellingPrice !== undefined) {
        item.discountPercent = item.tp > 0 ? ((item.tp - updates.sellingPrice) / item.tp) * 100 : 0;
      } else if (updates.discountPercent !== undefined) {
        item.sellingPrice = item.tp - (item.tp * updates.discountPercent / 100);
      }

      next[idx] = item;
      return next.filter(i => i.qty > 0 || (i.qty === 0 && updates.qty === undefined));
    });
  };

  const removeItem = (idx: number) => {
    setCart((prev: CartItem[]) => prev.filter((_, i) => i !== idx));
  };

  const totals = useMemo(() => {
    const subtotalBeforeCommission = cart.reduce((sum: number, i: CartItem) => {
      if (i.action === 'REPLACE') return sum;
      const itemPrice = Number(i.tp); // Full TP value
      const lineTotal = itemPrice * i.qty;
      return sum + (i.action === 'RETURN' ? -lineTotal : lineTotal);
    }, 0);

    const itemCommissionTotal = cart.reduce((sum: number, i: CartItem) => {
      if (i.action !== 'SALE') return sum;
      const tpPrice = Number(i.tp);
      const sellPrice = Number(i.sellingPrice);
      const commissionPerUnit = tpPrice - sellPrice;
      return sum + (commissionPerUnit * i.qty);
    }, 0);

    const globalCommissionAmount = (subtotalBeforeCommission > 0) ? (subtotalBeforeCommission * globalCommission) / 100 : 0;

    const totalCommission = itemCommissionTotal + globalCommissionAmount;
    const netTotal = subtotalBeforeCommission - totalCommission;
    const finalTotalBalance = prevDue + netTotal - cashReceived;

    return { subtotal: subtotalBeforeCommission, totalCommission, netTotal, finalTotalBalance };
  }, [cart, globalCommission, cashReceived, prevDue]);

  const handleFinalSave = async () => {
    if (!selectedCust || cart.length === 0) return alert("দোকান এবং পণ্য নির্বাচন করুন!");
    if (!confirm("আপনি কি নিশ্চিতভাবে এই মেমোটি সেভ করতে চান?")) return;

    setIsSaving(true);
    try {
      const itemsToSave = cart.map((i: CartItem) => {
        const isReplace = i.action === 'REPLACE';
        const price = isReplace ? 0 : Number(i.sellingPrice);
        const tpRate = isReplace ? 0 : Number(i.tp);
        const itemTotal = isReplace ? 0 : (i.action === 'RETURN' ? -1 : 1) * price * i.qty;

        return {
          id: i.id, name: i.name, qty: i.qty, price, mrp: i.mrp, tp: tpRate,
          discount: i.discountPercent, action: i.action, total: itemTotal
        };
      });

      const expiryDate = deadlineDate ? new Date(deadlineDate).toISOString() : null;

      const { data: txData, error: txError } = await supabase.from('transactions').insert([{
        customer_id: selectedCust.id,
        company: dbCo,
        amount: totals.netTotal,
        payment_type: 'DUE',
        items: itemsToSave,
        submitted_by: user.name,
        meta: {
          total_commission: totals.totalCommission,
          total_gift: giftAmount,
          commission_percent_global: globalCommission,
          commission_percent_item: cart.map(it => it.discountPercent),
          commission_type: deadlineDate ? 'CONDITIONAL' : 'IMMEDIATE',
          expiry_date: expiryDate,
          commission_status: deadlineDate ? 'PENDING' : 'COMPLETED'
        }
      }]).select().single();

      if (txError) throw txError;

      const memoIdShort = String(txData.id).slice(-6).toUpperCase();

      // 🔔 Trigger Notification to Customer
      await supabase.from('notifications').insert([{
        customer_id: selectedCust.id,
        title: `নতুন সেলস মেমো #${memoIdShort}`,
        message: `${company} থেকে আপনার নামে ৳${Math.round(totals.netTotal).toLocaleString()} টাকার একটি মেমো তৈরি করা হয়েছে। (#${memoIdShort})`,
        type: 'MEMO'
      }]);

      if (cashReceived > 0) {
        await supabase.from('transactions').insert([{
          customer_id: selectedCust.id, company: dbCo, amount: cashReceived, payment_type: 'COLLECTION',
          items: [{ note: `নগদ গ্রহণ (মেমো #${memoIdShort})` }],
          submitted_by: user.name
        }]);

        await supabase.from('notifications').insert([{
          customer_id: selectedCust.id,
          title: `টাকা জমা রশিদ (মেমো #${memoIdShort})`,
          message: `আপনার মেমো #${memoIdShort} পরিশোধ বাবদ ৳${Math.round(cashReceived).toLocaleString()} জমা করা হয়েছে।`,
          type: 'PAYMENT'
        }]);
      }

      for (const item of cart) {
        if (item.action === 'REPLACE') {
          await supabase.from('replacements').insert([{
            customer_id: selectedCust.id,
            company: dbCo,
            product_name: item.name,
            product_id: item.id,
            qty: item.qty,
            status: 'PENDING'
          }]);
          await supabase.rpc('increment_stock', { row_id: item.id, amt: -item.qty });
        } else if (item.action === 'SALE') {
          await supabase.rpc('increment_stock', { row_id: item.id, amt: -item.qty });
        } else if (item.action === 'RETURN') {
          await supabase.rpc('increment_stock', { row_id: item.id, amt: item.qty });
        }
      }

      alert("মেমো সফলভাবে সেভ হয়েছে!");
      setShowInvoicePreview(false);
      setCart([]);
      setSelectedCust(null);
      setGlobalCommission(0);
      setCashReceived(0);
      loadData();
      fetchRecentMemos();
    } catch (e: any) { alert("ত্রুটি: " + e.message); } finally { setIsSaving(false); }
  };

  const handleDeleteMemo = async (memo: any) => {
    if (!user.role.includes('ADMIN') && !user.role.includes('STAFF')) return;
    const memoIdShort = String(memo.id).slice(-6).toUpperCase();
    const confirmMsg = `আপনি কি নিশ্চিত এই মেমোটি (#${memoIdShort}) ডিলিট করতে চান? এটি ডিলিট করলে মাল স্টকে ফেরত যাবে এবং নোটিফিকেশন মুছে যাবে।`;
    if (!confirm(confirmMsg)) return;

    setLoading(true);
    try {
      // 1. Recover stock
      if (Array.isArray(memo.items)) {
        for (const item of memo.items) {
          if (item.id && item.qty) {
            const amtToRevert = item.action === 'RETURN' ? -Number(item.qty) : Number(item.qty);
            await supabase.rpc('increment_stock', { row_id: item.id, amt: amtToRevert });
          }
        }
      }

      // 2. 🔔 Delete associated notifications from customer inbox
      await supabase
        .from('notifications')
        .delete()
        .eq('customer_id', memo.customer_id)
        .ilike('message', `%#${memoIdShort}%`);

      // 3. Delete the transaction
      const { error } = await supabase.from('transactions').delete().eq('id', memo.id);
      if (error) throw error;

      alert("মেমো এবং নোটিফিকেশন সফলভাবে মুছে ফেলা হয়েছে!");
      fetchRecentMemos();
      loadData();
    } catch (err: any) {
      alert("ডিলিট করা যায়নি: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async () => {
    if (!invoiceRef.current || isDownloading) return;
    setIsDownloading(true);
    try {
      const canvas = await html2canvas(invoiceRef.current, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a5');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      
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

      pdf.save(`IFZA_Memo_${selectedCust?.name}_${new Date().toLocaleDateString('bn-BD')}.pdf`);
    } catch (e) { 
      alert("PDF তৈরি করা যায়নি।"); 
    } finally { 
      setIsDownloading(false); 
    }
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter((c: any) => {
      const q = (custSearch || "").toLowerCase().trim();
      const name = (c.name || "").toLowerCase();
      const phone = (c.phone || "");
      return (name.includes(q) || phone.includes(q)) && (!areaFilter || c.address === areaFilter);
    });
  }, [customers, custSearch, areaFilter]);

  const filteredProducts = useMemo(() => products.filter(p => (p.name || "").toLowerCase().includes((prodSearch || "").toLowerCase())), [products, prodSearch]);

  return (
    <div className="flex flex-col gap-6 pb-32 animate-reveal text-black font-sans">

      <div className="flex flex-col lg:flex-row gap-6">
        {/* LEFT: Product Selection */}
        <div className="flex-1 space-y-6 no-print">
          <div className="bg-white p-6 rounded-[2rem] border shadow-sm" ref={dropdownRef}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative" ref={areaRef}>
                <button
                  onClick={() => setShowAreaDropdown(!showAreaDropdown)}
                  className="w-full p-4 bg-slate-50 border rounded-2xl outline-none font-bold text-xs flex justify-between items-center transition-all focus:border-blue-500"
                >
                  <span className="uppercase">{areaFilter || "সকল এরিয়া"}</span>
                  <span className="text-[8px] opacity-40">▼</span>
                </button>

                {showAreaDropdown && (
                  <div className="absolute top-full mt-2 left-0 w-full bg-white border border-slate-200 rounded-2xl shadow-2xl z-[1000] overflow-hidden animate-reveal">
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
                        onClick={() => { setAreaFilter(""); setShowAreaDropdown(false); setShowCustDropdown(true); }}
                      >
                        সকল এরিয়া
                      </div>
                      {Array.from(new Set(customers.map(c => String(c.address || "").trim()).filter(Boolean))).sort().filter(a => a.toLowerCase().includes((areaSearch || "").toLowerCase())).map(area => (
                        <div
                          key={area}
                          className="p-4 hover:bg-blue-50 cursor-pointer text-[10px] font-black uppercase text-slate-700 border-t border-slate-50"
                          onClick={() => { setAreaFilter(area); setShowAreaDropdown(false); setShowCustDropdown(true); setAreaSearch(""); }}
                        >
                          {area}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button onClick={() => setShowCustDropdown(!showCustDropdown)} className={`w-full p-4 rounded-2xl border flex items-center justify-between text-left ${selectedCust ? 'bg-blue-50 border-blue-200' : 'bg-slate-50'}`}>
                {selectedCust ? <span className="font-black text-blue-700 text-xs uppercase">{selectedCust.name}</span> : <span className="text-xs font-bold text-slate-400 uppercase">দোকান বাছাই করুন...</span>}
                <span>▼</span>
              </button>
              {showCustDropdown && (
                <div className="absolute top-[280px] left-8 right-8 md:w-[400px] z-[500] bg-white border rounded-2xl shadow-2xl overflow-hidden animate-reveal">
                  <input className="w-full p-4 border-b font-bold text-xs" placeholder="খুঁজুন..." value={custSearch} onChange={e => setCustSearch(e.target.value)} />
                  <div className="max-h-60 overflow-y-auto">
                    {filteredCustomers.map(c => <div key={c.id} onClick={() => { setSelectedCust(c); setShowCustDropdown(false); }} className="p-4 hover:bg-blue-50 border-b cursor-pointer font-bold text-xs uppercase">{c.name} - {c.address}</div>)}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2rem] border shadow-sm">
            <input className="w-full p-4 bg-slate-50 border rounded-2xl font-bold text-xs uppercase mb-4" placeholder="মডেল সার্চ করুন..." value={prodSearch} onChange={e => setProdSearch(e.target.value)} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[500px] overflow-y-auto custom-scroll pr-2">
              {filteredProducts.map(p => (
                <div key={p.id} onClick={() => addToCart(p)} className="p-4 border rounded-2xl flex justify-between items-center hover:bg-blue-50 cursor-pointer active:scale-95 transition-all">
                  <div className="min-w-0 pr-4">
                    <p className="text-[11px] font-black uppercase italic truncate">{p.name}</p>
                    <p className="text-[9px] font-bold text-blue-600 uppercase">Stock: {p.stock} | MRP: ৳{p.mrp}</p>
                  </div>
                  <p className="text-xs font-black italic">৳{p.tp}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: POS Cart */}
        <div className="w-full lg:w-[480px] space-y-6 no-print">
          <div className="bg-slate-900 text-white rounded-[2.5rem] shadow-xl flex flex-col h-[700px] sticky top-6 overflow-hidden">
            <div className="p-8 border-b border-white/5 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <h3 className="font-black uppercase italic text-sm">মেমো কার্ট (POS)</h3>
                <button 
                  onClick={() => setShowGift(!showGift)} 
                  className={`px-3 py-1.5 rounded-lg font-black text-[8px] uppercase transition-all ${showGift ? 'bg-rose-600 text-white shadow-lg' : 'bg-white/10 text-rose-400 border border-white/10'}`}
                >
                  {showGift ? '🎁 গিফট চালু' : '🎁 গিফট'}
                </button>
              </div>
              <button onClick={() => { setCart([]); setGlobalCommission(0); setCashReceived(0); setShowGift(false); }} className="text-[9px] font-black uppercase text-rose-400">রিসেট</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scroll">
              {cart.map((item, idx) => (
                <div key={`${item.id}-${idx}`} className={`p-2 rounded-xl border transition-all ${item.action === 'SALE' ? 'bg-white/5 border-white/5' : item.action === 'RETURN' ? 'bg-red-500/10 border-red-500/20' : 'bg-cyan-500/10 border-cyan-500/20'}`}>
                  <div className="flex justify-between items-center mb-1.5 px-1">
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      <p className="text-[9px] font-black uppercase italic text-slate-100 truncate">{item.name}</p>
                      <span className="text-[7px] font-bold text-slate-500 uppercase whitespace-nowrap">M: ৳{item.mrp}</span>
                    </div>
                    <button onClick={() => removeItem(idx)} className="text-slate-500 hover:text-red-500 text-lg ml-2 leading-none">×</button>
                  </div>

                  <div className="grid grid-cols-5 gap-1 items-center">
                    <div>
                      <input type="number" className="w-full bg-black/40 p-1.5 rounded-lg text-center text-[9px] font-bold text-white outline-none" title="পিস (Qty)" value={item.qty} onChange={e => updateCartItem(idx, { qty: Number(e.target.value) })} />
                    </div>
                    <div>
                      <input
                        type="number"
                        disabled
                        title="টিপি (TP)"
                        className="w-full p-1.5 rounded-lg text-center text-[9px] font-bold text-slate-500 outline-none bg-white/5"
                        value={item.tp}
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        disabled={item.action === 'REPLACE'}
                        title="বিক্রয় রেট"
                        className={`w-full p-1.5 rounded-lg text-center text-[9px] font-bold text-white outline-none ${item.action === 'REPLACE' ? 'bg-white/5 text-slate-500' : 'bg-black/40 border border-blue-500/30'}`}
                        value={item.sellingPrice}
                        onChange={e => updateCartItem(idx, { sellingPrice: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        disabled={item.action === 'REPLACE'}
                        title="কমিশন %"
                        className={`w-full p-1.5 rounded-lg text-center text-[9px] font-black text-emerald-500 outline-none ${item.action === 'REPLACE' ? 'bg-white/5 opacity-20' : 'bg-black/40 border border-emerald-500/20'}`}
                        placeholder="0%"
                        value={Math.round(item.discountPercent || 0)}
                        onChange={e => updateCartItem(idx, { discountPercent: Number(e.target.value) })}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <button onClick={() => updateCartItem(idx, { action: 'SALE', sellingPrice: item.tp })} title="Sell" className={`py-1 rounded text-[8px] font-black border transition-all ${item.action === 'SALE' ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-white/5 border-white/5 text-slate-500'}`}>S</button>
                      <button onClick={() => updateCartItem(idx, { action: 'RETURN', sellingPrice: item.tp })} title="Return" className={`py-1 rounded text-[8px] font-black border transition-all ${item.action === 'RETURN' ? 'bg-red-600 border-red-600 text-white shadow-lg' : 'bg-white/5 border-white/5 text-slate-500'}`}>R</button>
                      <button onClick={() => updateCartItem(idx, { action: 'REPLACE', sellingPrice: 0, discountPercent: 0 })} title="Replace" className={`py-1 rounded text-[8px] font-black border transition-all ${item.action === 'REPLACE' ? 'bg-cyan-600 border-cyan-600 text-white shadow-lg' : 'bg-white/5 border-white/5 text-slate-500'}`}>Rp</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-black/40 border-t border-white/10 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-0.5">
                  <label className="text-[7px] font-black text-slate-500 uppercase ml-2 italic">গ্লোবাল কমিশন %</label>
                  <input type="number" placeholder="0" className="w-full bg-white/5 p-2 rounded-xl text-center font-black text-white text-base" value={globalCommission || ""} onChange={e => setGlobalCommission(Number(e.target.value))} />
                </div>
                <div className="space-y-0.5 relative">
                  <label className="text-[7px] font-black text-blue-500 uppercase ml-2 italic">পেমেন্ট ডেডলাইন (শর্ত)</label>
                  <input 
                    type="date"
                    className="w-full bg-white/5 p-2 rounded-xl text-center font-black text-white text-[10px] outline-none border border-white/5 focus:border-blue-500" 
                    value={deadlineDate} 
                    onChange={e => setDeadlineDate(e.target.value)}
                  />
                  {!deadlineDate && <p className="absolute -bottom-2 right-2 text-[6px] text-slate-500 uppercase font-bold">নগদ (Instant)</p>}
                </div>
                {showGift && (
                  <div className="space-y-0.5">
                    <label className="text-[7px] font-black text-rose-400 uppercase ml-2 italic">গোপন গিফট ভ্যালু (Gift)</label>
                    <input type="number" placeholder="0" className="w-full bg-white/5 p-2 rounded-xl text-center font-black text-rose-400 text-base shadow-inner" value={giftAmount || ""} onChange={e => setGiftAmount(Number(e.target.value))} />
                  </div>
                )}
                <div className="space-y-0.5">
                  <label className="text-[7px] font-black text-emerald-500 uppercase ml-2 italic">আজকের জমা (নগদ)</label>
                  <input type="number" placeholder="0" className="w-full bg-white/5 p-2 rounded-xl text-center font-black text-emerald-400 text-base shadow-inner" value={cashReceived || ""} onChange={e => setCashReceived(Number(e.target.value))} />
                </div>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-white/5">
                <div>
                  <p className="text-[8px] font-black text-slate-500 uppercase italic leading-none mb-1">Grand Total</p>
                  <p className="text-2xl font-black italic tracking-tighter text-white">{formatCurrency(totals.netTotal)}</p>
                </div>
                <button disabled={cart.length === 0 || !selectedCust} onClick={() => setShowInvoicePreview(true)} className="bg-blue-600 text-white px-6 py-4 rounded-2xl font-black uppercase text-[10px] shadow-2xl active:scale-95 transition-all">মেমো প্রিভিউ ➔</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 📜 BOTTOM HISTORY SECTION */}
      <div className="mt-12 bg-white rounded-[3.5rem] border shadow-sm overflow-hidden no-print">
        <div className="p-8 md:p-10 border-b flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-2xl text-white italic font-black shadow-lg">H</div>
            <div>
              <h3 className="text-xl font-black uppercase italic tracking-tighter">মেমো হিস্টোরি ও কারেকশন</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">ভুল মেমো ডিলিট করলে মাল স্টকে ফেরত যাবে</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="text-[10px] font-black text-slate-400 uppercase italic">তারিখ নির্বাচন:</label>
            <input
              type="date"
              className="p-4 bg-slate-50 border rounded-2xl font-black text-[11px] outline-none focus:border-blue-600 transition-all"
              value={historyDate}
              onChange={e => setHistoryDate(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto custom-scroll max-h-[500px]">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] border-b">
                <th className="px-8 py-6">সময়</th>
                <th className="px-8 py-6">দোকানের নাম ও ঠিকানা</th>
                <th className="px-8 py-6 text-center">আইটেম</th>
                <th className="px-8 py-6 text-right">মেমো বিল</th>
                <th className="px-8 py-6 text-center">অ্যাকশন</th>
              </tr>
            </thead>
            <tbody className="divide-y text-[12px] font-bold">
              {recentMemos.length === 0 ? (
                <tr><td colSpan={5} className="p-20 text-center opacity-20 font-black uppercase italic italic text-sm">এই তারিখে কোনো মেমো পাওয়া যায়নি</td></tr>
              ) : recentMemos.map((memo, idx) => (
                <tr key={memo.id} className="hover:bg-blue-50/50 transition-colors animate-reveal" style={{ animationDelay: `${idx * 0.05}s` }}>
                  <td className="px-8 py-6 text-slate-400 font-black italic">
                    {new Date(memo.created_at).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-8 py-6">
                    <p className="uppercase font-black text-slate-900 leading-none mb-1">{memo.customers?.name}</p>
                    <p className="text-[9px] text-slate-400 italic">📍 {memo.customers?.address}</p>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <span className="px-3 py-1 bg-slate-100 rounded-lg text-[10px] font-black uppercase italic">
                      {memo.items?.length || 0} Products
                    </span>
                  </td>
                  <td className="px-8 py-6 text-right font-black italic text-base text-slate-900 tracking-tighter">
                    {formatCurrency(memo.amount)}
                  </td>
                  <td className="px-8 py-6 text-center">
                    <div className="flex justify-center items-center gap-2">
                      <button
                        onClick={() => handleViewArchiveMemo(memo)}
                        className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm flex items-center justify-center text-sm active:scale-90"
                        title="View & Re-print Memo"
                      >
                        👁️
                      </button>
                      <button
                        onClick={() => handleDeleteMemo(memo)}
                        className="w-10 h-10 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm flex items-center justify-center text-sm active:scale-90"
                        title="Delete Memo & Revert Stock"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 🧾 MINIMALIST INVOICE PREVIEW MODAL */}
      {showInvoicePreview && (viewingArchiveMemo || (selectedCust && cart.length > 0)) && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-3xl z-[5000] flex flex-col items-center p-4 overflow-y-auto no-print">
          <div className="w-full max-w-[148mm] flex justify-between items-center mb-8 sticky top-0 z-[5001] bg-slate-900/90 p-6 rounded-[2.5rem] border border-white/10">
            <button onClick={() => { setShowInvoicePreview(false); setViewingArchiveMemo(null); }} className="text-white font-black uppercase text-[10px] px-6 transition-colors hover:text-blue-400">← ফিরে যান</button>
            <div className="flex gap-3">
              <button disabled={isDownloading} onClick={downloadPDF} className="bg-white text-slate-900 px-8 py-4 rounded-xl font-black text-[10px] uppercase shadow-xl active:scale-95">PDF ডাউনলোড ⎙</button>
              {!viewingArchiveMemo && (
                <button disabled={isSaving} onClick={handleFinalSave} className="bg-emerald-600 text-white px-10 py-4 rounded-xl font-black text-[10px] uppercase shadow-xl transition-all hover:bg-emerald-700">কনফার্ম সেভ ✓</button>
              )}
            </div>
          </div>

          {(() => {
            const isArchive = !!viewingArchiveMemo;
            const targetCust = isArchive ? viewingArchiveMemo.customers : selectedCust;
            const targetItems = isArchive ? viewingArchiveMemo.items : cart;
            const targetMeta = isArchive ? viewingArchiveMemo.meta : {};
            
            // Reconstruct totals for archive if needed, or use stored totals
            const archiveSubtotal = isArchive ? (targetItems.reduce((s: any, i: any) => s + (Number(i.tp || 0) * i.qty * (i.action === 'RETURN' ? -1 : 1)), 0)) : totals.subtotal;
            const archiveCommission = isArchive ? viewingArchiveMemo.meta?.total_commission : totals.totalCommission;
            const archiveNetTotal = isArchive ? (archiveSubtotal - archiveCommission) : totals.netTotal;
            const archiveGift = isArchive ? viewingArchiveMemo.meta?.total_gift : giftAmount;
            const archiveDeadline = isArchive ? viewingArchiveMemo.meta?.expiry_date : deadlineDate;
            
            // For archive, we might not have prevDue/finalTotal stored in meta? 
            // Let's check if they are there. If not, we use current or 0.
            const archiveFinalTotal = isArchive ? (Number(archiveNetTotal)) : totals.finalTotalBalance;

            return (
              <div ref={invoiceRef} className="bg-white w-[148mm] min-h-fit p-10 flex flex-col font-sans text-black relative overflow-hidden">
                <p className="text-center font-bold text-[11px] mb-2 italic leading-tight text-black">
                  বিসমিল্লাহির রাহমানির রাহিম
                </p>

                <div className="text-center border-b border-black pb-4 mb-4">
                  <h1 className="text-[26px] font-black uppercase italic tracking-tighter leading-none mb-1 text-blue-600">IFZA ELECTRONICS</h1>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-1 text-black">{company} DIVISION</p>
                  <p className="text-[8px] font-bold text-black italic">যোগাযোগ: {getStaffContacts(company)}</p>
                </div>

                <div className="flex justify-between items-start mb-6">
                  <div className="space-y-1 flex-1">
                    <p className="text-[18px] font-black uppercase italic leading-tight text-blue-600">{targetCust?.name}</p>
                    <p className="text-[10px] font-bold text-black">📍 ঠিকানা: {targetCust?.address} | 📱 {targetCust?.phone}</p>

                    <div className="mt-4 flex gap-4">
                      <div className="border-l-4 border-black pl-3">
                        <p className="text-[8px] font-black uppercase text-black">সর্বশেষ জমা:</p>
                        <p className="text-[13px] font-black text-black">৳{isArchive ? "N/A" : lastPaymentFromDb.toLocaleString()}</p>
                      </div>
                      {!isArchive && cashReceived > 0 && (
                        <div className="border-l-4 border-green-600 pl-3">
                          <p className="text-[8px] font-black uppercase text-green-600">আজকের জমা:</p>
                          <p className="text-[13px] font-black text-green-600">৳{cashReceived.toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right space-y-1 w-44">
                    <p className="text-[9px] font-black uppercase text-black mb-2">তারিখ: {isArchive ? new Date(viewingArchiveMemo.created_at).toLocaleDateString('bn-BD') : new Date().toLocaleDateString('bn-BD')}</p>
                    {!isArchive && <p className="flex justify-between font-bold text-[11px] text-black"><span>পূর্বের বাকি:</span> <span className="text-red-600">৳{Math.round(prevDue).toLocaleString()}</span></p>}
                    <p className="flex justify-between font-black text-[14px] border-t border-black pt-1 text-black"><span>মোট বিল:</span> <span className="text-red-600">৳{Math.round(archiveNetTotal).toLocaleString()}</span></p>
                    {archiveDeadline && (
                      <div className="mt-2 p-2 bg-rose-50 border border-rose-100 rounded-lg">
                        <p className="text-[7px] font-black text-rose-600 uppercase leading-tight">পেমেন্ট ডেডলাইন (কমিশন শর্ত):</p>
                        <p className="text-[10px] font-black text-rose-700 italic">
                          {new Date(archiveDeadline).toLocaleDateString('bn-BD')}
                        </p>
                      </div>
                    )}
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
                    <tbody className={`${targetItems.length > 35 ? "text-[8px]" : "text-[10px]"} text-black`}>
                      {targetItems.map((it: any, idx: number) => (
                        <tr key={idx} className={`font-bold italic border-b border-black ${it.action === 'RETURN' ? 'text-red-600' : it.action === 'REPLACE' ? 'text-blue-600' : 'text-black'}`}>
                          <td className="py-2">{idx + 1}</td>
                          <td className="py-2 uppercase">
                            <span>{it.name}</span>
                            <div className="flex gap-2 items-center mt-0.5 opacity-60">
                              <span className="text-[7px] font-black">MRP: ৳{it.mrp}</span>
                              {it.action !== 'SALE' && <span className="text-[7px] border border-black px-1 rounded uppercase">[{it.action}]</span>}
                            </div>
                          </td>
                          <td className="py-2 text-center">৳{it.action === 'REPLACE' ? '0' : it.price || it.sellingPrice}</td>
                          <td className="py-2 text-center">{it.qty}</td>
                          <td className="py-2 text-right">
                            ৳{Math.abs(Math.round((it.price || it.sellingPrice) * it.qty)).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-8 flex justify-end">
                  <div className="w-56 space-y-1 font-black italic text-[10px] text-black">
                    <div className="flex justify-between"><span>SUB-TOTAL (TP):</span><span>৳{Math.round(archiveSubtotal).toLocaleString()}</span></div>
                    {archiveCommission > 0 && (
                      <div className="flex justify-between text-blue-600">
                        <span>TOTAL COMMISSION:</span>
                        <span>-৳{Math.round(archiveCommission).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t-2 border-black pt-2 text-[15px] text-blue-600">
                      <span className="uppercase">নিট বিল (Payable):</span>
                      <span>৳{Math.round(archiveNetTotal).toLocaleString()}</span>
                    </div>
                    {archiveGift > 0 && (
                      <div className="mt-4 pt-2 border-t border-slate-200">
                        <p className="text-[9px] font-black text-rose-600 italic text-center">** এই পণ্যের সাথে গিফট ধার্য করা হয়েছে।</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-20 flex justify-between items-end px-4 mb-4 text-black">
                  <div className="text-center w-40 border-t border-black pt-2 font-black uppercase italic text-[9px]">ক্রেতার স্বাক্ষর</div>
                  <div className="text-center">
                    <div className="mb-1">
                      <p className="text-[12px] font-black text-red-600 uppercase italic leading-none">এস এম মোস্তাফিজুর রহমান</p>
                      <p className="text-[9px] font-bold text-red-600 uppercase mt-1">ইফজা ইলেকট্রনিক্স</p>
                    </div>
                    <div className="w-48 border-t border-black pt-2">
                      <p className="text-[9px] font-black uppercase italic">কর্তৃপক্ষের স্বাক্ষর</p>
                    </div>
                  </div>
                </div>

                <div className="text-center mt-auto pt-10">
                  <p className="text-[7px] font-bold uppercase italic tracking-[0.2em] text-black">POWERED BY IFZAERP.COM</p>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {loading && <div className="fixed inset-0 bg-white/50 backdrop-blur-sm z-[9999] flex items-center justify-center font-black uppercase italic text-blue-600 animate-pulse tracking-[0.3em]">Syncing POS Terminal...</div>}
    </div>
  );
};

export default Sales;
