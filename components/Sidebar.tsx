
import React, { useState, useEffect } from 'react';
import { User, Company } from '../types';
import { supabase, mapToDbCompany } from '../lib/supabase';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
  user: User;
  selectedCompany: Company;
  onCompanyChange: (company: Company) => void;
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  activeTab, 
  setActiveTab, 
  onLogout, 
  user, 
  selectedCompany, 
  onCompanyChange,
  isOpen,
  onClose
}) => {
  const [pendingCollections, setPendingCollections] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [hasCustomerDue, setHasCustomerDue] = useState(false);
  
  const isCustomer = user.role === 'CUSTOMER';
  const isAdmin = user.role === 'ADMIN';
  const isStaff = user.role === 'STAFF';
  
  const canSwitch = isAdmin || user.role === 'DELIVERY';

  useEffect(() => {
    if (!isCustomer) {
      fetchCounts();
      
      const collectionChannel = supabase
        .channel('schema-db-changes-collections')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'collection_requests' }, () => fetchCounts())
        .subscribe();

      const ordersChannel = supabase
        .channel('schema-db-changes-orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'market_orders' }, () => fetchCounts())
        .subscribe();

      return () => {
        supabase.removeChannel(collectionChannel);
        supabase.removeChannel(ordersChannel);
      };
    } else {
      checkCustomerDue();
    }
  }, [isCustomer, user.customer_id, selectedCompany]);

  const fetchCounts = async () => {
    try {
      const dbCo = mapToDbCompany(selectedCompany);
      const today = new Date().toISOString().split('T')[0];
      const startOfDay = `${today}T00:00:00.000Z`;

      // 1. Fetch Pending Collections
      let collQuery = supabase.from('collection_requests').select('*', { count: 'exact', head: true }).eq('status', 'PENDING');
      if (isStaff) collQuery = collQuery.eq('company', mapToDbCompany(user.company));
      const { count: cCount } = await collQuery;
      setPendingCollections(cCount || 0);

      // 2. Fetch Pending Market Orders (Filter by Today for badge)
      let orderQuery = supabase
        .from('market_orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'PENDING')
        .gte('created_at', startOfDay);
        
      if (isStaff) orderQuery = orderQuery.eq('company', mapToDbCompany(user.company));
      else orderQuery = orderQuery.eq('company', dbCo);
      
      const { count: oCount } = await orderQuery;
      setPendingOrders(oCount || 0);
      
    } catch (e) {}
  };

  const checkCustomerDue = async () => {
    if (!user.customer_id) return;
    try {
      const { data } = await supabase
        .from('transactions')
        .select('amount, payment_type')
        .eq('customer_id', user.customer_id);
      
      let balance = 0;
      data?.forEach(tx => {
        const amt = Number(tx.amount) || 0;
        balance += (tx.payment_type === 'COLLECTION' ? -amt : amt);
      });
      setHasCustomerDue(balance > 1);
    } catch (e) {}
  };

  const menu = [
    { id: 'dashboard', label: '📊 ড্যাশবোর্ড', roles: ['ADMIN', 'STAFF', 'DELIVERY'] },
    { id: 'portal_dashboard', label: '🏠 কাস্টমার হোম', roles: ['CUSTOMER'] },
    { id: 'portal_order', label: '🛒 অর্ডার করুন', roles: ['CUSTOMER'] },
    { id: 'showroom', label: '💎 ডিজিটাল শোরুম', roles: ['ADMIN', 'CUSTOMER'] },
    { id: 'portal_booking', label: '📅 আমার বুকিং', roles: ['CUSTOMER'] },
    { id: 'portal_ledger', label: '📒 আমার লেজার', roles: ['CUSTOMER'], badge: 'due' },
    { id: 'portal_catalog', label: '📢 অফার ও রেট', roles: ['CUSTOMER'] },
    { id: 'ad_manager', label: '📢 ক্যাটালগ ম্যানেজার', roles: ['ADMIN'] },
    { id: 'sales', label: '📝 সেলস মেমো (POS)', roles: ['ADMIN'] },
    { id: 'collections', label: '💰 টাকা কালেকশন', roles: ['ADMIN', 'STAFF', 'DELIVERY'], badge: 'pending_collections' },
    { id: 'order_management', label: '🛒 মার্কেট অর্ডার', roles: ['ADMIN', 'STAFF'], badge: 'pending_orders' },
    { id: 'bookings', label: '📅 বুকিং অর্ডার', roles: ['ADMIN', 'STAFF'] },
    { id: 'replacements', label: '🔄 রিপ্লেসমেন্ট (Claim)', roles: ['ADMIN'] },
    { id: 'delivery_hub', label: '🚚 ডেলিভারি হাব', roles: ['ADMIN', 'DELIVERY', 'STAFF'] },
    { id: 'inventory', label: '📦 স্টক ইনভেন্টরি', roles: ['ADMIN'] },
    { id: 'customers', label: '👥 কাস্টমার ডাটা', roles: ['ADMIN', 'STAFF', 'DELIVERY'] },
    { id: 'ledger', label: '📒 কোম্পানি লেজার', roles: ['ADMIN'] },
    { id: 'reports', label: '📁 অল রিপোর্টস', roles: ['ADMIN', 'STAFF'] },
    { id: 'team', label: '🛡️ টিম মনিটরিং', roles: ['ADMIN'] }
  ].filter(m => m.roles.includes(user.role));

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-slate-950/20 backdrop-blur-sm z-[240] md:hidden transition-opacity duration-500" onClick={onClose} />
      )}

      <aside className={`fixed inset-y-0 left-0 w-[280px] md:w-[320px] bg-white flex flex-col no-print z-[250] border-r border-slate-200 shadow-xl transition-transform duration-700 cubic-bezier(0.16, 1, 0.3, 1) ${
        isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        <div className="p-4 md:p-6 space-y-4">
          <div className="flex justify-between items-center mb-1">
            <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-widest italic leading-none animate-pulse">
              {isCustomer ? 'Retailer Portal' : 'Enterprise Control'}
            </p>
            <button onClick={onClose} className="md:hidden text-slate-400 p-2 text-xl hover:text-red-500 transition-colors">✕</button>
          </div>

          <div className="flex flex-col items-center mb-2 group cursor-pointer animate-float">
            <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white text-xl font-black italic shadow-lg transition-all duration-700 group-hover:rotate-[360deg] group-hover:bg-blue-600 active:scale-90">
              ই
            </div>
            <div className="text-center mt-3">
              <div className="text-2xl font-black italic tracking-tighter leading-none">ইফজা<span className="text-blue-600 animate-ping inline-block ml-0.5">.</span></div>
              <p className="text-[6px] text-slate-400 font-bold uppercase tracking-[0.4em] mt-2 italic leading-none">Global Terminal</p>
            </div>
          </div>
          
          {!isCustomer && (
            <div className="space-y-1.5 pt-2">
              {canSwitch ? (
                (['Transtec', 'SQ Light', 'SQ Cables'] as Company[]).map((co, idx) => (
                  <button 
                    key={co} 
                    onClick={() => { onCompanyChange(co); if(window.innerWidth < 768) onClose(); }}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all hover:translate-x-1 animate-reveal`}
                    style={{ animationDelay: `${idx * 0.1}s`, backgroundColor: selectedCompany === co ? '#0f172a' : '#f8fafc', color: selectedCompany === co ? 'white' : '#64748b' }}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${selectedCompany === co ? 'bg-blue-400 active-pulse' : 'bg-slate-300'}`}></div>
                    {co}
                  </button>
                ))
              ) : (
                <div className="w-full flex items-center gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100 animate-reveal">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full active-pulse"></div>
                  <span className="text-[9px] font-black text-blue-700 uppercase tracking-widest">{user.company} Division</span>
                </div>
              )}
            </div>
          )}
        </div>

        <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto custom-scroll pb-10 mt-4">
          {menu.map((item, idx) => {
            let badgeCount = 0;
            let badgeColor = "bg-red-600";
            
            if (item.badge === 'pending_collections') badgeCount = pendingCollections;
            if (item.badge === 'pending_orders') {
              badgeCount = pendingOrders;
              badgeColor = "bg-rose-600 shadow-[0_0_15px_rgba(225,29,72,0.4)]";
            }
            if (item.badge === 'due' && hasCustomerDue) badgeCount = 1;

            return (
              <button 
                key={item.id} 
                onClick={() => { setActiveTab(item.id); if(window.innerWidth < 768) onClose(); }}
                className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-[11px] font-black uppercase transition-all relative group animate-reveal stagger-${(idx % 4) + 1} ${
                  activeTab === item.id 
                  ? 'bg-blue-600 text-white shadow-[0_10px_25px_rgba(37,99,235,0.3)] translate-x-2' 
                  : 'text-slate-700 hover:bg-slate-50 hover:translate-x-1'
                }`}
              >
                <span className={`text-lg transition-transform duration-500 ${activeTab === item.id ? 'scale-125' : 'opacity-50 grayscale group-hover:grayscale-0 group-hover:opacity-100'}`}>
                  {item.label.split(' ')[0]}
                </span>
                <span className="flex-1 text-left tracking-tight">{item.label.split(' ').slice(1).join(' ')}</span>
                
                {badgeCount > 0 && (
                  <div className={`flex items-center justify-center min-w-[1.4rem] h-[1.4rem] px-1.5 rounded-full ${badgeColor} text-white text-[9px] font-black animate-pulse border-2 border-white shadow-sm`}>
                    {item.badge === 'due' ? '!' : badgeCount}
                  </div>
                )}
                
                {activeTab === item.id && <div className="absolute left-1 w-1 h-6 bg-white/40 rounded-full"></div>}
              </button>
            );
          })}
        </nav>

        <div className="p-6 border-t border-slate-100 bg-slate-50/50">
           <button onClick={onLogout} className="w-full bg-white text-rose-600 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-rose-600 hover:text-white transition-all border border-rose-100 shadow-sm active:scale-95 group">
             <span className="group-hover:translate-x-1 transition-transform">🚪</span> LOGOUT
           </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
