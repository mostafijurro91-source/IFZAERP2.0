
import React, { useState, useEffect, useRef } from 'react';
import { Company, Advertisement, UserRole } from '../types';
import { supabase } from '../lib/supabase';

const AdManager: React.FC = () => {
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [editingAd, setEditingAd] = useState<Advertisement | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    title: '', content: '', company: 'Transtec' as Company, type: 'OFFER' as any, image_url: '', external_url: ''
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
      alert("অফারটি সফলভাবে পাবলিশ হয়েছে! এটি এখন কাস্টমাররা প্রিমিয়াম কার্ড আকারে দেখতে পাবে।");
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
      
      {/* 📢 Catalog Hub Header */}
      <div className="bg-[#0f172a] p-12 md:p-16 rounded-[4rem] shadow-2xl border border-white/5 flex flex-col md:flex-row justify-between items-center gap-10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 blur-[120px] rounded-full"></div>
        <div className="relative z-10">
          <h3 className="text-4xl font-black text-white uppercase italic tracking-tighter leading-none">Catalog Hub</h3>
          <p className="text-[10px] text-indigo-400 font-black uppercase tracking-[0.6em] mt-4">Manage Offers & Events</p>
        </div>
        <div className="flex flex-wrap justify-center gap-4 relative z-10">
          <button onClick={() => setShowNotifyModal(true)} className="bg-indigo-600 text-white px-10 py-5 rounded-[2.5rem] font-black uppercase text-[11px] tracking-widest shadow-xl active:scale-95 transition-all hover:bg-indigo-700">মেসেজ পাঠান 🔔</button>
          <button onClick={() => { setEditingAd(null); setFormData({title:'', content:'', company:'Transtec', type:'OFFER', image_url:'', external_url:''}); setShowModal(true); }} className="bg-white text-slate-900 px-10 py-5 rounded-[2.5rem] font-black uppercase text-[11px] tracking-widest shadow-xl active:scale-95 transition-all hover:scale-105">নতুন অফার তৈরি +</button>
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
                   <span className="px-5 py-2 bg-rose-600 text-white text-[9px] font-black rounded-2xl uppercase tracking-widest italic shadow-xl">{ad.type}</span>
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
      
      {/* Add/Edit Offer Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[3000] flex items-center justify-center p-4 overflow-y-auto">
           <div className="bg-white rounded-[4.5rem] w-full max-w-2xl shadow-2xl animate-reveal overflow-hidden flex flex-col my-auto border border-white/20">
              <div className="p-10 bg-slate-900 text-white flex justify-between items-center shrink-0">
                 <h3 className="text-2xl font-black uppercase italic tracking-tighter">অফার ক্রিয়েটর</h3>
                 <button onClick={() => setShowModal(false)} className="text-4xl text-slate-500 hover:text-white font-black transition-colors">✕</button>
              </div>
              <form onSubmit={handleSave} className="p-10 space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                       <label className="text-[9px] font-black uppercase text-slate-400 ml-4 italic">কোম্পানি</label>
                       <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl outline-none font-black text-xs uppercase" value={formData.company} onChange={e => setFormData({...formData, company: e.target.value as Company})}>
                          <option value="Transtec">Transtec</option>
                          <option value="SQ Light">SQ Light</option>
                          <option value="SQ Cables">SQ Cables</option>
                       </select>
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-[9px] font-black uppercase text-slate-400 ml-4 italic">অফারের ধরণ</label>
                       <select className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl outline-none font-black text-xs uppercase" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as any})}>
                          <option value="OFFER">Special Offer 🎁</option>
                          <option value="NEW_PRODUCT">New Product 🚀</option>
                          <option value="NOTICE">Official Notice 📢</option>
                          <option value="OFFICIAL_CATALOG">Price Catalog 📄</option>
                       </select>
                    </div>
                 </div>

                 <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-slate-400 ml-4 italic">অফার হেডলাইন (যেমন: ১ লক্ষের মালে মোবাইল গিফট)</label>
                    <input required className="w-full p-6 bg-slate-50 border border-slate-100 rounded-3xl outline-none font-black italic text-[14px]" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="হেডলাইন লিখুন..." />
                 </div>

                 <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-slate-400 ml-4 italic">বিস্তারিত বিবরণ ও শর্তাবলী</label>
                    <textarea required className="w-full p-6 bg-slate-50 border border-slate-100 rounded-3xl outline-none font-bold italic h-32" value={formData.content} onChange={e => setFormData({...formData, content: e.target.value})} placeholder="অফারের শর্তাবলী বিস্তারিত লিখুন..." />
                 </div>

                 <div className="space-y-4">
                    <p className="text-[9px] font-black uppercase text-slate-400 ml-4 italic">অফার ব্যানার / ছবি (ঐচ্ছিক)</p>
                    <div className="p-8 border-4 border-dashed border-slate-100 rounded-[3rem] flex flex-col items-center justify-center gap-4 bg-slate-50/50 hover:bg-white transition-all cursor-pointer group" onClick={() => fileInputRef.current?.click()}>
                       <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                       {formData.image_url ? (
                         <div className="relative">
                            <img src={formData.image_url} className="h-40 rounded-2xl shadow-xl" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl">
                               <p className="text-[10px] font-black text-white uppercase">Change Image</p>
                            </div>
                         </div>
                       ) : (
                         <>
                            <div className="text-4xl">📸</div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Click to upload banner</p>
                         </>
                       )}
                    </div>
                 </div>

                 <button disabled={isSaving || isUploading} type="submit" className="w-full bg-slate-900 text-white py-8 rounded-[3rem] font-black uppercase text-xs tracking-[0.3em] shadow-2xl active:scale-95 transition-all">
                    {isSaving ? "PUBLISHING..." : "অফারটি পাবলিশ করুন ➔"}
                 </button>
              </form>
           </div>
        </div>
      )}

      {/* Messaging Modal */}
      {showNotifyModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[3000] flex items-center justify-center p-4">
           <div className="bg-white rounded-[4rem] w-full max-w-md shadow-2xl animate-reveal overflow-hidden">
              <div className="p-8 bg-indigo-600 text-white flex justify-between items-center">
                 <h3 className="text-xl font-black uppercase italic tracking-tighter">সরাসরি মেসেজ পাঠান</h3>
                 <button onClick={() => setShowNotifyModal(false)} className="text-3xl text-white/50 hover:text-white font-black">✕</button>
              </div>
              <form onSubmit={handleSendNotification} className="p-10 space-y-6">
                 <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-slate-400 ml-4 italic">দোকান নির্বাচন</label>
                    <select required className="w-full p-5 bg-slate-50 border border-slate-100 rounded-3xl outline-none font-bold text-xs" value={notifyData.customer_id} onChange={e => setNotifyData({...notifyData, customer_id: e.target.value})}>
                       <option value="">দোকান সিলেক্ট করুন...</option>
                       {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-slate-400 ml-4 italic">মেসেজ শিরোনাম</label>
                    <input className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold italic" value={notifyData.title} onChange={e => setNotifyData({...notifyData, title: e.target.value})} placeholder="যেমন: জরুরি নোটিশ" />
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-slate-400 ml-4 italic">মেসেজ টেক্সট</label>
                    <textarea required className="w-full p-6 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold italic h-32" value={notifyData.message} onChange={e => setNotifyData({...notifyData, message: e.target.value})} placeholder="আপনার মেসেজটি লিখুন..." />
                 </div>
                 <button disabled={isSaving} type="submit" className="w-full bg-slate-900 text-white py-6 rounded-[2.5rem] font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all">মেসেজ পাঠান ➔</button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default AdManager;
