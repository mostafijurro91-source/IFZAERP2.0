
import React, { useState, useEffect } from 'react';
import { User, Advertisement, formatCurrency, Company, Product } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';

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
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [alerts, setAlerts] = useState<any[]>([]);

  const [multiStats, setMultiStats] = useState<Record<string, CompanyStats>>({
    'Transtec': { balance: 0, totalBill: 0, totalPaid: 0 },
    'SQ Light': { balance: 0, totalBill: 0, totalPaid: 0 },
    'SQ Cables': { balance: 0, totalBill: 0, totalPaid: 0 }
  });

  const companies: Company[] = ['Transtec', 'SQ Light', 'SQ Cables'];

  useEffect(() => {
    fetchAllData();
    fetchAlerts();
    if (type === 'ALERTS') markAlertsAsRead();
  }, [user, type]);

  useEffect(() => {
    if (type === 'DASHBOARD') fetchAds();
    if (type === 'CATALOG') fetchProducts();
    if (type === 'LEDGER') fetchLedgerForCompany(activeCompany);
  }, [type, activeCompany]);

  const fetchAlerts = async () => {
    if (!user.customer_id) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('customer_id', user.customer_id)
      .order('created_at', { ascending: false })
      .limit(type === 'DASHBOARD' ? 10 : 40);
    setAlerts(data || []);
  };

  const markAlertsAsRead = async () => {
    if (!user.customer_id) return;
    await supabase.from('notifications').update({ is_read: true }).eq('customer_id', user.customer_id);
  };

  const fetchAds = async () => {
    const { data } = await supabase.from('advertisements').select('*').order('created_at', { ascending: false });
    setAds(data || []);
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
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  };

  const totalOutstanding = (Object.values(multiStats) as CompanyStats[]).reduce((sum, s) => sum + s.balance, 0);

  return (
    <div className="space-y-6 pb-32 animate-reveal font-sans text-slate-900">
      
      {type === 'DASHBOARD' && (
        <>
          {/* 📊 Top Stats Grid - Exactly matching User Screenshot */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
             <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm text-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 italic">আজকের মোট</p>
                <p className="text-2xl font-black text-slate-900 leading-none tracking-tighter italic">
                   {totalOutstanding.toLocaleString()}৳
                </p>
             </div>
             <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm text-center group">
                <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-2 italic">Transtec</p>
                <p className="text-2xl font-black text-amber-600 leading-none tracking-tighter italic">
                   {multiStats['Transtec'].balance.toLocaleString()}৳
                </p>
             </div>
             <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm text-center group">
                <p className="text-[10px] font-black text-cyan-500 uppercase tracking-widest mb-2 italic">SQ Light</p>
                <p className="text-2xl font-black text-cyan-600 leading-none tracking-tighter italic">
                   {multiStats['SQ Light'].balance.toLocaleString()}৳
                </p>
             </div>
             <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm text-center group">
                <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-2 italic">SQ Cables</p>
                <p className="text-2xl font-black text-rose-600 leading-none tracking-tighter italic">
                   {multiStats['SQ Cables'].balance.toLocaleString()}৳
                </p>
             </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-8">
            <div className="flex-1 space-y-6">
              {/* 🔔 LIVE LOG - Matching user screenshot card style */}
              <div className="bg-white/40 p-2 md:p-4 rounded-[3.5rem] border-2 border-dashed border-slate-200">
                <div className="flex justify-between items-center mb-6 px-8 pt-4">
                   <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] italic">সাম্প্রতিক অ্যাক্টিভিটি (Activity Feed)</h3>
                   <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping shadow-[0_0_10px_#10b981]"></span>
                </div>
                
                <div className="space-y-4">
                  {loading ? (
                    <div className="py-20 text-center animate-pulse italic text-sm uppercase font-black opacity-20">Syncing Feed...</div>
                  ) : alerts.length === 0 ? (
                    <div className="py-20 text-center opacity-20 italic text-sm uppercase font-black">কোনো সাম্প্রতিক আপডেট নেই</div>
                  ) : alerts.map(al => (
                    <div key={al.id} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6 transition-all hover:shadow-xl hover:-translate-y-1 animate-reveal group">
                       <div className="flex-1">
                          <h4 className="text-xl font-black text-slate-800 uppercase italic tracking-tight mb-2 leading-none">{user.name}</h4>
                          <div className="flex gap-2 mb-4">
                             <span className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase italic tracking-widest ${
                               al.title.includes('Transtec') ? 'bg-amber-50 text-amber-600' : 
                               al.title.includes('Light') ? 'bg-cyan-50 text-cyan-600' : 
                               'bg-rose-50 text-rose-600'
                             }`}>
                                {al.title.includes('Transtec') ? 'TRANSTEC' : al.title.includes('Light') ? 'SQ LIGHT' : 'SQ CABLES'}
                             </span>
                             <span className="px-4 py-1.5 bg-slate-50 text-slate-400 text-[9px] font-black rounded-xl uppercase italic tracking-widest border">
                                ID: #{String(al.id).slice(-4).toUpperCase()}
                             </span>
                          </div>
                          <p className="text-[12px] font-bold text-slate-500 leading-relaxed max-w-lg">{al.message}</p>
                       </div>
                       <div className="text-right w-full md:w-auto border-t md:border-t-0 pt-6 md:pt-0 shrink-0">
                          <p className={`text-3xl font-black tracking-tighter italic leading-none ${al.type === 'PAYMENT' ? 'text-emerald-600' : 'text-slate-900'}`}>
                             ৳{al.message.match(/৳(\d+(,\d+)*)/)?.[1] || '0'}
                          </p>
                          <p className="text-[10px] font-black text-slate-300 uppercase mt-2 tracking-widest">
                             {new Date(al.created_at).toLocaleTimeString('bn-BD', {hour:'2-digit', minute:'2-digit'})}
                          </p>
                       </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Side: Catalog/Offer Highlights */}
            <div className="w-full lg:w-[380px] space-y-8">
               <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] ml-6 italic">নতুন অফার ও প্রমোশন</h4>
               <div className="space-y-6">
                  {ads.slice(0, 3).map(ad => (
                    <div key={ad.id} className="bg-white rounded-[3.5rem] border-2 border-slate-50 overflow-hidden shadow-sm group hover:shadow-2xl transition-all cursor-pointer">
                       <div className="h-56 overflow-hidden relative bg-slate-50">
                          {ad.image_url ? (
                            <img src={ad.image_url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[3000ms] opacity-90" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center opacity-5 font-black text-6xl uppercase italic">IFZA</div>
                          )}
                          <div className="absolute top-6 left-6">
                             <span className="px-5 py-2 bg-black/80 backdrop-blur-xl text-white text-[9px] font-black rounded-xl uppercase tracking-widest italic">{ad.company}</span>
                          </div>
                       </div>
                       <div className="p-8">
                          <h5 className="font-black text-lg uppercase italic text-slate-800 mb-3 leading-tight group-hover:text-blue-600 transition-colors line-clamp-2">{ad.title}</h5>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">{ad.type.replace('_', ' ')}</p>
                       </div>
                    </div>
                  ))}
               </div>
            </div>
          </div>
        </>
      )}

      {type === 'ALERTS' && (
        <div className="max-w-2xl mx-auto space-y-4">
           <div className="bg-[#0f172a] p-12 rounded-[4rem] text-white flex justify-between items-center shadow-2xl border border-white/5 mb-10">
              <div>
                 <h3 className="text-3xl font-black uppercase italic tracking-tighter">আমার ইনবক্স</h3>
                 <p className="text-[11px] text-slate-400 font-bold uppercase tracking-[0.3em] mt-3">Notification Archive & Real-time Logs</p>
              </div>
              <div className="w-16 h-16 bg-blue-600 rounded-[1.8rem] flex items-center justify-center text-3xl shadow-[0_0_40px_rgba(37,99,235,0.4)]">🔔</div>
           </div>
           {alerts.map(al => (
             <div key={al.id} className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm flex items-start gap-8 animate-reveal relative overflow-hidden group hover:shadow-xl transition-all">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 shadow-inner group-hover:scale-110 transition-transform ${al.type === 'PAYMENT' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                  {al.type === 'PAYMENT' ? '💰' : '📄'}
                </div>
                <div className="flex-1">
                   <div className="flex justify-between items-center mb-3">
                      <h4 className="font-black text-slate-900 uppercase italic text-base tracking-tight leading-none">{al.title}</h4>
                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{new Date(al.created_at).toLocaleDateString('bn-BD')}</span>
                   </div>
                   <p className="text-[13px] font-bold text-slate-500 leading-relaxed mb-4">{al.message}</p>
                   <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Tracking ID: #{String(al.id).toUpperCase()}</p>
                </div>
                {!al.is_read && <div className="absolute top-6 right-6 w-3 h-3 bg-blue-600 rounded-full animate-ping"></div>}
             </div>
           ))}
        </div>
      )}

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
                       {loading ? (
                         <tr><td colSpan={4} className="p-40 text-center animate-pulse text-slate-300 font-black uppercase italic">Syncing Ledger...</td></tr>
                       ) : ledger.length === 0 ? (
                         <tr><td colSpan={4} className="p-40 text-center opacity-20 font-black uppercase italic">কোনো লেনদেন পাওয়া যায়নি</td></tr>
                       ) : ledger.map((tx, i) => (
                         <tr key={tx.id} className="hover:bg-blue-50/20 transition-all group">
                            <td className="px-10 py-10 text-slate-500 whitespace-nowrap">{new Date(tx.created_at).toLocaleDateString('bn-BD')}</td>
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
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      )}

      {type === 'CATALOG' && (
        <div className="space-y-10">
           <div className="bg-white p-2 rounded-[2rem] border shadow-sm flex gap-2 overflow-x-auto no-scrollbar">
              {companies.map(co => (
                 <button key={co} onClick={() => setActiveCompany(co)} className={`flex-1 min-w-[140px] py-5 rounded-[1.5rem] text-[11px] font-black uppercase tracking-widest transition-all ${activeCompany === co ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50'}`}>
                    {co} রেট লিস্ট
                 </button>
              ))}
           </div>
           
           <div className="bg-white p-2 rounded-[2.5rem] border shadow-sm flex items-center gap-4 px-6 mb-6">
              <span className="text-xl opacity-20 pl-2">🔍</span>
              <input 
                className="w-full p-5 bg-transparent border-none outline-none font-black text-xs uppercase tracking-widest placeholder:text-slate-300" 
                placeholder="মডেল বা প্রোডাক্ট সার্চ করুন..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
           </div>

           <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase())).map(p => (
                 <div key={p.id} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm group hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
                    <h4 className="text-[14px] font-black uppercase italic text-slate-800 leading-tight mb-8 h-12 line-clamp-2 group-hover:text-blue-600">{p.name}</h4>
                    <div className="border-t pt-8">
                       <p className="text-[9px] font-black text-slate-300 uppercase mb-2 tracking-widest italic leading-none">Official Retail MRP</p>
                       <p className="font-black text-2xl text-slate-900 italic leading-none tracking-tighter">{p.mrp}৳</p>
                    </div>
                 </div>
              ))}
           </div>
        </div>
      )}
    </div>
  );
};

export default CustomerPortal;
