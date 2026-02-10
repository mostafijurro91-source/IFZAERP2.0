
import React, { useState, useEffect, useRef } from 'react';
import { Company, Advertisement } from '../types';
import { supabase } from '../lib/supabase';

const AdManager: React.FC = () => {
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [dbStatus, setDbStatus] = useState<'CHECKING' | 'CONNECTED' | 'ERROR'>('CHECKING');
  const [editingAd, setEditingAd] = useState<Advertisement | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    title: '', content: '', company: 'Transtec' as Company, type: 'OFFICIAL_CATALOG' as any, image_url: '', external_url: ''
  });

  useEffect(() => { 
    checkConnection();
    fetchAds(); 
  }, []);

  const checkConnection = async () => {
    try {
      const { error } = await supabase.from('advertisements').select('count', { count: 'exact', head: true });
      if (error) throw error;
      setDbStatus('CONNECTED');
    } catch (err) {
      console.error("Connection Check Failed:", err);
      setDbStatus('ERROR');
    }
  };

  const fetchAds = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('advertisements').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setAds(data || []);
    } catch (err: any) {
      console.error("Fetch error:", err);
    } finally { setLoading(false); }
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 500; 
          let width = img.width;
          let height = img.height;

          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.5));
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const compressedString = await compressImage(file);
      setFormData(prev => ({ ...prev, image_url: compressedString }));
    } catch (err) {
      alert("ছবি প্রসেস করা যায়নি।");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || isUploading) return;
    
    setIsSaving(true);
    try {
      const payload = {
        title: formData.title,
        content: formData.content || formData.title,
        company: formData.company,
        type: formData.type,
        image_url: formData.image_url,
        external_url: formData.external_url
      };

      let res;
      if (editingAd) {
        res = await supabase.from('advertisements').update(payload).eq('id', editingAd.id);
      } else {
        res = await supabase.from('advertisements').insert([payload]);
      }

      if (res.error) throw res.error;

      alert("সফলভাবে পাবলিশ হয়েছে! ✅");
      setShowModal(false);
      setFormData({title: '', content: '', company: 'Transtec', type: 'OFFICIAL_CATALOG', image_url: '', external_url: ''});
      setEditingAd(null);
      fetchAds();
    } catch (err: any) {
      alert("ত্রুটি: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-10 pb-32 animate-reveal">
      <div className="bg-[#0f172a] p-10 md:p-14 rounded-[4rem] shadow-2xl border border-white/5 flex flex-col md:flex-row justify-between items-center gap-8">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-3xl font-black text-white uppercase italic tracking-tighter leading-none">ক্যাটালগ হাব</h3>
            <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${dbStatus === 'CONNECTED' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
              {dbStatus === 'CONNECTED' ? 'Cloud Sync: Active' : 'Cloud Error'}
            </span>
          </div>
          <p className="text-[10px] text-blue-400 font-black uppercase tracking-[0.4em] mt-3">Product Marketing & Catalog Control</p>
        </div>
        <button 
          onClick={() => { setEditingAd(null); setFormData({title:'', content:'', company:'Transtec', type:'OFFICIAL_CATALOG', image_url:'', external_url:''}); setShowModal(true); }} 
          className="bg-white text-slate-900 px-12 py-5 rounded-[2rem] font-black uppercase text-[11px] tracking-widest shadow-xl active:scale-95 transition-all"
        >
          নতুন পোস্ট +
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {loading ? (
          <div className="col-span-full py-40 text-center animate-pulse text-slate-300 font-black uppercase italic">সার্ভার সিঙ্ক হচ্ছে...</div>
        ) : ads.map(ad => (
          <div key={ad.id} className="bg-white rounded-[4rem] overflow-hidden border shadow-sm group hover:shadow-2xl transition-all duration-700 animate-reveal">
             <div className="h-72 overflow-hidden bg-slate-50 relative">
                {ad.image_url ? (
                   <img src={ad.image_url} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[3000ms]" />
                ) : (
                   <div className="w-full h-full flex items-center justify-center opacity-10 font-black italic text-5xl uppercase">IFZA ERP</div>
                )}
                <div className="absolute top-8 left-8">
                   <span className="px-5 py-2 bg-black/80 backdrop-blur-xl text-white text-[9px] font-black rounded-2xl uppercase tracking-widest italic">{ad.company}</span>
                </div>
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                   <button onClick={() => { setEditingAd(ad); setFormData({title: ad.title, content: ad.content || '', company: ad.company, type: ad.type, image_url: ad.image_url || '', external_url: ad.external_url || ''}); setShowModal(true); }} className="bg-white text-slate-900 w-16 h-16 rounded-full flex items-center justify-center text-xl shadow-2xl active:scale-90">📝</button>
                </div>
             </div>
             <div className="p-10">
                <h4 className="text-xl font-black uppercase italic text-slate-800 leading-tight mb-4">{ad.title}</h4>
                <div className="flex justify-between items-center mt-6 pt-6 border-t border-slate-50">
                   <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{new Date(ad.created_at).toLocaleDateString('bn-BD')}</span>
                   <button onClick={async () => { if(confirm("ডিলিট করতে চান?")) { await supabase.from('advertisements').delete().eq('id', ad.id); fetchAds(); } }} className="text-red-400 font-black text-2xl hover:scale-125 transition-transform">🗑️</button>
                </div>
             </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-[#020617]/95 backdrop-blur-3xl z-[3000] flex items-center justify-center p-4">
          <div className="bg-white rounded-[5rem] w-full max-w-2xl shadow-2xl animate-reveal max-h-[95vh] overflow-y-auto custom-scroll text-black">
            <div className="p-10 md:p-14 space-y-10">
              <div className="flex justify-between items-center border-b pb-8">
                <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">{editingAd ? 'পোস্ট আপডেট' : 'নতুন পোস্ট পাবলিশ'}</h3>
                <button onClick={() => setShowModal(false)} className="text-4xl text-slate-300 font-black">✕</button>
              </div>

              <form onSubmit={handleSave} className="space-y-8">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase ml-6 italic">সিরিজ বা শিরোনাম</label>
                   <input required className="w-full p-8 bg-slate-50 border-none rounded-[2.5rem] font-black outline-none uppercase italic text-sm shadow-inner" placeholder="যেমন: White Gold Switch" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                     <label className="text-[10px] font-black text-slate-400 uppercase ml-6 italic">কোম্পানি</label>
                     <select className="w-full p-6 bg-slate-50 border-none rounded-[2rem] font-black text-[11px] uppercase outline-none shadow-inner" value={formData.company} onChange={e => setFormData({...formData, company: e.target.value as Company})}>
                        <option value="Transtec">TRANSTEC</option>
                        <option value="SQ Light">SQ LIGHT</option>
                        <option value="SQ Cables">SQ CABLES</option>
                     </select>
                  </div>
                  <div className="space-y-2">
                     <label className="text-[10px] font-black text-slate-400 uppercase ml-6 italic">টাইপ</label>
                     <select className="w-full p-6 bg-slate-50 border-none rounded-[2rem] font-black text-[11px] uppercase outline-none shadow-inner" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as any})}>
                        <option value="OFFICIAL_CATALOG">OFFICIAL CATALOG</option>
                        <option value="NEW_PRODUCT">NEW PRODUCT</option>
                        <option value="OFFER">SPECIAL OFFER</option>
                     </select>
                  </div>
                </div>

                <div className="space-y-4">
                   <label className="text-[10px] font-black text-slate-400 uppercase ml-6 italic">ছবি আপলোড</label>
                   <div className="flex gap-6 items-center">
                      <div className="w-24 h-24 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2.5rem] flex items-center justify-center overflow-hidden">
                         {formData.image_url ? <img src={formData.image_url} className="w-full h-full object-cover" /> : <span className="text-2xl">📸</span>}
                      </div>
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="bg-slate-900 text-white px-8 py-4 rounded-3xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all">গ্যালারি ➔</button>
                      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                   </div>
                </div>

                <button 
                  disabled={isSaving || isUploading} 
                  type="submit" 
                  className={`w-full text-white py-10 rounded-[3rem] font-black uppercase text-sm tracking-[0.4em] shadow-2xl active:scale-95 transition-all bg-[#2563eb] hover:bg-blue-700 disabled:opacity-50`}
                >
                  {isSaving ? "পাবলিশ হচ্ছে..." : "এখনই পাবলিশ করুন ➔"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdManager;
