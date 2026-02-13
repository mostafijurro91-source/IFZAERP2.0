
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Advertisement, Company } from '../types';

interface MarketingPageProps {
  onEnterERP: () => void;
}

// 🎡 Individual Brand Slider Component
const BrandSlider: React.FC<{ 
  brand: string, 
  ads: Advertisement[], 
  onCardClick: (ad: Advertisement) => void,
  onSeeAll: (brand: string) => void,
  themeClass: string
}> = ({ brand, ads, onCardClick, onSeeAll, themeClass }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const sliderIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (ads.length > 1) {
      sliderIntervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % ads.length);
      }, 4000 + Math.random() * 2000);
    }
    return () => {
      if (sliderIntervalRef.current) clearInterval(sliderIntervalRef.current);
    };
  }, [ads.length]);

  if (ads.length === 0) return null;

  const accentColor = themeClass.includes('amber') ? '#fbbf24' : themeClass.includes('cyan') ? '#22d3ee' : '#f43f5e';

  return (
    <div className="mb-24 animate-reveal">
      <div className="flex justify-between items-end mb-10 border-l-4 pl-6" style={{ borderColor: accentColor }}>
         <div>
            <h2 className="text-3xl md:text-4xl font-black uppercase italic tracking-tighter text-white">
               {brand} <span className="text-blue-500 opacity-50">Live Catalog</span>
            </h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-2">এক্সক্লুসিভ কালেকশন ও অফার</p>
         </div>
         <button 
           onClick={() => onSeeAll(brand)}
           className="px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase text-blue-400 tracking-widest hover:bg-blue-600 hover:text-white transition-all active:scale-95 shadow-xl"
         >
           See All ➔
         </button>
      </div>

      <div className="relative group/slider overflow-hidden rounded-[3rem] border border-white/5 shadow-2xl">
         <div className="relative h-[450px] md:h-[600px] w-full bg-[#0d121f]/40 backdrop-blur-md">
            {ads.map((ad, idx) => (
              <div 
                key={ad.id} 
                onClick={() => onCardClick(ad)}
                className={`absolute inset-0 transition-all duration-1000 ease-in-out cursor-pointer ${
                  idx === currentIndex ? 'opacity-100 scale-100 z-20' : 'opacity-0 scale-105 pointer-events-none z-10'
                }`}
              >
                 {ad.image_url ? (
                    <img src={ad.image_url} alt="" className="w-full h-full object-cover opacity-80" />
                 ) : (
                    <div className="w-full h-full flex items-center justify-center italic font-black text-6xl opacity-5 uppercase tracking-tighter">IFZA HUB</div>
                 )}
                 
                 <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent flex flex-col justify-end p-10 md:p-16">
                    <div className={`inline-block px-5 py-1.5 rounded-full text-[9px] font-black uppercase italic mb-4 w-fit bg-gradient-to-r text-white shadow-xl ${themeClass}`}>
                       {ad.type.replace('_', ' ')}
                    </div>
                    <h3 className="text-3xl md:text-6xl font-black uppercase italic leading-tight mb-4 text-white max-w-4xl tracking-tighter drop-shadow-2xl">
                       {ad.title}
                    </h3>
                    <div className="flex items-center gap-4">
                       <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400">বিস্তারিত দেখতে ক্লিক করুন</span>
                       <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-900 text-xl font-black shadow-2xl group-hover/slider:scale-110 transition-transform">➔</div>
                    </div>
                 </div>
              </div>
            ))}
         </div>

         <div className="absolute bottom-8 right-12 z-30 flex gap-2">
            {ads.map((_, idx) => (
              <button 
                key={idx} 
                onClick={(e) => { e.stopPropagation(); setCurrentIndex(idx); }}
                className={`h-1 transition-all duration-500 rounded-full ${
                  idx === currentIndex ? 'w-10 bg-blue-500' : 'w-2 bg-white/20 hover:bg-white/40'
                }`}
              ></button>
            ))}
         </div>
      </div>
    </div>
  );
};

