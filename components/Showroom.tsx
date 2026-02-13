
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Advertisement, Company } from '../types';

const Showroom: React.FC = () => {
  const [catalogs, setCatalogs] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('ALL');
  const [selectedItem, setSelectedItem] = useState<Advertisement | null>(null);

  useEffect(() => {
    fetchShowroom();
  }, []);

  const fetchShowroom = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('advertisements')
        .select('*')
        .order('created_at', { ascending: false });
      setCatalogs(data || []);
    } finally {
      setLoading(false);
    }
  };

  const filtered = catalogs.filter(c => filter === 'ALL' || c.company === filter);

  const brandThemes: Record<string, { gradient: string, color: string, glow: string, bg: string }> = {
    'Transtec': { gradient: 'from-amber-400 to-orange-600', color: 'text-amber-500', glow: 'shadow-amber-500/20', bg: 'bg-amber-500/10' },
    'SQ Light': { gradient: 'from-cyan-400 to-blue-600', color: 'text-cyan-500', glow: 'shadow-cyan-500/20', bg: 'bg-cyan-500/10' },
    'SQ Cables': { gradient: 'from-rose-500 to-red-700', color: 'text-rose-500', glow: 'shadow-rose-500/20', bg: 'bg-rose-500/10' },
    'ALL': { gradient: 'from-blue-600 to-indigo-700', color: 'text-blue-500', glow: 'shadow-blue-500/20', bg: 'bg-blue-600/10' }
  };

  const activeTheme = brandThemes[filter] || brandThemes['ALL'];

  return (
    <div className="space-y-12 pb-40 animate-reveal text-white">
      
      {/* 🎭 CINEMATIC HERO HEADER */}
      <section className="relative h-[400px] rounded-[4rem] overflow-hidden border border-white/5 shadow-2xl flex items-center justify-center">
         <div className={`absolute inset-0 bg-gradient-to-br ${activeTheme.gradient} opacity-20 blur-[100px] animate-pulse`}></div>
         <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
         
         <div className="relative z-10 text-center px-6">
            <p className={`text-[10px] font-black uppercase tracking-[0.6em] mb-6 italic ${activeTheme.color}`}>Official Digital Gallery</p>
            <h2 className="text-5xl md:text-8xl font-black uppercase italic tracking-tighter leading-none drop-shadow-2xl">
               {filter === 'ALL' ? 'IFZA SHOWROOM' : filter}
            </h2>
            <div className="flex items-center justify-center gap-6 mt-8">
               <div className="h-px w-16 bg-white/20"></div>
               <p className="text-slate-400 text-[11px] font-bold uppercase tracking-widest italic">প্রিমিয়াম ডিজিটাল ক্যাটালগ কালেকশন</p>
               <div className="h-px w-16 bg-white/20"></div>
            </div>
         </div>

         {/* 🔘 BRAND PICKER OVERLAY */}
         <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2 p-2 bg-black/40 backdrop-blur-3xl rounded-[2rem] border border-white/10 shadow-2xl z-20">
            {['ALL', 'Transtec', 'SQ Light', 'SQ Cables'].map(b => (
               <button 
                 key={b} 
                 onClick={() => setFilter(b)} 
                 className={`px-6 py-3 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${filter === b ? 'bg-white text-slate-900 shadow-xl scale-105' : 'text-white/40 hover:text-white'}`}
               >
                  {b}
               </button>
            ))}
         </div>
      </section>

      {/* 💎 SHOWCASE GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
        {loading ? (
          <div className="col-span-full py-40 text-center">
             <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
             <p className="animate-pulse text-slate-500 font-black uppercase tracking-widest text-xs italic">Syncing Showroom Assets...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full py-40 text-center bg-white/5 rounded-[4rem] border border-white/5 italic font-black text-slate-500 uppercase tracking-[0.4em]">
             No Assets Available
          </div>
        ) : filtered.map((item, i) => (
          <div 
            key={item.id} 
            onClick={() => item.external_url ? window.open(item.external_url, '_blank') : setSelectedItem(item)} 
            className={`bg-[#0d121f]/40 backdrop-blur-xl rounded-[4rem] border border-white/5 overflow-hidden group hover:shadow-2xl transition-all duration-1000 cursor-pointer animate-reveal ${brandThemes[item.company]?.glow}`}
            style={{ animationDelay: `${i * 0.1}s` }}
          >
             <div className="aspect-[4/5] relative overflow-hidden bg-slate-900">
                {item.image_url ? (
                  <img src={item.image_url} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[4000ms] opacity-80 group-hover:opacity-100" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center italic font-black text-slate-700 text-5xl uppercase opacity-20">IFZA</div>
                )}
                
                {/* 🌈 OVERLAY INFO */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#020408] via-transparent to-transparent opacity-80 group-hover:opacity-100 transition-opacity duration-700 flex flex-col justify-end p-12">
                   <div className="flex gap-2 mb-4">
                      <span className={`px-4 py-1.5 rounded-xl text-white text-[8px] font-black uppercase tracking-widest italic shadow-2xl bg-gradient-to-r ${brandThemes[item.company]?.gradient}`}>
                         {item.company}
                      </span>
                      <span className="px-4 py-1.5 rounded-xl text-white/60 bg-white/10 text-[8px] font-black uppercase tracking-widest italic">
                         {item.type.replace('_', ' ')}
                      </span>
                   </div>
                   <h4 className="text-2xl font-black uppercase italic text-white leading-tight mb-4 group-hover:translate-x-2 transition-transform duration-500">{item.title}</h4>
                   <div className="flex items-center gap-4 group-hover:translate-x-2 transition-transform duration-700 delay-75">
                      <p className="text-[9px] font-black text-blue-400 uppercase tracking-[0.3em]">View Assets</p>
                      <span className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-slate-900 text-lg font-black italic">➔</span>
                   </div>
                </div>
             </div>
             
             {/* 📝 CARD BOTTOM DESCRIPTION */}
             <div className="p-10 border-t border-white/5 bg-gradient-to-b from-transparent to-black/20">
                <p className="text-slate-400 text-[13px] font-medium italic leading-relaxed line-clamp-2">"{item.content}"</p>
                <div className="mt-8 flex items-center justify-between opacity-30 border-t border-white/5 pt-6">
                   <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{new Date(item.created_at).toLocaleDateString('bn-BD')}</span>
                   <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">REF: #{item.id.slice(-4).toUpperCase()}</span>
                </div>
             </div>
          </div>
        ))}
      </div>

      {/* 🎞️ CINEMATIC DETAIL MODAL */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-3xl z-[5000] flex flex-col animate-reveal" onClick={() => setSelectedItem(null)}>
           <div className="h-28 px-10 md:px-20 flex justify-between items-center border-b border-white/5 bg-black/40" onClick={e => e.stopPropagation()}>
              <div>
                 <h4 className="text-2xl font-black uppercase italic leading-none text-white">{selectedItem.title}</h4>
                 <p className="text-[9px] text-blue-500 font-black uppercase tracking-widest mt-2 italic">IFZA Official Resources • {selectedItem.company}</p>
              </div>
              <button onClick={() => setSelectedItem(null)} className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-white text-2xl hover:bg-red-500 transition-all active:scale-90">✕</button>
           </div>
           
           <div className="flex-1 overflow-y-auto p-6 md:p-20 custom-scroll" onClick={e => e.stopPropagation()}>
              <div className="max-w-7xl mx-auto space-y-24 pb-40">
                 {selectedItem.image_url && (
                    <div className="relative group">
                       <div className={`absolute inset-0 blur-[150px] opacity-30 rounded-full ${brandThemes[selectedItem.company]?.bg}`}></div>
                       <img src={selectedItem.image_url} className="w-full rounded-[4rem] shadow-2xl border border-white/10 relative z-10" />
                    </div>
                 )}
                 <div className="bg-white/[0.03] p-12 md:p-24 rounded-[6rem] border border-white/5 relative overflow-hidden text-center">
                    <div className="absolute top-10 left-10 text-9xl font-black text-white/5 select-none italic">"</div>
                    <p className="text-2xl md:text-5xl font-medium leading-[1.3] text-slate-100 italic relative z-10 max-w-5xl mx-auto">{selectedItem.content}</p>
                    <div className="mt-16 flex flex-col items-center gap-4 relative z-10">
                       <span className="h-px w-20 bg-blue-500/40"></span>
                       <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em] italic">Product Briefing Complete</p>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Showroom;
