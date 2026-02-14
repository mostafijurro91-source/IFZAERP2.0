
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
    
    // Check for API key in a standard location or assume injected
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      alert("AI Video API Key missing. Please configure environment variables.");
      return;
    }

    setIsGeneratingVideo(true);
    setGeneratedVideoUrl(null);
    setVideoStatus("Initializing AI Engine...");

    try {
      const ai = new GoogleGenAI({ apiKey });
      
      setVideoStatus("AI is imagining your video... (Approx 1-2 mins)");
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: videoPrompt + " for IFZA Electronics company branding, cinematic look, 4k",
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9'
        }
      });

      while (!operation.done) {
        setVideoStatus("Generating frames and motion... Please wait.");
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        setVideoStatus("Rendering complete! Fetching bytes...");
        const response = await fetch(`${downloadLink}&key=${apiKey}`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setGeneratedVideoUrl(url);
        setVideoStatus("Done!");
      } else {
        throw new Error("Video generation failed to return a link.");
      }
    } catch (err: any) {
      alert("ভিডিও তৈরিতে সমস্যা হয়েছে: " + err.message);
      setVideoStatus("Failed.");
    } finally {
      setIsGeneratingVideo(false);
    }
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
          const MAX_WIDTH = 600; 
          let width = img.width;
          let height = img.height;
          if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.6));
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
      const { error } = await supabase.from('notifications').insert([{
        customer_id: notifyData.customer_id,
        title: notifyData.title || "🔔 IFZA Alerts",
        message: notifyData.message,
        type: notifyData.type
      }]);
      if (error) throw error;
      alert("নোটিফিকেশন পাঠানো হয়েছে!");
      setShowNotifyModal(false);
      setNotifyData({ customer_id: '', title: '', message: '', type: 'ANNOUNCEMENT' });
    } catch (err: any) { alert(err.message); } finally { setIsSaving(false); }
  };

  return (
    <div className="space-y-10 pb-40 animate-reveal text-black">
      <div className="bg-[#0f172a] p-10 md:p-14 rounded-[4rem] shadow-2xl border border-white/5 flex flex-col md:flex-row justify-between items-center gap-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 blur-[100px] rounded-full"></div>
        <div className="relative z-10">
          <h3 className="text-3xl font-black text-white uppercase italic tracking-tighter leading-none">কমিউনিকেশন হাব</h3>
          <p className="text-[10px] text-blue-400 font-black uppercase tracking-[0.4em] mt-3">Broadcast & Personal Alert Control</p>
        </div>
        <div className="flex flex-wrap gap-3 relative z-10">
          <button onClick={() => setShowVideoModal(true)} className="bg-emerald-600 text-white px-8 py-5 rounded-[2rem] font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all">AI ভিডিও তৈরি 🎬</button>
          <button onClick={() => setShowNotifyModal(true)} className="bg-blue-600 text-white px-8 py-5 rounded-[2rem] font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all">মেসেজ পাঠান 🔔</button>
          <button onClick={() => { setEditingAd(null); setFormData({title:'', content:'', company:'Transtec', type:'OFFICIAL_CATALOG', image_url:'', external_url:''}); setShowModal(true); }} className="bg-white text-slate-900 px-8 py-5 rounded-[2rem] font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all">নতুন অফার +</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {loading ? (
          <div className="col-span-full py-40 text-center animate-pulse text-slate-300 font-black uppercase italic">Syncing Terminal...</div>
        ) : ads.map(ad => (
          <div key={ad.id} className="bg-white rounded-[4rem] overflow-hidden border shadow-sm group hover:shadow-2xl transition-all duration-700 animate-reveal">
             <div className="h-64 overflow-hidden bg-slate-50 relative">
                {ad.image_url ? <img src={ad.image_url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[3000ms]" /> : <div className="w-full h-full flex items-center justify-center opacity-10 font-black text-4xl">IFZA</div>}
                <div className="absolute top-6 left-6 flex gap-2">
                   <span className="px-4 py-1.5 bg-black/80 backdrop-blur-xl text-white text-[8px] font-black rounded-xl uppercase tracking-widest">{ad.company}</span>
                   <span className="px-4 py-1.5 bg-blue-600 text-white text-[8px] font-black rounded-xl uppercase tracking-widest">{ad.type}</span>
                </div>
             </div>
             <div className="p-8">
                <h4 className="text-lg font-black uppercase italic text-slate-800 leading-tight mb-4">{ad.title}</h4>
                <div className="flex justify-between items-center mt-6 pt-6 border-t border-slate-50">
                   <span className="text-[9px] font-black text-slate-300 uppercase">{new Date(ad.created_at).toLocaleDateString('bn-BD')}</span>
                   <button onClick={async () => { if(confirm("ডিলিট করতে চান?")) { await supabase.from('advertisements').delete().eq('id', ad.id); fetchAds(); } }} className="text-red-400 font-black text-xl">🗑️</button>
                </div>
             </div>
          </div>
        ))}
      </div>

      {/* 🎬 AI Video Generator Modal */}
      {showVideoModal && (
        <div className="fixed inset-0 bg-[#020617]/95 backdrop-blur-3xl z-[3000] flex items-center justify-center p-4">
           <div className="bg-white rounded-[4rem] w-full max-w-3xl shadow-2xl animate-reveal overflow-hidden flex flex-col h-[85vh]">
              <div className="p-10 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <div>
                    <h3 className="text-2xl font-black uppercase italic tracking-tighter">Gemini AI Video Generator</h3>
                    <p className="text-[9px] text-blue-400 font-black uppercase mt-2 tracking-widest">Powered by Veo 3.1 Experimental</p>
                 </div>
                 <button onClick={() => setShowVideoModal(false)} className="text-4xl text-slate-500 hover:text-white font-black">✕</button>
              </div>

              <div className="flex-1 overflow-y-auto p-10 space-y-10 custom-scroll">
                 <div className="space-y-6">
                    <p className="text-[11px] font-black text-slate-400 uppercase italic tracking-widest">বর্ণনা দিন (ভিডিওতে কি দেখাতে চান):</p>
                    <textarea 
                      className="w-full p-8 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] font-bold text-lg italic h-40 outline-none focus:border-blue-600 transition-all shadow-inner"
                      placeholder="যেমন: A cinematic slow motion shot of modern high quality electric switches on a luxury wall, soft lighting, 8k..."
                      value={videoPrompt}
                      onChange={e => setVideoPrompt(e.target.value)}
                    />
                    <div className="flex justify-between items-center">
                       <p className="text-[9px] text-slate-400 font-bold uppercase italic">Recommended: English Prompt works best.</p>
                       <button 
                         disabled={isGeneratingVideo}
                         onClick={handleGenerateVideo}
                         className="bg-blue-600 text-white px-10 py-5 rounded-[2rem] font-black uppercase text-[11px] shadow-2xl active:scale-95 transition-all flex items-center gap-4"
                       >
                         {isGeneratingVideo ? "তৈরি হচ্ছে... ⏳" : "ভিডিও তৈরি করুন ✨"}
                       </button>
                    </div>
                 </div>

                 {isGeneratingVideo && (
                    <div className="bg-slate-50 p-12 rounded-[3.5rem] flex flex-col items-center justify-center space-y-6 border-2 border-dashed border-blue-200">
                       <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                       <p className="font-black text-blue-600 uppercase italic tracking-[0.2em]">{videoStatus}</p>
                       <p className="text-[9px] text-slate-400 font-bold uppercase">AI is working on your request. Do not close this window.</p>
                    </div>
                 )}

                 {generatedVideoUrl && (
                    <div className="space-y-6 animate-reveal">
                       <p className="text-[11px] font-black text-emerald-600 uppercase italic tracking-widest">ভিডিও তৈরি সফল! নিচে দেখুন ও ডাউনলোড করুন:</p>
                       <div className="rounded-[3rem] overflow-hidden border-8 border-slate-900 shadow-2xl aspect-video bg-black">
                          <video src={generatedVideoUrl} controls autoPlay loop className="w-full h-full object-cover" />
                       </div>
                       <div className="flex gap-4">
                          <a href={generatedVideoUrl} download="IFZA_Promo_AI.mp4" className="flex-1 bg-emerald-600 text-white py-6 rounded-3xl font-black uppercase text-center text-xs tracking-widest shadow-xl active:scale-95 transition-all">ভিডিও ডাউনলোড করুন 📥</a>
                          <button onClick={() => setGeneratedVideoUrl(null)} className="px-8 bg-slate-100 text-slate-400 font-black rounded-3xl uppercase text-[10px]">আবার চেষ্টা করুন</button>
                       </div>
                    </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {/* 🔔 Send Notification Modal */}
      {showNotifyModal && (
        <div className="fixed inset-0 bg-[#020617]/90 backdrop-blur-3xl z-[3000] flex items-center justify-center p-4">
           <div className="bg-white rounded-[4rem] w-full max-w-lg shadow-2xl animate-reveal overflow-hidden">
              <div className="p-10 md:p-12 space-y-8">
                 <div className="flex justify-between items-center border-b pb-6">
                    <h3 className="text-xl font-black text-slate-900 uppercase italic">কাস্টমার এলার্ট পাঠান</h3>
                    <button onClick={() => setShowNotifyModal(false)} className="text-3xl text-slate-300 font-black">✕</button>
                 </div>
                 <form onSubmit={handleSendNotification} className="space-y-6">
                    <div className="space-y-1">
                       <label className="text-[9px] font-black text-slate-400 uppercase ml-4 italic">ターゲティング (Target Shop)</label>
                       <select required className="w-full p-5 bg-slate-50 border-none rounded-2xl outline-none font-black text-[11px] uppercase italic" value={notifyData.customer_id} onChange={e => setNotifyData({...notifyData, customer_id: e.target.value})}>
                          <option value="">দোকান সিলেক্ট করুন...</option>
                          {customers.map(c => <option key={c.id} value={c.id}>{c.name} - {c.address}</option>)}
                       </select>
                    </div>
                    <div className="space-y-1">
                       <label className="text-[9px] font-black text-slate-400 uppercase ml-4 italic">টাইটেল (যেমন: বকেয়া নোটিশ)</label>
                       <input className="w-full p-5 bg-slate-50 border-none rounded-2xl outline-none font-black text-xs uppercase" placeholder="নোটিফিকেশন টাইটেল" value={notifyData.title} onChange={e => setNotifyData({...notifyData, title: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                       <label className="text-[9px] font-black text-slate-400 uppercase ml-4 italic">বিস্তারিত মেসেজ</label>
                       <textarea required className="w-full p-5 bg-slate-50 border-none rounded-2xl outline-none font-bold text-xs h-32" placeholder="আপনার মেসেজ এখানে লিখুন..." value={notifyData.message} onChange={e => setNotifyData({...notifyData, message: e.target.value})} />
                    </div>
                    <button disabled={isSaving} type="submit" className="w-full bg-blue-600 text-white py-6 rounded-[2.5rem] font-black uppercase text-xs tracking-widest shadow-2xl active:scale-95 transition-all">
                       {isSaving ? "পাঠানো হচ্ছে..." : "এখনই পাঠান 🚀"}
                    </button>
                 </form>
              </div>
           </div>
        </div>
      )}

      {/* 🖼️ Add Ad/Catalog Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-3xl z-[3000] flex items-center justify-center p-4">
          <div className="bg-white rounded-[5rem] w-full max-w-2xl shadow-2xl animate-reveal max-h-[95vh] overflow-y-auto custom-scroll">
            <div className="p-10 md:p-14 space-y-10">
              <div className="flex justify-between items-center border-b pb-8">
                <h3 className="text-2xl font-black text-slate-900 uppercase italic">অফার বা ক্যাটালগ পোস্ট</h3>
                <button onClick={() => setShowModal(false)} className="text-4xl text-slate-300 font-black">✕</button>
              </div>
              <form onSubmit={handleSave} className="space-y-6">
                <div className="space-y-1">
                   <label className="text-[9px] font-black text-slate-400 uppercase ml-4 italic">সিরিজ বা শিরোনাম</label>
                   <input required className="w-full p-6 bg-slate-50 border-none rounded-[2rem] font-black outline-none uppercase italic text-sm" placeholder="White Gold Switch" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <select className="p-5 bg-slate-50 border-none rounded-[1.8rem] font-black text-[11px] uppercase" value={formData.company} onChange={e => setFormData({...formData, company: e.target.value as Company})}>
                     <option value="Transtec">TRANSTEC</option>
                     <option value="SQ Light">SQ LIGHT</option>
                     <option value="SQ Cables">SQ CABLES</option>
                  </select>
                  <select className="p-5 bg-slate-50 border-none rounded-[1.8rem] font-black text-[11px] uppercase" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as any})}>
                     <option value="OFFICIAL_CATALOG">OFFICIAL CATALOG</option>
                     <option value="NEW_PRODUCT">NEW PRODUCT</option>
                     <option value="OFFER">SPECIAL OFFER</option>
                  </select>
                </div>
                <div className="flex gap-6 items-center bg-slate-50 p-6 rounded-[2.5rem]">
                   <div className="w-20 h-20 bg-white border-2 border-dashed border-slate-200 rounded-[1.5rem] flex items-center justify-center overflow-hidden">
                      {formData.image_url ? <img src={formData.image_url} className="w-full h-full object-cover" /> : <span className="text-xl">🖼️</span>}
                   </div>
                   <button type="button" onClick={() => fileInputRef.current?.click()} className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black uppercase text-[9px] tracking-widest shadow-lg">ছবি আপলোড</button>
                   <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </div>
                <button disabled={isSaving || isUploading} type="submit" className="w-full bg-blue-600 text-white py-10 rounded-[3rem] font-black uppercase text-sm tracking-[0.4em] shadow-2xl active:scale-95 transition-all">
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
