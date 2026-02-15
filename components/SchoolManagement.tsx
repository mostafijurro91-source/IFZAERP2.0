
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const SchoolManagement: React.FC = () => {
  const [students, setStudents] = useState<any[]>([]);
  const [feeHistory, setFeeHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [feeType, setFeeType] = useState("Monthly Tuition");
  const [month, setMonth] = useState(new Date().toLocaleString('default', { month: 'long' }));

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [stuRes, feeRes] = await Promise.all([
        supabase.from('students').select('*').order('name'),
        supabase.from('school_fees').select('*').order('created_at', { ascending: false }).limit(20)
      ]);
      setStudents(stuRes.data || []);
      setFeeHistory(feeRes.data || []);
    } catch (err) {} finally { setLoading(false); }
  };

  const handlePayFee = async () => {
    if (!selectedStudent || !amount || Number(amount) <= 0) return alert("ছাত্র এবং সঠিক টাকার পরিমাণ দিন!");
    setIsSaving(true);
    try {
      const { error } = await supabase.from('school_fees').insert([{
        student_id: selectedStudent.id,
        student_name: selectedStudent.name,
        class_name: selectedStudent.class_name,
        amount: Number(amount),
        fee_type: feeType,
        month: month,
        received_by: 'ADMIN'
      }]);

      if (error) throw error;
      alert("বেতন জমা নেওয়া হয়েছে! ✅");
      setAmount("");
      fetchInitialData();
    } catch (err: any) { alert(err.message); } finally { setIsSaving(false); }
  };

  const filteredStudents = useMemo(() => {
    return students.filter(s => 
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      s.student_id?.toString().includes(searchTerm)
    );
  }, [students, searchTerm]);

  const totalFeesToday = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return feeHistory
      .filter(f => f.created_at.startsWith(today))
      .reduce((sum, f) => sum + Number(f.amount), 0);
  }, [feeHistory]);

  return (
    <div className="space-y-6 pb-40 animate-reveal text-slate-900 font-sans">
      
      {/* 📊 Top School Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-1">
         <div className="bg-indigo-600 p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-bl-full"></div>
            <p className="text-[10px] font-black uppercase text-indigo-100 tracking-widest mb-1 italic relative z-10">মোট ছাত্র সংখ্যা</p>
            <p className="text-4xl font-black italic relative z-10">{students.length} জন</p>
         </div>
         <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <p className="text-[10px] font-black uppercase text-emerald-500 tracking-widest mb-1 italic">আজকের সংগৃহীত ফি</p>
            <p className="text-3xl font-black italic text-slate-800">৳{totalFeesToday.toLocaleString()}</p>
         </div>
         <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-sm">
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 italic">সিস্টেম স্ট্যাটাস</p>
            <p className="text-xl font-black italic text-emerald-400">অনলাইন ✓</p>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 px-1">
         {/* 📝 Fee Collection Form */}
         <div className="bg-white p-8 md:p-12 rounded-[3.5rem] border border-slate-100 shadow-2xl space-y-8">
            <div className="flex items-center gap-5">
               <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-xl font-black italic shadow-xl">S</div>
               <div>
                  <h3 className="text-2xl font-black text-slate-900 italic tracking-tight uppercase leading-none">বেতন ও ফি সংগ্রহ</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-2 tracking-widest">School Accounts Terminal</p>
               </div>
            </div>
            
            <div className="space-y-6">
               <div className="space-y-4">
                  <input 
                    className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[1.8rem] outline-none font-bold shadow-inner" 
                    placeholder="ছাত্রের নাম বা আইডি খুঁজুন..." 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                  
                  <div className="max-h-40 overflow-y-auto custom-scroll space-y-2">
                     {filteredStudents.slice(0, 10).map(s => (
                        <div 
                           key={s.id} 
                           onClick={() => setSelectedStudent(s)}
                           className={`p-4 rounded-2xl border cursor-pointer transition-all ${selectedStudent?.id === s.id ? 'bg-indigo-50 border-indigo-600' : 'bg-white hover:bg-slate-50'}`}
                        >
                           <p className="font-black uppercase text-xs italic">{s.name}</p>
                           <p className="text-[9px] text-slate-400 font-bold">Class: {s.class_name} • Roll: {s.roll_no}</p>
                        </div>
                     ))}
                  </div>
               </div>

               {selectedStudent && (
                 <div className="animate-reveal space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                       <select className="p-5 bg-slate-50 border border-slate-100 rounded-[1.8rem] outline-none font-bold" value={feeType} onChange={e => setFeeType(e.target.value)}>
                          <option>Monthly Tuition</option>
                          <option>Admission Fee</option>
                          <option>Exam Fee</option>
                          <option>Others</option>
                       </select>
                       <select className="p-5 bg-slate-50 border border-slate-100 rounded-[1.8rem] outline-none font-bold" value={month} onChange={e => setMonth(e.target.value)}>
                          {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map(m => (
                             <option key={m}>{m}</option>
                          ))}
                       </select>
                    </div>

                    <div className="relative">
                       <input 
                          type="number" 
                          className="w-full p-8 bg-slate-900 border-none rounded-[2.5rem] text-center text-5xl font-black italic text-indigo-400 shadow-2xl" 
                          placeholder="0.00" 
                          value={amount}
                          onChange={e => setAmount(e.target.value)}
                       />
                       <p className="text-center text-[9px] font-black text-slate-500 uppercase mt-4 italic tracking-widest">টাকার পরিমাণ (BDT)</p>
                    </div>

                    <button 
                      disabled={isSaving} 
                      onClick={handlePayFee}
                      className="w-full bg-indigo-600 text-white py-6 rounded-[2.5rem] font-black uppercase text-xs tracking-[0.3em] shadow-xl active:scale-95 transition-all"
                    >
                       {isSaving ? 'সংরক্ষণ হচ্ছে...' : 'ফি গ্রহণ করুন ➔'}
                    </button>
                 </div>
               )}
            </div>
         </div>

         {/* ⏳ Recent Collection History */}
         <div className="space-y-6">
            <h4 className="text-[11px] font-black text-slate-400 uppercase italic tracking-[0.2em] ml-4">সাম্প্রতিক কালেকশন হিস্টোরি</h4>
            <div className="space-y-3">
               {feeHistory.map(fee => (
                  <div key={fee.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex justify-between items-center group animate-reveal">
                     <div>
                        <h4 className="font-black text-slate-800 uppercase italic text-sm">{fee.student_name}</h4>
                        <p className="text-[9px] font-black text-slate-400 uppercase mt-1">{fee.fee_type} • {fee.month}</p>
                     </div>
                     <p className="text-2xl font-black italic text-slate-900 tracking-tighter shrink-0">৳{fee.amount}</p>
                  </div>
               ))}
               {feeHistory.length === 0 && <div className="py-20 text-center opacity-10 font-black uppercase text-xs italic italic">কোনো ডাটা নেই</div>}
            </div>
         </div>
      </div>
    </div>
  );
};

export default SchoolManagement;
