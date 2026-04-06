
import React, { useState } from 'react';
import { User, Company, UserRole } from '../types';
import { supabase } from '../lib/supabase';

interface LoginProps {
  onLogin: (user: User) => void;
  onBack?: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin, onBack }) => {
  const [loginType, setLoginType] = useState<'STAFF' | 'CUSTOMER'>('STAFF');
  const [username, setUsername] = useState(""); 
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    
    try {
      if (loginType === 'STAFF') {
        const { data, error: dbError } = await supabase
          .from('users')
          .select('*')
          .eq('username', username.trim().toLowerCase())
          .eq('password', password.trim())
          .maybeSingle();

        if (dbError) throw dbError;
        if (!data) {
          setError("ভুল ইউজার আইডি অথবা পাসওয়ার্ড!");
        } else {
          onLogin({
            id: data.id,
            name: data.name,
            role: data.role.toUpperCase() as UserRole,
            company: data.company as Company,
            username: data.username,
            customer_id: data.customer_id
          });
        }
      } else {
        // Customer login from 'customers' table using portal credentials
        const { data: custData, error: custError } = await supabase
          .from('customers')
          .select('*')
          .eq('portal_username', username.trim().toLowerCase())
          .eq('portal_password', password.trim())
          .maybeSingle();

        if (custError) throw custError;
        if (!custData) {
          setError("ভুল কাস্টমার আইডি অথবা সিক্রেট কি!");
        } else {
          onLogin({
            id: custData.id,
            name: custData.name,
            role: 'CUSTOMER',
            company: 'Transtec', 
            username: custData.portal_username || '',
            customer_id: custData.id
          });
        }
      }
    } catch (err: any) { 
        setError("সার্ভার কানেকশন এরর!"); 
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#05070a] flex items-center justify-center p-6 relative overflow-hidden font-sans">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full"></div>
      
      {onBack && (
        <button onClick={onBack} className="absolute top-10 left-10 text-white/40 hover:text-white font-black uppercase text-[10px] tracking-widest flex items-center gap-3 transition-all z-[100]">
           <span className="text-xl">←</span> Back to Home
        </button>
      )}

      <div className="relative w-full max-w-[460px] animate-reveal">
        <div className="bg-[#0d121f]/80 backdrop-blur-3xl border border-white/5 p-10 md:p-14 rounded-[3.5rem] shadow-2xl">
          <div className="text-center mb-10 overflow-hidden">
             <div className="flex flex-col items-center mb-8 group cursor-pointer animate-logo-float liquid-glow mt-8">
                <div className="relative">
                  <div className="w-20 h-20 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-900 rounded-[2.5rem] flex items-center justify-center text-white text-4xl font-black italic shadow-[0_30px_60px_rgba(37,99,235,0.4)] border border-white/20 transition-all duration-700 group-hover:rotate-[360deg] active:scale-95 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-50"></div>
                    <div className="absolute inset-0 bg-white/10 skew-x-[-20deg] animate-[premium-shimmer_3s_infinite_cubic-bezier(0.4,0,0.2,1)]"></div>
                    <span className="relative z-10 drop-shadow-2xl">if</span>
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-emerald-500 rounded-full border-4 border-[#0d121f] shadow-lg active-pulse"></div>
                </div>
                
                <div className="text-center mt-8">
                  <div className="text-5xl font-black italic tracking-tighter leading-none relative group-hover:scale-110 transition-transform duration-700">
                     <span className="logo-premium drop-shadow-sm">ইফজা</span>
                     <span className="text-blue-500 animate-logo-glow inline-block ml-0.5">.</span>
                  </div>
                  <div className="flex flex-col items-center mt-6">
                    <div className="h-[1px] w-16 bg-gradient-to-r from-transparent via-blue-400/30 to-transparent mb-4"></div>
                    <p className="text-[8px] text-slate-500 font-extrabold uppercase tracking-[0.8em] leading-none opacity-40 group-hover:opacity-100 transition-opacity">ERP ENTERPRISE V4</p>
                  </div>
                </div>
             </div>
          </div>

          <div className="bg-white/5 p-1.5 rounded-2xl flex gap-1.5 mb-10 border border-white/5">
             <button onClick={() => { setLoginType('STAFF'); setError(""); }} className={`flex-1 py-4 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${loginType === 'STAFF' ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-500'}`}>Internal Staff</button>
             <button onClick={() => { setLoginType('CUSTOMER'); setError(""); }} className={`flex-1 py-4 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${loginType === 'CUSTOMER' ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-500'}`}>Shop Owner</button>
          </div>

          {error && <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-5 rounded-2xl text-[10px] mb-8 font-black text-center uppercase animate-pulse">⚠️ {error}</div>}

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-1.5">
               <label className="text-[9px] font-black text-slate-500 uppercase ml-4 italic tracking-widest">Username / User ID</label>
               <input required className="w-full p-6 bg-white/5 border border-white/10 rounded-2xl text-white outline-none font-bold focus:border-blue-500/50 focus:ring-4 ring-blue-500/10 transition-all" placeholder={loginType === 'STAFF' ? "Enter username" : "Enter shop ID"} value={username} onChange={e => setUsername(e.target.value)} />
            </div>
            <div className="space-y-1.5">
               <label className="text-[9px] font-black text-slate-500 uppercase ml-4 italic tracking-widest">Security Key (Password)</label>
               <input required type="password" className="w-full p-6 bg-white/5 border border-white/10 rounded-2xl text-white outline-none font-bold focus:border-blue-500/50 focus:ring-4 ring-blue-500/10 transition-all" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <button disabled={loading} className={`w-full ${loginType === 'STAFF' ? 'bg-blue-600' : 'bg-emerald-600'} text-white py-6 rounded-2xl font-black text-[12px] uppercase tracking-[0.3em] shadow-xl active:scale-95 transition-all mt-4`}>
                {loading ? "AUTHENTICATING..." : "SIGN IN TO ERP ➔"}
            </button>
          </form>
          
          <div className="mt-12 pt-6 border-t border-white/5 text-center">
             <p className="text-white/10 font-black uppercase text-[7px] tracking-[0.5em] italic">Official Enterprise Infrastructure by IFZAERP.COM</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
