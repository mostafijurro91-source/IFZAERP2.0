
import React, { useState, useEffect } from 'react';
import { User, Company } from '../types';
import { supabase } from '../lib/supabase';

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
  const [pendingCount, setPendingCount] = useState(0);
  const isCustomer = user.role === 'CUSTOMER';
  const isAdmin = user.role === 'ADMIN';
  const isStaff = user.role === 'STAFF';
  const isDelivery = user.role === 'DELIVERY';
  
  const canSwitch = isAdmin || isDelivery;

  useEffect(() => {
    if (!isCustomer) {
      fetchPendingCollections();
      const interval = setInterval(fetchPendingCollections, 30000);
      return () => clearInterval(interval);
    }
  }, [isCustomer]);

  const fetchPendingCollections = async () => {
    try {
      const { count, error } = await supabase
        .from('collection_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'PENDING');
      if (!error) setPendingCount(count || 0);
    } catch (e) {}
  };

  const menu = [
    { id: 'dashboard', label: '📊 ড্যাশবোর্ড', roles: ['ADMIN', 'STAFF', 'DELIVERY'] },
    { id: 'portal_dashboard', label: '🏠 কাস্টমার হোম', roles: ['CUSTOMER'] },
    { id: 'showroom', label: '💎 ডিজিটাল শোরুম', roles: ['ADMIN', 'STAFF', 'CUSTOMER'] },
    { id: 'portal_ledger', label: '📒 আমার লেজার', roles: ['CUSTOMER'] },
    { id: 'portal_catalog', label: '📢 অফার ও রেট', roles: ['CUSTOMER'] },
    { id: 'ad_manager', label: '📢 ক্যাটালগ ম্যানেজার', roles: ['ADMIN'] },
    { id: 'sales', label: '📝 সেলস মেমো (POS)', roles: ['ADMIN', 'STAFF'] },
    { id: 'collections', label: '💰 টাকা কালেকশন', roles: ['ADMIN', 'STAFF', 'DELIVERY'], badge: true },
    { id: 'order_management', label: '🛒 মার্কেট অর্ডার', roles: ['ADMIN', 'STAFF'] },
    { id: 'bookings', label: '📅 বুকিং অর্ডার', roles: ['ADMIN', 'STAFF'] },
    { id: 'replacements', label: '🔄 রিপ্লেসমেন্ট (Claim)', roles: ['ADMIN', 'STAFF'] },
    { id: 'delivery_hub', label: '🚚 ডেলিভারি হাব', roles: ['ADMIN', 'DELIVERY', 'STAFF'] },
    { id: 'inventory', label: '📦 স্টক ইনভেন্টরি', roles: ['ADMIN', 'STAFF'] },
    { id: 'customers', label: '👥 কাস্টমার ডাটা', roles: ['ADMIN', 'STAFF', 'DELIVERY'] },
    { id: 'ledger', label: '📒 কোম্পানি লেজার', roles: ['ADMIN'] },
    { id: 'reports', label: '📁 অল রিপোর্টস', roles: ['ADMIN', 'STAFF'] },
    { id: 'team', label: '🛡️ টিম মনিটরিং', roles: ['ADMIN'] }
  ].filter(m => m.roles.includes(user.role));

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-slate-950/20 backdrop-blur-sm z-[240] md:hidden transition-all duration-500" onClick={onClose} />
      )}

      <aside className={`fixed inset-y-0 left-0 w-[280px] md:w-[320px] bg-white flex flex-col no-print z-[250] border-r border-slate-200 shadow-xl transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1) ${
        isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        <div className="p-4 md:p-6 space-y-4">
          <div className="flex justify-between items-center mb-1">
            <p className="text-[8px] font-semibold text-slate-400 uppercase tracking-widest italic leading-none">
              {isCustomer ? 'Retailer Portal' : 'Enterprise Control'}
            </p>
            <button onClick={onClose} className="md:hidden text-slate-400 p-2 text-xl hover:text-black">✕</button>
          </div>

          <div className="flex flex-col items-center mb-2 group cursor-pointer">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white text-xl font-black italic shadow-lg transition-all duration-700 group-hover:rotate-12 group-hover:bg-blue-600 animate-glow">
              ই
            </div>
            <div className="text-center mt-2">
              <div className="text-2xl font-black italic tracking-tighter animate-brand-text leading-none">ইফজা<span className="text-blue-600">.</span></div>
              <p className="text-[6px] text-slate-400 font-bold uppercase tracking-[0.4em] mt-1.5 italic leading-none">Division Hub Terminal</p>
            </div>
          </div>
          
          {!isCustomer && (
            <div className="space-y-1 pt-1">
              {canSwitch ? (
                (['Transtec', 'SQ Light', 'SQ Cables'] as Company[]).map(co => (
                  <button 
                    key={co} 
                    onClick={() => { onCompanyChange(co); if(window.innerWidth < 768) onClose(); }}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-[8px] font-bold uppercase tracking-widest transition-all ${
                      selectedCompany === co 
                      ? 'bg-slate-900 text-white shadow-md' 
                      : 'bg-slate-50 text-slate-900 border border-slate-100 hover:bg-slate-100'
                    }`}
                  >
                    <div className={`w-1 h-1 rounded-full ${selectedCompany === co ? 'bg-white animate-pulse' : 'bg-slate-400'}`}></div>
                    {co}
                  </button>
                ))
              ) : (
                <div className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-blue-600/10 border border-blue-500/30">
                  <div className="w-1 h-1 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="text-[8px] font-semibold text-blue-700 uppercase tracking-widest">{user.company} Division</span>
                </div>
              )}
            </div>
          )}
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto custom-scroll pb-10 mt-2">
          {menu.map(item => (
            <button 
              key={item.id} 
              onClick={() => { setActiveTab(item.id); if(window.innerWidth < 768) onClose(); }}
              className={`w-full flex items-center gap-4 px-6 py-3 rounded-xl md:rounded-full text-[11px] font-black uppercase transition-all relative group ${
                activeTab === item.id 
                ? 'bg-blue-600 text-white shadow-lg translate-x-1' 
                : 'text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span className={`text-base transition-transform ${activeTab === item.id ? 'scale-110' : 'grayscale opacity-60'}`}>
                {item.label.split(' ')[0]}
              </span>
              <span className="flex-1 text-left">{item.label.split(' ').slice(1).join(' ')}</span>
              {item.badge && pendingCount > 0 && (isAdmin || isStaff) && (
                <div className="absolute right-4 w-5 h-5 bg-red-600 text-white text-[9px] rounded-full flex items-center justify-center border-2 border-white shadow-lg animate-bounce">
                  {pendingCount}
                </div>
              )}
              {activeTab === item.id && !item.badge && <div className="absolute right-6 w-1 h-1 rounded-full bg-white shadow-[0_0_8px_white]"></div>}
            </button>
          ))}
        </nav>

        <div className="p-6 border-t border-slate-100 bg-slate-50/50">
           <button onClick={onLogout} className="w-full bg-white text-rose-600 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-rose-50 transition-all border border-rose-100 shadow-sm active:scale-95">
             🚪 LOGOUT
           </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
