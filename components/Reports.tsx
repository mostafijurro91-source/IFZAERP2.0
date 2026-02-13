
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Company, formatCurrency, UserRole } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';
import { jsPDF } from 'jspdf';
import * as html2canvasModule from 'html2canvas';

const html2canvas = (html2canvasModule as any).default || html2canvasModule;

interface ReportsProps {
  company: Company;
  userRole?: UserRole;
  userName?: string;
  user?: any;
}

type ReportType = 'MAIN' | 'CUSTOMER_DUES' | 'STOCK_REPORT' | 'DELIVERY_LOG_A4' | 'PURCHASE_HISTORY' | 'MARKET_ORDERS' | 'MASTER_LOG_ALL' | 'BOOKING_LOG' | 'REPLACEMENT_SUMMARY';

const Reports: React.FC<ReportsProps> = ({ company, userRole, userName, user }) => {
  const [activeReport, setActiveReport] = useState<ReportType>('MAIN');
  const [loading, setLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [reportData, setReportData] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedRoute, setSelectedRoute] = useState("");
  const [routes, setRoutes] = useState<string[]>([]);
  
  const [showSlipModal, setShowSlipModal] = useState(false);
  const [selectedSlipData, setSelectedSlipData] = useState<any>(null);

  const reportRef = useRef<HTMLDivElement>(null);
  const slipRef = useRef<HTMLDivElement>(null);

  const isAdmin = userRole === 'ADMIN';

  useEffect(() => { fetchRoutes(); }, []);
  useEffect(() => { 
    if (activeReport !== 'MAIN') {
      fetchReport(activeReport);
    }
  }, [activeReport, company, selectedDate]);

  const fetchRoutes = async () => {
    const { data } = await supabase.from('customers').select('address');
    const routeList = (data?.map(c => c.address?.trim()).filter(Boolean) || []) as string[];
    setRoutes(Array.from(new Set(routeList)).sort());
  };

  const fetchReport = async (type: ReportType) => {
    setLoading(true);
    const dbCompany = mapToDbCompany(company);
    try {
      const startOfDay = `${selectedDate}T00:00:00.000Z`;
      const endOfDay = `${selectedDate}T23:59:59.999Z`;

      if (type === 'STOCK_REPORT') {
        const { data } = await supabase.from('products').select('*').eq('company', dbCompany).order('name');
        setReportData(data || []);
      } 
      else if (type === 'REPLACEMENT_SUMMARY') {
        const { data } = await supabase
          .from('replacements')
          .select('*')
          .eq('company', dbCompany);
        
        const groupedMap: Record<string, any> = {};
        data?.forEach(r => {
          const key = r.product_name || 'Unknown Product';
          if (!groupedMap[key]) {
            groupedMap[key] = { name: key, qty: 0, pending: 0, received: 0, sent: 0 };
          }
          groupedMap[key].qty += Number(r.qty || 0);
          if (r.status === 'PENDING') groupedMap[key].pending += Number(r.qty || 0);
          if (r.status === 'RECEIVED') groupedMap[key].received += Number(r.qty || 0);
          if (r.status === 'SENT_TO_COMPANY') groupedMap[key].sent += Number(r.qty || 0);
        });
        setReportData(Object.values(groupedMap).sort((a,b) => b.qty - a.qty));
      }
      else if (type === 'MARKET_ORDERS') {
        const { data } = await supabase.from('market_orders').select('*, customers(name, address, phone)').eq('company', dbCompany).gte('created_at', startOfDay).lte('created_at', endOfDay).order('created_at', { ascending: false });
        setReportData(data || []);
      }
      else if (type === 'BOOKING_LOG') {
        const { data: bookings, error } = await supabase
          .from('bookings')
          .select('*, customers(name, address, phone)')
          .eq('company', dbCompany)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        const flatBookings: any[] = [];
        bookings?.forEach(b => {
          b.items.forEach((item: any) => {
            if (item.delivered_qty > 0) {
              flatBookings.push({
                ...item,
                customer_name: b.customers?.name,
                address: b.customers?.address,
                phone: b.customers?.phone,
                booking_id: b.id,
                status: b.status,
                booking_created_at: b.created_at
              });
            }
          });
        });
        setReportData(flatBookings);
      }
      else if (type === 'DELIVERY_LOG_A4' || type === 'MASTER_LOG_ALL') {
        let query = supabase.from('transactions')
          .select('*, customers(id, name, address)')
          .gte('created_at', startOfDay)
          .lte('created_at', endOfDay);
        
        if (type === 'DELIVERY_LOG_A4') {
          query = query.eq('company', dbCompany);
        }

        const { data: txs, error } = await query.order('created_at', { ascending: true });
        if (error) throw error;

        const list = (txs || []).map(t => {
          const items = t.items || [];
          const totalQty = items.reduce((acc: number, item: any) => acc + (Number(item.qty) || 0), 0);
          return { ...t, total_qty: totalQty, log_type: t.payment_type === 'COLLECTION' ? 'আদায়' : 'মেমো' };
        });
        setReportData(list);
      } 
      else if (type === 'CUSTOMER_DUES') {
        const [{ data: custs }, { data: txs }] = await Promise.all([
          supabase.from('customers').select('*').order('name'),
          supabase.from('transactions').select('customer_id, amount, payment_type, company').eq('company', dbCompany)
        ]);
        const dues: Record<string, number> = {};
        txs?.forEach(tx => { 
          const cid = tx.customer_id;
          if (!dues[cid]) dues[cid] = 0;
          dues[cid] += (tx.payment_type === 'COLLECTION' ? -Number(tx.amount) : Number(tx.amount)); 
        });
        setReportData(custs?.map(c => ({ ...c, balance: dues[c.id] || 0 })).filter(c => Math.abs(c.balance) > 1) || []);
      } 
      else if (type === 'PURCHASE_HISTORY') {
        const { data } = await supabase.from('company_ledger').select('*').eq('company', dbCompany).eq('type', 'PURCHASE').order('date', { ascending: false });
        const list = (data || []).map(p => {
          const items = p.items_json || [];
          const totalQty = items.reduce((acc: number, item: any) => acc + (Number(item.qty) || 0), 0);
          return { ...p, total_qty: totalQty };
        });
        setReportData(list);
      }
    } catch (err) { 
      console.error(err);
      alert("ডাটা লোড করতে সমস্যা হয়েছে।");
    } finally { setLoading(false); }
  };

  /**
   * Delete Logic (Maintained but removed from log UI as requested)
   */
  const handleDeleteTransaction = async (tx: any) => {
    if (!isAdmin) return;
    const typeLabel = tx.payment_type === 'COLLECTION' ? 'আদায়' : 'মেমো';
    const confirmMsg = tx.payment_type === 'DUE' 
      ? `আপনি কি নিশ্চিত এই মেমোটি (#${String(tx.id).slice(-6).toUpperCase()}) ডিলিট করতে চান? এটি ডিলিট করলে মালের স্টক স্বয়ংক্রিয়ভাবে আবার ইনভেন্টরিতে যোগ হয়ে যাবে।` 
      : `আপনি কি নিশ্চিত এই আদায়ের এন্ট্রিটি চিরতরে মুছে ফেলতে চান?`;

    if (!confirm(confirmMsg)) return;
    
    setLoading(true);
    try {
      if (tx.payment_type === 'DUE' && Array.isArray(tx.items)) {
        for (const item of tx.items) {
          if (item.id && item.qty) {
            await supabase.rpc('increment_stock', { 
              row_id: item.id, 
              amt: Number(item.qty)
            });
          }
        }
      }
      const { error } = await supabase.from('transactions').delete().eq('id', tx.id);
      if (error) throw error;
      alert("সফলভাবে ডিলিট এবং স্টক অ্যাডজাস্ট করা হয়েছে!");
      fetchReport(activeReport);
    } catch (err: any) {
      alert("ডিলিট করা যায়নি: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async (ref: React.RefObject<HTMLDivElement>, filename: string) => {
    if (!ref.current || isDownloading) return;
    setIsDownloading(true);
    try {
      const element = ref.current;
      const canvas = await html2canvas(element, { 
        scale: 2, 
        useCORS: true, 
        backgroundColor: '#ffffff',
        logging: false
      });
      
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      
      pdf.save(`${filename}_${new Date().getTime()}.pdf`);
    } catch (err) {
      alert("PDF ডাউনলোড ব্যর্থ হয়েছে।");
    } finally {
      setIsDownloading(false);
    }
  };

  const filteredData = useMemo(() => {
    return reportData.filter(item => {
      const q = searchQuery.toLowerCase().trim();
      const name = item.customers?.name || item.customer_name || item.name || "";
      const addr = item.customers?.address || item.address || "";
      const matchesSearch = !q || name.toLowerCase().includes(q) || addr.toLowerCase().includes(q);
      const matchesRoute = selectedRoute ? addr.trim() === selectedRoute.trim() : true;
      return matchesSearch && matchesRoute;
    });
  }, [reportData, searchQuery, selectedRoute]);

  const totals = useMemo(() => {
    let sales = 0, collections = 0, totalDue = 0, stockValue = 0, totalQty = 0;
    filteredData.forEach(item => {
      if (activeReport === 'CUSTOMER_DUES') totalDue += (item.balance || 0);
      else if (activeReport === 'STOCK_REPORT') {
        stockValue += (Number(item.stock) || 0) * (Number(item.tp) || 0);
        totalQty += (Number(item.stock) || 0);
      }
      else if (activeReport === 'REPLACEMENT_SUMMARY') {
        totalQty += (Number(item.qty) || 0);
      }
      else if (activeReport === 'DELIVERY_LOG_A4' || activeReport === 'MASTER_LOG_ALL') {
        const amt = Number(item.amount || 0);
        if (item.log_type === 'আদায়') collections += amt; 
        else if (item.log_type === 'মেমো') sales += amt;
        totalQty += (Number(item.total_qty) || 0);
      }
      else if (activeReport === 'BOOKING_LOG') {
        totalQty += (item.delivered_qty || 0);
        sales += (item.delivered_qty || 0) * (item.unitPrice || 0);
      }
      else {
        const amt = Number(item.amount || item.total_amount || 0);
        sales += amt;
        totalQty += (Number(item.total_qty) || 0);
      }
    });
    return { sales, collections, totalDue, stockValue, totalQty };
  }, [filteredData, activeReport]);

  const isLog = activeReport === 'DELIVERY_LOG_A4' || activeReport === 'MASTER_LOG_ALL';
  const isBooking = activeReport === 'BOOKING_LOG';
  const isRepl = activeReport === 'REPLACEMENT_SUMMARY';
  const isCombined = activeReport === 'MASTER_LOG_ALL';
  const isDue = activeReport === 'CUSTOMER_DUES';

  if (activeReport === 'MAIN') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-32">
        <div 
          onClick={() => setActiveReport('MASTER_LOG_ALL')} 
          className="col-span-full bg-blue-600 p-10 rounded-[3.5rem] shadow-xl hover:shadow-2xl cursor-pointer border-2 border-white/10 flex flex-col items-center group transition-all duration-500 hover:-translate-y-2 animate-reveal relative overflow-hidden">
          <div className="absolute top-[-20%] left-[-10%] w-60 h-60 bg-white/5 rounded-full blur-3xl animate-pulse"></div>
          <div className="relative z-10 flex flex-col items-center">
             <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center text-4xl mb-6 shadow-2xl">🚛</div>
             <h3 className="text-2xl font-black uppercase italic tracking-tighter text-white leading-none">MASTER LOG (3-IN-1)</h3>
             <p className="text-[10px] font-bold text-white/60 mt-4 uppercase tracking-[0.4em] italic">তিন কোম্পানির রিপোর্ট এক সাথে দেখুন</p>
          </div>
        </div>

        {[
          { id: 'DELIVERY_LOG_A4', title: 'DIVISION LOG', icon: '🚚', desc: 'ডেলিভারি ও আদায় শিট', color: 'bg-slate-900', anim: 'hover-truck' },
          { id: 'BOOKING_LOG', title: 'BOOKING LOG', icon: '📅', desc: 'বুকিং ডেলিভারি হিস্টোরি', color: 'bg-indigo-600', anim: 'hover-pulse' },
          { id: 'REPLACEMENT_SUMMARY', title: 'REPLACEMENT LOG', icon: '🔄', desc: 'রিপ্লেসমেন্ট স্টকের রিপোর্ট', color: 'bg-rose-500', anim: 'hover-pulse' },
          { id: 'MARKET_ORDERS', title: 'MARKET ORDERS', icon: '🛍️', desc: 'অপেক্ষমাণ মার্কেট অর্ডার', color: 'bg-orange-600', anim: 'hover-sway' },
          { id: 'STOCK_REPORT', title: 'STOCK LIST', icon: '📦', desc: 'ইনভেন্টরি রিপোর্ট', color: 'bg-slate-800', anim: 'hover-pulse' },
          { id: 'CUSTOMER_DUES', title: 'DUE REPORT', icon: '💸', desc: 'মার্কেট বকেয়া হিসাব', color: 'bg-red-600', anim: 'hover-float' },
          { id: 'PURCHASE_HISTORY', title: 'PURCHASE LOG', icon: '📥', desc: 'কোম্পানি কেনাকাটা', color: 'bg-emerald-600', anim: 'hover-bounce' },
        ].map((item, idx) => (
          <div key={item.id} 
               style={{ animationDelay: `${(idx + 1) * 0.1}s` }}
               onClick={() => setActiveReport(item.id as ReportType)} 
               className={`bg-white p-10 rounded-[3.5rem] shadow-sm hover:shadow-2xl cursor-pointer border-2 border-slate-50 flex flex-col items-center group transition-all duration-500 hover:-translate-y-2 animate-reveal ${item.anim}`}>
            <div className={`w-20 h-20 rounded-[2rem] ${item.color} flex items-center justify-center text-4xl mb-8 shadow-xl transition-all duration-500 group-hover:scale-110 group-hover:shadow-blue-500/20 text-white relative overflow-hidden`}>
              <div className="icon-inner relative z-10">{item.icon}</div>
              <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 animate-shimmer"></div>
            </div>
            <h3 className="text-lg font-black uppercase italic tracking-tighter text-slate-800 leading-none group-hover:text-blue-600 transition-colors">{item.title}</h3>
            <p className="text-[10px] font-bold text-slate-400 mt-4 uppercase tracking-[0.2em]">{item.desc}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white p-6 md:p-12 rounded-[4rem] shadow-2xl min-h-[85vh] border relative animate-reveal text-black">
      <div className="flex justify-between items-center mb-12 no-print flex-wrap gap-6">
        <button onClick={() => setActiveReport('MAIN')} className="bg-slate-900 text-white px-10 py-5 rounded-[2rem] font-black text-[11px] uppercase shadow-2xl active:scale-95 transition-all">← ফিরে যান</button>
        
        <div className="flex gap-4 flex-wrap items-center bg-slate-50 p-4 rounded-[2.5rem] border shadow-inner">
          {!isBooking && !isRepl && (
            <div className="flex flex-col">
              <label className="text-[8px] font-black uppercase text-slate-400 ml-4 mb-1 italic">তারিখ অনুযায়ী খুঁজুন</label>
              <input type="date" className="p-4 border-2 border-white rounded-[1.8rem] text-[11px] font-black outline-none bg-white shadow-sm focus:border-blue-500 transition-all" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
            </div>
          )}
          <div className="flex flex-col">
            <label className="text-[8px] font-black uppercase text-slate-400 ml-4 mb-1 italic">সার্চ ({isRepl ? 'প্রোডাক্ট' : 'দোকান'})</label>
            <input className="p-4 border-2 border-white rounded-[1.8rem] text-[11px] font-black outline-none bg-white shadow-sm min-w-[200px] focus:border-blue-500 transition-all" placeholder="নাম বা ঠিকানা লিখুন..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <div className="flex gap-2 self-end">
            <button disabled={isDownloading || loading} onClick={() => handleDownloadPDF(reportRef, 'Full_Report')} className="bg-emerald-600 text-white px-8 py-5 rounded-[1.8rem] font-black text-[11px] uppercase shadow-lg active:scale-95 transition-all">
              {isDownloading ? "ডাউনলোড..." : "PDF ডাউনলোড ⬇"}
            </button>
            <button onClick={() => window.print()} className="bg-blue-600 text-white px-8 py-5 rounded-[1.8rem] font-black text-[11px] uppercase shadow-lg active:scale-95">প্রিন্ট শিট ⎙</button>
          </div>
        </div>
      </div>

      <div className="max-w-[210mm] mx-auto border-2 border-slate-100 p-2 overflow-hidden bg-slate-50 rounded-2xl shadow-inner no-print">
         <p className="text-[8px] font-black text-center text-slate-400 mb-2 uppercase tracking-widest italic">A4 Page Preview (ডেলিভারি ম্যানের জন্য প্রস্তুত)</p>
         <div ref={reportRef} className="print-area printable-content p-10 bg-white text-black min-h-fit flex flex-col border-2 border-black">
            <style>{`
               @media print {
                  @page { size: A4; margin: 10mm; }
                  body * { visibility: hidden !important; }
                  .printable-content, .printable-content * { 
                    visibility: visible !important; 
                    color: #000 !important; 
                    border-color: #000 !important;
                    -webkit-print-color-adjust: exact;
                  }
                  .printable-content { position: static !important; width: 100% !important; padding: 0 !important; border: none !important; box-shadow: none !important; display: block !important; }
                  table { font-size: 10px !important; border: 1.5px solid #000 !important; border-collapse: collapse !important; width: 100% !important; }
                  th, td { padding: 12px 6px !important; border: 1px solid #000 !important; }
                  .no-print-col { display: none !important; }
               }
            `}</style>
            <div className="text-center border-b-4 border-black pb-6 mb-8 relative">
               <h1 className="text-5xl font-black uppercase italic mb-1 tracking-tighter text-black leading-none">IFZA ELECTRONICS</h1>
               <p className="text-lg font-black uppercase tracking-[0.4em] mb-2 text-black">{isCombined ? 'ALL' : company} DIVISIONS</p>
               <div className="inline-block px-10 py-2 bg-black text-white text-xs font-black uppercase rounded-full italic tracking-widest mt-2">
                  {activeReport.replace(/_/g, ' ')} ({new Date(selectedDate).toLocaleDateString('bn-BD')})
               </div>
            </div>

            <table className="w-full border-collapse border-2 border-black flex-1">
               <thead>
                  <tr className="bg-slate-50 text-[11px] font-black uppercase italic border-b-2 border-black text-black">
                     <th className="p-3 border-r border-black text-center w-10">#</th>
                     <th className="p-3 border-r border-black text-left">{isRepl ? 'পণ্যের নাম' : 'বিবরণ ও ঠিকানা'}</th>
                     {isBooking ? (
                       <>
                        <th className="p-3 border-r border-black text-center w-20">অর্ডার</th>
                        <th className="p-3 border-r border-black text-center w-20">গেছে</th>
                        <th className="p-3 border-r border-black text-center w-20">বাকি</th>
                        <th className="p-3 no-print-col text-center w-20">অ্যাকশন</th>
                       </>
                     ) : isRepl ? (
                       <>
                        <th className="p-3 border-r border-black text-center w-16">পেন্ডিং</th>
                        <th className="p-3 border-r border-black text-center w-16">প্রাপ্ত</th>
                        <th className="p-3 border-r border-black text-center w-16">প্রেরিত</th>
                        <th className="p-3 border-r border-black text-center w-20">মোট</th>
                       </>
                     ) : (
                       <>
                        <th className="p-3 border-r border-black text-right w-32">টাকা</th>
                        {!isLog && <th className="p-3 border-r border-black text-center w-24">{isDue ? 'বকেয়া' : 'পরিমাণ'}</th>}
                        {isLog && (
                          <>
                            <th className="p-3 border-r border-black text-center w-24">আদায় (হাতে)</th>
                            <th className="p-3 border-r border-black text-center w-28">স্বাক্ষর</th>
                          </>
                        )}
                       </>
                     )}
                  </tr>
               </thead>
               <tbody className="divide-y divide-black/30 text-[11px] font-bold">
                  {loading ? (
                    <tr><td colSpan={6} className="p-20 text-center animate-pulse">লোডিং...</td></tr>
                  ) : filteredData.length === 0 ? (
                    <tr><td colSpan={6} className="p-20 text-center">এই তারিখে কোনো ডাটা পাওয়া যায়নি</td></tr>
                  ) : filteredData.map((item, idx) => {
                     const amount = Number(item.amount || item.balance || item.total_amount || (item.stock * item.tp) || 0);
                     const shopName = item.customers?.name || item.customer_name || item.name || item.product_name;
                     const shopAddress = item.customers?.address || item.address || '—';
                     const displayCompany = item.company ? `[${item.company}]` : '';
                     const isCollection = item.payment_type === 'COLLECTION' || item.log_type === 'আদায়';

                     return (
                        <tr key={idx} className="border-b border-black text-black">
                           <td className="p-3 border-r border-black text-center">{idx + 1}</td>
                           <td className="p-3 border-r border-black">
                              <div className="flex flex-col">
                                 <p className="font-black uppercase text-black text-[12px]">
                                    {isCombined ? <span className="text-blue-700 mr-2">{displayCompany}</span> : ''}
                                    {shopName}
                                 </p>
                                 {!isRepl && (
                                   <p className="text-[9px] font-bold italic opacity-80 leading-none mt-1">
                                     {isBooking ? `${item.name} | ` : ''} 📍 {shopAddress}
                                   </p>
                                 )}
                              </div>
                           </td>
                           
                           {isBooking ? (
                             <>
                               <td className="p-3 border-r border-black text-center">{item.qty}</td>
                               <td className="p-3 border-r border-black text-center text-blue-600">{item.delivered_qty}</td>
                               <td className="p-3 border-r border-black text-center text-red-600">{item.qty - item.delivered_qty}</td>
                               <td className="p-2 text-center no-print-col">
                                  <button onClick={() => { setSelectedSlipData(item); setShowSlipModal(true); }} className="bg-slate-900 text-white px-3 py-1.5 rounded text-[8px] font-black uppercase">স্লিপ 🖨️</button>
                               </td>
                             </>
                           ) : isRepl ? (
                             <>
                               <td className="p-3 border-r border-black text-center text-slate-400">{item.pending}</td>
                               <td className="p-3 border-r border-black text-center text-blue-600">{item.received}</td>
                               <td className="p-3 border-r border-black text-center text-rose-500">{item.sent}</td>
                               <td className="p-3 border-r border-black text-center font-black">{item.qty}</td>
                             </>
                           ) : (
                             <>
                               <td className={`p-3 border-r border-black text-right font-black italic text-[13px] ${isCollection ? 'text-emerald-600' : (amount < 0 ? 'text-red-600' : '')}`}>
                                  {isCollection ? '-' : ''}৳{Math.abs(amount).toLocaleString()}
                               </td>
                               {!isLog && <td className="p-3 border-r border-black text-center">{isDue ? '—' : (item.stock || item.total_qty || 0)}</td>}
                               {isLog && (
                               <>
                                  <td className="p-3 border-r border-black h-16 w-24"></td>
                                  <td className="p-3 border-r border-black h-16"></td>
                               </>
                               )}
                             </>
                           )}
                        </tr>
                     );
                  })}
               </tbody>
            </table>

            <div className="mt-12 border-t-4 border-black pt-6 flex justify-between items-end">
               <div className="text-[10px] font-black uppercase italic space-y-1.5">
                  <p>* জেনারেট টাইম: {new Date().toLocaleString('bn-BD')}</p>
                  <p>* রিপোর্ট মেকার: {userName || 'SYSTEM'}</p>
                  <p className="text-[8px] mt-2 opacity-50 font-black">বিঃদ্রঃ "আদায় (হাতে)" কলামে ডেলিভারি ম্যান কত টাকা পেলেন তা লিখবেন।</p>
               </div>
               <div className="w-64 space-y-2 text-right">
                  <div className="flex justify-between text-[11px] font-black border-b border-black/20 pb-1">
                     <span>TOTAL QTY:</span>
                     <span>{totals.totalQty}</span>
                  </div>
                  {!isRepl && (
                    <div className="flex justify-between text-2xl font-black text-black tracking-tighter">
                      <span>G. TOTAL:</span>
                      <span>৳{(totals.sales || totals.totalDue || totals.stockValue).toLocaleString()}</span>
                    </div>
                  )}
               </div>
            </div>
         </div>
      </div>

      {showSlipModal && selectedSlipData && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[5000] flex flex-col items-center p-4 overflow-y-auto no-print">
           <div className="w-full max-w-[148mm] flex justify-between gap-6 mb-8 sticky top-0 z-[5001] bg-slate-900/90 p-6 rounded-3xl border border-white/10 shadow-2xl items-center">
              <button onClick={() => setShowSlipModal(false)} className="text-white font-black uppercase text-[10px] px-6">← ফিরে যান</button>
              <button disabled={isDownloading} onClick={() => handleDownloadPDF(slipRef, 'Booking_Slip')} className="bg-emerald-600 text-white px-10 py-4 rounded-xl font-black text-[10px] uppercase shadow-xl active:scale-95 transition-all">
                 {isDownloading ? "ডাউনলোড..." : "স্লিপ ডাউনলোড করুন ⬇"}
              </button>
           </div>

           <div ref={slipRef} className="bg-white w-[148mm] min-h-[210mm] p-10 flex flex-col font-sans text-black shadow-2xl border-[3px] border-black">
              <div className="text-center mb-10 border-b-4 border-black pb-6">
                 <h1 className="text-[42px] font-black uppercase italic tracking-tighter leading-none mb-1">IFZA ELECTRONICS</h1>
                 <p className="text-2xl font-black uppercase italic">{company} DIVISION</p>
                 <div className="mt-4 inline-block px-8 py-1.5 bg-black text-white text-[10px] font-black uppercase rounded-full italic">DELIVERY CHALLAN (স্লিপ)</div>
              </div>

              <div className="flex justify-between items-start mb-10 text-[12px] font-bold">
                 <div>
                    <p className="text-[10px] font-black border-b border-black w-fit mb-2 uppercase opacity-60">ক্রেতা (Customer):</p>
                    <p className="text-3xl font-black uppercase italic leading-none">{selectedSlipData.customer_name}</p>
                    <p className="text-[13px] font-bold mt-2">📍 {selectedSlipData.address}</p>
                    <p className="text-[13px] font-bold">📱 {selectedSlipData.phone || '—'}</p>
                 </div>
                 <div className="text-right">
                    <p className="text-[10px] font-black border-b border-black w-fit ml-auto mb-2 uppercase opacity-60">চালান তথ্য:</p>
                    <p className="text-[14px] font-black">বুকিং আইডি: #{selectedSlipData.booking_id.slice(-6).toUpperCase()}</p>
                    <p className="text-[14px] font-black">তারিখ: {new Date().toLocaleDateString('bn-BD')}</p>
                 </div>
              </div>

              <div className="flex-1">
                 <p className="text-[10px] font-black uppercase mb-4 italic text-slate-500">সরবরাহকৃত মালের বিবরণ:</p>
                 <table className="w-full border-collapse border-2 border-black">
                    <thead>
                       <tr className="bg-black text-white text-[11px] font-black uppercase italic">
                          <th className="p-3 text-left border border-black">পণ্যের নাম (Description)</th>
                          <th className="p-3 text-center border border-black w-24">অর্ডার</th>
                          <th className="p-3 text-center border border-black w-24">গেছে (Qty)</th>
                       </tr>
                    </thead>
                    <tbody>
                       <tr className="border-b border-black text-[18px] font-black italic">
                          <td className="p-4 uppercase border-r border-black">{selectedSlipData.name}</td>
                          <td className="p-4 text-center border-r border-black">{selectedSlipData.qty}</td>
                          <td className="p-4 text-center text-blue-600">{selectedSlipData.delivered_qty}</td>
                       </tr>
                    </tbody>
                 </table>
                 <div className="mt-8 p-6 bg-slate-50 border-2 border-black rounded-2xl italic font-black text-[12px] leading-relaxed">
                    দ্রষ্টব্য: এই স্লিপটি শুধুমাত্র বুকিংয়ের বিপরীতে পাঠানো মালের হিসাব নিশ্চিত করার জন্য। মালের কোনো ত্রুটি থাকলে তৎক্ষণাৎ কর্তৃপক্ষকে জানান।
                 </div>
              </div>

              <div className="mt-20 flex justify-between items-end px-4 mb-4">
                 <div className="text-center w-48 border-t-2 border-black pt-2 font-black italic text-[14px]">ক্রেতার স্বাক্ষর</div>
                 <div className="text-center w-60 border-t-2 border-black pt-2 text-right">
                    <p className="text-[18px] font-black uppercase italic tracking-tighter">কর্তৃপক্ষের স্বাক্ষর</p>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
