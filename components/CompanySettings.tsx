
import React, { useState, useEffect } from 'react';
import { CompanyRecord } from '../types';
import { supabase, db } from '../lib/supabase';

interface CompanySettingsProps {
  onUpdate: () => void;
}

const CompanySettings: React.FC<CompanySettingsProps> = ({ onUpdate }) => {
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const data = await db.getAllCompanies();
      setCompanies(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || isSaving) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('companies')
        .insert([{ name: newName.trim(), is_active: true }]);

      if (error) throw error;
      
      setNewName('');
      await fetchCompanies();
      onUpdate();
      alert('নতুন কোম্পানি সফলভাবে যোগ করা হয়েছে! ✅');
    } catch (err: any) {
      alert('ত্রুটি: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStatus = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('companies')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (error) throw error;
      
      await fetchCompanies();
      onUpdate();
    } catch (err: any) {
      alert('ত্রুটি: ' + err.message);
    }
  };

  return (
    <div className="space-y-8 pb-32 font-sans text-slate-900 animate-reveal">
      <div className="bg-[#0f172a] p-10 md:p-14 rounded-[4rem] text-white shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 blur-[120px] rounded-full"></div>
        <div className="relative z-10">
           <h3 className="text-3xl md:text-4xl font-black uppercase italic tracking-tighter leading-none">কোম্পানি সেটিংস</h3>
           <p className="text-[10px] text-blue-400 font-black uppercase mt-4 tracking-[0.4em] italic leading-none">Enterprise Resource Management</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Add Company Form */}
        <div className="lg:col-span-1">
          <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 sticky top-10">
            <h4 className="text-sm font-black uppercase italic tracking-widest text-slate-400 mb-8 ml-2">নতুন কোম্পানি যোগ করুন</h4>
            <form onSubmit={handleAddCompany} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-slate-400 ml-4 italic">কোম্পানির নাম</label>
                <input 
                  required
                  type="text" 
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="যেমন: IFZA Electronics"
                  className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-black uppercase italic text-sm focus:border-blue-600 transition-all"
                />
              </div>
              <button 
                disabled={isSaving}
                className="w-full bg-blue-600 text-white py-6 rounded-2xl font-black uppercase text-xs tracking-[0.3em] shadow-lg active:scale-95 transition-all hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? 'প্রসেসিং...' : 'সেভ করুন ➔'}
              </button>
            </form>
          </div>
        </div>

        {/* Company List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-[3rem] shadow-xl border border-slate-100 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-900 text-white/50 text-[9px] font-black uppercase tracking-widest italic border-b border-white/5">
                <tr>
                  <th className="px-8 py-6">Company Name</th>
                  <th className="px-8 py-6 text-center">Status</th>
                  <th className="px-8 py-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan={3} className="py-20 text-center animate-pulse text-slate-300 font-black uppercase tracking-widest">লোড হচ্ছে...</td>
                  </tr>
                ) : companies.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-20 text-center text-slate-300 font-black uppercase tracking-widest">কোনো কোম্পানি পাওয়া যায়নি</td>
                  </tr>
                ) : companies.map((co) => (
                  <tr key={co.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-6">
                      <p className="font-black uppercase italic text-slate-800 text-lg">{co.name}</p>
                      <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter mt-1 italic">
                        Created: {new Date(co.created_at).toLocaleDateString('bn-BD')}
                      </p>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <span className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest italic ${
                        co.is_active ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-400 border border-slate-200'
                      }`}>
                        {co.is_active ? 'Active ✓' : 'Inactive ✕'}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <button 
                        onClick={() => toggleStatus(co.id, co.is_active)}
                        className={`px-6 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-90 border-2 ${
                          co.is_active 
                          ? 'bg-rose-50 text-rose-500 border-rose-100 hover:bg-rose-500 hover:text-white' 
                          : 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-600 hover:text-white'
                        }`}
                      >
                        {co.is_active ? 'Archive 📦' : 'Restore ♻️'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-8 bg-blue-50 rounded-[2.5rem] border border-blue-100">
             <p className="text-[10px] font-bold text-blue-800 leading-relaxed italic">
               <span className="font-black text-xs block mb-2">💡 প্রোটাইপ নোট:</span>
               কোম্পানি ডিলিট করার কোনো অপশন নেই যাতে পূর্বের কোনো মেমো বা ট্রানজ্যাকশন ডাটাবেজ থেকে হারিয়ে না যায়। যদি কোনো কোম্পানির কাজ শেষ হয়ে যায়, তবে সেটিকে **Archive** করে দিন। এতে সেটি মেনু থেকে সরে যাবে কিন্তু পুরোনো ডাটা রিপোর্টে ঠিকই থাকবে।
             </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanySettings;
