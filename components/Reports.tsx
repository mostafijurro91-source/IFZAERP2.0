
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

type ReportType = 'MAIN' | 'CUSTOMER_DUES' | 'STOCK_REPORT' | 'DELIVERY_LOG_A4' | 'PURCHASE_HISTORY' | 'MARKET_ORDERS';

const Reports: React.FC<ReportsProps> = ({ company, userRole, userName, user }) => {
  const [activeReport, setActiveReport] = useState<ReportType>('MAIN');
  const [loading, setLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [reportData, setReportData] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedRoute, setSelectedRoute] = useState("");
  const [routes, setRoutes] = useState<string[]>([]);
  
  const reportRef = useRef<HTMLDivElement>(null);

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
      else if (type === 'MARKET_ORDERS') {
        const { data } = await supabase.from('market_orders').select('*, customers(name, address, phone)').eq('company', dbCompany).gte('created_at', startOfDay).lte('created_at', endOfDay).order('created_at', { ascending: false });
        setReportData(data || []);
      }
      else if (type === 'DELIVERY_LOG_A4') {
        const { data: txs, error } = await supabase.from('transactions')
          .select('*, customers(id, name, address)')
          .eq('company', dbCompany)
          .gte('created_at', startOfDay)
          .lte('created_at', endOfDay)
          .order('created_at', { ascending: true });
        
        if (error) throw error;

        const list = (txs || []).map(t => {
          const items = t.items || [];
          const totalQty = items.reduce((acc: number, item: any) => acc + (Number(item.qty) || 0), 0);
          return { 
            ...t, 
            total_qty: totalQty, 
            log_type: t.payment_type === 'COLLECTION' ? 'আদায়' : 'মেমো' 
          };
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
      console.error("Report Fetch Error:", err);
      alert("ডাটা লোড করতে সমস্যা হয়েছে।");
    } finally { setLoading(false); }
  };

  const handleDownloadPDF = async () => {
    if (!reportRef.current || isDownloading) return;
    setIsDownloading(true);
    try {
      const element = reportRef.current;
      const canvas = await html2canvas(element, { 
        scale: 2.5, 
        useCORS: true, 
        backgroundColor: '#ffffff' 
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a5');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      const fileName = `${company}_${activeReport}_${selectedDate}.pdf`.replace(/ /g, '_');
      pdf.save(fileName);
    } catch (err) {
      console.error("PDF Generation Error:", err);
      alert("PDF ডাউনলোড করতে সমস্যা হয়েছে।");
    } finally {
      setIsDownloading(false);
    }
  };

  const filteredData = useMemo(() => {
    return reportData.filter(item => {
      const q = searchQuery.toLowerCase().trim();
      const name = item.customers?.name || item.name || "";
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
      else if (activeReport === 'DELIVERY_LOG_A4') {
        const amt = Number(item.amount || 0);
        if (item.log_type === 'আদায়') collections += amt; 
        else if (item.log_type === 'মেমো') sales += amt;
        totalQty += (Number(item.total_qty) || 0);
      }
      else {
        const amt = Number(item.amount || item.total_amount || 0);
        sales += amt;
        totalQty += (Number(item.total_qty) || 0);
      }
    });
    return { sales, collections, totalDue, stockValue, totalQty };
  }, [filteredData, activeReport]);

  const isLog = activeReport === 'DELIVERY_LOG_A4';
  const isDue = activeReport === 'CUSTOMER_DUES';

  if (activeReport === 'MAIN') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-32">
        {[
          { id: 'DELIVERY_LOG_A4', title: 'DIVISION LOG', icon: '🚚', desc: 'ডেলিভারি ও আদায় শিট', color: 'bg-blue-600', anim: 'hover-truck' },
          { id: 'MARKET_ORDERS', title: 'MARKET ORDERS', icon: '🛍️', desc: 'অপেক্ষমাণ মার্কেট অর্ডার', color: 'bg-orange-600', anim: 'hover-sway' },
          { id: 'STOCK_REPORT', title: 'STOCK LIST', icon: '📦', desc: 'ইনভেন্টরি রিপোর্ট', color: 'bg-slate-900', anim: 'hover-pulse' },
          { id: 'CUSTOMER_DUES', title: 'DUE REPORT', icon: '💸', desc: 'মার্কেট বকেয়া হিসাব', color: 'bg-red-600', anim: 'hover-float' },
          { id: 'PURCHASE_HISTORY', title: 'PURCHASE LOG', icon: '📥', desc: 'কোম্পানি কেনাকাটা', color: 'bg-emerald-600', anim: 'hover-bounce' },
        ].map((item, idx) => (
          <div key={item.id} 
               style={{ animationDelay: `${idx * 0.1}s` }}
               onClick={() => setActiveReport(item.id as ReportType)} 
               className={`bg-white p-10 rounded-[3.5rem] shadow-sm hover:shadow-2xl cursor-pointer border-2 border-slate-50 flex flex-col items-center group transition-all duration-500 hover:-translate-y-2 animate-reveal ${item.anim}`}>
            <div className={`w-24 h-24 rounded-[2.5rem] ${item.color} flex items-center justify-center text-5xl mb-8 shadow-xl transition-all duration-500 group-hover:scale-110 group-hover:shadow-blue-500/20 text-white relative overflow-hidden`}>
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
    <div className="bg-white p-6 md:p-12 rounded-[4rem] shadow-2xl min-h-[85vh] border relative animate-reveal">
      <div className="flex justify-between items-center mb-12 no-print flex-wrap gap-6">
        <button onClick={() => setActiveReport('MAIN')} className="bg-slate-900 text-white px-10 py-5 rounded-[2rem] font-black text-[11px] uppercase shadow-2xl active:scale-95 transition-all">← ফিরে যান</button>
        <div className="flex gap-4 flex-wrap items-center">
          <div className="flex flex-col">
            <label className="text-[8px] font-black uppercase text-slate-400 ml-3 mb-1">তারিখ বাছাই</label>
            <input type="date" className="p-4 border-2 border-slate-100 rounded-[2rem] text-[10px] font-black outline-none bg-slate-50" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
          </div>
          <div className="flex flex-col">
            <label className="text-[8px] font-black uppercase text-slate-400 ml-3 mb-1">এরিয়া/রুট</label>
            <select className="p-4 border-2 border-slate-100 rounded-[2rem] text-[10px] font-black outline-none bg-slate-50" value={selectedRoute} onChange={e => setSelectedRoute(e.target.value)}>
              <option value="">সকল রুট</option>
              {routes.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex gap-2 self-end">
            <button disabled={isDownloading || loading} onClick={handleDownloadPDF} className="bg-emerald-600 text-white px-8 py-5 rounded-[2rem] font-black text-[11px] uppercase shadow-2xl active:scale-95 transition-all">
              {isDownloading ? "ডাউনলোড..." : "PDF (A5) ⬇"}
            </button>
            <button onClick={() => window.print()} className="bg-blue-600 text-white px-8 py-5 rounded-[2rem] font-black text-[11px] uppercase shadow-2xl active:scale-95">প্রিন্ট (A5) ⎙</button>
          </div>
        </div>
      </div>

      <div className="max-w-[148mm] mx-auto border-2 border-slate-100 p-2 overflow-hidden bg-slate-50 rounded-2xl shadow-inner no-print">
         <p className="text-[8px] font-black text-center text-slate-400 mb-2 uppercase tracking-widest italic">A5 Page Preview (148mm x 210mm)</p>
         <div ref={reportRef} className="print-area printable-content p-4 bg-white text-black min-h-fit flex flex-col">
            <style>{`
               @media print {
                  @page { size: A5; margin: 8mm; }
                  body * { visibility: hidden !important; }
                  .printable-content, .printable-content * { 
                    visibility: visible !important; 
                    color: #000 !important; 
                    border-color: #000 !important;
                    -webkit-print-color-adjust: exact;
                  }
                  .printable-content { position: static !important; width: 100% !important; padding: 0 !important; border: none !important; box-shadow: none !important; display: block !important; }
                  table { font-size: 8px !important; border: 1.2px solid #000 !important; border-collapse: collapse !important; width: 100% !important; }
                  th, td { padding: 4px 2px !important; border: 1px solid #000 !important; }
                  .footer-section { page-break-inside: avoid; margin-top: 10mm; }
               }
            `}</style>
            <div className="text-center border-b-4 border-black pb-3 mb-4 relative">
               <h1 className="text-2xl font-black uppercase italic mb-1 tracking-tighter text-black leading-none">IFZA ELECTRONICS</h1>
               <p className="text-[9px] font-black uppercase tracking-[0.3em] mb-1 text-black">{company} DIVISION</p>
               <div className="inline-block px-4 py-1 bg-black text-white text-[7px] font-black uppercase rounded-full italic">
                  {isLog ? 'DIVISION LOG (A5)' : activeReport.replace(/_/g, ' ')}
               </div>
               <p className="mt-2 text-[8px] font-black uppercase italic text-black">তারিখ: {new Date(selectedDate).toLocaleDateString('bn-BD')}</p>
            </div>

            <table className="w-full border-collapse border-2 border-black flex-1">
               <thead>
                  <tr className="bg-slate-100 text-[7px] font-black uppercase italic border-b-2 border-black text-black">
                     <th className="p-1.5 border-r border-black text-center w-6">#</th>
                     <th className="p-1.5 border-r border-black text-left">বিবরণ ও ঠিকানা</th>
                     <th className="p-1.5 border-r border-black text-right w-16">টাকা</th>
                     {isLog && (
                       <>
                        <th className="p-1.5 border-r border-black text-center w-20">ডেলিভারি নোট</th>
                        <th className="p-1.5 border-r border-black text-center w-16">স্বাক্ষর</th>
                       </>
                     )}
                     {!isLog && (
                       <th className="p-1.5 border-r border-black text-center w-14">
                         {isDue ? 'বকেয়া' : 'পরিমাণ'}
                       </th>
                     )}
                  </tr>
               </thead>
               <tbody className="divide-y divide-black/30 text-[8px] font-bold">
                  {loading ? (
                  <tr><td colSpan={isLog ? 5 : 4} className="p-10 text-center animate-pulse text-black uppercase font-black">লোডিং...</td></tr>
                  ) : filteredData.length === 0 ? (
                  <tr><td colSpan={isLog ? 5 : 4} className="p-10 text-center text-black uppercase italic font-black">কোনো লেনদেন নেই</td></tr>
                  ) : filteredData.map((item, idx) => (
                  <tr key={idx} className="border-b border-black text-black">
                     <td className="p-1.5 border-r border-black text-center">{idx + 1}</td>
                     <td className="p-1.5 border-r border-black">
                        <p className="font-black uppercase text-black truncate max-w-[150px]">{item.customers?.name || item.name || item.note}</p>
                        <p className="text-[6px] font-bold italic text-black opacity-80 truncate max-w-[150px]">{item.customers?.address || item.address || item.date || '—'}</p>
                     </td>
                     <td className="p-1.5 border-r border-black text-right font-black italic">
                        ৳{(item.amount || item.balance || item.total_amount || (item.stock * item.tp) || 0).toLocaleString()}
                     </td>
                     {isLog && (
                       <>
                        <td className="p-1.5 border-r border-black text-center h-12"></td>
                        <td className="p-1.5 border-r border-black text-center h-12"></td>
                       </>
                     )}
                     {!isLog && (
                       <td className="p-1.5 border-r border-black text-center italic">
                         {isDue ? '—' : `${item.stock || item.total_qty || 0}`}
                       </td>
                     )}
                  </tr>
                  ))}
               </tbody>
            </table>

            <div className="footer-section mt-8 border-t-[2.5px] border-black pt-3">
               <div className="flex justify-between items-start gap-4 mb-12">
                  <div className="flex-1 text-[6px] font-black uppercase text-black italic">
                     <p>* জেনারেট টাইম: {new Date().toLocaleString('bn-BD')}</p>
                     <p>* রিপোর্ট মেকার: {userName || 'ERP System'}</p>
                     <p className="mt-1">* অফিস কপি (Office Copy)</p>
                  </div>
                  <div className="w-40 space-y-1">
                     <div className="flex justify-between items-center text-[7px] font-black italic text-black">
                        <span className="uppercase">TOTAL ITEMS:</span>
                        <span>{filteredData.length}</span>
                     </div>
                     <div className="flex justify-between items-center text-lg font-black italic text-black leading-none pt-1 border-t border-black/20">
                        <span className="text-[7px] uppercase">G. TOTAL:</span>
                        <span>৳{(totals.sales || totals.totalDue || totals.stockValue).toLocaleString()}</span>
                     </div>
                  </div>
               </div>

               <div className="flex justify-between items-end text-[8px] font-black uppercase italic text-black px-2 pb-4">
                  <div className="text-center w-28 border-t-[1.2px] border-black pt-1">ডেলিভারি স্বাক্ষর</div>
                  <div className="text-center w-36 border-t-[1.2px] border-black pt-1">
                     <p className="text-[6px] font-bold">IFZA ELECTRONICS</p>
                     <p className="text-[8px]">কর্তৃপক্ষের স্বাক্ষর</p>
                  </div>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};

export default Reports;
