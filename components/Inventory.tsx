
import React, { useState, useEffect, useMemo } from 'react';
import { Product, Company, UserRole, formatCurrency } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';

interface InventoryProps {
  company: Company;
  role: UserRole;
}

const Inventory: React.FC<InventoryProps> = ({ company, role }) => {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // New Product State
  const [newProd, setNewProd] = useState({ name: '', tp: '', mrp: '', stock: '0' });

  const dbCo = mapToDbCompany(company);
  const isAdmin = role === 'ADMIN';

  useEffect(() => { fetchProducts(); }, [company]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { data: prodData } = await supabase.from('products').select('*').eq('company', dbCo).order('name');
      const productsList = prodData || [];

      const { data: ledgerData } = await supabase.from('company_ledger').select('items_json').eq('company', dbCo).eq('type', 'PURCHASE');
      const { data: txData } = await supabase.from('transactions').select('items, payment_type').eq('company', dbCo);
      const { data: replData } = await supabase.from('replacements').select('product_id, product_name, qty').eq('company', dbCo);

      const statsMap: Record<string, { purchased: number, sold: number, replaced: number, returned: number }> = {};

      const getStatKey = (pId: string, pName: string) => {
        const match = productsList.find(p => p.id === pId || p.name.toLowerCase().trim() === pName?.toLowerCase().trim());
        return match ? match.id : null;
      };

      ledgerData?.forEach(ledger => {
        ledger.items_json?.forEach((it: any) => {
          const key = getStatKey(it.id, it.name);
          if (key) {
            if (!statsMap[key]) statsMap[key] = { purchased: 0, sold: 0, replaced: 0, returned: 0 };
            statsMap[key].purchased += Number(it.qty || 0);
          }
        });
      });

      txData?.forEach(tx => {
        tx.items?.forEach((it: any) => {
          const key = getStatKey(it.id, it.name);
          if (key) {
            if (!statsMap[key]) statsMap[key] = { purchased: 0, sold: 0, replaced: 0, returned: 0 };
            if (it.action === 'SALE' || !it.action) statsMap[key].sold += Number(it.qty || 0);
            if (it.action === 'RETURN') statsMap[key].returned += Number(it.qty || 0);
          }
        });
      });

      replData?.forEach(rp => {
        const key = getStatKey(rp.product_id, rp.product_name);
        if (key) {
          if (!statsMap[key]) statsMap[key] = { purchased: 0, sold: 0, replaced: 0, returned: 0 };
          statsMap[key].replaced += Number(rp.qty || 0);
        }
      });

      const enrichedProducts = productsList.map(p => {
        const s = statsMap[p.id] || { purchased: 0, sold: 0, replaced: 0, returned: 0 };
        const calculatedStock = (s.purchased + s.returned) - (s.sold + s.replaced);
        return {
          ...p,
          purchased: s.purchased,
          sold: s.sold,
          replaced: s.replaced,
          returned: s.returned,
          calcStock: calculatedStock
        };
      });

      setProducts(enrichedProducts);
    } finally { setLoading(false); }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || !newProd.name) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('products').insert([{
        name: newProd.name.trim(),
        tp: Number(newProd.tp) || 0,
        mrp: Number(newProd.mrp) || 0,
        stock: Number(newProd.stock) || 0,
        company: dbCo
      }]);
      if (error) throw error;
      alert("নতুন প্রোডাক্ট সফলভাবে যোগ করা হয়েছে! ✅");
      setShowAddModal(false);
      setNewProd({ name: '', tp: '', mrp: '', stock: '0' });
      fetchProducts();
    } catch (err: any) { alert("ত্রুটি: " + err.message); } finally { setIsSaving(false); }
  };

  const handleQuickAdjust = async (id: string, amt: number) => {
    try {
      const { error } = await supabase.rpc('increment_stock', { row_id: id, amt: amt });
      if (error) throw error;
      fetchProducts();
    } catch (err: any) { alert(err.message); }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || isSaving) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('products').update({
        name: editingProduct.name,
        tp: Number(editingProduct.tp),
        mrp: Number(editingProduct.mrp),
        stock: Number(editingProduct.stock)
      }).eq('id', editingProduct.id);
      if (error) throw error;
      setShowEditModal(false);
      fetchProducts();
    } finally { setIsSaving(false); }
  };

  const filtered = useMemo(() => products.filter(p => p.name.toLowerCase().includes(search.toLowerCase())), [products, search]);
  const totalStockVal = useMemo(() => products.reduce((acc, p) => acc + (p.stock * p.tp), 0), [products]);

  return (
    <div className="space-y-8 pb-40 text-slate-900 animate-reveal">

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 no-print">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Total Inventory Valuation (TP)</p>
            <h3 className="text-3xl font-black italic tracking-tighter text-slate-900">{formatCurrency(totalStockVal)}</h3>
          </div>
          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-2xl">📊</div>
        </div>
        <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl flex flex-col justify-center text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-3xl rounded-full"></div>
          <h2 className="text-xl font-black uppercase italic tracking-tighter leading-none relative z-10">মাস্টার ইনভেন্টরি লেজার</h2>
          <p className="text-[8px] text-indigo-400 font-bold uppercase mt-2 tracking-widest relative z-10">Transparent Stock Tracking Active ✓</p>
        </div>
      </div>

      <div className="sticky top-0 z-[110] bg-white/90 backdrop-blur-md -mx-4 px-4 py-4 border-b flex flex-col md:flex-row gap-4 items-center shadow-sm">
        <div className="flex-1 flex gap-2 items-center bg-slate-100 p-2 rounded-2xl shadow-inner border w-full">
          <span className="pl-4 text-slate-400">🔍</span>
          <input type="text" placeholder="মডেল সার্চ করুন (যেমন: 2.0 RM)..." className="flex-1 p-3 bg-transparent border-none text-[13px] font-bold uppercase outline-none" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          {isAdmin && (
            <button onClick={() => setShowAddModal(true)} className="flex-1 md:flex-none bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase shadow-lg active:scale-95 transition-all">+ নিউ মডেল যোগ</button>
          )}
          <button onClick={fetchProducts} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase shadow-lg active:scale-95 transition-all">🔄 রিফ্রেশ</button>
        </div>
      </div>

      <div className="bg-white rounded-[3rem] border border-slate-100 shadow-xl overflow-hidden overflow-x-auto custom-scroll">
        <table className="w-full text-left min-w-[1200px]">
          <thead className="bg-slate-900 text-white/50 text-[9px] font-black uppercase tracking-widest italic border-b border-white/5">
            <tr>
              <th className="px-6 py-5 text-center">#</th>
              <th className="px-6 py-5">Product Model</th>
              <th className="px-6 py-5 text-center">TP Rate</th>
              <th className="px-6 py-5 text-center">Purchased</th>
              <th className="px-6 py-5 text-center text-rose-400">Sold</th>
              <th className="px-6 py-5 text-center text-cyan-400">Replaced</th>
              <th className="px-6 py-5 text-center text-emerald-400">Returned</th>
              <th className="px-6 py-5 text-center text-blue-400">Net Stock</th>
              <th className="px-6 py-5 text-center bg-white/5 text-emerald-400">Stock</th>
              <th className="px-6 py-5 text-center text-indigo-400">Total Value</th>
              <th className="px-6 py-5 text-right">Manage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 text-[13px] font-bold italic">
            {loading ? (
              <tr><td colSpan={11} className="py-20 text-center animate-pulse text-slate-300 font-black uppercase italic tracking-[0.4em]">Node Data Synchronizing...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={11} className="py-20 text-center text-slate-300 font-black uppercase">কোনো রেকর্ড পাওয়া যায়নি</td></tr>
            ) : filtered.map((p, idx) => (
              <tr key={p.id} className="hover:bg-blue-50/30 transition-all group animate-reveal" style={{ animationDelay: `${idx * 0.02}s` }}>
                <td className="px-6 py-5 text-center text-slate-300">{(idx + 1).toString().padStart(2, '0')}</td>
                <td className="px-6 py-5">
                  <p className="font-black uppercase italic text-slate-800 leading-tight">{p.name}</p>
                  <p className="text-[8px] text-slate-400 uppercase mt-1 tracking-widest">MRP: ৳{p.mrp}</p>
                </td>
                <td className="px-6 py-5 text-center text-slate-800 font-black text-base">৳{p.tp}</td>
                <td className="px-6 py-5 text-center text-slate-600 font-black text-base">{p.purchased}</td>
                <td className="px-6 py-5 text-center text-rose-600 font-black text-base">{p.sold}</td>
                <td className="px-6 py-5 text-center text-cyan-600 font-black text-base">{p.replaced}</td>
                <td className="px-6 py-5 text-center text-emerald-500 font-black text-base">+{p.returned}</td>
                <td className="px-6 py-5 text-center text-blue-600 font-black text-xl">{p.calcStock}</td>
                <td className="px-6 py-5 text-center bg-emerald-50/30">
                  <div className="flex items-center justify-center gap-4">
                    <button onClick={() => handleQuickAdjust(p.id, -1)} className="w-8 h-8 bg-white border border-rose-100 text-rose-500 rounded-xl flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all shadow-sm">-</button>
                    <div className="text-center">
                      <span className={`text-[18px] font-black italic tracking-tighter ${p.stock < 10 ? 'text-rose-600' : 'text-slate-900'}`}>{p.stock}</span>
                    </div>
                    <button onClick={() => handleQuickAdjust(p.id, 1)} className="w-8 h-8 bg-white border border-emerald-100 text-emerald-500 rounded-xl flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all shadow-sm">+</button>
                  </div>
                </td>
                <td className="px-6 py-5 text-center text-indigo-600 font-black text-base">৳{formatCurrency((p.stock || 0) * (p.tp || 0)).replace('৳', '')}</td>
                <td className="px-6 py-5 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setEditingProduct(p); setShowEditModal(true); }} className="w-10 h-10 bg-white border text-indigo-600 rounded-xl flex items-center justify-center text-xs hover:bg-indigo-600 hover:text-white transition-all shadow-md active:scale-90">📝</button>
                    {isAdmin && (
                      <button onClick={async () => { if (confirm(`ডিলিট নিশ্চিত? ${p.name}`)) { await supabase.from('products').delete().eq('id', p.id); fetchProducts(); } }} className="w-10 h-10 bg-white border text-rose-500 rounded-xl flex items-center justify-center text-xs hover:bg-rose-500 hover:text-white transition-all shadow-md active:scale-90">🗑️</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ➕ ADD PRODUCT MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[2000] flex items-center justify-center p-4 text-slate-900 animate-reveal">
          <div className="bg-white p-10 rounded-[3.5rem] w-full max-w-lg shadow-2xl">
            <div className="flex justify-between items-center mb-8 border-b pb-4">
              <h3 className="text-xl font-black uppercase italic tracking-tighter">নতুন মডেল এন্ট্রি</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-300 text-3xl font-black hover:text-rose-500">×</button>
            </div>
            <form onSubmit={handleAddProduct} className="space-y-6">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase text-slate-400 ml-4 italic">মডেল নাম</label>
                <input required className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-black uppercase italic text-sm focus:border-blue-500 transition-all" value={newProd.name} onChange={e => setNewProd({ ...newProd, name: e.target.value })} placeholder="যেমন: 2.0 RM" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase text-slate-400 ml-4 italic">TP Rate</label>
                  <input required type="number" className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-black italic text-lg" value={newProd.tp} onChange={e => setNewProd({ ...newProd, tp: e.target.value })} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase text-slate-400 ml-4 italic">MRP Rate</label>
                  <input required type="number" className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-black italic text-lg" value={newProd.mrp} onChange={e => setNewProd({ ...newProd, mrp: e.target.value })} placeholder="0" />
                </div>
              </div>
              <div className="p-8 bg-blue-600 rounded-[2.5rem] text-center shadow-xl">
                <label className="text-white/50 text-[9px] font-black uppercase block italic mb-3 tracking-[0.4em]">প্রাথমিক স্টক সংখ্যা</label>
                <input required type="number" className="w-full bg-transparent border-none outline-none text-white text-6xl font-black italic text-center tracking-tighter" value={newProd.stock} onChange={e => setNewProd({ ...newProd, stock: e.target.value })} />
              </div>
              <button disabled={isSaving} type="submit" className="w-full bg-slate-900 text-white py-7 rounded-[2rem] font-black uppercase text-xs tracking-[0.4em] shadow-xl active:scale-95 transition-all">
                {isSaving ? "SAVING..." : "মালটি ইনভেন্টরিতে যোগ করুন ➔"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 📝 EDIT MODAL */}
      {showEditModal && editingProduct && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[2000] flex items-center justify-center p-4 text-slate-900 animate-reveal">
          <div className="bg-white p-10 rounded-[3.5rem] w-full max-w-lg shadow-2xl">
            <div className="flex justify-between items-center mb-8 border-b pb-4">
              <h3 className="text-xl font-black uppercase italic tracking-tighter">মডেল ইনফরমেশন এডিট</h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-300 text-3xl font-black hover:text-rose-500">×</button>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-6">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase text-slate-400 ml-4 italic">মডেল নাম</label>
                <input required className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-black uppercase italic text-sm focus:border-indigo-500 transition-all" value={editingProduct.name} onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase text-slate-400 ml-4 italic">TP Rate</label>
                  <input type="number" className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-black italic text-lg" value={editingProduct.tp} onChange={e => setEditingProduct({ ...editingProduct, tp: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase text-slate-400 ml-4 italic">MRP Rate</label>
                  <input type="number" className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-black italic text-lg" value={editingProduct.mrp} onChange={e => setEditingProduct({ ...editingProduct, mrp: Number(e.target.value) })} />
                </div>
              </div>
              <div className="p-8 bg-slate-900 rounded-[2.5rem] text-center shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform"></div>
                <label className="text-white/30 text-[9px] font-black uppercase block italic mb-3 tracking-[0.4em]">স্টক ব্যালেন্স (Final Adjustment)</label>
                <input type="number" className="w-full bg-transparent border-none outline-none text-white text-6xl font-black italic text-center tracking-tighter" value={editingProduct.stock} onChange={e => setEditingProduct({ ...editingProduct, stock: Number(e.target.value) })} />
              </div>
              <button disabled={isSaving} type="submit" className="w-full bg-indigo-600 text-white py-7 rounded-[2rem] font-black uppercase text-xs tracking-[0.4em] shadow-xl active:scale-95 transition-all">
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
