import React, { useState, useEffect, useMemo } from 'react';
import { Company, UserRole, FastBookingCustomer, FastBookingOrder, formatCurrency } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';
import { parseAmount } from '../lib/utils';

interface FastBookingProps {
   company: Company;
   role: UserRole;
   user: any;
}

const FastBooking: React.FC<FastBookingProps> = ({ company, role, user }) => {
   const [customers, setCustomers] = useState<FastBookingCustomer[]>([]);
   const [orders, setOrders] = useState<FastBookingOrder[]>([]);
   const [loading, setLoading] = useState(true);
   const [activeTab, setActiveTab] = useState<'CUSTOMERS' | 'ORDERS'>('ORDERS');
   const [showCustModal, setShowCustModal] = useState(false);
   const [showOrderModal, setShowOrderModal] = useState(false);
   const [isSaving, setIsSaving] = useState(false);

   // Forms
   const [custForm, setCustForm] = useState({ name: '', phone: '', address: '' });
   const [orderForm, setOrderForm] = useState({ customer_id: '', product_name: '', qty: 1, total_bill: 0, deposit: 0, method: 'CASH' });

   useEffect(() => {
      fetchData();
   }, [company]);

   const fetchData = async () => {
      setLoading(true);
      try {
         const dbCo = mapToDbCompany(company);
         const [{ data: cData }, { data: oData }] = await Promise.all([
            supabase.from('fast_booking_customers').select('*').eq('company', dbCo).order('name'),
            supabase.from('fast_booking_orders').select('*, fast_booking_customers(name, phone)').eq('company', dbCo).order('created_at', { ascending: false })
         ]);
         
         setCustomers(cData || []);
         setOrders((oData || []).map((o: any) => ({
            ...o,
            customer_name: o.fast_booking_customers?.name
         })));
      } catch (e) {
         console.error(e);
      } finally {
         setLoading(false);
      }
   };

   const handleSaveCustomer = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSaving || !custForm.name) return;
      setIsSaving(true);
      try {
         const dbCo = mapToDbCompany(company);
         const { error } = await supabase.from('fast_booking_customers').insert([{
            name: custForm.name,
            phone: custForm.phone,
            address: custForm.address,
            company: dbCo
         }]);
         if (error) throw error;
         alert("Customer added successfully!");
         setShowCustModal(false);
         setCustForm({ name: '', phone: '', address: '' });
         fetchData();
      } catch (err: any) {
         alert("Error: " + err.message);
      } finally {
         setIsSaving(false);
      }
   };

   const handleSaveOrder = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSaving || !orderForm.customer_id) return;
      setIsSaving(true);
      try {
         const dbCo = mapToDbCompany(company);
         const items = [{
             id: Date.now().toString(),
             product_id: 'FAST_ITEM',
             name: orderForm.product_name || 'Fast Booking Item',
             qty: Number(orderForm.qty),
             unitPrice: Number(orderForm.total_bill) / Math.max(1, Number(orderForm.qty)),
             delivered_qty: 0
         }];

         const { data: order, error: oError } = await supabase.from('fast_booking_orders').insert([{
            customer_id: orderForm.customer_id,
            company: dbCo,
            total_bill: Number(orderForm.total_bill),
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

         alert("Fast Booking Order Created!");
         setShowOrderModal(false);
         setOrderForm({ customer_id: '', product_name: '', qty: 1, total_bill: 0, deposit: 0, method: 'CASH' });
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
                  <h3 className="text-xl font-black uppercase italic tracking-tighter">ফাস্ট বুকিং (ISOLATED)</h3>
                  <p className="text-[9px] text-slate-400 font-bold uppercase mt-1 tracking-widest">{company} • সম্পূর্ণ আলাদা ডেটাবেজ</p>
               </div>
            </div>
            <div className="flex gap-2">
               <button onClick={() => setActiveTab('ORDERS')} className={`px-6 py-3 rounded-2xl font-black text-xs uppercase transition-all ${activeTab === 'ORDERS' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Orders</button>
               <button onClick={() => setActiveTab('CUSTOMERS')} className={`px-6 py-3 rounded-2xl font-black text-xs uppercase transition-all ${activeTab === 'CUSTOMERS' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Customers</button>
            </div>
         </div>

         {activeTab === 'CUSTOMERS' && (
            <div className="space-y-4">
               <div className="flex justify-between items-center bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
                  <h4 className="font-black text-slate-700 italic ml-2">বুকিং কাস্টমার লিস্ট</h4>
                  <button onClick={() => setShowCustModal(true)} className="bg-indigo-600 text-white px-6 py-2 rounded-xl text-xs font-black uppercase hover:bg-indigo-700">+ New Customer</button>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {customers.map(c => (
                     <div key={c.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                        <h5 className="font-black text-lg italic uppercase">{c.name}</h5>
                        <p className="text-xs font-bold text-slate-500 mt-1">📱 {c.phone || 'N/A'}</p>
                        <p className="text-xs font-bold text-slate-400 mt-1">📍 {c.address || 'N/A'}</p>
                     </div>
                  ))}
               </div>
            </div>
         )}

         {activeTab === 'ORDERS' && (
            <div className="space-y-4">
               <div className="flex justify-between items-center bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
                  <h4 className="font-black text-slate-700 italic ml-2">অর্ডার লিস্ট</h4>
                  <button onClick={() => setShowOrderModal(true)} className="bg-indigo-600 text-white px-6 py-2 rounded-xl text-xs font-black uppercase hover:bg-indigo-700">+ New Order</button>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {orders.map(o => (
                     <div key={o.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-md">
                        <div className="flex justify-between items-start mb-4">
                           <span className="px-3 py-1 rounded-lg text-[9px] font-black uppercase bg-indigo-50 text-indigo-600 border border-indigo-100">{o.status}</span>
                           <span className="text-[9px] font-black text-slate-400">#{o.id.slice(-6).toUpperCase()}</span>
                        </div>
                        <h4 className="font-black text-lg uppercase italic">{o.customer_name}</h4>
                        <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                           <div className="flex justify-between">
                              <span className="text-[10px] font-bold text-slate-400">Total Bill</span>
                              <span className="font-black">৳{formatCurrency(o.total_bill)}</span>
                           </div>
                           <div className="flex justify-between">
                              <span className="text-[10px] font-bold text-slate-400">Deposit</span>
                              <span className="font-black text-emerald-600">৳{formatCurrency(o.total_deposit)}</span>
                           </div>
                           <div className="flex justify-between pt-2 border-t border-slate-50">
                              <span className="text-[10px] font-black text-rose-400 uppercase">Due</span>
                              <span className="font-black text-rose-600 text-lg">৳{formatCurrency(Math.max(0, o.total_bill - o.total_deposit))}</span>
                           </div>
                        </div>
                     </div>
                  ))}
               </div>
            </div>
         )}

         {/* MODALS */}
         {showCustModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[5000] flex items-center justify-center p-4">
               <div className="bg-white rounded-3xl w-full max-w-md p-6">
                  <h3 className="text-xl font-black italic uppercase mb-4">নতুন বুকিং কাস্টমার</h3>
                  <form onSubmit={handleSaveCustomer} className="space-y-4">
                     <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" placeholder="Customer Name" value={custForm.name} onChange={e => setCustForm({...custForm, name: e.target.value})} />
                     <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" placeholder="Phone" value={custForm.phone} onChange={e => setCustForm({...custForm, phone: e.target.value})} />
                     <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" placeholder="Address" value={custForm.address} onChange={e => setCustForm({...custForm, address: e.target.value})} />
                     <div className="flex gap-2 pt-4">
                        <button type="button" onClick={() => setShowCustModal(false)} className="flex-1 p-3 rounded-xl bg-slate-100 font-black uppercase text-slate-500">Cancel</button>
                        <button type="submit" disabled={isSaving} className="flex-1 p-3 rounded-xl bg-indigo-600 font-black uppercase text-white">Save</button>
                     </div>
                  </form>
               </div>
            </div>
         )}

         {showOrderModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[5000] flex items-center justify-center p-4">
               <div className="bg-white rounded-3xl w-full max-w-md p-6">
                  <h3 className="text-xl font-black italic uppercase mb-4">নতুন বুকিং অর্ডার</h3>
                  <form onSubmit={handleSaveOrder} className="space-y-4">
                     <select required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" value={orderForm.customer_id} onChange={e => setOrderForm({...orderForm, customer_id: e.target.value})}>
                        <option value="">-- Select Customer --</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                     </select>
                     <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" placeholder="Product / Description" value={orderForm.product_name} onChange={e => setOrderForm({...orderForm, product_name: e.target.value})} />
                     <input required type="number" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold" placeholder="Total Bill Amount" value={orderForm.total_bill || ''} onChange={e => setOrderForm({...orderForm, total_bill: parseAmount(e.target.value)})} />
                     <input type="number" className="w-full p-3 bg-emerald-50 border border-emerald-200 rounded-xl font-bold text-emerald-700" placeholder="Advance Deposit" value={orderForm.deposit || ''} onChange={e => setOrderForm({...orderForm, deposit: parseAmount(e.target.value)})} />
                     <div className="flex gap-2 pt-4">
                        <button type="button" onClick={() => setShowOrderModal(false)} className="flex-1 p-3 rounded-xl bg-slate-100 font-black uppercase text-slate-500">Cancel</button>
                        <button type="submit" disabled={isSaving} className="flex-1 p-3 rounded-xl bg-indigo-600 font-black uppercase text-white">Save Order</button>
                     </div>
                  </form>
               </div>
            </div>
         )}
      </div>
   );
};

export default FastBooking;
