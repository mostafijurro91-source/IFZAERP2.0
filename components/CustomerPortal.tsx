
import React, { useState, useEffect } from 'react';
import { User, Advertisement, formatCurrency, Company, Product } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';

interface PortalProps {
  type: 'DASHBOARD' | 'CATALOG' | 'LEDGER';
  user: User;
}

interface CompanyStats {
  balance: number;
  totalBill: number;
  totalPaid: number;
  lastPurchase: string;
  lastPayment: string;
}

const CustomerPortal: React.FC<PortalProps> = ({ type, user }) => {
  const [activeCompany, setActiveCompany] = useState<Company>('Transtec');
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [shopInfo, setShopInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedAd, setSelectedAd] = useState<Advertisement | null>(null);

  // Initialize multi-company stats
  // Fix: Changed 'SQ Cables' to 'SQ careport' to align with Company type
  const [multiStats, setMultiStats] = useState<Record<string, CompanyStats>>({
    'Transtec': { balance: 0, totalBill: 0, totalPaid: 0, lastPurchase: '—', lastPayment: '—' },
    'SQ Light': { balance: 0, totalBill: 0, totalPaid: 0, lastPurchase: '—', lastPayment: '—' },
    'SQ careport': { balance: 0, totalBill: 0, totalPaid: 0, lastPurchase: '—', lastPayment: '—' }
  });

  // Fix: Changed 'SQ Cables' to 'SQ careport' to align with Company type
  const companies: Company[] = ['Transtec', 'SQ Light', 'SQ careport'];

  useEffect(() => {
    fetchAllData();
  }, [user]);

  useEffect(() => {
    if (type === 'DASHBOARD') fetchAds();
    if (type === 'CATALOG') fetchProducts();
    if (type === 'LEDGER') fetchLedgerForCompany(activeCompany);
  }, [type, activeCompany]);

  const fetchAds = async () => {
    try {
      const { data } = await supabase
        .from('advertisements')
        .select('*')
        .order('created_at', { ascending: false });
      setAds(data || []);
    } catch (err) { console.error(err); }
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('company', mapToDbCompany(activeCompany))
        .order('name');
      setProducts(data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const fetchLedgerForCompany = async (co: Company) => {
    if (!user.customer_id) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('customer_id', user.customer_id)
        .eq('company', mapToDbCompany(co))
        .order('created_at', { ascending: false });
      setLedger(data || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const fetchAllData = async () => {
    if (!user.customer_id) return;
    setLoading(true);
    try {
      const [custRes, txRes] = await Promise.all([
        supabase.from('customers').select('*').eq('id', user.customer_id).single(),
        supabase.from('transactions').select('*').eq('customer_id', user.customer_id)
      ]);

      setShopInfo(custRes.data);
      
      const allTxs = txRes.data || [];
      // Fix: Changed 'SQ Cables' to 'SQ careport' to align with Company type
      const stats: Record<string, CompanyStats> = {
        'Transtec': { balance: 0, totalBill: 0, totalPaid: 0, lastPurchase: '—', lastPayment: '—' },
        'SQ Light': { balance: 0, totalBill: 0, totalPaid: 0, lastPurchase: '—', lastPayment: '—' },
        'SQ careport': { balance: 0, totalBill: 0, totalPaid: 0, lastPurchase: '—', lastPayment: '—' }
      };

      allTxs.forEach(tx => {
        const dbCo = mapToDbCompany(tx.company);
        if (stats[dbCo]) {
          const amt = Number(tx.amount);
          if (tx.payment_type === 'COLLECTION') {
            stats[dbCo].totalPaid += amt;
            stats[dbCo].balance -= amt;
            if (stats[dbCo].lastPayment === '—') stats[dbCo].lastPayment = new Date(tx.created_at).toLocaleDateString('bn-BD');
          } else {
            stats[dbCo].totalBill += amt;
            stats[dbCo].balance += amt;
            if (stats[dbCo].lastPurchase === '—') stats[dbCo].lastPurchase = new Date(tx.created_at).toLocaleDateString('bn-BD');
          }
        }
      });

      setMultiStats(stats);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const statsList = Object.values(multiStats) as CompanyStats[];
  const totalOutstanding = statsList.reduce((sum, s) => sum + s.balance, 0);

  const brandStyles: Record<string, string> = {
    'Transtec': 'bg-amber-500',
    'SQ Light': 'bg-cyan-500',
    'SQ careport': 'bg-rose-600'
  };

  const brandGradients: Record<string, string> = {
    'Transtec': 'from-amber-400 to-amber-600',
    'SQ Light': 'from-cyan-400 to-blue-500',
    'SQ careport': 'from-rose-500 to-red-600'
  };

  if (type === 'DASHBOARD') {
    return (
      <div className="space-y-8 pb-32 animate-reveal">
        {/* Master Profile Info */}
        <div className="bg-white p-8 md:p-12 rounded-[3.5rem] border border-slate-100 shadow-sm flex flex-col lg:flex-row justify-between items-center gap-8">
           <div className="flex items-center gap-6">
              <div className="w-24 h-24 bg-blue-600 rounded-[2.5rem] flex items-center justify-center text-4xl font-black text-white italic shadow-2xl">
                {user.name.charAt(0)}
              </div>
              <div>
                 <h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">{user.name}</h2>
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-3 italic">প্রোপ্রাইটর: {shopInfo?.proprietor_name || '...'}</p>
                 <div className="flex gap-2 mt-2">
                    <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[8px] font-black uppercase tracking-widest">📍 {shopInfo?.address}</span>
                    <span className="px-3 py-1 bg-slate-900 text-white rounded-lg text-[8px] font-black uppercase tracking-widest italic">IFZA HUB ACCESS</span>
                 </div>
              </div>
           </div>
           <div className="bg-slate-950 px-12 py-8 rounded-[3rem] text-center border border-white/5 shadow-2xl">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 italic">মোট নিট বকেয়া (৩ কোম্পানি)</p>
              <p className={`text-5xl font-black italic tracking-tighter ${totalOutstanding > 0 ? 'text-red-500' : 'text-emerald-500'}`}>{formatCurrency(totalOutstanding)}</p>
           </div>
        </div>

        {/* Company Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
           {companies.map(co => (
             <div key={co} className="bg-white rounded-[3.5rem] border border-slate-100 shadow-sm overflow-hidden group hover:shadow-xl transition-all">
                <div className={`h-2 bg-gradient-to-r ${brandGradients[co]}`}></div>
                <div className="p-10">
                   <div className="flex justify-between items-center mb-8">
                      <div className={`px-5 py-2 rounded-xl text-white text-[10px] font-black uppercase italic tracking-widest shadow-lg ${brandStyles[co]}`}>{co}</div>
                      <div className="text-[20px]">{co === 'Transtec' ? '⚡' : co === 'SQ Light' ? '💡' : '🔌'}</div>
                   </div>
                   <p className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest italic">কোম্পানি বকেয়া</p>
                   <p className={`text-4xl font-black italic tracking-tighter ${multiStats[co].balance > 0 ? 'text-slate-900' : 'text-emerald-500'}`}>{formatCurrency(multiStats[co].balance)}</p>
                   
                   <div className="mt-8 pt-8 border-t border-slate-50 space-y-4">
                      <div className="flex justify-between items-center">
                         <span className="text-[9px] font-black text-slate-400 uppercase">মোট মালামাল গেছে</span>
                         <span className="text-xs font-black text-slate-800">{formatCurrency(multiStats[co].totalBill)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                         <span className="text-[9px] font-black text-slate-400 uppercase">মোট নগদ জমা</span>
                         <span className="text-xs font-black text-emerald-600">{formatCurrency(multiStats[co].totalPaid)}</span>
                      </div>
                   </div>
                </div>
             </div>
           ))}
        </div>

        {/* Catalog Feed */}
        <div className="pt-10">
           <div className="flex justify-between items-end px-6 mb-8">
              <h3 className="text-3xl font-black uppercase italic tracking-tighter text-slate-900">ভিজ্যুয়াল ক্যাটালগ ও পোস্টার</h3>
              <span className="bg-slate-100 px-6 py-2.5 rounded-2xl text-[10px] font-black text-slate-500 uppercase">Live Feed</span>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
             {ads.map(ad => (
               <div key={ad.id} onClick={() => setSelectedAd(ad)} className="bg-white rounded-[4rem] border shadow-sm overflow-hidden group hover:shadow-2xl transition-all cursor-pointer">
                  <div className="aspect-[4/5] overflow-hidden bg-slate-50 relative">
                     {ad.image_url ? (
                        <img src={ad.image_url} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[3000ms] opacity-80" />
                     ) : (
                        <div className="w-full h-full flex items-center justify-center italic font-black text-slate-200 text-6xl uppercase">IFZA HUB</div>
                     )}
                     <div className="absolute top-8 left-8">
                        <span className={`px-6 py-2.5 rounded-2xl text-white text-[9px] font-black uppercase tracking-widest italic shadow-2xl border border-white/20 ${brandStyles[ad.company] || 'bg-slate-900'}`}>{ad.company}</span>
                     </div>
                  </div>
                  <div className="p-12">
                     <h3 className="text-2xl font-black italic text-slate-800 uppercase leading-tight mb-4">{ad.title}</h3>
                     <p className="text-sm text-slate-400 font-medium leading-relaxed italic line-clamp-2">"{ad.content}"</p>
                  </div>
               </div>
             ))}
           </div>
        </div>

        {/* Modal Viewer */}
        {selectedAd && (
          <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-3xl z-[3000] flex items-center justify-center p-4" onClick={() => setSelectedAd(null)}>
             <div className="w-full max-w-5xl bg-white rounded-[5rem] overflow-hidden flex flex-col lg:flex-row shadow-2xl text-black">
                <div className="flex-1 bg-slate-100 flex items-center justify-center">
                   <img src={selectedAd.image_url} className="max-h-[80vh] object-contain" />
                </div>
                <div className="w-full lg:w-[400px] p-12 flex flex-col justify-center">
                   <span className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase text-white mb-6 w-fit ${brandStyles[selectedAd.company]}`}>{selectedAd.company}</span>
                   <h3 className="text-4xl font-black uppercase italic mb-8">{selectedAd.title}</h3>
                   <p className="text-xl text-slate-500 italic mb-10 leading-relaxed">"{selectedAd.content}"</p>
                   <button className="w-full bg-slate-900 text-white py-6 rounded-3xl font-black uppercase text-xs">বন্ধ করুন</button>
                </div>
             </div>
          </div>
        )}
      </div>
    );
  }

  if (type === 'LEDGER') {
    return (
      <div className="space-y-6 pb-32 animate-reveal">
         <div className="bg-white p-2 rounded-[2.5rem] border shadow-sm flex gap-2">
            {companies.map(co => (
               <button key={co} onClick={() => setActiveCompany(co)} className={`flex-1 py-5 rounded-[2rem] text-[11px] font-black uppercase tracking-widest transition-all ${activeCompany === co ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50'}`}>
                  {co} লেজার
               </button>
            ))}
         </div>

         <div className={`p-12 rounded-[3.5rem] shadow-2xl flex flex-col md:flex-row justify-between items-center gap-10 text-white ${brandStyles[activeCompany]}`}>
            <div>
               <h3 className="text-3xl font-black uppercase italic tracking-tighter">{activeCompany} লেনদেন স্টেটমেন্ট</h3>
               <p className="text-[11px] text-white/60 font-black uppercase mt-2 italic">{user.name} • Official Records</p>
            </div>
            <div className="text-right">
               <p className="text-[11px] font-black text-white/50 uppercase italic mb-2">বর্তমান কোম্পানি বকেয়া</p>
               <p className="text-5xl font-black italic tracking-tighter">{formatCurrency(multiStats[activeCompany].balance)}</p>
            </div>
         </div>

         <div className="bg-white rounded-[4rem] border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
               <table className="w-full text-left">
                  <thead>
                     <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
                        <th className="p-10">তারিখ ও সময়</th>
                        <th className="p-10">বিবরণ (Description)</th>
                        <th className="p-10 text-right text-red-500">মালের বিল (Debit)</th>
                        <th className="p-10 text-right text-emerald-600">নগদ টাকা জমা (Credit)</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-[14px]">
                     {loading ? (
                       <tr><td colSpan={4} className="p-40 text-center animate-pulse text-slate-300 font-black text-xl uppercase">লোড হচ্ছে...</td></tr>
                     ) : ledger.length === 0 ? (
                       <tr><td colSpan={4} className="p-40 text-center text-slate-300 italic font-black uppercase text-xl">কোনো লেনদেন পাওয়া যায়নি</td></tr>
                     ) : ledger.map((tx, i) => (
                       <tr key={i} className="hover:bg-blue-50/30 transition-all">
                          <td className="p-10 font-bold">
                             <p className="text-slate-800">{new Date(tx.created_at).toLocaleDateString('bn-BD')}</p>
                             <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">{new Date(tx.created_at).toLocaleTimeString('bn-BD')}</p>
                          </td>
                          <td className="p-10">
                             <p className="font-black text-xs uppercase italic text-slate-700">
                                {tx.payment_type === 'COLLECTION' ? '💰 নগদ পেমেন্ট জমা' : `📄 মালের মেমো`}
                             </p>
                             <p className="text-[10px] font-black text-blue-500 mt-2">ID: #{tx.id.slice(-8).toUpperCase()}</p>
                          </td>
                          <td className="p-10 text-right font-black italic text-slate-900 text-2xl">
                             {tx.payment_type !== 'COLLECTION' ? `৳${Number(tx.amount).toLocaleString()}` : '—'}
                          </td>
                          <td className="p-10 text-right font-black italic text-emerald-600 text-2xl">
                             {tx.payment_type === 'COLLECTION' ? `৳${Number(tx.amount).toLocaleString()}` : '—'}
                          </td>
                       </tr>
                     ))}
                  </tbody>
               </table>
            </div>
         </div>
      </div>
    );
  }

  if (type === 'CATALOG') {
    return (
        <div className="space-y-10 pb-32 animate-reveal">
           <div className="bg-white p-2 rounded-[2.5rem] border shadow-sm flex gap-2">
              {companies.map(co => (
                 <button key={co} onClick={() => setActiveCompany(co)} className={`flex-1 py-5 rounded-[2rem] text-[11px] font-black uppercase tracking-widest transition-all ${activeCompany === co ? 'bg-slate-900 text-white shadow-xl' : 'text-slate-400 hover:bg-slate-50'}`}>
                    {co} রেট লিস্ট
                 </button>
              ))}
           </div>
           <div className="bg-white p-8 md:p-10 rounded-[3.5rem] border flex flex-col md:flex-row gap-8 shadow-sm items-center">
              <input className="flex-1 w-full p-6 bg-slate-50 border-none rounded-[2.5rem] font-black text-sm uppercase outline-none shadow-inner italic" placeholder={`${activeCompany} মডেল সার্চ করুন...`} value={search} onChange={e => setSearch(e.target.value)} />
              <div className={`${brandStyles[activeCompany]} text-white px-12 py-5 rounded-[2.5rem] text-[11px] font-black uppercase tracking-widest shadow-2xl italic shrink-0`}>
                 {activeCompany} Official Rates
              </div>
           </div>
           <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase())).map(p => (
                 <div key={p.id} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm group hover:shadow-2xl transition-all">
                    <h4 className="text-[14px] font-black uppercase italic text-slate-800 leading-tight mb-8 h-10 line-clamp-2">{p.name}</h4>
                    <div className="border-t pt-8 flex justify-between items-end">
                       <div>
                          <p className="text-[8px] font-black text-slate-300 uppercase mb-1.5 tracking-widest">Retail MRP</p>
                          <p className="font-black text-2xl text-slate-900 italic leading-none">৳{p.mrp}</p>
                       </div>
                       <p className="text-[8px] font-black text-blue-500 italic uppercase">UID: {p.id.slice(-4).toUpperCase()}</p>
                    </div>
                 </div>
              ))}
           </div>
        </div>
    );
  }

  return null;
};

export default CustomerPortal;
