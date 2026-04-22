
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { sendSMS } from '../lib/sms';

const SMSSettings: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [senderId, setSenderId] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://sms.ummahhostbd.com/api/v1');
  const [isSaving, setIsSaving] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  // Test SMS state
  const [testPhone, setTestPhone] = useState('');
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    // Load settings from localStorage
    const savedApiKey = localStorage.getItem('sms_api_key') || ''; 
    const savedSenderId = localStorage.getItem('sms_sender_id') || ''; 
    const savedBaseUrl = localStorage.getItem('sms_base_url') || 'https://sms.ummahhostbd.com/api/v1';

    setApiKey(savedApiKey);
    setSenderId(savedSenderId);
    setBaseUrl(savedBaseUrl);

    if (savedApiKey) {
      fetchBalance(savedApiKey, savedBaseUrl);
    }
  }, []);

  const fetchBalance = async (key: string, url: string) => {
    if (!key || key.includes('***')) return;
    setIsLoadingBalance(true);
    try {
      const response = await fetch(`${url}/user/balance?api_key=${key}`);
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
    
    localStorage.setItem('sms_api_key', apiKey);
    localStorage.setItem('sms_sender_id', senderId);
    localStorage.setItem('sms_base_url', baseUrl);
    
    setTimeout(() => {
      setIsSaving(false);
      alert('SMS সেটিংস সফলভাবে সেভ করা হয়েছে! ✅');
      fetchBalance(apiKey, baseUrl);
    }, 500);
  };

  const handleSendTest = async () => {
    if (!testPhone) return alert('টেস্ট করার জন্য একটি মোবাইল নাম্বার দিন।');
    setIsTesting(true);
    try {
      const result = await sendSMS(testPhone, "এটি ইফজা ইআরপি থেকে একটি টেস্ট মেসেজ।");
      if (result.success) {
        alert('টেস্ট এসএমএস সফলভাবে পাঠানো হয়েছে! ✅');
      } else {
        alert('এসএমএস পাঠানো যায়নি: ' + result.error);
      }
    } catch (err: any) {
      alert('ত্রুটি: ' + err.message);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-8 pb-32 font-sans text-slate-900 animate-reveal">
      <div className="bg-[#0f172a] p-10 md:p-14 rounded-[4rem] text-white shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 blur-[120px] rounded-full"></div>
        <div className="relative z-10">
           <h3 className="text-3xl md:text-4xl font-black uppercase italic tracking-tighter leading-none">SMS গেটওয়ে সেটিংস</h3>
           <p className="text-[10px] text-blue-400 font-black uppercase mt-4 tracking-[0.4em] italic leading-none">Ummah Host BD SMS Integration</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Main Settings Form */}
          <div className="bg-white p-8 md:p-12 rounded-[3rem] shadow-xl border border-slate-100">
            <form onSubmit={handleSave} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-4 italic tracking-widest">API Key</label>
                  <input 
                    required
                    type="password" 
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="আপনার API Key দিন"
                    className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold text-sm focus:border-blue-600 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-4 italic tracking-widest">Center ID (সেন্টার আইডি)</label>
                  <input 
                    type="text" 
                    value={senderId}
                    onChange={(e) => setSenderId(e.target.value)}
                    placeholder="যেমন: 8809617632427"
                    className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold text-sm focus:border-blue-600 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-4 italic tracking-widest">Base URL</label>
                <input 
                  required
                  type="text" 
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold text-sm focus:border-blue-600 transition-all"
                />
              </div>

              <div className="pt-4">
                <button 
                  disabled={isSaving}
                  className="w-full md:w-auto px-12 bg-blue-600 text-white py-6 rounded-2xl font-black uppercase text-xs tracking-[0.3em] shadow-lg active:scale-95 transition-all hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSaving ? 'সেভ হচ্ছে...' : 'সেটিংস সেভ করুন ➔'}
                </button>
              </div>
            </form>
          </div>

          {/* Test SMS Section */}
          <div className="bg-slate-50 p-8 md:p-10 rounded-[3rem] border border-dashed border-slate-200">
             <h4 className="text-sm font-black uppercase italic mb-6">টেস্ট এসএমএস পাঠান</h4>
             <div className="flex flex-col md:flex-row gap-4">
                <input 
                  type="text" 
                  placeholder="মোবাইল নাম্বার (যেমন: 01712345678)"
                  className="flex-1 p-5 bg-white border-2 border-slate-100 rounded-2xl outline-none font-bold text-sm focus:border-blue-600"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                />
                <button 
                  onClick={handleSendTest}
                  disabled={isTesting || !apiKey}
                  className="px-8 bg-slate-900 text-white py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-black transition-all disabled:opacity-20"
                >
                  {isTesting ? 'পাঠানো হচ্ছে...' : 'টেস্ট করুন ➔'}
                </button>
             </div>
             <p className="text-[9px] text-slate-400 font-bold mt-4 uppercase italic">দ্রষ্টব্য: টেস্ট করার আগে উপরের সেটিংস সেভ করে নিন।</p>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-slate-900 p-8 rounded-[3rem] shadow-2xl text-white relative overflow-hidden h-full">
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-blue-600/20 blur-3xl rounded-full"></div>
            <div className="relative z-10 space-y-6">
              <h4 className="text-xs font-black uppercase italic tracking-[0.2em] text-blue-400">ব্যালেন্স স্ট্যাটাস</h4>
              
              <div className="py-4">
                {isLoadingBalance ? (
                  <div className="animate-pulse flex items-center gap-3">
                    <div className="h-10 w-32 bg-white/10 rounded-xl"></div>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    <span className="text-4xl font-black italic tracking-tighter">৳ {balance || '0.00'}</span>
                    <span className="text-[9px] font-bold uppercase text-white/40 mt-2 tracking-widest">Current API Balance</span>
                  </div>
                )}
              </div>

              <button 
                onClick={() => fetchBalance(apiKey, baseUrl)}
                className="w-full py-4 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
              >
                রিফ্রেশ করুন 🔄
              </button>

              <div className="pt-6 border-t border-white/5">
                <p className="text-[9px] font-bold text-white/50 leading-relaxed italic">
                  <span className="text-blue-400 block mb-1">প্রোটোকল নোট:</span>
                  সবগুলো SMS অপারেশন `POST` এন্ডপয়েন্ট ব্যবহার করে সম্পন্ন করা হবে। মোবাইল নাম্বার ফরমেট অবশ্যই `01XXXXXXXXX` অথবা `8801XXXXXXXXX` হতে হবে। সেন্টার আইডি (Center ID) ফিল্ডটি সঠিক থাকলে মেমো এবং টাকা জমার কনফার্মেশন মেসেজ স্বয়ংক্রিয়ভাবে চলে যাবে।
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SMSSettings;
