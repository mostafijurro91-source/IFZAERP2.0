
import React, { useState, useEffect } from 'react';
import { Company, UserRole } from '../types';
import { supabase } from '../lib/supabase';

const Team: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ username: '', password: '', name: '', role: 'STAFF' as UserRole, company: 'Transtec' as Company });

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('users').select('*').order('name');
      setUsers(data || []);
    } finally { setLoading(false); }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('users').insert([formData]);
      if (error) throw error;
      setShowModal(false);
      fetchUsers();
      alert("সফলভাবে নতুন ইউজার তৈরি হয়েছে!");
    } catch (err: any) { alert("ত্রুটি: " + err.message); }
  };

  return (
    <div className="space-y-8 pb-32">
      <div className="bg-slate-900 p-8 rounded-[3.5rem] flex flex-col md:flex-row justify-between items-center gap-6 shadow-2xl border border-white/5">
        <div className="flex items-center gap-6">
           <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center text-3xl shadow-xl italic font-black text-white transition-transform hover:rotate-3">T</div>
           <div>
              <h3 className="text-white text-2xl font-black uppercase italic italic tracking-tighter leading-none">টিম মনিটরিং হাব</h3>
              <p className="text-[10px] text-blue-400 font-black uppercase mt-2 tracking-widest">Real-time Human Resources Control</p>
           </div>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-white text-slate-900 px-10 py-5 rounded-[2rem] font-black uppercase text-[11px] tracking-widest shadow-xl active:scale-95 transition-all">নতুন মেম্বার যুক্ত করুন +</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {loading && users.length === 0 ? (
          <div className="col-span-full py-32 text-center animate-pulse text-slate-300 font-black uppercase italic">টিম ডাটা লোড হচ্ছে...</div>
        ) : users.map(u => (
          <div key={u.id} className="bg-white p-10 rounded-[3.5rem] border shadow-sm group hover:shadow-2xl transition-all duration-500 hover:-translate-y-1">
             <div className="flex items-center gap-6 mb-8">
                <div className="w-16 h-16 rounded-3xl bg-slate-900 flex items-center justify-center text-white text-2xl font-black italic shadow-xl group-hover:bg-blue-600 transition-colors">{u.name.charAt(0)}</div>
                <div className="flex-1 min-w-0">
                   <h4 className="font-black text-slate-800 uppercase italic text-lg truncate">{u.name}</h4>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1.5">{u.role} | {u.company}</p>
                </div>
             </div>
             
             <div className="space-y-4 p-6 bg-slate-50 rounded-[2.5rem] border border-slate-100">
                <div className="flex justify-between items-center">
                   <span className="text-[9px] font-black text-slate-400 uppercase">Username</span>
                   <span className="text-xs font-black text-slate-800">{u.username}</span>
                </div>
                <div className="flex justify-between items-center">
                   <span className="text-[9px] font-black text-slate-400 uppercase">Status</span>
                   <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${u.last_seen ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-400'}`}>
                     {u.last_seen ? 'Online' : 'Never Active'}
                   </span>
                </div>
                {u.last_lat && (
                   <a href={`https://www.google.com/maps?q=${u.last_lat},${u.last_lng}`} target="_blank" className="w-full mt-4 flex items-center justify-center bg-slate-900 text-white py-3.5 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all">📍 ট্র্যাক করুন</a>
                )}
             </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[1000] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white p-10 md:p-14 rounded-[4rem] w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]">
            <h3 className="text-2xl font-black text-slate-900 mb-10 uppercase italic border-b pb-6">নতুন টিম প্রোফাইল</h3>
            <form onSubmit={handleAddUser} className="space-y-5 text-[11px] font-black uppercase">
               <input required className="w-full p-5 bg-slate-50 border-none rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/5 transition-all" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="পুরো নাম" />
               <input required className="w-full p-5 bg-slate-50 border-none rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/5 transition-all" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} placeholder="ইউজার আইডি (Username)" />
               <input required className="w-full p-5 bg-slate-50 border-none rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/5 transition-all" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} placeholder="পাসওয়ার্ড" />
               <div className="grid grid-cols-2 gap-4">
                  <select className="p-5 bg-slate-50 border-none rounded-2xl outline-none font-black text-[11px] uppercase" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as UserRole})}>
                     <option value="STAFF">STAFF</option><option value="DELIVERY">DELIVERY</option><option value="ADMIN">ADMIN</option>
                  </select>
                  <select className="p-5 bg-slate-50 border-none rounded-2xl outline-none font-black text-[11px] uppercase" value={formData.company} onChange={e => setFormData({...formData, company: e.target.value as Company})}>
                     <option value="Transtec">Transtec</option><option value="SQ Light">SQ Light</option>
                     {/* Fix: Changed 'SQ Cable' to 'SQ Cables' */}
                     <option value="SQ Cables">SQ Cables</option>
                  </select>
               </div>
               <div className="flex gap-4 pt-10">
                  <button type="submit" className="flex-1 bg-slate-900 text-white py-6 rounded-[2.5rem] font-black uppercase text-xs tracking-widest shadow-xl active:scale-95 transition-all">মেম্বার তৈরি করুন</button>
                  <button type="button" onClick={() => setShowModal(false)} className="px-10 text-slate-400 font-black hover:text-red-500 transition-colors">বাতিল</button>
               </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Team;
