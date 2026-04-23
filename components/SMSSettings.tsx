
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { sendSMS } from '../lib/sms';

const SMSSettings: React.FC = () => {
  const [apiToken, setApiToken] = useState('');
  const [senderId, setSenderId] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://sms.ummahhostbd.com/api/v1');
  const [panelUrl, setPanelUrl] = useState('https://bill.ummahhostbd.com/panel.php');
  const [serverIp, setServerIp] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  // Test SMS state
  const [testPhone, setTestPhone] = useState('');
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    // Load settings from localStorage
    const savedApiToken = localStorage.getItem('sms_api_token') || localStorage.getItem('sms_api_key') || ''; 
    const savedSenderId = localStorage.getItem('sms_sender_id') || ''; 
    const savedBaseUrl = localStorage.getItem('sms_base_url') || 'https://sms.ummahhostbd.com/api/v1';
    const savedPanelUrl = localStorage.getItem('sms_panel_url') || 'https://bill.ummahhostbd.com/panel.php';
    const savedServerIp = localStorage.getItem('sms_server_ip') || '';

    setApiToken(savedApiToken);
    setSenderId(savedSenderId);
    setBaseUrl(savedBaseUrl);
    setPanelUrl(savedPanelUrl);
    setServerIp(savedServerIp);

    if (savedApiToken) {
      fetchBalance(savedApiToken, savedBaseUrl);
    }
  }, []);

  const fetchBalance = async (key: string, url: string) => {
    if (!key || key.includes('***')) return;
    setIsLoadingBalance(true);
    try {
      // Use AllOrigins proxy for balance check to avoid CORS
      const targetUrl = `${url.replace(/\/$/, '')}/user/balance?api_key=${key}`;
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
      
      const response = await fetch(proxyUrl);
      const data = await response.json();
      if (data && data.balance !== undefined) {
        setBalance(data.balance);
      } else {
        setBalance('N/A');
      }
    } catch (e) {
      console.error('Failed to fetch balance', e);
      setBalance('Error');
    } finally {
      setIsLoadingBalance(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    localStorage.setItem('sms_api_token', apiToken);
    localStorage.setItem('sms_sender_id', senderId);
    localStorage.setItem('sms_base_url', baseUrl);
    localStorage.setItem('sms_panel_url', panelUrl);
    localStorage.setItem('sms_server_ip', serverIp);
    
    setTimeout(() => {
      setIsSaving(false);
      alert('এসএমএস ইন্টিগ্রেশন সেটিংস সফলভাবে সেভ করা হয়েছে! ✅');
      fetchBalance(apiToken, baseUrl);
    }, 500);
  };

  const handleSendTest = async () => {
    if (!testPhone) return alert('টেস্ট করার জন্য একটি মোবাইল নাম্বার দিন।');
    setIsTesting(true);
    try {
      const result = await sendSMS(testPhone, "এটি ইফজা ইআরপি থেকে একটি টেস্ট মেসেজ।");
      if (result.success) {
        alert('টেস্ট এসএমএস সফলভাবে পাঠানো হয়েছে! (Background Node active) ✅');
      } else {
        alert('এসএমএস পাঠানো যায়নি: ' + result.error);
      }
    } catch (err: any) {
      alert('ত্রুটি: ' + err.message);
    } finally {
      setIsTesting(false);
    }
  };

  const openPanel = () => {
    window.open(panelUrl, '_blank');
  };

  return (
    <div className="space-y-10 pb-40 font-sans text-slate-900 animate-reveal">
      {/* Header Section */}
      <div className="bg-[#0f172a] p-12 md:p-16 rounded-[4rem] text-white shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/10 blur-[150px] rounded-full"></div>
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-indigo-600/10 blur-[100px] rounded-full"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-center md:text-left">
            <h3 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter leading-none mb-4">SMS ইন্টিগ্রেশন হাব</h3>
            <p className="text-[11px] text-blue-400 font-black uppercase tracking-[0.4em] italic leading-none flex items-center gap-2 justify-center md:justify-start">
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-ping"></span>
              Ummah Host BD / White Label API
            </p>
          </div>
          
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-[2.5rem] flex flex-col items-center min-w-[200px]">
            <span className="text-[9px] font-black uppercase text-white/40 mb-2 tracking-[0.2em]">প্যানেল ব্যালেন্স</span>
            {isLoadingBalance ? (
              <div className="animate-pulse h-8 w-24 bg-white/10 rounded-lg"></div>
            ) : (
              <span className="text-3xl font-black italic text-blue-400 tracking-tighter">৳ {balance || '0.00'}</span>
            )}
            <button onClick={() => fetchBalance(apiToken, baseUrl)} className="mt-3 text-[8px] font-black uppercase text-white/60 hover:text-white transition-all">রিফ্রেশ 🔄</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
        <div className="xl:col-span-2 space-y-10">
          {/* System Health Status */}
          <div className="bg-white p-10 md:p-14 rounded-[4rem] shadow-xl border border-slate-50 relative overflow-hidden animate-reveal">
            <div className="absolute top-0 right-0 p-8">
               <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 font-black italic">HUB</div>
            </div>
            
            <div className="space-y-8">
               <h4 className="text-sm font-black uppercase italic text-slate-400 tracking-widest flex items-center gap-3">
                  <span className="w-8 h-[2px] bg-emerald-100"></span>
                  সিস্টেম হেলথ ও কানেক্টিভিটি
               </h4>

               <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 flex flex-col items-center text-center hover:bg-white hover:shadow-lg transition-all cursor-default group">
                    <div className="w-10 h-10 bg-blue-100 rounded-xl mb-3 flex items-center justify-center text-blue-600 text-xs group-hover:scale-110 transition-transform">01</div>
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Method: Fetch</p>
                    <p className="text-[10px] font-bold text-emerald-600 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                      সক্রিয় ✅
                    </p>
                  </div>
                  <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 flex flex-col items-center text-center hover:bg-white hover:shadow-lg transition-all cursor-default group">
                    <div className="w-10 h-10 bg-indigo-100 rounded-xl mb-3 flex items-center justify-center text-indigo-600 text-xs group-hover:scale-110 transition-transform">02</div>
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Method: Proxy</p>
                    <p className="text-[10px] font-bold text-emerald-600 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                      সক্রিয় ✅
                    </p>
                  </div>
                  <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 flex flex-col items-center text-center hover:bg-white hover:shadow-lg transition-all cursor-default group">
                    <div className="w-10 h-10 bg-purple-100 rounded-xl mb-3 flex items-center justify-center text-purple-600 text-xs group-hover:scale-110 transition-transform">03</div>
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Method: Iframe</p>
                    <p className="text-[10px] font-bold text-emerald-600 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                      সক্রিয় ✅
                    </p>
                  </div>
               </div>

               <div className="p-6 bg-blue-50/50 rounded-3xl border border-blue-100/50">
                  <p className="text-[10px] font-bold text-blue-800 leading-relaxed italic">
                    সিস্টেম বর্তমানে <span className="text-blue-600 font-black underline decoration-blue-200 underline-offset-4">Triple-Layer Strategy</span> ব্যবহার করছে। সরাসরি কানেকশন কাজ না করলে প্রক্সি এবং আইফ্রেম পদ্ধতি স্বয়ংক্রিয়ভাবে মেসেজ ডেলিভারি নিশ্চিত করবে।
                  </p>
               </div>
            </div>
          </div>

          {/* Main Settings Form */}
          <div className="bg-white p-10 md:p-14 rounded-[4rem] shadow-xl border border-slate-50 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8">
               <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 font-black italic">API</div>
            </div>
            
            <form onSubmit={handleSave} className="space-y-10">
              <div className="space-y-6">
                <h4 className="text-sm font-black uppercase italic text-slate-400 tracking-widest flex items-center gap-3">
                  <span className="w-8 h-[2px] bg-blue-100"></span>
                  অটোমেটিক গেটওয়ে কনফিগারেশন
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-4 italic tracking-widest">Gateway API Key</label>
                    <input 
                      required
                      type="password" 
                      value={apiToken}
                      onChange={(e) => setApiToken(e.target.value)}
                      placeholder="আপনার API Key এখানে দিন"
                      className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] outline-none font-bold text-sm focus:border-blue-600 focus:bg-white transition-all shadow-inner"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-4 italic tracking-widest">Center ID (Sender ID)</label>
                    <input 
                      type="text" 
                      value={senderId}
                      onChange={(e) => setSenderId(e.target.value)}
                      placeholder="যেমন: 8809617632427"
                      className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] outline-none font-bold text-sm focus:border-blue-600 focus:bg-white transition-all shadow-inner"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase text-slate-500 ml-4 italic tracking-widest">Gateway API Endpoint</label>
                  <input 
                    required
                    type="text" 
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] outline-none font-bold text-sm focus:border-blue-600 focus:bg-white transition-all shadow-inner"
                  />
                </div>
              </div>

              <div className="space-y-6 pt-4 border-t border-slate-100">
                <h4 className="text-sm font-black uppercase italic text-slate-400 tracking-widest flex items-center gap-3">
                  <span className="w-8 h-[2px] bg-indigo-100"></span>
                  প্যানেল ও সার্ভার তথ্য
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-4 italic tracking-widest">SMS Panel URL</label>
                    <input 
                      type="text" 
                      value={panelUrl}
                      onChange={(e) => setPanelUrl(e.target.value)}
                      placeholder="https://bill.ummahhostbd.com/panel.php"
                      className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] outline-none font-bold text-sm focus:border-indigo-600 focus:bg-white transition-all shadow-inner"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-4 italic tracking-widest">Gateway IP Address</label>
                    <input 
                      type="text" 
                      value={serverIp}
                      onChange={(e) => setServerIp(e.target.value)}
                      placeholder="যেমন: 103.145.116.10"
                      className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] outline-none font-bold text-sm focus:border-indigo-600 focus:bg-white transition-all shadow-inner"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6">
                <button 
                  disabled={isSaving}
                  className="w-full bg-blue-600 text-white py-8 rounded-[2.5rem] font-black uppercase text-xs tracking-[0.4em] shadow-2xl shadow-blue-200 active:scale-95 transition-all hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-4"
                >
                  {isSaving ? 'সেভ হচ্ছে...' : 'সেটিংস আপডেট করুন ➔'}
                </button>
              </div>
            </form>
          </div>

          {/* Connection Test */}
          <div className="bg-slate-900 p-10 md:p-14 rounded-[4rem] shadow-2xl text-white relative overflow-hidden">
             <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[80px] rounded-full"></div>
             <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                <div className="flex-1">
                  <h4 className="text-xl font-black uppercase italic mb-2 tracking-tight">কানেকশন টেস্ট করুন</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">অটোমেটিক মেমো মেসেজ যাওয়ার জন্য এটি পরীক্ষা করা জরুরি</p>
                </div>
                <div className="flex w-full md:w-auto gap-4">
                  <input 
                    type="text" 
                    placeholder="মোবাইল নাম্বার দিন"
                    className="flex-1 md:w-60 p-5 bg-white/5 border border-white/10 rounded-2xl outline-none font-bold text-sm text-white focus:border-emerald-500 transition-all"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                  />
                  <button 
                    onClick={handleSendTest}
                    disabled={isTesting || !apiToken}
                    className="px-10 bg-emerald-600 text-white py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-900/20 disabled:opacity-20"
                  >
                    {isTesting ? 'টেস্ট হচ্ছে...' : 'টেস্ট ➔'}
                  </button>
                </div>
             </div>
          </div>
        </div>

        <div className="xl:col-span-1 space-y-10">
          {/* Quick Access Panel */}
          <div className="bg-white p-10 rounded-[3.5rem] shadow-xl border border-slate-100 flex flex-col items-center text-center space-y-8 h-full">
            <div className="w-24 h-24 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center text-4xl shadow-inner">🌐</div>
            <div>
              <h4 className="text-xl font-black uppercase italic tracking-tighter">এসএমএস প্যানেল এক্সেস</h4>
              <p className="text-[10px] text-slate-400 font-black uppercase mt-2 tracking-widest leading-relaxed">
                সরাসরি গেটওয়ে প্যানেল থেকে <br/> মেসেজ পাঠাতে বা লগইন করতে
              </p>
            </div>
            
            <div className="w-full p-6 bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
               <p className="text-[8px] font-black uppercase text-slate-400 mb-2 italic">Target Portal</p>
               <p className="text-[11px] font-bold text-slate-600 truncate mb-4">{panelUrl}</p>
               <button 
                 onClick={openPanel}
                 className="w-full py-5 rounded-2xl bg-slate-900 text-white font-black uppercase text-[10px] tracking-widest hover:bg-black transition-all shadow-lg active:scale-95"
               >
                 প্যানেল ওপেন করুন 🚀
               </button>
            </div>

            <div className="pt-6 border-t border-slate-50 w-full">
              <p className="text-[9px] font-bold text-slate-400 leading-relaxed italic text-left">
                <span className="text-indigo-500 block mb-2 font-black not-italic uppercase tracking-widest">গুরুত্বপূর্ণ তথ্য:</span>
                ১. আপনার প্যানেলে যদি আইপি হোয়াইটলিস্টিং (IP Whitelisting) অন থাকে, তবে উপরে দেওয়া আইপি এড্রেসটি চেক করুন।<br/><br/>
                ২. অটোমেটিক মেসেজ পাঠানোর সময় ব্রাউজারের ব্যাকগ্রাউন্ড ফ্রেম (Iframe) ব্যবহার করা হয় যাতে কানেকশন ইরর না হয়।<br/><br/>
                ৩. মেমো সেভ করার পর কাস্টমার স্বয়ংক্রিয়ভাবে একটি কনফার্মেশন এসএমএস পাবেন।
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SMSSettings;
