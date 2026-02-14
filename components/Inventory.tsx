
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Product, Company, UserRole, formatCurrency } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';
import * as XLSX from 'xlsx';

interface InventoryProps {
  company: Company;
  role: UserRole;
}

const Inventory: React.FC<InventoryProps> = ({ company, role }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isCompact, setIsCompact] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dbCo = mapToDbCompany(company);
  const isAdmin = role === 'ADMIN';

  useEffect(() => { fetchProducts(); }, [company]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { data } = await supabase.from('products').select('*').eq('company', dbCo).order('name');
      setProducts(data || []);
    } finally { setLoading(false); }
  };

  const handleOpenEdit = (p: Product) => { setEditingProduct({ ...p }); setShowEditModal(true); };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || isSaving) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('products').update({ name: editingProduct.name, mrp: Number(editingProduct.mrp), tp: Number(editingProduct.tp), stock: Number(editingProduct.stock), etp: Number(editingProduct.etp || 0) }).eq('id', editingProduct.id);
      if (error) throw error;
      setShowEditModal(false); 
      fetchProducts();
    } finally { setIsSaving(false); }
  };

  const filtered = useMemo(() => products.filter(p => p.name.toLowerCase().includes(search.toLowerCase())), [products, search]);

  const totalStockVal = useMemo(() => products.reduce((acc, p) => acc + (p.stock * p.tp), 0), [products]);

  return (
    <div className="space-y-8 pb-40 text-slate-900 animate-reveal relative">
      
      {/* 📊 Inventory Dashboard Header */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 no-print">
         <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-slate-100 flex items-center justify-between group overflow-hidden">
            <div className="relative z-10">
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Total Stock Valuation</p>
               <h3 className="text-4xl font-black italic tracking-tighter text-slate-900">{formatCurrency(totalStockVal)}</h3>
            </div>
            <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center text-4xl group-hover:scale-110 transition-transform">💰</div>
         </div>
         <div className="bg-slate-900 p-10 rounded-[3rem] shadow-2xl flex items-center justify-between text-white group overflow-hidden">
            <div className="relative z-10">
               <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1 italic">Active Models</p>
               <h3 className="text-4xl font-black italic tracking-tighter text-white">{products.length} <span className="text-base font-medium opacity-30 tracking-normal ml-2">SKUs Registered</span></h3>
            </div>
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center text-4xl group-hover:rotate-12 transition-transform">📦</div>
         </div>
      </div>

      <div className="sticky top-0 z-[110] bg-white/80 backdrop-blur-2xl -mx-6 px-6 py-4 border-b border-slate-200/50 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-4 items-center">
           <div className="flex-1 flex gap-2 items-center bg-slate-100 p-2 rounded-[2rem] shadow-inner border border-slate-200 w-full group focus-within:ring-4 ring-indigo-50 transition-all">
              <div className="pl-4 text-slate-400 group-focus-within:text-indigo-500">🔍</div>
              <input autoFocus type="text" placeholder="মডেল সার্চ করুন..." className="flex-1 p-3 bg-transparent border-none text-[13px] font-bold uppercase outline-none text-slate-900" value={search} onChange={e => setSearch(e.target.value)} />
              <button onClick={() => setIsCompact(!isCompact)} className="bg-white p-3 rounded-2xl shadow-sm text-lg active:scale-90 transition-all">{isCompact ? "🔳" : "☰"}</button>
           </div>
           <div className="flex gap-2 shrink-0">
              <button onClick={() => {}} className="bg-emerald-600 text-white px-8 py-4 rounded-3xl font-black uppercase text-[10px] shadow-xl active:scale-95 transition-all">📥 Export Excel</button>
              {isAdmin && (
                <button onClick={() => fileInputRef.current?.click()} className="bg-slate-900 text-white px-8 py-4 rounded-3xl font-black uppercase text-[10px] shadow-xl active:scale-95 transition-all">📤 Import Stock</button>
              )}
           </div>
        </div>
      </div>

      {loading ? (
        <div className="py-24 text-center animate-pulse text-slate-300 font-black uppercase italic text-xs tracking-[0.4em]">Inventory Nodes Syncing...</div>
      ) : (
        <div className={isCompact ? "bg-white rounded-[4rem] border border-slate-100 shadow-xl overflow-hidden" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8"}>
           {isCompact && (
             <div className="grid grid-cols-12 bg-slate-900 text-white/50 p-6 text-[8px] font-black uppercase tracking-widest italic">
                <div className="col-span-5">Product SKU Identity</div>
                <div className="col-span-2 text-right">TP Rate</div>
                <div className="col-span-2 text-right">Current Stock</div>
                <div className="col-span-3 text-right">Manage</div>
             </div>
           )}
           {filtered.map((p, idx) => (
             isCompact ? (
               <div key={p.id} className="grid grid-cols-12 p-6 border-b border-slate-50 hover:bg-indigo-50/50 transition-all items-center group animate-reveal" style={{ animationDelay: `${idx * 0.02}s` }}>
                  <div className="col-span-5 truncate pr-8 font-black uppercase italic text-slate-800 group-hover:text-indigo-600 transition-colors text-[13px]">{p.name}</div>
                  <div className="col-span-2 text-right font-black italic text-slate-400">৳{p.tp}</div>
                  <div className={`col-span-2 text-right font-black italic text-[18px] tracking-tighter ${p.stock < 10 ? 'text-rose-600 animate-pulse' : 'text-emerald-600'}`}>{p.stock}</div>
                  <div className="col-span-3 flex justify-end gap-2">
                     <button onClick={() => handleOpenEdit(p)} className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center text-xs shadow-xl active:scale-90 transition-all">📝</button>
                     {isAdmin && <button onClick={async () => { if(confirm("ডিলিট?")) { await supabase.from('products').delete().eq('id', p.id); fetchProducts(); } }} className="w-10 h-10 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center text-xs hover:bg-rose-500 hover:text-white transition-all shadow-sm">🗑️</button>}
                  </div>
               </div>
             ) : (
               <div key={p.id} className="bg-white p-10 rounded-[4rem] border border-slate-100 shadow-lg hover:shadow-2xl transition-all duration-700 group relative overflow-hidden animate-reveal" style={{ animationDelay: `${idx * 0.05}s` }}>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-bl-[5rem] -z-0 opacity-60 group-hover:scale-110 transition-transform"></div>
                  <div className="relative z-10">
                     <div className="flex justify-between items-start mb-8">
                        <span className={`px-5 py-2 rounded-2xl text-[9px] font-black uppercase tracking-widest italic shadow-sm ${p.stock < 10 ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                           Stock: {p.stock} Units
                        </span>
                        <div className="flex gap-2">
                           <button onClick={() => handleOpenEdit(p)} className="w-10 h-10 bg-white border rounded-xl flex items-center justify-center text-indigo-600 shadow-sm hover:bg-indigo-600 hover:text-white transition-all">📝</button>
                        </div>
                     </div>
                     <h4 className="text-[15px] font-black uppercase italic text-slate-800 leading-tight mb-10 h-12 line-clamp-2">{p.name}</h4>
                     <div className="border-t pt-8 flex justify-between items-end">
                        <div>
                           <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Trade Price</p>
                           <p className="font-black text-2xl text-slate-900 italic tracking-tighter">৳{p.tp}</p>
                        </div>
                        <div className="text-right">
                           <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">MRP</p>
                           <p className="font-black text-lg text-indigo-400 italic tracking-tighter">৳{p.mrp}</p>
                        </div>
                     </div>
                  </div>
               </div>
             )
           ))}
        </div>
      )}

      {showEditModal && editingProduct && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-3xl flex items-center justify-center z-[2000] p-4 text-slate-900 animate-reveal">
          <div className="bg-white p-10 md:p-14 rounded-[4.5rem] w-full max-w-lg shadow-2xl border border-white/20">
            <div className="flex justify-between items-center mb-10 border-b pb-8">
               <h3 className="text-2xl font-black uppercase italic tracking-tighter">Inventory Update</h3>
               <button onClick={() => setShowEditModal(false)} className="text-slate-300 text-4xl font-black hover:text-rose-500 transition-colors">×</button>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-6">
               <div className="space-y-1.5">
                  <label className="ml-5 italic text-slate-400 uppercase text-[9px] font-black tracking-widest">Model Description</label>
                  <input required className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none font-black uppercase italic text-[14px] text-slate-900 focus:border-indigo-500 transition-all shadow-inner" value={editingProduct.name} onChange={e => setEditingProduct({...editingProduct, name: e.target.value})} />
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                     <label className="ml-5 italic text-slate-400 uppercase text-[9px] font-black tracking-widest">MRP Rate</label>
                     <input type="number" className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-3xl font-black italic text-slate-900 shadow-inner" value={editingProduct.mrp} onChange={e => setEditingProduct({...editingProduct, mrp: Number(e.target.value)})} />
                  </div>
                  <div className="space-y-1.5">
                     <label className="ml-5 italic text-indigo-500 uppercase text-[9px] font-black tracking-widest">TP Rate</label>
                     <input type="number" className="w-full p-5 bg-indigo-50 text-indigo-700 border-2 border-indigo-100 rounded-3xl font-black italic shadow-inner" value={editingProduct.tp} onChange={e => setEditingProduct({...editingProduct, tp: Number(e.target.value)})} />
                  </div>
               </div>
               <div className="p-10 bg-slate-900 rounded-[3rem] shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full blur-2xl animate-pulse"></div>
                  <label className="text-white/30 text-[9px] font-black uppercase text-center block italic mb-4 tracking-[0.4em]">Real-time Stock Balance</label>
                  <input type="number" className="w-full bg-transparent border-none outline-none text-white text-6xl font-black italic text-center tracking-tighter" value={editingProduct.stock} onChange={e => setEditingProduct({...editingProduct, stock: Number(e.target.value)})} />
               </div>
               <button disabled={isSaving} type="submit" className="w-full bg-indigo-600 text-white py-8 rounded-[2.5rem] font-black uppercase text-xs tracking-[0.4em] shadow-2xl active:scale-95 transition-all">
                 {isSaving ? "SYNCING..." : "কনফার্ম আপডেট করুন ➔"}
               </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
