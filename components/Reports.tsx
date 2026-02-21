
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
}

type ReportType = 'MAIN' | 'CUSTOMER_DUES' | 'STOCK_REPORT' | 'DELIVERY_LOG_A4' | 'PURCHASE_HISTORY' | 'BOOKING_LOG' | 'COLLECTION_REPORT';

const Reports: React.FC<ReportsProps> = ({ company, userRole, userName }) => {
  const [activeReport, setActiveReport] = useState<ReportType>('MAIN');
  const [loading, setLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [reportData, setReportData] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const reportRef = useRef<HTMLDivElement>(null);

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
        const statsMap: Record<string, any> = {};

        productsList.forEach(p => {
          statsMap[p.id] = { purchased: 0, sold: 0, replaced: 0, returned: 0 };
        });

        ledgerRes.data?.forEach(l => l.items_json?.forEach((it: any) => {
          if (statsMap[it.id]) statsMap[it.id].purchased += Number(it.qty || 0);
        }));

        txRes.data?.forEach(tx => tx.items?.forEach((it: any) => {
          if (statsMap[it.id]) {
            if (it.action === 'SALE' || !it.action) statsMap[it.id].sold += Number(it.qty || 0);
            if (it.action === 'RETURN') statsMap[it.id].returned += Number(it.qty || 0);
          }
        }));

        replRes.data?.forEach(rp => {
          if (statsMap[rp.product_id]) statsMap[rp.product_id].replaced += Number(rp.qty || 0);
        });

        setReportData(productsList.map(p => ({
          ...p,
          ...statsMap[p.id],
          current_stock: (statsMap[p.id].purchased + statsMap[p.id].returned) - (statsMap[p.id].sold + statsMap[p.id].replaced)
        })));
      }
      else if (type === 'DELIVERY_LOG_A4') {
        const start = `${selectedDate}T00:00:00.000Z`;
        const end = `${selectedDate}T23:59:59.999Z`;
        const { data } = await supabase
          .from('transactions')
          .select('*, customers(name, address)')
          .eq('payment_type', 'DUE')
          .eq('company', dbCompany)
          .gte('created_at', start)
          .lte('created_at', end)
          .order('created_at', { ascending: true });
        setReportData(data || []);
      }
      else if (type === 'COLLECTION_REPORT') {
        const start = `${selectedDate}T00:00:00.000Z`;
        const end = `${selectedDate}T23:59:59.999Z`;
        const { data } = await supabase
          .from('transactions')
          .select('*, customers(name)')
          .eq('payment_type', 'COLLECTION')
          .eq('company', dbCompany)
          .gte('created_at', start)
          .lte('created_at', end)
          .order('created_at', { ascending: false });
        setReportData(data || []);
      }
      else if (type === 'BOOKING_LOG') {
        const { data } = await supabase
          .from('bookings')
          .select('*, customers(name, address, phone)')
          .eq('company', dbCompany)
          .neq('status', 'COMPLETED')
          .order('created_at', { ascending: false });

        const flattened: any[] = [];
        data?.forEach(b => {
          b.items?.forEach((it: any) => {
            const rem = Number(it.qty || 0) - Number(it.delivered_qty || 0);
            if (rem > 0) {
              flattened.push({
                ...b,
                item_id: it.id,
                item_name: it.name,
                item_price: Number(it.unitPrice || 0),
                item_ord: Number(it.qty || 0),
                item_del: Number(it.delivered_qty || 0),
                item_rem: rem,
                item_rem_val: rem * Number(it.unitPrice || 0)
              });
            }
          });
        });
        setReportData(flattened);
      }
      else if (type === 'PURCHASE_HISTORY') {
        const { data } = await supabase
          .from('company_ledger')
          .select('*')
          .eq('company', dbCompany)
          .eq('type', 'PURCHASE')
          .order('date', { ascending: false });
        setReportData(data || []);
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
          dues[cid] += (tx.payment_type === 'COLLECTION' ? -Number(tx.amount || 0) : Number(tx.amount || 0));
        });
        setReportData(custs?.map(c => ({ ...c, balance: dues[c.id] || 0 })).filter(c => Math.abs(c.balance) > 1) || []);
      }
    } catch (err) { console.error("Report Fetch Error:", err); } finally { setLoading(false); }
  };

  const handleDownloadPDF = async (ref: React.RefObject<HTMLDivElement | null>, filename: string) => {
    if (!ref.current || isDownloading) return;
    setIsDownloading(true);

    // Prevent cropping on mobile/small screens by making wrapper temporarily visible
    const parent = ref.current.parentElement;
    const parentOverflow = parent ? parent.style.overflowX : '';
    if (parent) parent.style.overflowX = 'visible';

    try {
      const element = ref.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);

      // A4 dimensions in mm
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 10;
      const contentWidth = pageWidth - (2 * margin);

      // Calculate number of pages needed
      const imgWidth = contentWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const pageHeightUsable = pageHeight - (2 * margin);
      const numPages = Math.ceil(imgHeight / pageHeightUsable);

      // Create PDF with proper A4 size
      const pdf = new jsPDF('p', 'mm', 'a4');

      for (let i = 0; i < numPages; i++) {
        const sourceY = (i * pageHeightUsable * canvas.height) / imgHeight;
        const sourceHeight = Math.min(pageHeightUsable * canvas.height / imgHeight, canvas.height - sourceY);

        const croppedCanvas = document.createElement('canvas');
        croppedCanvas.width = canvas.width;
        croppedCanvas.height = sourceHeight;
        const ctx = croppedCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, canvas.width, sourceHeight);
          const croppedImgData = croppedCanvas.toDataURL('image/jpeg', 0.95);

          pdf.addImage(croppedImgData, 'JPEG', margin, margin, imgWidth, (sourceHeight * imgWidth) / canvas.width);

          if (i < numPages - 1) {
            pdf.addPage();
          }
        }
      }

      pdf.save(`${filename}_${new Date().getTime()}.pdf`);
    } catch (err) {
      console.error("PDF Generation Error:", err);
      alert("PDF ডাউনলোড ব্যর্থ হয়েছে: " + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      if (parent) parent.style.overflowX = parentOverflow;
      setIsDownloading(false);
    }
  };

  const filteredData = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return reportData.filter(item => {
      const name = (item.name || item.customers?.name || item.item_name || "").toLowerCase();
      return !q || name.includes(q);
    });
  }, [reportData, searchQuery]);

  const summary = useMemo(() => {
    if (activeReport === 'BOOKING_LOG') {
      return {
        totalRemQty: filteredData.reduce((s, i) => s + Number(i.item_rem || 0), 0),
        totalRemVal: filteredData.reduce((s, i) => s + Number(i.item_rem_val || 0), 0)
      };
    }
    if (activeReport === 'STOCK_REPORT') {
      return {
        totalRemQty: filteredData.reduce((s, i) => s + Number(i.current_stock || 0), 0),
        totalRemVal: filteredData.reduce((s, i) => s + (Number(i.current_stock || 0) * Number(i.tp || 0)), 0)
      };
    }
    if (activeReport === 'CUSTOMER_DUES') {
      return { totalRemQty: 0, totalRemVal: filteredData.reduce((s, i) => s + Number(i.balance || 0), 0) };
    }
    return {
      totalRemQty: 0,
      totalRemVal: filteredData.reduce((s, i) => s + Number(i.amount || 0), 0)
    };
  }, [filteredData, activeReport]);

  if (activeReport === 'MAIN') {
    const reportOptions = [
      { id: 'BOOKING_LOG', title: 'BOOKING MASTER', icon: '📅', desc: 'বাকি মাল ও আইটেম লিস্ট' },
      { id: 'COLLECTION_REPORT', title: 'COLLECTION LOG', icon: '💰', desc: 'আজকের নগদ কালেকশন' },
      { id: 'STOCK_REPORT', title: 'STOCK LIST', icon: '📦', desc: 'ইনভেন্টরি লেজার' },
      { id: 'DELIVERY_LOG_A4', title: 'DELIVERY SHEET', icon: '🚚', desc: 'প্রতিদিনের ডেলিভারি শিট' },
      { id: 'PURCHASE_HISTORY', title: 'PURCHASE LOG', icon: '📒', desc: 'কোম্পানি ক্রয় হিসাব' },
      { id: 'CUSTOMER_DUES', title: 'DUE REPORT', icon: '💸', desc: 'মার্কেট বকেয়া' }
    ];

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-32">
        {reportOptions.map((item) => (
          <div key={item.id} onClick={() => setActiveReport(item.id as ReportType)} className="bg-white p-10 rounded-[3.5rem] shadow-sm hover:shadow-2xl cursor-pointer border-2 border-slate-50 flex flex-col items-center group transition-all animate-reveal">
            <div className={`w-20 h-20 rounded-[2rem] bg-slate-900 flex items-center justify-center text-4xl mb-8 shadow-xl text-white`}>{item.icon}</div>
            <h3 className="text-lg font-black uppercase italic text-slate-800 leading-none">{item.title}</h3>
            <p className="text-[10px] font-bold text-slate-400 mt-4 uppercase tracking-widest">{item.desc}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white p-4 md:p-12 rounded-[4rem] shadow-2xl min-h-[85vh] border animate-reveal text-black">
      <div className="flex justify-between items-center mb-8 no-print flex-wrap gap-4">
        <button onClick={() => setActiveReport('MAIN')} className="bg-slate-900 text-white px-8 py-5 rounded-[1.5rem] font-black text-[11px] uppercase">← ফিরে যান</button>
        <div className="flex gap-4 items-center bg-slate-50 p-3 rounded-[2rem] border">
          {(activeReport === 'DELIVERY_LOG_A4' || activeReport === 'COLLECTION_REPORT') && <input type="date" className="p-3 border rounded-[1.2rem] text-[10px] font-black" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />}
          <input className="p-3 border rounded-[1.2rem] text-[10px] font-black outline-none bg-white" placeholder="সার্চ..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          <button disabled={isDownloading || loading} onClick={() => handleDownloadPDF(reportRef, `IFZA_${activeReport}`)} className="bg-emerald-600 text-white px-5 py-4 rounded-[1.2rem] font-black text-[9px] uppercase shadow-lg">PDF ডাউনলোড</button>
        </div>
      </div>

      <div className="w-full overflow-x-auto custom-scroll">
        <div ref={reportRef} className="printable-content p-10 bg-white text-black min-h-fit flex flex-col border-2 border-black mx-auto" style={{ width: '100%', minWidth: '850px', minHeight: '1202px' }}>
          <div className="text-center border-b-4 border-black pb-8 mb-10 relative">
            <h1 className="text-5xl font-black uppercase italic mb-1 tracking-tighter text-black leading-none">IFZA ELECTRONICS</h1>
            <p className="text-xl font-black uppercase tracking-[0.5em] mb-4 text-black">{activeReport.replace(/_/g, ' ')} SUMMARY</p>

            {activeReport === 'BOOKING_LOG' ? (
              <div className="mt-4 p-8 bg-white border-[6px] border-rose-600 rounded-[3rem] inline-block shadow-2xl animate-reveal ring-[15px] ring-rose-50">
                <p className="text-[12px] font-black uppercase text-rose-600 tracking-[0.3em] mb-3 italic">TOTAL PENDING ITEMS (বাকি মালের মোট সংখ্যা)</p>
                <p className="text-8xl font-black italic tracking-tighter text-rose-700 leading-none">{summary.totalRemQty} <span className="text-3xl font-bold">Pcs</span></p>
                <div className="mt-4 pt-4 border-t-2 border-rose-100 flex items-center justify-center gap-6">
                  <p className="text-[12px] font-black text-rose-500 uppercase tracking-widest italic">Inventory Valuation: ৳{(summary.totalRemVal || 0).toLocaleString()}</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <p className="text-[12px] font-black uppercase italic opacity-60 bg-slate-100 py-2 px-6 inline-block rounded-full">Date: {new Date().toLocaleDateString('bn-BD')} | Node: {company}</p>
                {activeReport === 'STOCK_REPORT' && (
                  <p className="mt-4 text-2xl font-black italic text-indigo-600">Total Stock Value: ৳{(summary.totalRemVal || 0).toLocaleString()}</p>
                )}
              </div>
            )}
          </div>

          <table className="w-full border-collapse border-2 border-black">
            <thead>
              <tr className="bg-slate-900 text-white text-[10px] font-black uppercase italic border-b-2 border-black">
                <th className="p-3 border-r border-white/20 text-center w-10">Sl</th>
                {activeReport === 'DELIVERY_LOG_A4' ? (
                  <>
                    <th className="p-3 border-r border-white/20 text-left">দোকান ও ঠিকানা</th>
                    <th className="p-3 border-r border-white/20 text-center w-24">কোম্পানি</th>
                    <th className="p-3 border-r border-white/20 text-right w-28">মেমো বিল</th>
                    <th className="p-3 border-r border-white/20 text-center w-32">সংগ্রহ (Manual)</th>
                    <th className="p-3 text-center w-32">স্বাক্ষর</th>
                  </>
                ) : activeReport === 'COLLECTION_REPORT' ? (
                  <>
                    <th className="p-3 border-r border-white/20 text-left">দোকানের নাম</th>
                    <th className="p-3 border-r border-white/20 text-center w-24">কোম্পানি</th>
                    <th className="p-3 border-r border-white/20 text-right w-32">টাকার পরিমাণ</th>
                    <th className="p-3 text-center">সংগ্রহকারী (By)</th>
                  </>
                ) : activeReport === 'BOOKING_LOG' ? (
                  <>
                    <th className="p-3 border-r border-white/20 text-left">দোকান ও আইটেম বিবরণ</th>
                    <th className="p-3 border-r border-white/20 text-center w-24">অর্ডার</th>
                    <th className="p-3 border-r border-white/20 text-center w-24">ডেলিভারি</th>
                    <th className="p-3 border-r border-white/20 text-center w-24 bg-rose-700">বাকি (পিস)</th>
                    <th className="p-3 text-right w-36">বাকি টাকা (Val)</th>
                  </>
                ) : activeReport === 'PURCHASE_HISTORY' ? (
                  <>
                    <th className="p-3 border-r border-white/20 text-center w-24">তারিখ</th>
                    <th className="p-3 border-r border-white/20 text-left">পণ্য ও পরিমাণ</th>
                    <th className="p-3 text-right w-32">মোট ক্রয় মূল্য</th>
                  </>
                ) : activeReport === 'STOCK_REPORT' ? (
                  <>
                    <th className="p-3 border-r border-white/20 text-left">পণ্যের নাম</th>
                    <th className="p-3 border-r border-white/20 text-center w-16">ক্রয় (+)</th>
                    <th className="p-3 border-r border-white/20 text-center w-16">বিক্রয় (-)</th>
                    <th className="p-3 border-r border-white/20 text-center w-20 bg-slate-800">স্টক</th>
                    <th className="p-3 text-right w-32">স্টক মূল্য (TP)</th>
                  </>
                ) : (
                  <>
                    <th className="p-3 border-r border-white/20 text-left">দোকানের বিবরণ</th>
                    <th className="p-3 text-right w-32">টাকা (Balance)</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="text-[12px] font-bold italic">
              {loading ? (
                <tr><td colSpan={10} className="p-24 text-center animate-pulse text-slate-300 font-black uppercase tracking-[0.4em]">Node Data Synchronizing...</td></tr>
              ) : filteredData.length === 0 ? (
                <tr><td colSpan={10} className="p-24 text-center opacity-30 uppercase font-black tracking-widest italic">কোনো তথ্য পাওয়া যায়নি</td></tr>
              ) : filteredData.map((item, idx) => (
                <tr key={idx} className="border-b-2 border-black text-black hover:bg-slate-50 transition-all">
                  <td className="p-3 border-r border-black text-center font-black">{(idx + 1).toString().padStart(2, '0')}</td>
                  {activeReport === 'DELIVERY_LOG_A4' ? (
                    <>
                      <td className="p-3 border-r border-black">
                        <p className="font-black uppercase">{item.customers?.name}</p>
                        <p className="text-[9px] italic opacity-60">📍 {item.customers?.address}</p>
                      </td>
                      <td className="p-3 border-r border-black text-center uppercase text-[9px] font-black">{item.company}</td>
                      <td className="p-3 border-r border-black text-right font-black italic">৳{(Number(item.amount) || 0).toLocaleString()}</td>
                      <td className="p-3 border-r border-black"></td>
                      <td className="p-3"></td>
                    </>
                  ) : activeReport === 'COLLECTION_REPORT' ? (
                    <>
                      <td className="p-3 border-r border-black">
                        <p className="font-black uppercase">{item.customers?.name}</p>
                      </td>
                      <td className="p-3 border-r border-black text-center uppercase text-[9px] font-black">{item.company}</td>
                      <td className="p-3 border-r border-black text-right font-black italic text-emerald-600">৳{(Number(item.amount) || 0).toLocaleString()}</td>
                      <td className="p-3 text-center uppercase text-[9px] font-black">{item.submitted_by}</td>
                    </>
                  ) : activeReport === 'BOOKING_LOG' ? (
                    <>
                      <td className="p-3 border-r border-black">
                        <p className="font-black uppercase italic leading-none mb-1">{item.customers?.name}</p>
                        <div className="flex items-center gap-2">
                          <span className="w-1 h-1 bg-blue-600 rounded-full"></span>
                          <p className="text-[13px] font-black text-blue-600 uppercase italic tracking-tighter leading-none">{item.item_name}</p>
                        </div>
                        <p className="text-[8px] font-black text-slate-400 mt-1 uppercase">Unit Price: ৳{(item.item_price || 0).toLocaleString()}</p>
                      </td>
                      <td className="p-3 border-r border-black text-center">{(item.item_ord || 0)}</td>
                      <td className="p-3 border-r border-black text-center text-emerald-600">{(item.item_del || 0)}</td>
                      <td className="p-3 border-r border-black text-center text-rose-700 bg-rose-50 font-black text-lg italic">{(item.item_rem || 0)}</td>
                      <td className="p-3 text-right italic font-black text-rose-600 text-sm">৳{(item.item_rem_val || 0).toLocaleString()}</td>
                    </>
                  ) : activeReport === 'PURCHASE_HISTORY' ? (
                    <>
                      <td className="p-3 border-r border-black text-center">{item.date ? new Date(item.date).toLocaleDateString('bn-BD') : ''}</td>
                      <td className="p-3 border-r border-black uppercase text-[10px] leading-tight">{item.note}</td>
                      <td className="p-3 text-right font-black text-emerald-600">৳{(item.amount || 0).toLocaleString()}</td>
                    </>
                  ) : activeReport === 'STOCK_REPORT' ? (
                    <>
                      <td className="p-3 border-r border-black uppercase">
                        <p className="font-black">{item.name}</p>
                        <p className="text-[8px] opacity-50 uppercase">Rate: ৳{(item.tp || 0)}</p>
                      </td>
                      <td className="p-3 border-r border-black text-center text-emerald-600">+{(item.purchased || 0)}</td>
                      <td className="p-3 border-r border-black text-center text-rose-600">-{(item.sold || 0)}</td>
                      <td className="p-3 border-r border-black text-center font-black bg-slate-50 text-base italic">{(item.current_stock || 0)}</td>
                      <td className="p-3 text-right font-black italic">৳{(Number(item.current_stock || 0) * Number(item.tp || 0)).toLocaleString()}</td>
                    </>
                  ) : (
                    <>
                      <td className="p-3 border-r border-black">
                        <p className="uppercase font-black">{item.name}</p>
                        <p className="text-[9px] italic opacity-60">📍 {item.address}</p>
                      </td>
                      <td className={`p-3 text-right font-black italic text-base ${(item.balance || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        ৳{Math.abs(item.balance || 0).toLocaleString()}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-16 border-t-4 border-black pt-8 flex justify-between items-end">
            <div className="text-[10px] font-black uppercase italic space-y-2">
              <p className="text-blue-600 font-black">* IFZA ELECTRONICS GROUP (OFFICIAL REPORT)</p>
              <p>* GENERATED BY: {userName}</p>
              <p>* BRANCH/NODE: {company}</p>
              <p>* TIMESTAMP: {new Date().toLocaleString('bn-BD')}</p>
            </div>
            <div className="w-96 space-y-3 text-right">
              <div className="flex justify-between text-[11px] font-black border-b-2 border-black/10 pb-2 uppercase italic text-slate-400">
                <span>Item Records:</span>
                <span>{filteredData.length}</span>
              </div>
              {activeReport === 'BOOKING_LOG' && (
                <div className="flex justify-between text-sm font-black text-rose-600 italic border-b-2 border-rose-100 pb-2">
                  <span>বাকি মালের সংখ্যা (Requirement):</span>
                  <span>{(summary.totalRemQty || 0)} Pcs</span>
                </div>
              )}
              <div className="flex justify-between text-3xl font-black text-black tracking-tighter leading-none pt-2">
                <span className="uppercase">{activeReport === 'BOOKING_LOG' ? 'NET REQUIREMENT:' : 'NET TOTAL SUM:'}</span>
                <span>৳{(summary.totalRemVal || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="mt-auto pt-20 text-center">
            <p className="text-[8px] font-black uppercase tracking-[0.5em] opacity-20">SYSTEM CORE v4.8.2 • POWERED BY IFZAERP.COM</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
