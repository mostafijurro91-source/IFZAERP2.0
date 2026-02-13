
import React, { useState, useEffect, useRef } from 'react';
import { User, Advertisement, formatCurrency, Company, Product } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';
import { jsPDF } from 'jspdf';
import * as html2canvasModule from 'html2canvas';

const html2canvas = (html2canvasModule as any).default || html2canvasModule;

interface PortalProps {
  type: 'DASHBOARD' | 'CATALOG' | 'LEDGER' | 'ALERTS';
  user: User;
}

interface CompanyStats {
  balance: number;
  totalBill: number;
  totalPaid: number;
}

const CustomerPortal: React.FC<PortalProps> = ({ type, user }) => {
  const [activeCompany, setActiveCompany] = useState<Company>('Transtec');
  const [ledger, setLedger] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [printingTx, setPrintingTx] = useState<any>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const invoiceRef = useRef<HTMLDivElement>(null);

  const [multiStats, setMultiStats] = useState<Record<string, CompanyStats>>({
    'Transtec': { balance: 0, totalBill: 0, totalPaid: 0 },
    'SQ Light': { balance: 0, totalBill: 0, totalPaid: 0 },
    'SQ Cables': { balance: 0, totalBill: 0, totalPaid: 0 }
  });

  const companies: Company[] = ['Transtec', 'SQ Light', 'SQ Cables'];

  // 🔔 Improved Real-time Sync
  useEffect(() => {
    if (!user.customer_id) return;
    
    const channel = supabase
      .channel(`portal_realtime_final_${user.customer_id}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'notifications', 
          filter: `customer_id=eq.${user.customer_id}` 
        },
        () => {
          fetchAlerts();
          fetchAllData(); 
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user.customer_id]);

  useEffect(() => {
    fetchAllData();
    fetchAlerts();
    if (type === 'ALERTS') markAlertsAsRead();
  }, [user.customer_id, type]);

  useEffect(() => {
    if (type === 'CATALOG') fetchProducts();
    if (type === 'LEDGER') fetchLedgerForCompany(activeCompany);
  }, [type, activeCompany]);

  const fetchAlerts = async () => {
    if (!user.customer_id) return;
    setIsSyncing(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('customer_id', user.customer_id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setAlerts(data || []);
    } catch (err) {
      console.error("Alert Fetch Error:", err);
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  };

  const markAlertsAsRead = async () => {
    if (!user.customer_id) return;
    await supabase.from('notifications').update({ is_read: true }).eq('customer_id', user.customer_id);
  };

  const deleteAlert = async (id: string) => {
    if (!confirm("আপনি কি এই নোটিফিকেশনটি মুছে ফেলতে চান?")) return;
    try {
      const { error } = await supabase.from('notifications').delete().eq('id', id);
      if (error) throw error;
      setAlerts(prev => prev.filter(a => a.id !== id));
    } catch (err) { alert("ডিলিট করা যায়নি!"); }
  };

  const clearAllAlerts = async () => {
    if (!confirm("আপনি কি নিশ্চিত আপনার ইনবক্সের সব নোটিফিকেশন মুছে ফেলতে চান?")) return;
    try {
      const { error } = await supabase.from('notifications').delete().eq('customer_id', user.customer_id);
      if (error) throw error;
      setAlerts([]);
    } catch (err) { alert("মুছা যায়নি!"); }
  };

  const fetchProducts = async () => {
    setLoading(true);
    const { data } = await supabase.from('products').select('*').eq('company', mapToDbCompany(activeCompany)).order('name');
    setProducts(data || []);
    setLoading(false);
  };

  const fetchLedgerForCompany = async (co: Company) => {
    if (!user.customer_id) return;
    setLoading(true);
    const { data } = await supabase.from('transactions').select('*').eq('customer_id', user.customer_id).eq('company', mapToDbCompany(co)).order('created_at', { ascending: false });
    setLedger(data || []);
    setLoading(false);
  };

  const fetchAllData = async () => {
    if (!user.customer_id) return;
    try {
      const { data: allTxs } = await supabase.from('transactions').select('*').eq('customer_id', user.customer_id);
      const stats: Record<string, CompanyStats> = {
        'Transtec': { balance: 0, totalBill: 0, totalPaid: 0 },
        'SQ Light': { balance: 0, totalBill: 0, totalPaid: 0 },
        'SQ Cables': { balance: 0, totalBill: 0, totalPaid: 0 }
      };
      (allTxs || []).forEach(tx => {
        const dbCo = mapToDbCompany(tx.company);
        if (stats[dbCo]) {
          const amt = Number(tx.amount);
          if (tx.payment_type === 'COLLECTION') {
            stats[dbCo].totalPaid += amt;
            stats[dbCo].balance -= amt;
          } else {
            stats[dbCo].totalBill += amt;
            stats[dbCo].balance += amt;
          }
        }
      });
      setMultiStats(stats);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePrintMemoFromAlert = async (alert: any) => {
    if (!user.customer_id) return;
    // Extract ID from message like #ABC123
    const match = alert.message.match(/#([A-Z0-9]{6})/);
    if (!match) return alert("মেমো আইডি ইনবক্সে পাওয়া যায়নি।");
    const shortId = match[1];

    setIsSyncing(true);
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*, customers(*)')
        .eq('customer_id', user.customer_id)
        .ilike('id::text', `%${shortId.toLowerCase()}%`)
        .single();
      
      if (error || !data) throw new Error("Not found");
      setPrintingTx(data);
    } catch (e) {
      alert("দুঃখিত, এই মেমোটির বিস্তারিত তথ্য এখন পাওয়া যাচ্ছে না।");
    } finally {
      setIsSyncing(false);
    }
  };

  const downloadPDF = async () => {
    if (!invoiceRef.current || isDownloading) return;
    setIsDownloading(true);
    try {
      const canvas = await html2canvas(invoiceRef.current, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      const pdf = new jsPDF('p', 'mm', 'a5');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, imgHeight);
      pdf.save(`Invoice_${printingTx?.customers?.name}_${Date.now()}.pdf`);
    } catch (e) {
      alert("PDF ডাউনলোড ব্যর্থ হয়েছে।");
    } finally {
      setIsDownloading(false);
    }
  };

  const totalOutstanding = (Object.values(multiStats) as CompanyStats[]).reduce((sum, s) => sum + s.balance, 0);

  return (
    <div className="space-y-10 pb-32 animate-reveal font-sans text-slate-900">
      
      {/* View: DASHBOARD */}
      {type === 'DASHBOARD' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
             <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm text-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 italic">আমার মোট বকেয়া</p>
                <p className="text-2xl font-black text-slate-900 leading-none tracking-tighter italic">
                   {totalOutstanding.toLocaleString()}৳
                </p>
             </div>
             {companies.map(co => (
               <div key={co} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm text-center">
                  <p className={`text-[10px] font-black uppercase tracking-widest mb-2 italic ${co === 'Transtec' ? 'text-amber-500' : co === 'SQ Light' ? 'text-cyan-500' : 'text-rose-500'}`}>{co}</p>
                  <p className="text-2xl font-black text-slate-900 leading-none tracking-tighter italic">
                     {multiStats[co].balance.toLocaleString()}৳
                  </p>
               </div>
             ))}
          </div>

          <div className="bg-white/40 p-4 md:p-8 rounded-[3.5rem] border-2 border-dashed border-slate-200 mt-10">
            <div className="flex justify-between items-center mb-8 px-4">
               <div>
                  <h3 className="text-[12px] font-black text-slate-400 uppercase tracking-[0.2em] italic">রিয়েল-টাইম লগ (Activity Feed)</h3>
                  <p className="text-[9px] text-blue-500 font-black uppercase tracking-widest mt-1">সর্বশেষ আপডেটগুলো এখানে পাবেন</p>
               </div>
               <button onClick={fetchAlerts} className={`w-10 h-10 bg-white border rounded-full flex items-center justify-center text-sm shadow-sm hover:bg-slate-50 transition-all ${isSyncing ? 'animate-spin' : 'active:scale-90'}`}>🔄</button>
            </div>
            
            <div className="space-y-4">
              {alerts.slice(0, 5).map(al => (
                <div key={al.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex justify-between items-center group animate-reveal">
                   <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-inner ${al.type === 'PAYMENT' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                        {al.type === 'PAYMENT' ? '💰' : '📄'}
                      </div>
                      <div>
                        <h4 className="font-black text-slate-800 uppercase italic text-sm truncate max-w-[150px] md:max-w-none">{al.title}</h4>
                        <p className="text-[9px] text-slate-400 font-bold uppercase">{new Date(al.created_at).toLocaleDateString('bn-BD')}</p>
                      </div>
                   </div>
                   <div className="text-right">
                      <p className="text-sm font-black italic text-slate-900 leading-none">{al.message.match(/৳(\d+(,\d+)*)/)?.[0] || 'এন্ট্রি আপডেট'}</p>
                      <p className="text-[8px] font-bold text-slate-300 uppercase mt-1">{new Date(al.created_at).toLocaleTimeString('bn-BD', {hour:'2-digit', minute:'2-digit'})}</p>
                   </div>
                </div>
              ))}
              {alerts.length === 0 && !isSyncing && (
                 <div className="py-20 text-center opacity-20 font-black uppercase text-[10px] tracking-widest italic flex flex-col items-center">
                    <span className="text-4xl mb-4">📡</span>
                    কোনো সাম্প্রতিক আপডেট পাওয়া যায়নি
                 </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* View: ALERTS (Inbox) - Improved UI */}
      {type === 'ALERTS' && (
        <div className="max-w-2xl mx-auto space-y-4">
           <div className="bg-[#0f172a] p-10 md:p-14 rounded-[4rem] text-white flex justify-between items-center shadow-2xl border border-white/5 mb-10 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 blur-[60px] rounded-full group-hover:scale-150 transition-transform duration-1000"></div>
              <div className="flex-1 relative z-10">
                 <h3 className="text-3xl font-black uppercase italic tracking-tighter leading-none">আমার ইনবক্স</h3>
                 <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.3em] mt-3 italic">Notification Archive & Real-time Logs</p>
                 <div className="flex gap-2 mt-8">
                    <button onClick={fetchAlerts} className="bg-blue-600 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-xl flex items-center gap-2">
                       {isSyncing ? 'সিঙ্ক হচ্ছে...' : '🔄 রিফ্রেশ (Refresh)'}
                    </button>
                    <button onClick={clearAllAlerts} className="bg-white/10 text-rose-400 border border-white/5 px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all hover:bg-rose-500/10">সব মুছুন</button>
                 </div>
              </div>
              <div className={`w-20 h-20 bg-blue-600/20 rounded-[2rem] flex items-center justify-center text-4xl shadow-inner relative z-10 ${isSyncing ? 'animate-spin' : 'animate-bounce'}`}>🔔</div>
           </div>
           
           {loading && alerts.length === 0 ? (
             <div className="py-20 text-center animate-pulse text-slate-300 font-black uppercase italic italic text-xs">Syncing Cloud Terminal...</div>
           ) : alerts.length === 0 ? (
             <div className="py-28 bg-white rounded-[3rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center text-center px-10 animate-reveal">
                <span className="text-8xl mb-8 grayscale opacity-10">📭</span>
                <p className="text-[15px] font-black text-slate-300 uppercase italic tracking-widest">আপনার ইনবক্স সম্পূর্ণ খালি</p>
                <p className="text-[10px] font-bold text-slate-400 mt-4 max-w-xs leading-relaxed">নতুন কোনো মেমো বা টাকা জমার আপডেট আসার সাথে সাথে এখানে দেখা যাবে। নিশ্চিত হতে রিফ্রেশ বাটন চাপুন।</p>
             </div>
           ) : (
             alerts.map((al, idx) => (
               <div key={al.id} className="bg-white p-8 md:p-12 rounded-[3.5rem] border border-slate-100 shadow-sm flex flex-col gap-8 animate-reveal relative overflow-hidden group hover:shadow-xl transition-all" style={{ animationDelay: `${idx * 0.05}s` }}>
                  <div className="flex items-start gap-8">
                    <div className={`w-16 h-16 rounded-3xl flex items-center justify-center text-3xl shrink-0 shadow-inner group-hover:scale-110 transition-transform ${al.type === 'PAYMENT' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                      {al.type === 'PAYMENT' ? '💰' : '📄'}
                    </div>
                    <div className="flex-1">
                       <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-3">
                          <h4 className="font-black text-slate-900 uppercase italic text-lg tracking-tight leading-none">{al.title}</h4>
                          <span className="text-[10px] font-black text-slate-300 uppercase italic px-4 py-1.5 bg-slate-50 rounded-full border">
                             📅 {new Date(al.created_at).toLocaleDateString('bn-BD')} | {new Date(al.created_at).toLocaleTimeString('bn-BD', {hour:'2-digit', minute:'2-digit'})}
                          </span>
                       </div>
                       <p className="text-[14px] font-bold text-slate-500 leading-relaxed mb-6">{al.message}</p>
                       <div className="flex items-center justify-between border-t border-slate-50 pt-6">
                          <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest italic">NOTIFICATION ID: #{String(al.id).slice(-8).toUpperCase()}</p>
                          <div className="flex gap-3">
                             {al.type === 'MEMO' && (
                               <button onClick={() => handlePrintMemoFromAlert(al)} className="bg-blue-600 text-white hover:bg-slate-900 px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg transition-all active:scale-95">প্রিন্ট মেমো ⎙</button>
                             )}
                             <button onClick={() => deleteAlert(al.id)} className="bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500 px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">মুছুন ×</button>
                          </div>
                       </div>
                    </div>
                    {!al.is_read && <div className="absolute top-8 right-8 w-3 h-3 bg-blue-600 rounded-full animate-ping"></div>}
                  </div>
               </div>
             ))
           )}
        </div>
      )}

      {/* View: LEDGER */}
      {type === 'LEDGER' && (
        <div className="space-y-8">
           <div className="bg-white p-2 rounded-[2rem] border shadow-sm flex gap-2 overflow-x-auto no-scrollbar">
              {companies.map(co => (
                 <button key={co} onClick={() => setActiveCompany(co)} className={`flex-1 min-w-[140px] py-5 rounded-[1.5rem] text-[11px] font-black uppercase tracking-widest transition-all ${activeCompany === co ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50'}`}>
                    {co} লেজার
                 </button>
              ))}
           </div>
           <div className="bg-white rounded-[3.5rem] border shadow-sm overflow-hidden animate-reveal">
              <div className="overflow-x-auto custom-scroll">
                 <table className="w-full text-left">
                    <thead>
                       <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] border-b">
                          <th className="px-10 py-8">তারিখ</th>
                          <th className="px-10 py-8">বিবরণ (Description)</th>
                          <th className="px-10 py-8 text-right">ডেবিট (মালের বিল)</th>
                          <th className="px-10 py-8 text-right">ক্রেডিট (টাকা জমা)</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[15px] font-bold">
                       {ledger.map((tx) => (
                         <tr key={tx.id} className="hover:bg-blue-50/20 transition-all group">
                            <td className="px-10 py-10 text-slate-500 whitespace-nowrap italic">{new Date(tx.created_at).toLocaleDateString('bn-BD')}</td>
                            <td className="px-10 py-10">
                               <p className="uppercase italic font-black text-sm text-slate-800">{tx.payment_type === 'COLLECTION' ? '💰 নগদ জমা' : '📄 মালের ইনভয়েস'}</p>
                               <p className="text-[10px] text-slate-300 uppercase mt-1 tracking-widest font-black">ID: #{String(tx.id).slice(-8).toUpperCase()}</p>
                            </td>
                            <td className="px-10 py-10 text-right font-black italic text-red-600 text-2xl tracking-tighter">
                               {tx.payment_type !== 'COLLECTION' ? `${Math.round(tx.amount).toLocaleString()}৳` : '—'}
                            </td>
                            <td className="px-10 py-10 text-right font-black italic text-emerald-600 text-2xl tracking-tighter">
                               {tx.payment_type === 'COLLECTION' ? `${Math.round(tx.amount).toLocaleString()}৳` : '—'}
                            </td>
                         </tr>
                       ))}
                       {ledger.length === 0 && (
                         <tr><td colSpan={4} className="p-40 text-center opacity-20 font-black uppercase italic">কোনো লেনদেন পাওয়া যায়নি</td></tr>
                       )}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      )}

      {/* 🧾 MEMO PRINT MODAL */}
      {printingTx && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-3xl z-[6000] flex flex-col items-center p-4 overflow-y-auto">
           <div className="w-full max-w-[148mm] flex justify-between items-center mb-8 sticky top-0 z-[6001] bg-slate-900/90 p-6 rounded-[2.5rem] border border-white/10 shadow-2xl">
              <button onClick={() => setPrintingTx(null)} className="text-white font-black uppercase text-[10px] px-6 hover:text-blue-400 transition-colors">← ইনবক্সে ফিরুন</button>
              <div className="flex gap-3">
                 <button disabled={isDownloading} onClick={downloadPDF} className="bg-white text-slate-900 px-8 py-4 rounded-xl font-black text-[10px] uppercase shadow-xl active:scale-95">PDF ডাউনলোড ⎙</button>
                 <button onClick={() => window.print()} className="bg-blue-600 text-white px-8 py-4 rounded-xl font-black text-[10px] uppercase shadow-xl active:scale-95">প্রিন্ট এ৪ ⎙</button>
              </div>
           </div>

           <div ref={invoiceRef} className="bg-white w-[148mm] min-h-fit p-12 flex flex-col font-sans text-black relative shadow-2xl border-[3px] border-black">
              <p className="text-center font-bold text-[10px] mb-2 italic leading-tight">বিসমিল্লাহির রাহমানির রাহিম</p>
              <div className="text-center border-b-2 border-black pb-6 mb-8">
                 <h1 className="text-[32px] font-black uppercase italic tracking-tighter leading-none mb-1 text-blue-700">IFZA ELECTRONICS</h1>
                 <p className="text-[14px] font-black uppercase tracking-[0.2em] mb-1">{printingTx.company.toUpperCase()} DIVISION</p>
              </div>

              <div className="flex justify-between items-start mb-10 text-[13px]">
                 <div className="space-y-1">
                    <p className="text-[20px] font-black uppercase italic leading-none text-blue-700">{printingTx.customers?.name}</p>
                    <p className="font-bold">📍 {printingTx.customers?.address}</p>
                    <p className="font-bold">📱 {printingTx.customers?.phone}</p>
                 </div>
                 <div className="text-right space-y-1">
                    <p className="font-black uppercase italic">তারিখ: {new Date(printingTx.created_at).toLocaleDateString('bn-BD')}</p>
                    <p className="font-black">ইনভয়েস: #{String(printingTx.id).slice(-8).toUpperCase()}</p>
                 </div>
              </div>

              <table className="w-full border-collapse mb-10">
                 <thead>
                    <tr className="text-[11px] font-black uppercase italic border-b-2 border-black text-left">
                       <th className="py-2 w-8">Sl</th>
                       <th className="py-2">বিবরণ (Description)</th>
                       <th className="py-2 text-center w-20">দর</th>
                       <th className="py-2 text-center w-12">Qty</th>
                       <th className="py-2 text-right w-24">মোট</th>
                    </tr>
                 </thead>
                 <tbody className="text-[12px] font-bold">
                    {Array.isArray(printingTx.items) && printingTx.items.map((it: any, idx: number) => (
                       <tr key={idx} className="italic border-b border-black/10">
                          <td className="py-4">{idx + 1}</td>
                          <td className="py-4 uppercase">{it.name}</td>
                          <td className="py-4 text-center">৳{it.price}</td>
                          <td className="py-4 text-center">{it.qty}</td>
                          <td className="py-4 text-right">৳{(it.total || (it.price * it.qty)).toLocaleString()}</td>
                       </tr>
                    ))}
                 </tbody>
              </table>

              <div className="flex justify-end mt-auto pt-10">
                 <div className="w-64 space-y-2 text-right border-t-2 border-black pt-6">
                    <p className="text-3xl font-black italic tracking-tighter text-blue-700">NET BILL: ৳{Number(printingTx.amount).toLocaleString()}</p>
                 </div>
              </div>

              <div className="mt-32 flex justify-between px-4">
                 <div className="text-center w-40 border-t border-black pt-2 font-black uppercase text-[9px] italic">ক্রেতার স্বাক্ষর</div>
                 <div className="text-center w-40 border-t border-black pt-2 font-black uppercase text-[9px] italic">কর্তৃপক্ষের স্বাক্ষর</div>
              </div>

              <div className="mt-20 text-center opacity-30">
                 <p className="text-[8px] font-black uppercase tracking-[0.4em]">OFFICIAL RECEIPT GENERATED VIA IFZAERP.COM</p>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default CustomerPortal;
