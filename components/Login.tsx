
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
          <div className="text-center mb-10">
            <div className="text-6xl font-black italic tracking-tighter text-white lowercase leading-none flex justify-center items-baseline">
              ifza<span className="text-blue-500 ml-1">.</span>erp
            </div>
            <p className="text-[8px] font-black uppercase tracking-[0.6em] text-slate-500 mt-4 italic">Enterprise Access Portal</p>
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
