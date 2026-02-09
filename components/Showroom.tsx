
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

  const brandColors: Record<string, string> = {
    'Transtec': 'from-amber-400 to-orange-600',
    'SQ Light': 'from-cyan-400 to-blue-600',
    'SQ careport': 'from-rose-500 to-red-700'
  };

  return (
    <div className="space-y-12 pb-40 animate-reveal">
      {/* Premium Hero Section */}
      <div className="relative bg-slate-900 p-12 md:p-20 rounded-[4rem] shadow-2xl overflow-hidden group">
         <div className="absolute right-[-20px] top-[-20px] text-[180px] opacity-5 font-black italic select-none group-hover:opacity-10 transition-opacity">HUB</div>
         <div className="relative z-10 max-w-3xl">
            <h2 className="text-4xl md:text-6xl font-black text-white uppercase italic tracking-tighter leading-none mb-6">Digital <br/> Showroom</h2>
            <p className="text-sm md:text-lg text-blue-400 font-medium italic opacity-80 leading-relaxed mb-10">
               আপনার ব্যবসার জন্য লেটেস্ট ক্যাটালগ এবং অফিসিয়াল প্রোডাক্ট গাইড এখন ডিজিটাল ফরমেটে। Transtec-এর অফিসিয়াল সাইট এবং আমাদের নিজস্ব কালেকশন এক জায়গায়।
            </p>
            
            <div className="flex gap-2 flex-wrap">
               {/* Fix: Changed SQ Cables to SQ careport */}
               {['ALL', 'Transtec', 'SQ Light', 'SQ careport'].map(b => (
                  <button key={b} onClick={() => setFilter(b)} className={`px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === b ? 'bg-white text-slate-900 shadow-xl' : 'bg-white/10 text-white/50 hover:bg-white/20'}`}>
                     {b}
                  </button>
               ))}
            </div>
         </div>
      </div>

      {/* Official Transtec Featured Resource */}
      {(filter === 'ALL' || filter === 'Transtec') && (
        <div className="bg-gradient-to-br from-amber-500/10 to-orange-600/10 p-10 md:p-16 rounded-[4rem] border border-orange-500/20 flex flex-col md:flex-row items-center justify-between gap-10">
           <div className="flex-1">
              <div className="flex items-center gap-4 mb-4">
                 <span className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center text-white text-2xl font-black italic">T</span>
                 <h3 className="text-2xl font-black uppercase italic tracking-tighter">Official Transtec Website</h3>
              </div>
              <p className="text-slate-500 font-medium italic">ট্র্যানটেকের অফিসিয়াল ওয়েবসাইটের প্রোডাক্ট ক্যাটালগ এবং টেকনিক্যাল স্পেসিফিকেশন সরাসরি ব্রাউজ করুন।</p>
           </div>
           <button onClick={() => window.open('https://www.transteclighting.com/products/', '_blank')} className="bg-slate-900 text-white px-12 py-6 rounded-3xl font-black uppercase text-[12px] tracking-[0.3em] shadow-2xl hover:bg-orange-600 transition-all active:scale-95">
              Browse Website ➔
           </button>
        </div>
      )}

      {/* Visual Catalog Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
        {loading ? (
          <div className="col-span-full py-40 text-center animate-pulse text-slate-300 font-black uppercase italic italic">Syncing Showroom...</div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full py-40 text-center bg-white rounded-[4rem] border border-slate-100 italic font-black text-slate-300">কোনো ক্যাটালগ আইটেম পাওয়া যায়নি</div>
        ) : filtered.map(item => (
          <div key={item.id} onClick={() => item.external_url ? window.open(item.external_url, '_blank') : setSelectedItem(item)} className="bg-white rounded-[4rem] border shadow-sm overflow-hidden group hover:shadow-2xl transition-all duration-1000 cursor-pointer">
             <div className="aspect-[4/5] relative overflow-hidden bg-slate-50">
                {item.image_url ? (
                  <img src={item.image_url} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[3000ms] opacity-90" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center italic font-black text-slate-200 text-5xl uppercase opacity-20">IFZA HUB</div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 flex flex-col justify-end p-12">
                   <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2 italic">{item.external_url ? 'Official Website Link' : 'Interactive Brochure'}</p>
                   <p className="text-white text-2xl font-black uppercase italic leading-none">View Details ➔</p>
                </div>
                <div className="absolute top-8 left-8">
                   <span className={`px-6 py-2.5 rounded-2xl text-white text-[9px] font-black uppercase tracking-widest italic shadow-2xl bg-gradient-to-r ${brandColors[item.company] || 'from-slate-700 to-slate-900'}`}>{item.company}</span>
                </div>
             </div>
             <div className="p-12">
                <h4 className="text-xl font-black uppercase italic text-slate-800 leading-tight mb-4 group-hover:text-blue-600 transition-colors">{item.title}</h4>
                <p className="text-[12px] text-slate-400 font-medium italic leading-relaxed line-clamp-2">"{item.content}"</p>
             </div>
          </div>
        ))}
      </div>

      {/* Fullscreen Viewer */}
      {selectedItem && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-3xl z-[3000] flex items-center justify-center p-4" onClick={() => setSelectedItem(null)}>
           <div className="bg-white rounded-[5rem] w-full max-w-6xl h-[85vh] overflow-hidden flex flex-col animate-reveal">
              <div className="h-28 px-10 md:px-20 flex justify-between items-center border-b border-white/5">
                 <div>
                    <h4 className="text-2xl font-black uppercase italic leading-none text-white">{selectedItem.title}</h4>
                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-2">IFZA Official Resources</p>
                 </div>
                 <button onClick={() => setSelectedItem(null)} className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-white text-2xl hover:bg-red-500 transition-colors">✕</button>
              </div>
              <div className="flex-1 overflow-y-auto p-10 md:p-20 custom-scroll">
                 <div className="max-w-6xl mx-auto space-y-20 pb-40">
                    <img src={selectedItem.image_url} className="w-full rounded-[4rem] shadow-2xl border border-white/10" />
                    <div className="bg-white/[0.03] p-12 md:p-20 rounded-[5rem] border border-white/5">
                       <p className="text-2xl md:text-4xl font-medium leading-[1.4] text-slate-200 italic">"{selectedItem.content}"</p>
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
