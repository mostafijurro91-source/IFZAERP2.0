
import React from 'react';
import { User, Company } from '../types';

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
  const isCustomer = user.role === 'CUSTOMER';
  const isAdmin = user.role === 'ADMIN';
  const isDelivery = user.role === 'DELIVERY';
  
  const canSwitch = isAdmin || isDelivery;

  const menu = [
    { id: 'dashboard', label: '📊 ড্যাশবোর্ড', roles: ['ADMIN', 'STAFF', 'DELIVERY'] },
    { id: 'portal_dashboard', label: '🏠 কাস্টমার হোম', roles: ['CUSTOMER'] },
    { id: 'showroom', label: '💎 ডিজিটাল শোরুম', roles: ['ADMIN', 'STAFF', 'CUSTOMER'] },
    { id: 'portal_ledger', label: '📒 আমার লেজার', roles: ['CUSTOMER'] },
    { id: 'portal_catalog', label: '📢 অফার ও রেট', roles: ['CUSTOMER'] },
    { id: 'ad_manager', label: '📢 ক্যাটালগ ম্যানেজার', roles: ['ADMIN'] },
    { id: 'sales', label: '📝 সেলস মেমো (POS)', roles: ['ADMIN', 'STAFF'] },
    { id: 'collections', label: '💰 টাকা কালেকশন', roles: ['ADMIN', 'STAFF', 'DELIVERY'] },
    { id: 'order_management', label: '🛒 মার্কেট অর্ডার', roles: ['ADMIN', 'STAFF'] },
    { id: 'bookings', label: '📅 বুকিং অর্ডার', roles: ['ADMIN', 'STAFF'] },
    { id: 'replacements', label: '🔄 রিপ্লেসমেন্ট (Claim)', roles: ['ADMIN', 'STAFF'] },
    { id: 'delivery_hub', label: '🚚 ডেলিভারি হাব', roles: ['ADMIN', 'DELIVERY', 'STAFF'] },
    { id: 'inventory', label: '📦 স্টক ইনভেন্টরি', roles: ['ADMIN', 'STAFF'] },
    { id: 'customers', label: '👥 কাস্টমার ডাটা', roles: ['ADMIN', 'STAFF', 'DELIVERY'] },
    { id: 'ledger', label: '📒 কোম্পানি লেজার', roles: ['ADMIN'] },
    { id: 'reports', label: '📁 অল রিপোর্টস', roles: ['ADMIN', 'STAFF'] },
    { id: 'team', label: '🛡️ টিম মনিটরিং', roles: ['ADMIN'] },
    { id: 'github_sync', label: '🛰️ লাইভ ট্র্যাকিং ম্যাপ', roles: ['ADMIN'] }
  ].filter(m => m.roles.includes(user.role));

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-slate-950/20 backdrop-blur-sm z-[240] md:hidden transition-all duration-500" onClick={onClose} />
      )}

      <aside className={`fixed inset-y-0 left-0 w-[280px] md:w-[320px] bg-white flex flex-col no-print z-[250] border-r border-slate-200 shadow-xl transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1) ${
        isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        <div className="p-6 md:p-8 space-y-6">
          <div className="flex justify-between items-center">
            <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest italic">
              {isCustomer ? 'Retailer Portal' : 'Enterprise Control'}
            </p>
            <button onClick={onClose} className="md:hidden text-slate-400 p-2 text-2xl hover:text-black">✕</button>
          </div>
          
          {!isCustomer && (
            <div className="space-y-2">
              {canSwitch ? (
                (['Transtec', 'SQ Light', 'SQ Cables'] as Company[]).map(co => (
                  <button 
                    key={co} 
                    onClick={() => { onCompanyChange(co); if(window.innerWidth < 768) onClose(); }}
                    className={`w-full flex items-center gap-4 p-3.5 md:p-4 rounded-xl md:rounded-2xl text-[10px] md:text-[11px] font-semibold uppercase tracking-widest transition-all ${
                      selectedCompany === co 
                      ? 'bg-slate-900 text-white shadow-xl scale-[1.02]' 
                      : 'bg-slate-50 text-slate-900 border border-slate-100 hover:bg-slate-100'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${selectedCompany === co ? 'bg-white shadow-[0_0_8px_white]' : 'bg-slate-400'}`}></div>
                    {co}
                  </button>
                ))
              ) : (
                <div className="w-full flex items-center gap-4 p-4 rounded-2xl bg-blue-600/10 border border-blue-500/30">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-widest">{user.company} Division</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-8 py-2 md:py-4 flex flex-col items-center">
           <div className="text-4xl md:text-5xl font-semibold italic tracking-tighter lowercase text-slate-900">ifza<span className="text-blue-600">.</span>erp</div>
           <p className="text-[8px] text-slate-400 font-semibold uppercase tracking-[0.6em] mt-3 italic">Division Hub</p>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto custom-scroll pb-10 mt-6">
          {menu.map(item => (
            <button 
              key={item.id} 
              onClick={() => { setActiveTab(item.id); if(window.innerWidth < 768) onClose(); }}
              className={`w-full flex items-center gap-4 px-6 md:px-8 py-3.5 md:py-4.5 rounded-xl md:rounded-full text-[11px] md:text-[12px] font-semibold uppercase transition-all relative ${
                activeTab === item.id 
                ? 'bg-blue-600 text-white shadow-xl' 
                : 'text-slate-900 hover:bg-slate-100'
              }`}
            >
              <span className="text-lg">{item.label.split(' ')[0]}</span>
              <span className="flex-1 text-left">{item.label.split(' ').slice(1).join(' ')}</span>
              {activeTab === item.id && <div className="absolute right-6 w-1.5 h-1.5 rounded-full bg-white"></div>}
            </button>
          ))}
        </nav>

        <div className="p-6 md:p-8 border-t border-slate-100">
           <button onClick={onLogout} className="w-full bg-rose-50 text-rose-600 py-4 rounded-xl md:rounded-2xl text-[10px] font-semibold uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-rose-100 transition-all border border-rose-100">
             🚪 LOGOUT TERMINAL
           </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
