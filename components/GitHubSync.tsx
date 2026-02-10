
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const SystemSetup: React.FC = () => {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => { checkConnection(); }, []);

  const checkConnection = async () => {
    setChecking(true);
    try {
      const { data } = await supabase.from('users').select('count', { count: 'exact', head: true });
      setIsConnected(!!data);
    } catch {
      setIsConnected(false);
    } finally {
      setChecking(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('কপি করা হয়েছে: ' + text);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-32 animate-reveal font-sans text-slate-900">
      
      {/* Visual Header based on user's screenshot */}
      <div className="bg-white p-10 md:p-14 rounded-[4rem] border shadow-sm border-slate-100 relative overflow-hidden">
         <div className="flex items-center gap-6 mb-12">
            <div className="w-16 h-16 bg-blue-600 rounded-[1.8rem] flex items-center justify-center text-3xl shadow-xl text-white">📡</div>
            <div>
               <h3 className="text-2xl font-black uppercase italic tracking-tighter">Vercel DNS কনফিগারেশন এরর সমাধান</h3>
               <p className="text-[10px] text-slate-400 font-black uppercase mt-2 tracking-widest">আপনার স্ক্রিনশট অনুযায়ী নিচের ধাপগুলো শেষ করুন</p>
            </div>
         </div>

         <div className="space-y-12">
            {/* Warning Section */}
            <div className="p-8 bg-rose-50 border-2 border-dashed border-rose-200 rounded-[3rem]">
               <h4 className="font-black text-rose-600 uppercase text-xs mb-4 italic flex items-center gap-2">
                 ⚠️ প্রথমে এটি ডিলিট (Delete) করুন:
               </h4>
               <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-rose-100">
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase italic mb-1">Conflicting Record (Type A)</p>
                    <p className="text-xl font-black italic text-rose-600">161.248.189.34</p>
                  </div>
                  <span className="text-[9px] font-black text-rose-300 uppercase italic">Must Delete</span>
               </div>
               <p className="text-[11px] font-bold text-slate-500 mt-4 leading-relaxed">
                 আপনার সিপ্যানেলের **Zone Editor**-এ গিয়ে এই আইপি অ্যাড্রেসওয়ালা রেকর্ডটি খুঁজে ডিলিট করুন। এটি না মুছলে Vercel কানেক্ট হবে না।
               </p>
            </div>

            {/* Action Section */}
            <div className="p-8 bg-emerald-50 border-2 border-dashed border-emerald-200 rounded-[3rem]">
               <h4 className="font-black text-emerald-600 uppercase text-xs mb-4 italic flex items-center gap-2">
                 ✅ এরপর এটি অ্যাড (Add) করুন:
               </h4>
               <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-emerald-100">
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase italic mb-1">New Vercel IP (Type A)</p>
                    <p className="text-2xl font-black italic text-blue-600 tracking-tighter">76.76.21.21</p>
                  </div>
                  <button onClick={() => copyToClipboard('76.76.21.21')} className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black uppercase text-[9px] tracking-widest active:scale-90 transition-all shadow-lg">Copy IP</button>
               </div>
               <p className="text-[11px] font-bold text-slate-500 mt-4 leading-relaxed">
                 সিপ্যানেলে **+ A Record** বাটনে ক্লিক করে Name বক্সে `@` বা `ifzaerp.com` দিন এবং Address বক্সে উপরের আইপিটি পেস্ট করুন।
               </p>
            </div>

            {/* Status Section */}
            <div className="p-10 bg-slate-50 rounded-[3rem] border border-slate-100 text-center">
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">সিস্টেম কানেকশন স্ট্যাটাস</p>
               <div className="flex justify-center items-center gap-4">
                  <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
                  <p className="text-sm font-black uppercase italic tracking-tighter">
                    {checking ? 'চেক করা হচ্ছে...' : isConnected ? 'সার্ভার সিঙ্ক: অনলাইন ✓' : 'সার্ভার সিঙ্ক: অফলাইন !'}
                  </p>
               </div>
               <button onClick={checkConnection} className="mt-6 text-[9px] font-black text-blue-600 uppercase underline">Refresh Sync</button>
            </div>
         </div>
      </div>

      <div className="p-10 bg-slate-950 rounded-[4rem] text-white flex flex-col md:flex-row justify-between items-center gap-8 shadow-2xl relative overflow-hidden">
         <div className="absolute top-0 left-0 w-32 h-32 bg-blue-600/10 blur-[50px] rounded-full"></div>
         <div className="relative z-10">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-3">Enterprise Cloud Terminal</p>
            <h4 className="text-2xl font-black uppercase italic tracking-tighter">IFZA Electronics Group</h4>
         </div>
         <div className="text-right shrink-0">
            <p className="text-[9px] font-black text-blue-500 uppercase mb-1 tracking-widest">Version Control</p>
            <p className="text-xs font-bold text-white/40 italic">System Node v4.6.8</p>
         </div>
      </div>
    </div>
  );
};

export default SystemSetup;