const MarketingPage: React.FC<MarketingPageProps> = ({ onEnterERP }) => {
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAd, setSelectedAd] = useState<Advertisement | null>(null);
  const [viewAllBrand, setViewAllBrand] = useState<string | null>(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    fetchCatalogs();
    const handleInstallable = () => setCanInstall(true);
    window.addEventListener('pwa-installable', handleInstallable);
    return () => window.removeEventListener('pwa-installable', handleInstallable);
  }, []);

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

  const handleInstallClick = async () => {
    const promptEvent = (window as any).deferredPrompt;
    if (!promptEvent) return;
    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    (window as any).deferredPrompt = null;
    setCanInstall(false);
  };

  const brandThemes: Record<string, string> = {
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

  const filteredViewAllAds = ads.filter(a => a.company === viewAllBrand);

  return (
    <div className="min-h-screen bg-[#020408] text-white font-sans selection:bg-blue-500/30 overflow-x-hidden custom-scroll">
      
      {canInstall && (
        <div className="fixed top-0 inset-x-0 z-[2000] bg-blue-600 p-4 md:px-20 flex justify-between items-center shadow-2xl animate-reveal border-b border-white/20">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-600 text-xl font-black italic shadow-lg">ই</div>
              <div className="hidden sm:block">
                 <p className="text-white font-black text-[12px] uppercase italic leading-none">ইফজা ইআরপি অ্যাপ</p>
                 <p className="text-white/60 text-[8px] font-bold uppercase tracking-widest mt-1">দ্রুত ব্যবহারের জন্য ইন্সটল করুন</p>
              </div>
           </div>
           <button onClick={handleInstallClick} className="bg-white text-blue-600 px-6 py-2.5 rounded-full font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all">ইন্সটল ➔</button>
        </div>
      )}

      <nav className={`fixed ${canInstall ? 'top-[72px]' : 'top-0'} inset-x-0 h-24 bg-black/40 backdrop-blur-2xl z-[1000] border-b border-white/5 flex justify-between items-center px-6 md:px-20 transition-all duration-500`}>
        <div className="flex items-center gap-4 cursor-pointer" onClick={() => setViewAllBrand(null)}>
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center font-black italic shadow-lg text-white">if</div>
          <div className="text-2xl font-black italic tracking-tighter uppercase leading-none text-white">
            ifza<span className="text-blue-500">.</span>electronics
          </div>
        </div>
        <button onClick={onEnterERP} className="bg-blue-600 text-white px-8 py-3.5 rounded-full font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 hover:bg-blue-700">
          Staff Portal ➔
        </button>
      </nav>

      {/* 📁 FULL CATALOG GRID VIEW (Another Page Effect) */}
      {viewAllBrand ? (
        <section className="pt-40 pb-60 px-6 md:px-20 max-w-[1500px] mx-auto animate-reveal">
           <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-20 gap-8">
              <div>
                 <button onClick={() => setViewAllBrand(null)} className="text-blue-400 font-black uppercase text-[10px] tracking-widest mb-6 block hover:translate-x-[-10px] transition-transform">← Back to Home</button>
                 <h2 className="text-4xl md:text-7xl font-black uppercase italic tracking-tighter text-white leading-none">
                    {viewAllBrand} <span className="text-blue-500 opacity-30">Full Catalog</span>
                 </h2>
                 <p className="text-slate-400 mt-4 font-medium italic">সিরিয়াল অনুযায়ী সকল প্রোডাক্ট ও অফারের তালিকা।</p>
              </div>
              <div className="px-8 py-4 bg-white/5 rounded-[2rem] border border-white/10">
                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">আইটেম সংখ্যা: {filteredViewAllAds.length}</p>
              </div>
           </div>

           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
              {filteredViewAllAds.map((ad, i) => (
                <div 
                  key={ad.id} 
                  onClick={() => handleCardClick(ad)}
                  className="bg-[#0d121f]/60 rounded-[3rem] border border-white/5 overflow-hidden group hover:shadow-2xl hover:border-blue-500/30 transition-all duration-700 animate-reveal cursor-pointer"
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                   <div className="aspect-[4/3] overflow-hidden relative bg-slate-900">
                      {ad.image_url ? (
                        <img src={ad.image_url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[3000ms] opacity-90" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center opacity-5 font-black text-4xl">IFZA</div>
                      )}
                      <div className="absolute top-6 left-6">
                         <span className={`px-4 py-1.5 rounded-xl text-white text-[8px] font-black uppercase tracking-widest italic shadow-2xl ${brandThemes[viewAllBrand]}`}>{ad.type}</span>
                      </div>
                   </div>
                   <div className="p-10">
                      <h4 className="text-xl font-black uppercase italic text-white leading-tight mb-4 group-hover:text-blue-400 transition-colors">{ad.title}</h4>
                      <p className="text-slate-500 text-xs font-medium leading-relaxed line-clamp-3">"{ad.content}"</p>
                      <div className="mt-8 flex items-center justify-between">
                         <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{new Date(ad.created_at).toLocaleDateString('bn-BD')}</span>
                         <span className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-blue-500 group-hover:bg-blue-600 group-hover:text-white transition-all">➔</span>
                      </div>
                   </div>
                </div>
              ))}
           </div>

           <div className="mt-40 text-center">
              <button onClick={() => setViewAllBrand(null)} className="px-14 py-6 bg-white text-slate-950 rounded-full font-black uppercase text-xs tracking-widest shadow-2xl active:scale-95 transition-all">ফিরে যান (Back to Home)</button>
           </div>
        </section>
      ) : (
        <>
          <section className="relative pt-60 pb-20 px-6 text-center">
             <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.08)_0%,transparent_70%)] pointer-events-none"></div>
             <h1 className="text-6xl md:text-9xl font-black uppercase italic tracking-tighter leading-tight mb-8 animate-reveal">
                IFZA <br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 italic">Enterprise Hub</span>
             </h1>
             <p className="text-slate-400 text-sm md:text-xl max-w-2xl mx-auto font-medium leading-relaxed mb-20 opacity-80">
                স্বাগতম অফিসিয়াল ডিজিটাল হাবে। ট্র্যানটেক, এসকিউ লাইট এবং এসকিউ কেবলস-এর সকল ক্যাটালগ এখন একই সাথে।
             </p>
          </section>

          {/* 🎡 INDIVIDUAL BRAND SLIDERS */}
          <section className="px-6 md:px-20 pb-60 max-w-[1500px] mx-auto space-y-32">
             {loading ? (
                <div className="py-40 text-center animate-pulse font-black uppercase tracking-widest text-slate-600 italic">Syncing Catalogs...</div>
             ) : (
                <>
                   <BrandSlider 
                      brand="Transtec" 
                      ads={ads.filter(a => a.company === 'Transtec')} 
                      onCardClick={handleCardClick}
                      onSeeAll={setViewAllBrand}
                      themeClass={brandThemes['Transtec']}
                   />

                   <BrandSlider 
                      brand="SQ Light" 
                      ads={ads.filter(a => a.company === 'SQ Light')} 
                      onCardClick={handleCardClick}
                      onSeeAll={setViewAllBrand}
                      themeClass={brandThemes['SQ Light']}
                   />

                   <BrandSlider 
                      brand="SQ Cables" 
                      ads={ads.filter(a => a.company === 'SQ Cables')} 
                      onCardClick={handleCardClick}
                      onSeeAll={setViewAllBrand}
                      themeClass={brandThemes['SQ Cables']}
                   />
                </>
             )}
          </section>
        </>
      )}

      {/* Detail Modal */}
      {selectedAd && (
         <div className="fixed inset-0 bg-black/98 z-[2000] backdrop-blur-3xl flex flex-col animate-reveal">
            <div className="h-28 px-10 md:px-20 flex justify-between items-center border-b border-white/5">
               <div>
                  <h4 className="text-2xl font-black uppercase italic leading-none text-white">{selectedAd.title}</h4>
                  <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-2">Official Digital Release</p>
               </div>
               <button onClick={() => setSelectedAd(null)} className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-2xl hover:bg-red-500 transition-all text-white">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 md:p-20 custom-scroll">
               <div className="max-w-6xl mx-auto space-y-20 pb-40">
                  {selectedAd.image_url && (
                    <img src={selectedAd.image_url} className="w-full rounded-[4rem] shadow-2xl border border-white/10" />
                  )}
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
            <div className="text-4xl font-black italic tracking-tighter lowercase mb-8">ifza<span className="text-blue-500">.</span>electronics</div>
            <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.8em]">Transtec • SQ Light • SQ Cables</p>
         </div>
      </footer>
    </div>
  );
};

export default MarketingPage;
