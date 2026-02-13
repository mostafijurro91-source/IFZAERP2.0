
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
           Enter Showroom ➔
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
                    <div className="w-full h-full flex items-center justify-center italic font-black text-6xl opacity-5 uppercase tracking-tighter text-white">IFZA HUB</div>
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

  const brandThemes: Record<string, { gradient: string, color: string, glow: string }> = {
    'Transtec': { gradient: 'from-amber-400 to-orange-600', color: 'text-amber-500', glow: 'shadow-amber-500/20' },
    'SQ Light': { gradient: 'from-cyan-400 to-blue-600', color: 'text-cyan-500', glow: 'shadow-cyan-500/20' },
    'SQ Cables': { gradient: 'from-rose-500 to-red-700', color: 'text-rose-500', glow: 'shadow-rose-500/20' }
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

      {/* 📁 REDESIGNED DIGITAL SHOWROOM VIEW */}
      {viewAllBrand ? (
        <div className="animate-reveal">
           {/* Cinematic Hero Section */}
           <section className="relative h-[60vh] flex items-center justify-center overflow-hidden">
              <div className={`absolute inset-0 bg-gradient-to-b ${brandThemes[viewAllBrand].gradient} opacity-20 blur-[100px] animate-pulse`}></div>
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
              
              <div className="relative z-10 text-center px-6">
                 <button onClick={() => setViewAllBrand(null)} className="mb-10 text-blue-400 font-black uppercase text-[11px] tracking-[0.4em] hover:tracking-[0.6em] transition-all flex items-center justify-center gap-4 mx-auto group">
                    <span className="group-hover:-translate-x-2 transition-transform">←</span> Return to Hub
                 </button>
                 <h2 className="text-6xl md:text-[10rem] font-black uppercase italic tracking-tighter text-white leading-none drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                    {viewAllBrand}
                 </h2>
                 <div className="flex items-center justify-center gap-6 mt-8">
                    <div className="h-px w-20 bg-white/20"></div>
                    <p className={`text-[12px] font-black uppercase tracking-[0.6em] italic ${brandThemes[viewAllBrand].color}`}>Digital Showroom</p>
                    <div className="h-px w-20 bg-white/20"></div>
                 </div>
              </div>
           </section>

           <section className="px-6 md:px-20 pb-60 max-w-[1600px] mx-auto">
              <div className="flex flex-col md:flex-row justify-between items-center mb-20 gap-8 bg-white/5 backdrop-blur-xl p-10 rounded-[3rem] border border-white/10 shadow-2xl">
                 <div>
                    <h4 className="text-xl font-black uppercase italic text-white leading-none">Curated Collection</h4>
                    <p className="text-slate-400 mt-2 text-[10px] font-bold uppercase tracking-widest italic">এক্সক্লুসিভ ডিজিটাল ক্যাটালগ ও প্রিমিয়াম প্রোডাক্ট রেঞ্জ</p>
                 </div>
                 <div className="flex items-center gap-10">
                    <div className="text-center">
                       <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Assets</p>
                       <p className="text-2xl font-black italic">{filteredViewAllAds.length}</p>
                    </div>
                    <div className="w-px h-12 bg-white/10"></div>
                    <div className="text-center">
                       <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mb-1">Live Sync</p>
                       <p className="text-2xl font-black italic text-emerald-500">Active</p>
                    </div>
                 </div>
              </div>

              {/* Showroom Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-12">
                 {filteredViewAllAds.map((ad, i) => (
                   <div 
                     key={ad.id} 
                     onClick={() => handleCardClick(ad)}
                     className={`bg-[#0d121f]/40 backdrop-blur-xl rounded-[4rem] border border-white/5 overflow-hidden group hover:shadow-2xl transition-all duration-1000 animate-reveal cursor-pointer hover:border-blue-500/30 ${brandThemes[viewAllBrand].glow}`}
                     style={{ animationDelay: `${i * 0.1}s` }}
                   >
                      <div className="aspect-[4/5] overflow-hidden relative">
                         {ad.image_url ? (
                           <img src={ad.image_url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[4000ms] opacity-80 group-hover:opacity-100" />
                         ) : (
                           <div className="w-full h-full flex items-center justify-center opacity-5 font-black text-6xl italic uppercase">IFZA</div>
                         )}
                         
                         {/* Hover Overlay */}
                         <div className="absolute inset-0 bg-gradient-to-t from-[#020408] via-transparent to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-700 flex flex-col justify-end p-12">
                            <span className={`inline-block px-5 py-2 rounded-xl text-[9px] font-black uppercase italic mb-4 w-fit bg-gradient-to-r text-white ${brandThemes[viewAllBrand].gradient}`}>
                               {ad.type.replace('_', ' ')}
                            </span>
                            <h4 className="text-2xl font-black uppercase italic text-white leading-tight mb-4 group-hover:translate-x-2 transition-transform duration-500">{ad.title}</h4>
                            <div className="flex items-center gap-4 group-hover:translate-x-2 transition-transform duration-700 delay-75">
                               <p className="text-[9px] font-black text-blue-400 uppercase tracking-[0.3em]">View Assets</p>
                               <span className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-slate-900 text-lg font-black italic">➔</span>
                            </div>
                         </div>
                      </div>
                      <div className="p-12 border-t border-white/5 bg-gradient-to-b from-transparent to-black/20">
                         <p className="text-slate-400 text-[13px] font-medium leading-relaxed italic line-clamp-2">"{ad.content}"</p>
                         <div className="mt-8 flex items-center justify-between opacity-30">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest italic">{new Date(ad.created_at).toLocaleDateString('bn-BD')}</span>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest italic">REF: #{ad.id.slice(-4).toUpperCase()}</span>
                         </div>
                      </div>
                   </div>
                 ))}
              </div>

              {/* Quick Switcher at bottom */}
              <div className="mt-60 border-t border-white/5 pt-20 text-center">
                 <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em] mb-12 italic">Switch Brands</p>
                 <div className="flex flex-wrap justify-center gap-6">
                    {['Transtec', 'SQ Light', 'SQ Cables'].filter(b => b !== viewAllBrand).map(brand => (
                       <button 
                         key={brand}
                         onClick={() => { setViewAllBrand(brand); window.scrollTo(0,0); }}
                         className="px-12 py-6 bg-white/5 hover:bg-white/10 border border-white/5 rounded-[2rem] font-black uppercase text-[11px] tracking-widest transition-all hover:scale-105 active:scale-95"
                       >
                          Open {brand} Showroom ➔
                       </button>
                    ))}
                 </div>
              </div>
           </section>
        </div>
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
                      themeClass="from-amber-400 to-orange-600"
                   />

                   <BrandSlider 
                      brand="SQ Light" 
                      ads={ads.filter(a => a.company === 'SQ Light')} 
                      onCardClick={handleCardClick}
                      onSeeAll={setViewAllBrand}
                      themeClass="from-cyan-400 to-blue-600"
                   />

                   <BrandSlider 
                      brand="SQ Cables" 
                      ads={ads.filter(a => a.company === 'SQ Cables')} 
                      onCardClick={handleCardClick}
                      onSeeAll={setViewAllBrand}
                      themeClass="from-rose-500 to-red-700"
                   />
                </>
             )}
          </section>
        </>
      )}

      {/* Detail Modal - Enhanced Cinematic Style */}
      {selectedAd && (
         <div className="fixed inset-0 bg-black/98 z-[2000] backdrop-blur-3xl flex flex-col animate-reveal">
            <div className="h-28 px-10 md:px-20 flex justify-between items-center border-b border-white/5 bg-black/40">
               <div>
                  <h4 className="text-2xl font-black uppercase italic leading-none text-white">{selectedAd.title}</h4>
                  <p className="text-[9px] text-blue-500 font-black uppercase tracking-widest mt-2 italic">IFZA Enterprise Showroom Asset</p>
               </div>
               <button onClick={() => setSelectedAd(null)} className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-2xl hover:bg-red-500 transition-all text-white active:scale-90">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 md:p-20 custom-scroll">
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
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em] italic">Product Briefing Complete</p>
                     </div>
                  </div>
               </div>
            </div>
         </div>
      )}

      <footer className="py-40 border-t border-white/5 text-center relative">
         <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.05)_0%,transparent_50%)]"></div>
         <div className="relative z-10">
            <div className="text-4xl font-black italic tracking-tighter lowercase mb-8">ifza<span className="text-blue-500">.</span>electronics</div>
            <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.8em] italic">Transtec • SQ Light • SQ Cables</p>
         </div>
      </footer>
    </div>
  );
};

export default MarketingPage;
