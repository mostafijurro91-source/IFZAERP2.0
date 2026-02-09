
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const SystemSetup: React.FC = () => {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [dbStats, setDbStats] = useState<any>({ users: 0, customers: 0, products: 0 });
  const [checking, setChecking] = useState(false);

  useEffect(() => { checkConnection(); }, []);

  const checkConnection = async () => {
    setChecking(true);
    try {
      const [uCount, cCount, pCount] = await Promise.all([
        supabase.from('users').select('count', { count: 'exact', head: true }),
        supabase.from('customers').select('count', { count: 'exact', head: true }),
        supabase.from('products').select('count', { count: 'exact', head: true })
      ]);
      
      setIsConnected(!uCount.error);
      setDbStats({
        users: uCount.count || 0,
        customers: cCount.count || 0,
        products: pCount.count || 0
      });
    } catch {
      setIsConnected(false);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-32 animate-reveal font-sans">
      
      <div className={`p-12 md:p-16 rounded-[4rem] text-white shadow-2xl relative overflow-hidden transition-all duration-1000 ${isConnected ? 'bg-emerald-600' : 'bg-red-600'}`}>
        <div className="absolute right-[-20px] top-[-20px] text-[200px] opacity-10 font-black italic">{isConnected ? '✓' : '!'}</div>
        <div className="relative z-10">
          <h2 className="text-4xl md:text-6xl font-black uppercase italic tracking-tighter leading-none mb-4">
            {checking ? 'Checking System...' : isConnected ? 'Cloud Active' : 'Offline'}
          </h2>
          <p className="text-sm font-black uppercase tracking-[0.4em] opacity-70 italic mb-10">
            {isConnected ? 'আপনার এন্টারপ্রাইজ ক্লাউড ডাটাবেস সফলভাবে কানেক্টেড আছে' : 'সার্ভারের সাথে যোগাযোগ করা যাচ্ছে না'}
          </p>
          <div className="grid grid-cols-3 gap-6">
             <div className="bg-white/10 p-6 rounded-[2rem] border border-white/5">
                <p className="text-[9px] font-black uppercase mb-1">Personnel</p>
                <p className="text-2xl font-black italic">{dbStats.users}</p>
             </div>
             <div className="bg-white/10 p-6 rounded-[2rem] border border-white/5">
                <p className="text-[9px] font-black uppercase mb-1">Total Shops</p>
                <p className="text-2xl font-black italic">{dbStats.customers}</p>
             </div>
             <div className="bg-white/10 p-6 rounded-[2rem] border border-white/5">
                <p className="text-[9px] font-black uppercase mb-1">Active SKUs</p>
                <p className="text-2xl font-black italic">{dbStats.products}</p>
             </div>
          </div>
          <button onClick={checkConnection} className="mt-12 bg-white text-slate-900 px-10 py-5 rounded-[2rem] font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all">রিফ্রেশ সিস্টেম স্ট্যাটাস 🔄</button>
        </div>
      </div>

      <div className="bg-white p-10 md:p-16 rounded-[4rem] border shadow-sm border-slate-100">
         <div className="flex items-center gap-6 mb-12">
            <div className="w-16 h-16 bg-slate-900 rounded-3xl flex items-center justify-center text-3xl shadow-xl text-white italic font-black">!</div>
            <div>
               <h3 className="text-2xl font-black uppercase italic tracking-tighter text-slate-900">cPanel এবং হোস্টিং গাইডলাইন</h3>
               <p className="text-[10px] text-slate-400 font-black uppercase mt-2 tracking-widest italic">System Deployment Instructions</p>
            </div>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-slate-50 p-10 rounded-[3rem] border border-slate-100 relative group overflow-hidden">
               <span className="absolute -right-4 -bottom-4 text-7xl opacity-5 group-hover:opacity-10 transition-opacity">💿</span>
               <h4 className="font-black text-sm uppercase mb-4 text-slate-800">১. ডাটাবেস সেটআপ</h4>
               <p className="text-xs leading-relaxed text-slate-500 font-medium italic">
                 আপনার ছবির "MySQL Databases" সেকশনে কোনো কাজ করতে হবে না। এই অ্যাপ্লিকেশনটি সরাসরি ক্লাউড ডাটাবেস (Supabase) ব্যবহার করে। আপনি শুধু SQL Editor-এ গিয়ে আমার দেওয়া ফিক্সগুলো রান করবেন।
               </p>
            </div>
            <div className="bg-blue-50 p-10 rounded-[3rem] border border-blue-100 relative group overflow-hidden">
               <span className="absolute -right-4 -bottom-4 text-7xl opacity-5 group-hover:opacity-10 transition-opacity">🚀</span>
               <h4 className="font-black text-sm uppercase mb-4 text-blue-800">২. ফাইল আপলোড</h4>
               <p className="text-xs leading-relaxed text-slate-600 font-medium italic">
                 cPanel-এর <b>"File Manager"</b>-এ গিয়ে <b>public_html</b> ফোল্ডারে এই প্রোজেক্টের বিল্ড ফাইলগুলো আপলোড করুন। অ্যাপটি অটোমেটিক ক্লাউড থেকে সব ডাটা রিসিভ করা শুরু করবে।
               </p>
            </div>
         </div>
      </div>

      <div className="bg-slate-900 p-10 rounded-[3.5rem] text-center border border-white/5">
         <p className="text-white/30 text-[9px] font-black uppercase tracking-[0.6em] mb-4 italic">Cloud Infrastructure Security</p>
         <p className="text-white/60 text-sm font-medium leading-relaxed max-w-2xl mx-auto italic">
           "আপনার ERP সিস্টেমটি বর্তমানে IFZA Electronics-এর ৩টি কোম্পানির (Transtec, SQ Light, SQ Cables) জন্যই সিঙ্ক করা হয়েছে। সিস্টেমটি এখন রিয়েল-টাইম ডাটা প্রসেসিংয়ের জন্য প্রস্তুত।"
         </p>
      </div>

    </div>
  );
};

export default SystemSetup;
