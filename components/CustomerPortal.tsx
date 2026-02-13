
import React, { useState, useEffect, useRef } from 'react';
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

// 🎢 internal Slider Component for Portal
const PortalBrandSlider: React.FC<{ 
  brand: Company, 
  ads: Advertisement[], 
  onSeeAll: (brand: Company) => void,
  onAdClick: (ad: Advertisement) => void,
  themeColor: string
}> = ({ brand, ads, onSeeAll, onAdClick, themeColor }) => {
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ads.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % ads.length);
    }, 5000 + Math.random() * 1000);
    return () => clearInterval(timer);
  }, [ads.length]);

  if (ads.length === 0) return null;

  return (
    <div className="space-y-6 animate-reveal">
      <div className="flex justify-between items-end px-4">
         <div>
            <h4 className={`text-xl font-black uppercase italic tracking-tighter ${themeColor}`}>{brand}</h4>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">এক্সক্লুসিভ অফার ও ক্যাটালগ</p>
         </div>
         <button 
            onClick={() => onSeeAll(brand)}
            className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg hover:bg-blue-600 transition-all active:scale-95"
         >
           See All ➔
         </button>
      </div>

      <div className="relative group h-64 md:h-72 w-full overflow-hidden rounded-[2.5rem] border border-slate-100 shadow-sm bg-white">
         {ads.map((ad, idx) => (
           <div 
             key={ad.id}
             onClick={() => onAdClick(ad)}
             className={`absolute inset-0 transition-all duration-1000 ease-in-out cursor-pointer ${
               idx === index ? 'opacity-100 scale-100 z-10' : 'opacity-0 scale-105 pointer-events-none'
             }`}
           >
              {ad.image_url ? (
                <img src={ad.image_url} className="w-full h-full object-cover opacity-90 group-hover:scale-110 transition-transform duration-[5000ms]" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-200 font-black text-4xl italic uppercase">IFZA</div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-8">
                 <span className="bg-blue-600 text-white px-4 py-1 rounded-lg text-[8px] font-black uppercase w-fit mb-3">{ad.type.replace('_', ' ')}</span>
                 <h5 className="text-white text-lg font-black uppercase italic leading-tight drop-shadow-lg line-clamp-1">{ad.title}</h5>
              </div>
           </div>
         ))}
         
         <div className="absolute bottom-6 right-8 z-20 flex gap-1.5">
            {ads.map((_, idx) => (
              <div key={idx} className={`h-1 rounded-full transition-all duration-500 ${idx === index ? 'w-6 bg-blue-500' : 'w-1.5 bg-white/30'}`}></div>
            ))}
         </div>
      </div>
    </div>
  );
};

const CustomerPortal: React.FC<PortalProps> = ({ type, user }) => {
  const [activeCompany, setActiveCompany] = useState<Company>('Transtec');
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [alerts, setAlerts] = useState<any[]>([]);
  const [selectedAd, setSelectedAd] = useState<Advertisement | null>(null);
  const [showroomBrand, setShowroomBrand] = useState<Company | null>(null);

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
    if (type === 'DASHBOARD' || showroomBrand) fetchAds();
    if (type === 'CATALOG') fetchProducts();
    if (type === 'LEDGER') fetchLedgerForCompany(activeCompany);
  }, [type, activeCompany, showroomBrand]);

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

  const handleAdClick = (ad: Advertisement) => {
    if (ad.external_url) window.open(ad.external_url, '_blank');
    else setSelectedAd(ad);
  };

  const totalOutstanding = (Object.values(multiStats) as CompanyStats[]).reduce((sum, s) => sum + s.balance, 0);

  // 🏛️ Brand Specific Showroom View (Internal Page)
  if (showroomBrand) {
    const filteredAds = ads.filter(a => a.company === showroomBrand);
    return (
      <div className="space-y-10 pb-40 animate-reveal">
         <div className="bg-slate-900 p-10 md:p-16 rounded-[4rem] text-white relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 blur-[100px] rounded-full animate-pulse"></div>
            <button onClick={() => setShowroomBrand(null)} className="mb-10 text-blue-400 font-black uppercase text-[10px] tracking-widest flex items-center gap-3">
               <span>←</span> Back to Dashboard
            </button>
            <h2 className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter leading-none">{showroomBrand}</h2>
            <p className="text-[12px] font-black uppercase tracking-[0.6em] text-slate-500 mt-6 italic">Digital Showroom & Catalog</p>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {filteredAds.length === 0 ? (
               <div className="col-span-full py-40 text-center opacity-20 font-black uppercase tracking-widest italic">No Assets Found</div>
            ) : filteredAds.map(ad => (
               <div key={ad.id} onClick={() => handleAdClick(ad)} className="bg-white rounded-[3.5rem] border border-slate-100 shadow-sm overflow-hidden group hover:shadow-2xl transition-all duration-700 cursor-pointer animate-reveal">
                  <div className="h-64 overflow-hidden relative bg-slate-50">
                     {ad.image_url ? <img src={ad.image_url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[4000ms]" /> : <div className="w-full h-full flex items-center justify-center opacity-10 font-black text-4xl">IFZA</div>}
                     <div className="absolute top-6 left-6">
                        <span className="px-4 py-1.5 bg-blue-600 text-white text-[8px] font-black rounded-xl uppercase tracking-widest">{ad.type.replace('_', ' ')}</span>
                     </div>
                  </div>
                  <div className="p-8">
                     <h4 className="text-xl font-black uppercase italic text-slate-800 leading-tight mb-4 group-hover:text-blue-600 transition-colors">{ad.title}</h4>
                     <p className="text-[12px] text-slate-400 font-medium italic line-clamp-2 leading-relaxed">"{ad.content}"</p>
                  </div>
               </div>
            ))}
         </div>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-32 animate-reveal font-sans text-slate-900">
      
      {type === 'DASHBOARD' && (
        <>
          {/* 📊 Top Stats Grid */}
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
            <div className="flex-1 space-y-12">
              {/* 🔔 LIVE LOG */}
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

              {/* 🎡 TRIPLE AUTOMATIC SLIDERS SECTION */}
              <div className="space-y-16 pt-10 border-t-4 border-double border-slate-100">
                  <div className="text-center mb-10">
                     <h3 className="text-2xl font-black uppercase italic tracking-tighter">ব্র্যান্ড ক্যাটালগ ও অফার</h3>
                     <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.4em] mt-2 italic">Premium Digital Showroom Highlights</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                    <PortalBrandSlider 
                      brand="Transtec" 
                      ads={ads.filter(a => a.company === 'Transtec')} 
                      onSeeAll={setShowroomBrand} 
                      onAdClick={handleAdClick}
                      themeColor="text-amber-500"
                    />
                    <PortalBrandSlider 
                      brand="SQ Light" 
                      ads={ads.filter(a => a.company === 'SQ Light')} 
                      onSeeAll={setShowroomBrand} 
                      onAdClick={handleAdClick}
                      themeColor="text-cyan-500"
                    />
                    <PortalBrandSlider 
                      brand="SQ Cables" 
                      ads={ads.filter(a => a.company === 'SQ Cables')} 
                      onSeeAll={setShowroomBrand} 
                      onAdClick={handleAdClick}
                      themeColor="text-rose-500"
                    />
                  </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Detail Modal for Ad Preview */}
      {selectedAd && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-3xl z-[5000] flex flex-col animate-reveal" onClick={() => setSelectedAd(null)}>
           <div className="h-28 px-10 md:px-20 flex justify-between items-center border-b border-white/5 bg-black/40" onClick={e => e.stopPropagation()}>
              <div>
                 <h4 className="text-2xl font-black uppercase italic leading-none text-white">{selectedAd.title}</h4>
                 <p className="text-[9px] text-blue-500 font-black uppercase tracking-widest mt-2 italic">IFZA Enterprise Showroom Asset</p>
              </div>
              <button onClick={() => setSelectedAd(null)} className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-white text-2xl hover:bg-red-500 transition-all active:scale-90">✕</button>
           </div>
           
           <div className="flex-1 overflow-y-auto p-6 md:p-20 custom-scroll" onClick={e => e.stopPropagation()}>
              <div className="max-w-7xl mx-auto space-y-24 pb-40">
                 {selectedAd.image_url && (
                    <div className="relative group">
                       <div className="absolute inset-0 bg-blue-600/10 blur-[150px] opacity-30 rounded-full"></div>
                       <img src={selectedAd.image_url} className="w-full rounded-[4rem] shadow-2xl border border-white/10 relative z-10" />
                    </div>
                 )}
                 <div className="bg-white/[0.03] p-12 md:p-24 rounded-[6rem] border border-white/5 relative overflow-hidden text-center">
                    <div className="absolute top-10 left-10 text-9xl font-black text-white/5 select-none italic">"</div>
                    <p className="text-2xl md:text-5xl font-medium leading-[1.3] text-slate-100 italic relative z-10 max-w-5xl mx-auto">{selectedAd.content}</p>
                    <div className="mt-16 flex flex-col items-center gap-4 relative z-10">
                       <span className="h-px w-20 bg-blue-500/40"></span>
                       <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em] italic">Product Information Complete</p>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Remaining Portal Views (ALERTS, LEDGER, CATALOG) */}
      {type === 'ALERTS' && (
        <div className="max-w-2xl mx-auto space-y-4">
           {/* ... existing code ... */}
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
