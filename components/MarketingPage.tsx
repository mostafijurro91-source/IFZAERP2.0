
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Advertisement } from '../types';

interface MarketingPageProps {
  onEnterERP: () => void;
}

const MarketingPage: React.FC<MarketingPageProps> = ({ onEnterERP }) => {
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeBrand, setActiveBrand] = useState<string>('ALL');
  const [selectedAd, setSelectedAd] = useState<Advertisement | null>(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    fetchCatalogs();
    
    // Listen for the custom event from index.html
    const handleInstallable = () => setCanInstall(true);
    window.addEventListener('pwa-installable', handleInstallable);
    
    // Check if already in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches) {
        setCanInstall(false);
    }

    return () => window.removeEventListener('pwa-installable', handleInstallable);
  }, []);

  const handleInstallClick = async () => {
    const promptEvent = (window as any).deferredPrompt;
    if (!promptEvent) return;
    
    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    console.log(`User response to install prompt: ${outcome}`);
    (window as any).deferredPrompt = null;
    setCanInstall(false);
  };

  const fetchCatalogs = async () => {
    try {
      const { data } = await supabase.from('advertisements').select('*').order('created_at', { ascending: false });
      setAds(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const filteredAds = ads.filter(ad => activeBrand === 'ALL' || ad.company === activeBrand);

  const brandStyles: Record<string, string> = {
    'Transtec': 'from-amber-400 to-orange-600',
    'SQ Light': 'from-cyan-400 to-blue-600',
    'SQ Cables': 'from-rose-500 to-red-700'
  };

  const handleCardClick = (ad: Advertisement) => {
    if (ad.external_url) {
      window.open(ad.external_url, '_blank');
    } else {
      setSelectedAd(ad);
    }
  };

  return (
    <div className="min-h-screen bg-[#020408] text-white font-sans selection:bg-blue-500/30 overflow-x-hidden custom-scroll">
      
      {/* 📱 PWA SMART INSTALL BANNER */}
      {canInstall && (
        <div className="fixed top-0 inset-x-0 z-[2000] bg-blue-600 p-4 md:px-20 flex justify-between items-center shadow-2xl animate-reveal border-b border-white/20">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-600 text-xl font-black italic shadow-lg">ই</div>
              <div className="hidden sm:block">
                 <p className="text-white font-black text-[12px] uppercase italic leading-none">ইফজা ইআরপি অ্যাপ</p>
                 <p className="text-white/60 text-[8px] font-bold uppercase tracking-widest mt-1">দ্রুত ব্যবহারের জন্য ইন্সটল করুন</p>
              </div>
           </div>
           <div className="flex items-center gap-3">
              <button onClick={() => setCanInstall(false)} className="text-white/40 font-black text-xs px-4 hover:text-white transition-colors">পরে</button>
              <button onClick={handleInstallClick} className="bg-white text-blue-600 px-6 py-2.5 rounded-full font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all">ইন্সটল করুন ➔</button>
           </div>
        </div>
      )}

      <nav className={`fixed ${canInstall ? 'top-[72px]' : 'top-0'} inset-x-0 h-24 bg-black/40 backdrop-blur-2xl z-[1000] border-b border-white/5 flex justify-between items-center px-6 md:px-20 transition-all duration-500`}>
        <div className="flex items-center gap-4 group cursor-pointer">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center font-black italic shadow-[0_0_30px_rgba(37,99,235,0.4)] group-hover:scale-110 transition-transform text-white">if</div>
          <div className="text-2xl font-black italic tracking-tighter uppercase leading-none text-white">
            ifza<span className="text-blue-500">.</span>electronics
            <p className="text-[7px] tracking-[0.6em] text-slate-500 mt-1 font-bold uppercase">Official Enterprise Hub</p>
          </div>
        </div>
        <button onClick={onEnterERP} className="bg-blue-600 text-white px-8 py-3.5 rounded-full font-black uppercase text-[10px] tracking-widest shadow-[0_0_20px_rgba(37,99,235,0.3)] active:scale-95 transition-all hover:bg-blue-700 hover:shadow-blue-500/40">
          Staff Portal ➔
        </button>
      </nav>

      <section className="relative pt-60 pb-20 px-6 overflow-hidden">
         <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.08)_0%,transparent_70%)] pointer-events-none"></div>
         <div className="relative z-10 max-w-7xl mx-auto text-center">
            <h1 className="text-5xl md:text-9xl font-black uppercase italic tracking-tighter leading-tight mb-8 animate-reveal text-white">
               IFZA <br/>
               <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 italic">Electronics Group</span>
            </h1>
            <p className="text-slate-400 text-sm md:text-xl max-w-3xl mx-auto font-medium leading-relaxed mb-16 opacity-80 animate-reveal">
               স্বাগতম অফিসিয়াল ডিজিটাল হাবে। Transtec, SQ Light এবং SQ Cables-এর সকল ক্যাটালগ, অফার এবং ডিস্ট্রিবিউশন এখন একই সাথে।
            </p>

            <div className="flex justify-center gap-3 md:gap-4 flex-wrap animate-reveal">
               {['ALL', 'Transtec', 'SQ Light', 'SQ Cables'].map(b => (
                  <button 
                    key={b} 
                    onClick={() => setActiveBrand(b)} 
                    className={`px-10 py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                      activeBrand === b 
                      ? 'bg-blue-600 text-white border-blue-600 shadow-[0_0_30px_rgba(37,99,235,0.4)] scale-105' 
                      : 'bg-white/5 text-slate-400 border-white/5 hover:border-blue-500/40 hover:text-blue-400'
                    }`}
                  >
                     {b}
                  </button>
               ))}
            </div>
         </div>
      </section>

      <section className="px-6 md:px-20 pb-60 max-w-[1600px] mx-auto">
         <div className="flex items-center gap-4 mb-14 border-l-4 border-blue-600 pl-6">
            <h2 className="text-3xl font-black uppercase italic tracking-tighter text-white">Live Catalog</h2>
            <div className="h-px flex-1 bg-white/10"></div>
         </div>
         {loading ? (
            <div className="py-40 text-center animate-pulse font-black uppercase tracking-widest text-slate-600 italic">Connecting to Cloud...</div>
         ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
               {filteredAds.map((ad, idx) => (
                  <div key={ad.id} onClick={() => handleCardClick(ad)} className="group relative bg-[#0d121f]/40 backdrop-blur-md rounded-[4rem] overflow-hidden border border-white/5 cursor-pointer hover:border-blue-500/40 transition-all duration-1000 animate-reveal" style={{ animationDelay: `${idx * 0.1}s` }}>
                     <div className="aspect-[3/4] relative overflow-hidden">
                        {ad.image_url ? (
                           <img src={ad.image_url} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[3000ms] opacity-80" />
                        ) : (
                           <div className="w-full h-full flex items-center justify-center bg-slate-900/50 italic font-black text-6xl opacity-5 uppercase tracking-tighter">IFZA HUB</div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#020408] via-transparent to-transparent"></div>
                        <div className="absolute inset-0 p-12 flex flex-col justify-end">
                           <div className={`inline-block px-5 py-2 rounded-xl text-[10px] font-black uppercase italic mb-6 w-fit bg-gradient-to-r text-white ${brandStyles[ad.company]}`}>{ad.company}</div>
                           <h3 className="text-3xl font-black uppercase italic leading-[1.1] mb-6 text-white">{ad.title}</h3>
                           <div className="flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-all duration-700">
                              <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">{ad.external_url ? 'Visit Website' : 'View Catalog'}</span>
                              <div className="flex-1 h-px bg-blue-500/30"></div>
                              <span className="text-2xl text-white">➔</span>
                           </div>
                        </div>
                     </div>
                  </div>
               ))}
            </div>
         )}
      </section>

      {selectedAd && (
         <div className="fixed inset-0 bg-black/98 z-[2000] backdrop-blur-3xl flex flex-col animate-reveal">
            <div className="h-28 px-10 md:px-20 flex justify-between items-center border-b border-white/5">
               <div>
                  <h4 className="text-2xl font-black uppercase italic leading-none text-white">{selectedAd.title}</h4>
                  <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-2">IFZA Official Release</p>
               </div>
               <button onClick={() => setSelectedAd(null)} className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-2xl hover:bg-red-500 transition-all text-white">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 md:p-20 custom-scroll">
               <div className="max-w-6xl mx-auto space-y-20 pb-40">
                  <img src={selectedAd.image_url} className="w-full rounded-[4rem] shadow-2xl border border-white/10" />
                  <div className="bg-white/[0.03] p-12 md:p-20 rounded-[5rem] border border-white/5">
                     <p className="text-2xl md:text-4xl font-medium leading-[1.4] text-slate-200 italic">"{selectedAd.content}"</p>
                  </div>
               </div>
            </div>
         </div>
      )}

      <footer className="py-40 border-t border-white/5 text-center relative">
         <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.05)_0%,transparent_50%)]"></div>
         <div className="relative z-10">
            <div className="text-4xl font-black italic tracking-tighter lowercase mb-8 text-white">ifza<span className="text-blue-500">.</span>electronics</div>
            <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.8em]">Transtec • SQ Light • SQ Cables • IFZAERP.COM</p>
         </div>
      </footer>
    </div>
  );
};

export default MarketingPage;