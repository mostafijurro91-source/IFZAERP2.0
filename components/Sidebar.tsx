
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
        <div 
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[240] md:hidden transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      <aside className={`fixed inset-y-0 left-0 w-[320px] bg-[#0f172a] text-white flex flex-col no-print z-[250] border-r border-white/5 shadow-2xl transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        <div className="p-8 space-y-6">
          <div className="flex justify-between items-center">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] italic">
              {isCustomer ? 'Shop Owner Portal' : 'ERP Division Control'}
            </p>
            <button onClick={onClose} className="md:hidden text-slate-400 p-2 hover:text-white">✕</button>
          </div>
          
          {!isCustomer && (
            <div className="space-y-3">
              {canSwitch ? (
                (['Transtec', 'SQ Light', 'SQ Cables'] as Company[]).map(co => (
                  <button 
                    key={co} 
                    onClick={() => { onCompanyChange(co); if(window.innerWidth < 768) onClose(); }}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${
                      selectedCompany === co 
                      ? 'bg-[#4f46e5] text-white shadow-[0_10px_30px_rgba(79,70,229,0.4)]' 
                      : 'bg-white/5 text-slate-500 hover:bg-white/10'
                    }`}
                  >
                    <div className={`w-2.5 h-2.5 rounded-full ${selectedCompany === co ? 'bg-white shadow-[0_0_8px_white]' : 'bg-slate-700'}`}></div>
                    {co}
                  </button>
                ))
              ) : (
                <div className="w-full flex items-center gap-4 p-5 rounded-2xl bg-blue-600/20 border border-blue-500/30 text-white shadow-lg">
                  <div className="w-3 h-3 bg-blue-500 rounded-full shadow-[0_0_10px_#3b82f6]"></div>
                  <span className="text-[12px] font-black uppercase tracking-widest">{user.company} Division Only</span>
                </div>
              )}
            </div>
          )}

          {isCustomer && (
             <div className="p-6 bg-blue-600/10 border border-blue-500/20 rounded-[2rem]">
                <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest mb-1">Authenticated Shop</p>
                <p className="text-sm font-black text-white uppercase italic truncate">{user.name}</p>
                <p className="text-[7px] font-bold text-white/40 mt-1 uppercase tracking-widest">Supplier: {user.company}</p>
             </div>
          )}
        </div>

        <div className="px-10 py-4 flex flex-col items-center">
           <div className="text-5xl font-black italic tracking-tighter lowercase text-white">ifza<span className="text-blue-500">.</span>erp</div>
           <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.6em] mt-3 italic">
              {isCustomer ? 'Retailer Access' : 'Main Office Terminal'}
           </p>
        </div>

        <nav className="flex-1 px-4 space-y-2 overflow-y-auto custom-scroll pb-10 mt-6">
          {menu.map(item => (
            <button 
              key={item.id} 
              onClick={() => { setActiveTab(item.id); if(window.innerWidth < 768) onClose(); }}
              className={`w-full flex items-center gap-5 px-8 py-5 rounded-full text-[12px] font-black uppercase transition-all relative ${
                activeTab === item.id 
                ? 'bg-white text-[#0f172a] shadow-2xl' 
                : 'text-slate-400 hover:bg-white/5'
              }`}
            >
              <span className="text-xl opacity-60">{item.label.split(' ')[0]}</span>
              <span className="flex-1 text-left">{item.label.split(' ').slice(1).join(' ')}</span>
              {activeTab === item.id && <div className="absolute right-6 w-1.5 h-1.5 rounded-full bg-[#ef4444]"></div>}
            </button>
          ))}
        </nav>

        <div className="p-8 border-t border-white/5">
           <button onClick={onLogout} className="w-full bg-[#310c14] text-[#f43f5e] py-5 rounded-[2rem] text-[11px] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3 hover:bg-[#4c101b] transition-all border border-[#f43f5e]/20">
             🚪 LOGOUT PORTAL
           </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
