import React, { useState, useEffect } from 'react';
import { Company, UserRole, Customer, FastBookingOrder, Product, formatCurrency } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';
import { parseAmount } from '../lib/utils';

interface FastBookingProps {
   company: Company;
   role: UserRole;
   user: any;
}

const FastBooking: React.FC<FastBookingProps> = ({ company, role, user }) => {
   const [customers, setCustomers] = useState<Customer[]>([]);
   const [products, setProducts] = useState<Product[]>([]);
   const [orders, setOrders] = useState<FastBookingOrder[]>([]);
   const [loading, setLoading] = useState(true);
   const [showOrderModal, setShowOrderModal] = useState(false);
   const [isSaving, setIsSaving] = useState(false);

   // Deliver Modal State
   const [deliverOrder, setDeliverOrder] = useState<FastBookingOrder | null>(null);
   const [deliverInputs, setDeliverInputs] = useState<Record<string, number>>({});

   // Order Form State (Cart)
   const [orderForm, setOrderForm] = useState({ customer_id: '', deposit: 0, method: 'CASH' });
   const [cart, setCart] = useState<{ product_id: string; name: string; qty: number; unitPrice: number }[]>([]);
   const [selectedProduct, setSelectedProduct] = useState('');
   const [qtyInput, setQtyInput] = useState(1);
   const [priceInput, setPriceInput] = useState(0);

   // Search states
   const [customerSearch, setCustomerSearch] = useState('');
   const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
   const [productSearch, setProductSearch] = useState('');
   const [showProductDropdown, setShowProductDropdown] = useState(false);

   const filteredCustomers = customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()) || (c.phone || '').includes(customerSearch));
   const filteredProducts = products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()));

   useEffect(() => {
      fetchData();
   }, [company]);

   const fetchData = async () => {
      setLoading(true);
      try {
         const dbCo = mapToDbCompany(company);
         const [{ data: cData }, { data: pData }, { data: oData }] = await Promise.all([
            supabase.from('customers').select('id, name, address, phone').order('name'),
            supabase.from('products').select('*').eq('company', dbCo).order('name'),
            supabase.from('fast_booking_orders').select('*, customers(name, phone)').eq('company', dbCo).order('created_at', { ascending: false })
         ]);
         
         setCustomers(cData || []);
         setProducts(pData || []);
         setOrders((oData || []).map((o: any) => ({
            ...o,
            customer_name: o.customers?.name
         })));
      } catch (e) {
         console.error(e);
      } finally {
         setLoading(false);
      }
   };

   const handleProductSelect = (pid: string) => {
      setSelectedProduct(pid);
      const prod = products.find(p => p.id === pid);
      if (prod) {
         setPriceInput(prod.tp || 0); // Default to TP
      }
   };

   const addToCart = () => {
      if (!selectedProduct || qtyInput <= 0) return;
      const prod = products.find(p => p.id === selectedProduct);
      if (!prod) return;

      const existing = cart.find(c => c.product_id === selectedProduct);
      if (existing) {
         setCart(cart.map(c => c.product_id === selectedProduct ? { ...c, qty: c.qty + qtyInput, unitPrice: priceInput } : c));
      } else {
         setCart([...cart, { product_id: prod.id, name: prod.name, qty: qtyInput, unitPrice: priceInput }]);
      }
      setSelectedProduct('');
      setProductSearch('');
      setQtyInput(1);
      setPriceInput(0);
   };

   const removeFromCart = (pid: string) => {
      setCart(cart.filter(c => c.product_id !== pid));
   };

   const totalBill = cart.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);

   const handleSaveOrder = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSaving || !orderForm.customer_id || cart.length === 0) return;
      setIsSaving(true);
      try {
         const dbCo = mapToDbCompany(company);
         const items = cart.map(c => ({
             id: Date.now().toString() + Math.random(),
             product_id: c.product_id,
             name: c.name,
             qty: c.qty,
             unitPrice: c.unitPrice,
             delivered_qty: 0
         }));

         const { data: order, error: oError } = await supabase.from('fast_booking_orders').insert([{
            customer_id: orderForm.customer_id,
            company: dbCo,
            total_bill: totalBill,
            total_deposit: Number(orderForm.deposit),
            items: items,
            status: 'PENDING'
         }]).select().single();

         if (oError) throw oError;

         if (Number(orderForm.deposit) > 0) {
            await supabase.from('fast_booking_transactions').insert([{
               order_id: order.id,
               customer_id: orderForm.customer_id,
               company: dbCo,
               amount: Number(orderForm.deposit),
               type: 'DEPOSIT',
               method: orderForm.method,
               note: 'Initial Booking Deposit'
            }]);
         }

         alert("বুকিং অর্ডার সফলভাবে তৈরি হয়েছে! ✅");
         setShowOrderModal(false);
         setOrderForm({ customer_id: '', deposit: 0, method: 'CASH' });
         setCustomerSearch('');
         setCart([]);
         fetchData();
      } catch (err: any) {
         alert("Error: " + err.message);
      } finally {
         setIsSaving(false);
      }
   };

   const handleCancelBooking = async (id: string) => {
      if (!confirm("আপনি কি নিশ্চিত যে এই বুকিংটি ক্যানসেল করতে চান? (এটি ডেটাবেজ থেকে মুছে যাবে)")) return;
      setIsSaving(true);
      try {
         const { error } = await supabase.from('fast_booking_orders').delete().eq('id', id);
         if (error) throw error;
         alert("বুকিং ক্যানসেল করা হয়েছে! 🗑️");
         fetchData();
      } catch (err: any) {
         alert("Error: " + err.message);
      } finally {
         setIsSaving(false);
      }
   };

   const handleOpenDeliver = (order: FastBookingOrder) => {
      setDeliverOrder(order);
      const initialInputs: Record<string, number> = {};
      order.items.forEach(item => {
         initialInputs[item.id] = 0; // default 0 to deliver NOW
      });
      setDeliverInputs(initialInputs);
   };

   const handleSaveDelivery = async () => {
      if (!deliverOrder || isSaving) return;
      setIsSaving(true);
      try {
         // Update items with new delivered quantities
         const updatedItems = deliverOrder.items.map(item => {
             const deliverNow = deliverInputs[item.id] || 0;
             const newDelivered = Math.min(item.qty, item.delivered_qty + deliverNow);
             return { ...item, delivered_qty: newDelivered };
         });

         // Check if everything is fully delivered
         const isFullyDelivered = updatedItems.every(item => item.delivered_qty >= item.qty);

         if (isFullyDelivered) {
             // AUTO DELETE since it's fully delivered
             const { error } = await supabase.from('fast_booking_orders').delete().eq('id', deliverOrder.id);
             if (error) throw error;
             alert("অর্ডারটি সম্পূর্ণ ডেলিভারি হয়েছে এবং অটোমেটিক মুছে ফেলা হয়েছে! 🎉");
         } else {
             // PARTIAL update
             const totalDelivered = updatedItems.reduce((s, it) => s + it.delivered_qty, 0);
             const newStatus = totalDelivered > 0 ? 'PARTIAL' : 'PENDING';
             const { error } = await supabase.from('fast_booking_orders').update({
                 items: updatedItems,
                 status: newStatus
             }).eq('id', deliverOrder.id);
             if (error) throw error;
             alert("ডেলিভারি আপডেট করা হয়েছে! ✅");
         }
         
         setDeliverOrder(null);
         fetchData();
      } catch (err: any) {
         alert("Error: " + err.message);
      } finally {
         setIsSaving(false);
      }
   };

   return (
      <div className="space-y-6 pb-40 animate-reveal text-slate-900 mt-2">
         <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-100 shadow-lg flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-5">
               <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black italic shadow-lg">🚀</div>
               <div>
                  <h3 className="text-xl font-black uppercase italic tracking-tighter">ফাস্ট বুকিং</h3>
                  <p className="text-[9px] text-slate-400 font-bold uppercase mt-1 tracking-widest">{company} • স্মার্ট বুকিং সিস্টেম</p>
               </div>
            </div>
            <button onClick={() => setShowOrderModal(true)} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl text-sm font-black uppercase hover:bg-indigo-700 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
               + New Booking
            </button>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {orders.map(o => {
               const totalDelivered = o.items.reduce((s, it) => s + it.delivered_qty, 0);
               const totalQty = o.items.reduce((s, it) => s + it.qty, 0);
               const isPartial = totalDelivered > 0 && totalDelivered < totalQty;

               return (
                  <div key={o.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-md flex flex-col relative overflow-hidden">
                     <div className="flex justify-between items-start mb-4">
                        <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase border ${isPartial ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>
                           {isPartial ? 'অর্ধেক কমপ্লিট' : 'পেন্ডিং'}
                        </span>
                        <span className="text-[9px] font-black text-slate-400">#{o.id.slice(-6).toUpperCase()}</span>
                     </div>
                     <h4 className="font-black text-lg uppercase italic text-slate-800">{o.customer_name}</h4>
                     
                     <div className="mt-4 pt-4 border-t border-slate-100 flex-1">
                        <p className="text-xs font-black text-slate-400 uppercase mb-2">Products ({o.items.length})</p>
                        <ul className="space-y-2 mb-4">
                           {o.items.map(it => (
                              <li key={it.id} className="text-xs font-bold text-slate-600 flex justify-between bg-slate-50 p-2 rounded-xl border border-slate-100">
                                 <span className="truncate pr-2">{it.name}</span>
                                 <span className="whitespace-nowrap text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-lg">
                                    {it.delivered_qty}/{it.qty}
                                 </span>
                              </li>
                           ))}
                        </ul>
                        <div className="space-y-1 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                           <div className="flex justify-between text-xs font-bold text-slate-500">
                              <span>Total Bill</span><span>৳{formatCurrency(o.total_bill)}</span>
                           </div>
                           <div className="flex justify-between text-xs font-black text-emerald-600">
                              <span>Deposit</span><span>৳{formatCurrency(o.total_deposit)}</span>
                           </div>
                           <div className="flex justify-between pt-2 mt-2 border-t border-slate-200 text-sm font-black text-rose-600">
                              <span className="uppercase">Due</span><span>৳{formatCurrency(Math.max(0, o.total_bill - o.total_deposit))}</span>
                           </div>
                        </div>
                     </div>
                     
                     <div className="mt-4 flex gap-2">
                        <button onClick={() => handleCancelBooking(o.id)} className="flex-1 bg-rose-50 text-rose-600 py-3 rounded-xl text-[10px] font-black uppercase hover:bg-rose-100 border border-rose-100 transition-colors">
                           Cancel
                        </button>
                        <button onClick={() => handleOpenDeliver(o)} className="flex-[2] bg-indigo-600 text-white py-3 rounded-xl text-[10px] font-black uppercase hover:bg-indigo-700 shadow-md hover:shadow-lg transition-all">
                           Deliver Items
                        </button>
                     </div>
                  </div>
               );
            })}
            
            {orders.length === 0 && !loading && (
               <div className="col-span-full py-20 text-center">
                  <div className="text-5xl mb-4">📭</div>
                  <h4 className="text-xl font-black text-slate-300 uppercase italic">কোনো বুকিং নেই</h4>
               </div>
            )}
         </div>

         {/* NEW ORDER MODAL */}
         {showOrderModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[5000] flex items-center justify-center p-4">
               <div className="bg-white rounded-[2.5rem] w-full max-w-2xl p-8 max-h-[90vh] overflow-y-auto shadow-2xl">
                  <h3 className="text-2xl font-black italic uppercase mb-6 text-slate-800">নতুন বুকিং তৈরি করুন</h3>
                  <form onSubmit={handleSaveOrder} className="space-y-6">
                     
                     <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Customer</label>
                        <div className="relative">
                           <input 
                              type="text" 
                              placeholder="Search Customer by Name or Phone..." 
                              className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold focus:border-indigo-500 outline-none transition-colors"
                              value={customerSearch}
                              onChange={e => {
                                 setCustomerSearch(e.target.value);
                                 setShowCustomerDropdown(true);
                                 if (!e.target.value) setOrderForm({...orderForm, customer_id: ''});
                              }}
                              onFocus={() => setShowCustomerDropdown(true)}
                              onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                           />
                           {showCustomerDropdown && (
                              <div className="absolute z-10 w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-48 overflow-y-auto">
                                 {filteredCustomers.map(c => (
                                    <div 
                                       key={c.id} 
                                       className="p-4 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 text-sm font-bold text-slate-700"
                                       onClick={() => {
                                          setOrderForm({...orderForm, customer_id: c.id});
                                          setCustomerSearch(`${c.name} ${c.address ? `(${c.address})` : ''} ${c.phone ? `- ${c.phone}` : ''}`);
                                          setShowCustomerDropdown(false);
                                       }}
                                    >
                                       {c.name} {c.address ? `(${c.address})` : ''} {c.phone ? `- ${c.phone}` : ''}
                                    </div>
                                 ))}
                                 {filteredCustomers.length === 0 && <div className="p-4 text-slate-400 text-sm font-bold">No customers found</div>}
                              </div>
                           )}
                        </div>
                     </div>

                     <div className="bg-slate-50 p-6 rounded-3xl border-2 border-slate-100">
                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-4">Add Products</label>
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-4">
                           <div className="md:col-span-6 relative">
                              <input 
                                 type="text" 
                                 placeholder="Search Product..." 
                                 className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold focus:border-indigo-500 outline-none"
                                 value={productSearch}
                                 onChange={e => {
                                    setProductSearch(e.target.value);
                                    setShowProductDropdown(true);
                                    if (!e.target.value) setSelectedProduct('');
                                 }}
                                 onFocus={() => setShowProductDropdown(true)}
                                 onBlur={() => setTimeout(() => setShowProductDropdown(false), 200)}
                              />
                              {showProductDropdown && (
                                 <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                                    {filteredProducts.map(p => (
                                       <div 
                                          key={p.id} 
                                          className="p-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 text-sm font-bold text-slate-700"
                                          onClick={() => {
                                             handleProductSelect(p.id);
                                             setProductSearch(p.name);
                                             setShowProductDropdown(false);
                                          }}
                                       >
                                          {p.name}
                                       </div>
                                    ))}
                                    {filteredProducts.length === 0 && <div className="p-3 text-slate-400 text-sm font-bold">No products found</div>}
                                 </div>
                              )}
                           </div>
                           <div className="md:col-span-2">
                              <input type="number" min="1" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-center" placeholder="Qty" value={qtyInput} onChange={e => setQtyInput(parseInt(e.target.value) || 0)} />
                           </div>
                           <div className="md:col-span-2">
                              <input type="number" className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-center" placeholder="Rate" value={priceInput} onChange={e => setPriceInput(parseFloat(e.target.value) || 0)} />
                           </div>
                           <div className="md:col-span-2">
                              <button type="button" onClick={addToCart} className="w-full h-full bg-indigo-600 text-white rounded-xl font-black uppercase hover:bg-indigo-700 transition-colors">Add</button>
                           </div>
                        </div>

                        {cart.length > 0 && (
                           <div className="mt-4 pt-4 border-t border-slate-200 space-y-2 max-h-40 overflow-y-auto">
                              {cart.map(c => (
                                 <div key={c.product_id} className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-100">
                                    <div className="font-bold text-sm text-slate-700 truncate flex-1 pr-2">{c.name}</div>
                                    <div className="font-black text-xs text-slate-500 bg-slate-100 px-3 py-1 rounded-lg">{c.qty} x ৳{c.unitPrice}</div>
                                    <div className="font-black text-indigo-600 w-24 text-right">৳{c.qty * c.unitPrice}</div>
                                    <button type="button" onClick={() => removeFromCart(c.product_id)} className="ml-3 text-rose-500 font-black px-2 hover:text-rose-700">X</button>
                                 </div>
                              ))}
                           </div>
                        )}
                     </div>

                     <div className="bg-emerald-50 p-6 rounded-3xl border-2 border-emerald-100 flex gap-4 items-center">
                        <div className="flex-1">
                           <label className="block text-[10px] font-black text-emerald-600 uppercase mb-2">Advance Deposit</label>
                           <input type="number" className="w-full p-4 bg-white border-2 border-emerald-200 rounded-2xl font-black text-emerald-700 text-lg focus:border-emerald-500 outline-none" placeholder="Deposit Amount" value={orderForm.deposit || ''} onChange={e => setOrderForm({...orderForm, deposit: parseAmount(e.target.value)})} />
                        </div>
                        <div className="flex-1 text-right pt-4">
                           <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Total Bill</p>
                           <p className="text-3xl font-black text-slate-800">৳{formatCurrency(totalBill)}</p>
                        </div>
                     </div>

                     <div className="flex gap-3 pt-4">
                        <button type="button" onClick={() => setShowOrderModal(false)} className="flex-1 p-4 rounded-2xl bg-slate-100 font-black uppercase text-slate-500 hover:bg-slate-200 transition-colors">Cancel</button>
                        <button type="submit" disabled={isSaving || cart.length === 0} className="flex-[2] p-4 rounded-2xl bg-indigo-600 font-black uppercase text-white hover:bg-indigo-700 shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                           {isSaving ? 'Saving...' : 'Save Booking'}
                        </button>
                     </div>
                  </form>
               </div>
            </div>
         )}

         {/* DELIVER MODAL */}
         {deliverOrder && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[5000] flex items-center justify-center p-4">
               <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-8 shadow-2xl">
                  <h3 className="text-2xl font-black italic uppercase mb-2 text-slate-800">ডেলিভারি আপডেট</h3>
                  <p className="text-xs font-bold text-slate-400 mb-6 uppercase">আজকে কয়টি মাল দিচ্ছেন তা ইনপুট দিন</p>
                  
                  <div className="space-y-4 mb-8">
                     {deliverOrder.items.map(item => {
                        const remaining = item.qty - item.delivered_qty;
                        if (remaining <= 0) return null; // Already fully delivered
                        
                        return (
                           <div key={item.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between gap-4">
                              <div className="flex-1">
                                 <h5 className="font-bold text-sm text-slate-800 truncate">{item.name}</h5>
                                 <p className="text-[10px] font-black text-slate-400 uppercase mt-1">Ordered: {item.qty} | Delivered: {item.delivered_qty}</p>
                              </div>
                              <div className="flex flex-col items-end w-24">
                                 <label className="text-[9px] font-black text-indigo-600 uppercase mb-1">Deliver Now</label>
                                 <input 
                                    type="number" 
                                    min="0" 
                                    max={remaining} 
                                    className="w-full p-2 bg-white border-2 border-indigo-100 rounded-xl font-black text-center text-indigo-700 focus:border-indigo-500 outline-none"
                                    value={deliverInputs[item.id] === 0 ? '' : deliverInputs[item.id]}
                                    onChange={e => {
                                       const val = parseInt(e.target.value) || 0;
                                       setDeliverInputs({...deliverInputs, [item.id]: Math.min(val, remaining)});
                                    }}
                                 />
                              </div>
                           </div>
                        );
                     })}
                  </div>

                  <div className="flex gap-3">
                     <button type="button" onClick={() => setDeliverOrder(null)} className="flex-1 p-4 rounded-2xl bg-slate-100 font-black uppercase text-slate-500 hover:bg-slate-200 transition-colors">Close</button>
                     <button type="button" onClick={handleSaveDelivery} disabled={isSaving} className="flex-[2] p-4 rounded-2xl bg-indigo-600 font-black uppercase text-white hover:bg-indigo-700 shadow-lg hover:shadow-xl transition-all disabled:opacity-50">
                        {isSaving ? 'Updating...' : 'Confirm Delivery'}
                     </button>
                  </div>
               </div>
            </div>
         )}

      </div>
   );
};

export default FastBooking;
