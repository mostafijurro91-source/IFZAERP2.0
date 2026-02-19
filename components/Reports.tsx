
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

type ReportType = 'MAIN' | 'CUSTOMER_DUES' | 'STOCK_REPORT' | 'DELIVERY_LOG_A4' | 'PURCHASE_HISTORY' | 'MARKET_ORDERS' | 'MASTER_LOG_ALL' | 'BOOKING_LOG' | 'REPLACEMENT_SUMMARY' | 'BOOKING_AGGREGATE';

const Reports: React.FC<ReportsProps> = ({ company, userRole, userName, user }) => {
  const [activeReport, setActiveReport] = useState<ReportType>('MAIN');
  const [loading, setLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [reportData, setReportData] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState(""); 
  const [selectedRoute, setSelectedRoute] = useState("");
  
  const reportRef = useRef<HTMLDivElement>(null);
  const isAdmin = userRole === 'ADMIN';

  useEffect(() => { 
    if (activeReport !== 'MAIN') {
      fetchReport(activeReport);
    }
  }, [activeReport, company, selectedDate]);

  const fetchReport = async (type: ReportType) => {
    setLoading(true);
    const dbCompany = mapToDbCompany(company);
    try {
      if (type === 'STOCK_REPORT') {
        const [prodRes, ledgerRes, txRes, replRes] = await Promise.all([
          supabase.from('products').select('*').eq('company', dbCompany).order('name'),
          supabase.from('company_ledger').select('items_json').eq('company', dbCompany).eq('type', 'PURCHASE'),
          supabase.from('transactions').select('items, payment_type').eq('company', dbCompany),
          supabase.from('replacements').select('product_id, product_name, qty').eq('company', dbCompany)
        ]);
        
        const productsList = prodRes.data || [];
        const statsMap: Record<string, { purchased: number, sold: number, replaced: number, returned: number }> = {};

        const getStatKey = (pId: string, pName: string) => {
           const match = productsList.find(p => p.id === pId || p.name.toLowerCase().trim() === pName?.toLowerCase().trim());
           return match ? match.id : null;
        };

        ledgerRes.data?.forEach(l => l.items_json?.forEach((it:any) => {
          const key = getStatKey(it.id, it.name);
          if (key) {
            if(!statsMap[key]) statsMap[key] = { purchased: 0, sold: 0, replaced: 0, returned: 0 };
            statsMap[key].purchased += Number(it.qty || 0);
          }
        }));

        txRes.data?.forEach(tx => tx.items?.forEach((it:any) => {
          const key = getStatKey(it.id, it.name);
          if (key) {
            if(!statsMap[key]) statsMap[key] = { purchased: 0, sold: 0, replaced: 0, returned: 0 };
            if(it.action === 'SALE' || !it.action) statsMap[key].sold += Number(it.qty || 0);
            if(it.action === 'RETURN') statsMap[key].returned += Number(it.qty || 0);
          }
        }));

        replRes.data?.forEach(rp => {
          const key = getStatKey(rp.product_id, rp.product_name);
          if (key) {
            if(!statsMap[key]) statsMap[key] = { purchased: 0, sold: 0, replaced: 0, returned: 0 };
            statsMap[key].replaced += Number(rp.qty || 0);
          }
        });

        const list = productsList.map(p => {
          const s = statsMap[p.id] || { purchased: 0, sold: 0, replaced: 0, returned: 0 };
          return {
            ...p,
            purchased: s.purchased,
            sold: s.sold,
            replaced: s.replaced,
            returned: s.returned
          };
        });
        setReportData(list);
      } 
      // ... (other report types logic remains same)
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
    } catch (err) { 
      console.error(err);
    } finally { setLoading(false); }
  };

  const handleDownloadPDF = async (ref: React.RefObject<HTMLDivElement>, filename: string) => {
    if (!ref.current || isDownloading) return;
    setIsDownloading(true);
    try {
      const element = ref.current;
      const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, imgHeight);
      pdf.save(`${filename}_${new Date().getTime()}.pdf`);
    } catch (err) { alert("PDF ডাউনলোড ব্যর্থ হয়েছে।"); } finally { setIsDownloading(false); }
  };

  const filteredData = useMemo(() => {
    return reportData.filter(item => {
      const q = searchQuery.toLowerCase().trim();
      const name = item.name || item.customer_name || item.product_name || "";
      return !q || name.toLowerCase().includes(q);
    });
  }, [reportData, searchQuery]);

  const totals = useMemo(() => {
    let sales = 0, stockValue = 0, totalQty = 0;
    filteredData.forEach(item => {
      if (activeReport === 'STOCK_REPORT') {
        stockValue += (Number(item.stock) || 0) * (Number(item.tp) || 0);
        totalQty += (Number(item.stock) || 0);
      } else {
        sales += Number(item.amount || item.balance || item.total_amount || 0);
        totalQty += (Number(item.total_qty || item.qty) || 0);
      }
    });
    return { sales, stockValue, totalQty };
  }, [filteredData, activeReport]);

  if (activeReport === 'MAIN') {
    const reportOptions = [
      { id: 'STOCK_REPORT', title: 'STOCK LIST', icon: '📦', desc: 'ইনভেন্টরি পূর্ণাঙ্গ লেজার', color: 'bg-slate-800', roles: ['ADMIN', 'STAFF'] },
      { id: 'CUSTOMER_DUES', title: 'DUE REPORT', icon: '💸', desc: 'মার্কেট বকেয়া হিসাব', color: 'bg-red-600', roles: ['ADMIN', 'STAFF'] },
      { id: 'DELIVERY_LOG_A4', title: 'DIVISION LOG', icon: '🚚', desc: 'ডেলিভারি ও আদায় শিট', color: 'bg-slate-900', roles: ['ADMIN'] },
    ].filter(item => item.roles.includes(userRole || ''));

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-32">
        {reportOptions.map((item, idx) => (
          <div key={item.id} 
               onClick={() => setActiveReport(item.id as ReportType)} 
               className="bg-white p-10 rounded-[3.5rem] shadow-sm hover:shadow-2xl cursor-pointer border-2 border-slate-50 flex flex-col items-center group transition-all animate-reveal">
            <div className={`w-20 h-20 rounded-[2rem] ${item.color} flex items-center justify-center text-4xl mb-8 shadow-xl text-white`}>
              {item.icon}
            </div>
            <h3 className="text-lg font-black uppercase italic text-slate-800 leading-none">{item.title}</h3>
            <p className="text-[10px] font-bold text-slate-400 mt-4 uppercase tracking-widest">{item.desc}</p>
          </div>
        ))}
      </div>
    );
  }

  const isStock = activeReport === 'STOCK_REPORT';

  return (
    <div className="bg-white p-4 md:p-12 rounded-[4rem] shadow-2xl min-h-[85vh] border animate-reveal text-black">
      <div className="flex justify-between items-center mb-8 no-print flex-wrap gap-4">
        <button onClick={() => setActiveReport('MAIN')} className="bg-slate-900 text-white px-8 py-5 rounded-[1.5rem] font-black text-[11px] uppercase">← ফিরে যান</button>
        <div className="flex gap-4 items-center bg-slate-50 p-3 rounded-[2rem] border">
          <input className="p-3 border rounded-[1.2rem] text-[10px] font-black outline-none bg-white" placeholder="সার্চ..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          <button disabled={isDownloading || loading} onClick={() => handleDownloadPDF(reportRef, 'IFZA_Report')} className="bg-emerald-600 text-white px-5 py-4 rounded-[1.2rem] font-black text-[9px] uppercase shadow-lg">
             {isDownloading ? "..." : "PDF ডাউনলোড"}
          </button>
        </div>
      </div>

      <div className="w-full overflow-x-auto custom-scroll">
         <div ref={reportRef} className="printable-content p-10 bg-white text-black min-h-fit flex flex-col border-2 border-black mx-auto" style={{ width: '100%', minWidth: '850px', maxWidth: '210mm' }}>
            <div className="text-center border-b-4 border-black pb-6 mb-8">
               <h1 className="text-4xl font-black uppercase italic mb-1 tracking-tighter text-black leading-none">IFZA ELECTRONICS</h1>
               <p className="text-lg font-black uppercase tracking-[0.4em] mb-2 text-black">{activeReport.replace(/_/g, ' ')} SUMMARY</p>
               <p className="text-[10px] font-black uppercase italic opacity-60">Generated: {new Date().toLocaleString('bn-BD')}</p>
            </div>

            <table className="w-full border-collapse border-2 border-black flex-1">
               <thead>
                  <tr className="bg-slate-50 text-[10px] font-black uppercase italic border-b-2 border-black text-black">
                     <th className="p-3 border-r border-black text-center w-10">Sl</th>
                     <th className="p-3 border-r border-black text-left">বিবরণ (Description)</th>
                     {isStock ? (
                       <>
                        <th className="p-3 border-r border-black text-center w-16">ক্রয় (+)</th>
                        <th className="p-3 border-r border-black text-center w-16">বিক্রয় (-)</th>
                        <th className="p-3 border-r border-black text-center w-16">রিপ্লেস</th>
                        <th className="p-3 border-r border-black text-center w-16">রিটার্ন</th>
                        <th className="p-3 border-r border-black text-center w-20 bg-slate-100">বর্তমান স্টক</th>
                        <th className="p-3 text-right w-24">মূল্য (TP)</th>
                       </>
                     ) : (
                       <>
                        <th className="p-3 border-r border-black text-right w-32">টাকা</th>
                        <th className="p-3 border-r border-black text-center w-24">পরিমাণ</th>
                        <th className="p-3 text-center">মন্তব্য</th>
                       </>
                     )}
                  </tr>
               </thead>
               <tbody className="divide-y divide-black/30 text-[11px] font-bold">
                  {loading ? (
                    <tr><td colSpan={8} className="p-20 text-center">লোডিং...</td></tr>
                  ) : filteredData.length === 0 ? (
                    <tr><td colSpan={8} className="p-20 text-center font-black uppercase text-xs italic">কোনো তথ্য পাওয়া যায়নি</td></tr>
                  ) : filteredData.map((item, idx) => (
                    <tr key={idx} className="border-b border-black text-black">
                       <td className="p-3 border-r border-black text-center">{idx + 1}</td>
                       <td className="p-3 border-r border-black">
                          <p className="font-black uppercase text-black">{item.name || item.customer_name || item.product_name}</p>
                          <p className="text-[8px] font-bold italic opacity-60">📍 {item.address || '—'}</p>
                       </td>
                       {isStock ? (
                         <>
                           <td className="p-3 border-r border-black text-center text-slate-500">{item.purchased}</td>
                           <td className="p-3 border-r border-black text-center text-rose-600">{item.sold}</td>
                           <td className="p-3 border-r border-black text-center text-cyan-600">{item.replaced}</td>
                           <td className="p-3 border-r border-black text-center text-emerald-600">{item.returned}</td>
                           <td className="p-3 border-r border-black text-center font-black bg-slate-50 text-[13px]">{item.stock}</td>
                           <td className="p-3 text-right">৳{(item.stock * item.tp).toLocaleString()}</td>
                         </>
                       ) : (
                         <>
                           <td className="p-3 border-r border-black text-right font-black italic">৳{Math.abs(item.amount || item.balance || 0).toLocaleString()}</td>
                           <td className="p-3 border-r border-black text-center">{item.qty || item.total_qty || '—'}</td>
                           <td className="p-3 text-center text-[8px] italic">{item.status || item.payment_type || 'N/A'}</td>
                         </>
                       )}
                    </tr>
                  ))}
               </tbody>
            </table>

            <div className="mt-12 border-t-4 border-black pt-6 flex justify-between items-end">
               <div className="text-[9px] font-black uppercase italic space-y-1">
                  <p>* রিপোর্ট জেনারেটর: {userName || 'SYSTEM'}</p>
                  <p>* কোম্পানি: {company}</p>
               </div>
               <div className="w-64 space-y-1.5 text-right">
                  <div className="flex justify-between text-[10px] font-black border-b border-black/20 pb-1">
                     <span>{isStock ? 'TOTAL QUANTITY:' : 'TOTAL RECORD:'}</span>
                     <span>{totals.totalQty}</span>
                  </div>
                  <div className="flex justify-between text-xl font-black text-black tracking-tighter">
                     <span>{isStock ? 'VALUATION:' : 'G. TOTAL:'}</span>
                     <span>৳{(totals.stockValue || totals.sales).toLocaleString()}</span>
                  </div>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};

export default Reports;
