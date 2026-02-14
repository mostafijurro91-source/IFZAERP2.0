
import React, { useState, useEffect, useRef } from 'react';
import { Company, Advertisement, UserRole } from '../types';
import { supabase } from '../lib/supabase';
import { GoogleGenAI } from "@google/genai";

const AdManager: React.FC = () => {
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [editingAd, setEditingAd] = useState<Advertisement | null>(null);
  
  // AI Video States
  const [videoPrompt, setVideoPrompt] = useState("");
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    title: '', content: '', company: 'Transtec' as Company, type: 'OFFICIAL_CATALOG' as any, image_url: '', external_url: ''
  });

  const [notifyData, setNotifyData] = useState({
    customer_id: '', title: '', message: '', type: 'ANNOUNCEMENT'
  });

  useEffect(() => { 
    fetchAds(); 
    fetchCustomers();
  }, []);

  const fetchAds = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('advertisements').select('*').order('created_at', { ascending: false });
      setAds(data || []);
    } finally { setLoading(false); }
  };

  const fetchCustomers = async () => {
    const { data } = await supabase.from('customers').select('id, name, address').order('name');
    setCustomers(data || []);
  };

  const handleGenerateVideo = async () => {
    if (!videoPrompt) return alert("ভিডিওর জন্য একটি প্রম্পট লিখুন!");
    const apiKey = process.env.API_KEY;
    if (!apiKey) return alert("API Key missing!");
    setIsGeneratingVideo(true);
    setGeneratedVideoUrl(null);
    setVideoStatus("Initializing AI Engine...");

    try {
      const ai = new GoogleGenAI({ apiKey });
      setVideoStatus("AI is imagining your video... (Approx 1-2 mins)");
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: videoPrompt + " for IFZA Electronics company branding, cinematic look, 4k",
        config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
      });

      while (!operation.done) {
        setVideoStatus("Generating frames and motion... Please wait.");
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        const response = await fetch(`${downloadLink}&key=${apiKey}`);
        const blob = await response.blob();
        setGeneratedVideoUrl(URL.createObjectURL(blob));
        setVideoStatus("Done!");
      }
    } catch (err: any) { alert("ভিডিও তৈরিতে সমস্যা হয়েছে: " + err.message); } finally { setIsGeneratingVideo(false); }
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800; 
          let width = img.width;
          let height = img.height;
          if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
      };
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const compressed = await compressImage(file);
    setFormData(prev => ({ ...prev, image_url: compressed }));
    setIsUploading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = { ...formData, content: formData.content || formData.title };
      const res = editingAd ? await supabase.from('advertisements').update(payload).eq('id', editingAd.id) : await supabase.from('advertisements').insert([payload]);
      if (res.error) throw res.error;
      alert("সফলভাবে পাবলিশ হয়েছে!");
      setShowModal(false);
      fetchAds();
    } catch (err: any) { alert(err.message); } finally { setIsSaving(false); }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifyData.customer_id || !notifyData.message) return alert("দোকান এবং মেসেজ লিখুন!");
    setIsSaving(true);
    try {
      await supabase.from('notifications').insert([{
        customer_id: notifyData.customer_id,
        title: notifyData.title || "🔔 IFZA Alerts",
        message: notifyData.message,
        type: notifyData.type
      }]);
      alert("নোটিফিকেশন পাঠানো হয়েছে!");
      setShowNotifyModal(false);
      setNotifyData({ customer_id: '', title: '', message: '', type: 'ANNOUNCEMENT' });
    } catch (err: any) { alert(err.message); } finally { setIsSaving(false); }
  };

  return (
    <div className="space-y-10 pb-40 animate-reveal text-slate-900">
      
      {/* 📢 Communication Hub Header */}
      <div className="bg-[#0f172a] p-12 md:p-16 rounded-[4rem] shadow-2xl border border-white/5 flex flex-col md:flex-row justify-between items-center gap-10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 blur-[120px] rounded-full"></div>
        <div className="relative z-10">
          <h3 className="text-4xl font-black text-white uppercase italic tracking-tighter leading-none">Catalog Hub</h3>
          <p className="text-[10px] text-indigo-400 font-black uppercase tracking-[0.6em] mt-4">Broadcast & Social Media Management</p>
        </div>
        <div className="flex flex-wrap justify-center gap-4 relative z-10">
          <button onClick={() => setShowVideoModal(true)} className="bg-emerald-600 text-white px-10 py-5 rounded-[2.5rem] font-black uppercase text-[11px] tracking-widest shadow-xl active:scale-95 transition-all hover:bg-emerald-700">AI প্রোমো ভিডিও 🎬</button>
          <button onClick={() => setShowNotifyModal(true)} className="bg-indigo-600 text-white px-10 py-5 rounded-[2.5rem] font-black uppercase text-[11px] tracking-widest shadow-xl active:scale-95 transition-all hover:bg-indigo-700">মেসেজ পাঠান 🔔</button>
          <button onClick={() => { setEditingAd(null); setFormData({title:'', content:'', company:'Transtec', type:'OFFICIAL_CATALOG', image_url:'', external_url:''}); setShowModal(true); }} className="bg-white text-slate-900 px-10 py-5 rounded-[2.5rem] font-black uppercase text-[11px] tracking-widest shadow-xl active:scale-95 transition-all hover:scale-105">নতুন ক্যাটালগ +</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
        {loading ? (
          <div className="col-span-full py-40 text-center animate-pulse text-slate-300 font-black uppercase italic text-xs tracking-[0.4em]">Node Syncing Assets...</div>
        ) : ads.map((ad, idx) => (
          <div key={ad.id} className="bg-white rounded-[4rem] overflow-hidden border border-slate-100 shadow-lg group hover:shadow-2xl transition-all duration-1000 animate-reveal" style={{ animationDelay: `${idx * 0.1}s` }}>
             <div className="h-72 overflow-hidden bg-slate-50 relative">
                {ad.image_url ? <img src={ad.image_url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[4000ms]" /> : <div className="w-full h-full flex items-center justify-center opacity-5 font-black text-6xl italic">IFZA</div>}
                <div className="absolute top-8 left-8 flex gap-3">
                   <span className="px-5 py-2 bg-black/80 backdrop-blur-2xl text-white text-[9px] font-black rounded-2xl uppercase tracking-widest italic border border-white/10">{ad.company}</span>
                   <span className="px-5 py-2 bg-indigo-600 text-white text-[9px] font-black rounded-2xl uppercase tracking-widest italic shadow-xl">{ad.type}</span>
                </div>
             </div>
             <div className="p-10">
                <h4 className="text-xl font-black uppercase italic text-slate-800 leading-tight mb-6 line-clamp-2 group-hover:text-indigo-600 transition-colors">{ad.title}</h4>
                <p className="text-slate-400 text-sm font-medium italic mb-8 line-clamp-2 leading-relaxed">"{ad.content}"</p>
                <div className="flex justify-between items-center mt-8 pt-8 border-t border-slate-50">
                   <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{new Date(ad.created_at).toLocaleDateString('bn-BD')}</span>
                   <div className="flex gap-4">
                      <button onClick={async () => { if(confirm("ডিলিট?")) { await supabase.from('advertisements').delete().eq('id', ad.id); fetchAds(); } }} className="text-rose-400 font-black text-2xl hover:text-rose-600 transition-colors">🗑️</button>
                   </div>
                </div>
             </div>
          </div>
        ))}
      </div>
      
      {/* AI Video Generator Modal */}
      {showVideoModal && (
        <div className="fixed inset-0 bg-[#020617]/98 backdrop-blur-3xl z-[3000] flex items-center justify-center p-4 overflow-y-auto">
           <div className="bg-white rounded-[4.5rem] w-full max-w-4xl shadow-2xl animate-reveal overflow-hidden flex flex-col my-auto border border-white/20">
              <div className="p-10 md:p-14 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <div className="flex items-center gap-6">
                    <div className="w-14 h-14 bg-indigo-600 rounded-3xl flex items-center justify-center text-3xl animate-pulse shadow-2xl">🎞️</div>
                    <div>
                       <h3 className="text-2xl font-black uppercase italic tracking-tighter">Gemini AI Cinematic Video</h3>
                       <p className="text-[9px] text-indigo-400 font-black uppercase mt-2 tracking-widest">Powered by Veo 3.1 Advanced Engine</p>
                    </div>
                 </div>
                 <button onClick={() => setShowVideoModal(false)} className="text-4xl text-slate-500 hover:text-white font-black transition-colors">✕</button>
              </div>

              <div className="flex-1 overflow-y-auto p-10 md:p-14 space-y-12 custom-scroll">
                 <div className="space-y-6">
                    <p className="text-[11px] font-black text-slate-400 uppercase italic tracking-widest ml-6">ভিডিওতে কি দেখাতে চান (প্রম্পট দিন):</p>
                    <textarea 
                      className="w-full p-10 bg-slate-50 border-2 border-slate-100 rounded-[3.5rem] font-bold text-lg italic h-48 outline-none focus:border-indigo-600 transition-all shadow-inner text-slate-900"
                      placeholder="যেমন: A high-end luxury electrical switch panel on a marble wall with soft cinematic neon lighting, slow motion, 8k resolution..."
                      value={videoPrompt}
                      onChange={e => setVideoPrompt(e.target.value)}
                    />
                    <div className="flex justify-between items-center">
                       <p className="text-[9px] text-slate-400 font-black uppercase italic ml-6">English prompts deliver superior results.</p>
                       <button 
                         disabled={isGeneratingVideo}
                         onClick={handleGenerateVideo}
                         className="bg-indigo-600 text-white px-12 py-5 rounded-[2.5rem] font-black uppercase text-[11px] tracking-widest shadow-2xl active:scale-95 transition-all hover:bg-emerald-600"
                       >
                         {isGeneratingVideo ? "AI Rendering... ⏳" : "ভিডিও তৈরি করুন ✨"}
                       </button>
                    </div>
                 </div>

                 {isGeneratingVideo && (
                    <div className="bg-slate-50 p-16 rounded-[4rem] flex flex-col items-center justify-center space-y-8 border-4 border-dashed border-indigo-100">
                       <div className="w-20 h-20 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                       <p className="font-black text-indigo-600 uppercase italic tracking-[0.4em] text-sm text-center">{videoStatus}</p>
                       <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Generating motion vectors. Do not disconnect.</p>
                    </div>
                 )}

                 {generatedVideoUrl && (
                    <div className="space-y-8 animate-reveal">
                       <p className="text-[11px] font-black text-emerald-600 uppercase italic tracking-[0.2em] text-center">✓ Cinematic Rendering Successful</p>
                       <div className="rounded-[4rem] overflow-hidden border-[12px] border-slate-900 shadow-[0_50px_100px_rgba(0,0,0,0.5)] aspect-video bg-black group relative">
                          <video src={generatedVideoUrl} controls autoPlay loop className="w-full h-full object-cover" />
                       </div>
                       <div className="flex gap-4">
                          <a href={generatedVideoUrl} download="IFZA_Cinematic_Promo.mp4" className="flex-1 bg-emerald-600 text-white py-8 rounded-[3rem] font-black uppercase text-center text-xs tracking-[0.3em] shadow-2xl active:scale-95 transition-all hover:bg-emerald-700">ভিডিও ডাউনলোড করুন 📥</a>
                          <button onClick={() => setGeneratedVideoUrl(null)} className="px-10 bg-slate-100 text-slate-400 font-black rounded-[3rem] uppercase text-[10px] tracking-widest active:scale-95">নতুন ভিডিও তৈরি</button>
                       </div>
                    </div>
                 )}
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default AdManager;
