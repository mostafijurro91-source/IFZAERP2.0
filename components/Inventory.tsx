
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

  // --- Export to Excel ---
  const handleExport = () => {
    const exportData = products.map(p => ({
      'Product Name': p.name,
      'Company': p.company,
      'MRP': p.mrp,
      'TP': p.tp,
      'Special Offer (ETP)': p.etp,
      'Current Stock': p.stock
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock List");
    XLSX.writeFile(wb, `${company}_Stock_Backup_${new Date().toLocaleDateString()}.xlsx`);
  };

  // --- Import from Excel ---
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        if (data.length === 0) return alert("ফাইলটি খালি!");

        setIsSaving(true);
        for (const item of data) {
          const payload = {
            company: dbCo,
            name: item['Product Name'] || item['name'],
            mrp: Number(item['MRP'] || 0),
            tp: Number(item['TP'] || 0),
            etp: Number(item['Special Offer (ETP)'] || 0),
            stock: Number(item['Current Stock'] || item['stock'] || 0)
          };

          // Upsert logic: Update if name exists in same company, otherwise insert
          await supabase.from('products').upsert([payload], { onConflict: 'company, name' });
        }
        
        alert("ডেটা সফলভাবে ইমপোর্ট হয়েছে!");
        fetchProducts();
      } catch (err) {
        console.error(err);
        alert("ফাইল প্রসেস করতে সমস্যা হয়েছে। সঠিক ফরম্যাট চেক করুন।");
      } finally {
        setIsSaving(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleOpenEdit = (p: Product) => {
    setEditingProduct({ ...p });
    setShowEditModal(true);
  };

  const handleDeleteProduct = async (id: string) => {
    if (!isAdmin) return;
    if (!confirm("আপনি কি নিশ্চিত এই প্রোডাক্টটি ডিলিট করতে চান? এটি ইনভেন্টরি থেকে স্থায়ীভাবে মুছে যাবে।")) return;
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
      fetchProducts();
    } catch (err) { alert("ডিলিট করা যায়নি!"); }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || isSaving) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('products').update({
        name: editingProduct.name, mrp: Number(editingProduct.mrp),
        tp: Number(editingProduct.tp), stock: Number(editingProduct.stock),
        etp: Number(editingProduct.etp || 0)
      }).eq('id', editingProduct.id);
      if (error) throw error;
      setShowEditModal(false); fetchProducts();
    } finally { setIsSaving(false); }
  };

  const filtered = useMemo(() => 
    products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
  , [products, search]);

  return (
    <div className="space-y-4 pb-40 font-sans text-black animate-reveal relative">
      <div className="sticky top-0 z-[110] bg-white/70 backdrop-blur-xl -mx-6 px-6 py-3 border-b border-slate-200">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-4 items-center">
           <div className="flex-1 flex gap-2 items-center bg-slate-100 p-1.5 rounded-[1.8rem] shadow-inner border border-slate-200 w-full">
              <div className="pl-4 text-slate-400">🔍</div>
              <input autoFocus type="text" placeholder="মডেল সার্চ করুন..." className="flex-1 p-3 bg-transparent border-none text-[13px] font-bold uppercase outline-none" value={search} onChange={e => setSearch(e.target.value)} />
              <button onClick={() => setIsCompact(!isCompact)} className="bg-white p-3 rounded-2xl shadow-sm text-lg active:scale-90 transition-transform">
                {isCompact ? "🔳" : "☰"}
              </button>
           </div>
           <div className="flex gap-2 shrink-0">
              <button onClick={handleExport} className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all">📥 Export</button>
              {isAdmin && (
                <>
                  <input type="file" ref={fileInputRef} onChange={handleImport} accept=".xlsx, .xls, .csv" className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all">📤 Import</button>
                </>
              )}
           </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center animate-pulse text-slate-300 font-black uppercase italic tracking-widest">Syncing Cloud Inventory...</div>
      ) : (
        <div className={isCompact ? "bg-white rounded-[2.5rem] border overflow-hidden shadow-sm" : "grid grid-cols-2 md:grid-cols-4 gap-4"}>
           {isCompact && (
             <div className="grid grid-cols-12 bg-slate-900 text-white p-5 text-[8px] font-black uppercase tracking-widest italic">
                <div className="col-span-5">SKU Model Name</div>
                <div className="col-span-2 text-right">TP Price</div>
                <div className="col-span-2 text-right">Stock</div>
                <div className="col-span-3 text-right">Actions</div>
             </div>
           )}
           {filtered.map(p => {
             if (isCompact) {
               return (
                 <div key={p.id} className="grid grid-cols-12 p-5 border-b hover:bg-blue-50 transition-colors items-center text-[12px] font-bold uppercase">
                    <div className="col-span-5 truncate pr-4 font-black italic text-slate-800">{p.name}</div>
                    <div className="col-span-2 text-right font-black italic text-slate-500">৳{p.tp}</div>
                    <div className={`col-span-2 text-right font-black italic text-[15px] ${p.stock < 10 ? 'text-red-500' : 'text-emerald-600'}`}>{p.stock}</div>
                    <div className="col-span-3 flex justify-end gap-2">
                       <button onClick={() => handleOpenEdit(p)} title="Edit" className="w-9 h-9 bg-blue-600 text-white rounded-xl flex items-center justify-center text-xs shadow-lg active:scale-90 transition-transform">📝</button>
                       {isAdmin && <button onClick={() => handleDeleteProduct(p.id)} title="Delete" className="w-9 h-9 bg-red-100 text-red-500 rounded-xl flex items-center justify-center text-xs hover:bg-red-500 hover:text-white transition-all shadow-sm active:scale-90">🗑️</button>}
                    </div>
                 </div>
               );
             }
             return (
               <div key={p.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden animate-reveal">
                  <div className="flex justify-between items-start mb-4">
                     <span className={`px-4 py-1.5 rounded-xl text-[8px] font-black uppercase ${p.stock < 10 ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'}`}>Qty: {p.stock}</span>
                     <div className="flex gap-2">
                        <button onClick={() => handleOpenEdit(p)} className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm flex items-center justify-center active:scale-90 text-xs">📝</button>
                        {isAdmin && <button onClick={() => handleDeleteProduct(p.id)} className="w-9 h-9 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm flex items-center justify-center active:scale-90 text-xs">🗑️</button>}
                     </div>
                  </div>
                  <h4 className="text-[12px] font-black uppercase italic text-slate-800 leading-tight h-10 line-clamp-2">{p.name}</h4>
                  <div className="border-t mt-4 pt-4 flex justify-between items-end">
                     <div><p className="text-[7px] font-black text-slate-300 uppercase mb-0.5">TP Rate</p><p className="font-black text-[14px] text-blue-600 italic">৳{p.tp}</p></div>
                     <p className="text-[7px] font-black text-slate-300 italic uppercase">UID: {p.id.slice(-4).toUpperCase()}</p>
                  </div>
               </div>
             );
           })}
        </div>
      )}

      {showEditModal && editingProduct && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center z-[2000] p-4 text-black animate-in zoom-in-95">
          <div className="bg-white p-8 md:p-12 rounded-[3.5rem] w-full max-w-lg shadow-2xl overflow-y-auto max-h-[95vh]">
            <div className="flex justify-between items-center mb-8 border-b pb-6">
               <h3 className="text-xl font-black uppercase italic tracking-tighter">প্রোডাক্ট তথ্য আপডেট</h3>
               <button onClick={() => setShowEditModal(false)} className="text-slate-400 text-3xl font-black hover:text-red-500">×</button>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-5">
               <div className="space-y-1">
                  <label className="ml-4 italic text-slate-400 uppercase text-[9px]">Model Name</label>
                  <input required autoFocus className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-black uppercase italic text-[13px] focus:border-blue-600 transition-all" value={editingProduct.name} onChange={e => setEditingProduct({...editingProduct, name: e.target.value})} placeholder="নাম" />
               </div>
               <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                     <label className="ml-4 italic text-slate-400 uppercase text-[9px]">MRP Price</label>
                     <input type="number" className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black italic outline-none focus:border-blue-600 transition-all" value={editingProduct.mrp} onChange={e => setEditingProduct({...editingProduct, mrp: Number(e.target.value)})} placeholder="MRP" />
                  </div>
                  <div className="space-y-1">
                     <label className="ml-4 italic text-slate-400 uppercase text-[9px]">TP Price</label>
                     <input type="number" className="w-full p-4 bg-blue-50 text-blue-700 border-2 border-blue-100 rounded-2xl font-black italic outline-none focus:border-blue-600 transition-all" value={editingProduct.tp} onChange={e => setEditingProduct({...editingProduct, tp: Number(e.target.value)})} placeholder="TP" />
                  </div>
               </div>
               <div className="space-y-1">
                  <label className="ml-4 italic text-slate-400 uppercase text-[9px]">Special Offer (ETP)</label>
                  <input type="number" className="w-full p-4 bg-emerald-50 text-emerald-700 border-2 border-emerald-100 rounded-2xl font-black italic outline-none focus:border-emerald-600 transition-all" value={editingProduct.etp || ""} onChange={e => setEditingProduct({...editingProduct, etp: Number(e.target.value)})} placeholder="0.00" />
               </div>
               <div className="p-8 bg-slate-900 rounded-[2rem] shadow-2xl">
                  <label className="text-white/30 text-[9px] font-black uppercase text-center block italic mb-4 tracking-[0.2em]">Available Inventory Balance</label>
                  <input type="number" className="w-full bg-transparent border-none outline-none text-white text-5xl font-black italic text-center" value={editingProduct.stock} onChange={e => setEditingProduct({...editingProduct, stock: Number(e.target.value)})} />
               </div>
               <button disabled={isSaving} type="submit" className="w-full bg-blue-600 text-white py-6 rounded-[1.8rem] font-black uppercase text-xs tracking-widest shadow-2xl active:scale-95 transition-all">
                 {isSaving ? "SYNCING..." : "কনফার্ম আপডেট ➔"}
               </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
