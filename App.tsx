
import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Sales from './components/Sales';
import Inventory from './components/Inventory';
import Customers from './components/Customers';
import Bookings from './components/Bookings';
import Replacements from './components/Replacements';
import Reports from './components/Reports';
import Team from './components/Team';
import CompanyLedger from './components/CompanyLedger';
import Collections from './components/Collections';
import DeliveryHub from './components/DeliveryHub';
import OrderManagement from './components/OrderManagement';
import AdManager from './components/AdManager';
import Login from './components/Login';
import MarketingPage from './components/MarketingPage';
import CustomerPortal from './components/CustomerPortal';
import Showroom from './components/Showroom';
import Tracking from './components/Tracking';
import { User, Company } from './types';
import { supabase, checkSupabaseConnection } from './lib/supabase';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('ifza_active_tab') || 'dashboard');
  const [selectedCompany, setSelectedCompany] = useState<Company>(() => (localStorage.getItem('ifza_company') as Company) || 'Transtec');
  const [initialized, setInitialized] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [dbError, setDbError] = useState(false);
  const [toast, setToast] = useState<{title: string, message: string} | null>(null);

  useEffect(() => {
    if (user && user.customer_id) {
      const channel = supabase
        .channel(`cust_alerts_v2_${user.customer_id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `customer_id=eq.${user.customer_id}` },
          (payload: any) => {
            const { title, message } = payload.new;
            try { new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3').play(); } catch(e){}
            setToast({ title, message });
            setTimeout(() => setToast(null), 6000);
          }
        )
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [user]);

  useEffect(() => {
    const boot = async () => {
      try {
        const isConnected = await checkSupabaseConnection();
        if (!isConnected) setDbError(true);
        const saved = localStorage.getItem('ifza_user');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.id) setUser(parsed);
        }
      } catch (e) {
        setDbError(true);
      } finally {
        setTimeout(() => setInitialized(true), 1500);
      }
    };
    boot();
  }, []);

  useEffect(() => {
    if (user && initialized) {
      localStorage.setItem('ifza_active_tab', activeTab);
      localStorage.setItem('ifza_company', selectedCompany);
    }
  }, [activeTab, selectedCompany, user, initialized]);

  const handleLogin = (u: User) => {
    setUser(u);
    setShowLogin(false);
    setActiveTab(u.role === 'CUSTOMER' ? 'portal_dashboard' : 'dashboard');
    setSelectedCompany(u.company);
    localStorage.setItem('ifza_user', JSON.stringify(u));
  };

  const handleLogout = () => {
    if(confirm("লগ-আউট করতে চান?")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  if (!initialized) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#05070a] text-white">
      <div className="w-12 h-12 border-4 border-blue-600/10 border-t-blue-600 rounded-full animate-spin"></div>
      <p className="mt-4 font-black uppercase text-[10px] tracking-[0.4em] text-blue-500">IFZA ELECTRONICS</p>
    </div>
  );

  if (dbError) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#0a0f1d] text-white text-center p-6">
      <h1 className="text-lg font-black mb-4 uppercase italic">Server Sync Lost</h1>
      <button onClick={() => window.location.reload()} className="bg-blue-600 px-8 py-3 rounded-xl font-black text-[10px] uppercase">Reconnect 🔄</button>
    </div>
  );

  if (!user) return showLogin ? <Login onLogin={handleLogin} onBack={() => setShowLogin(false)} /> : <MarketingPage onEnterERP={() => setShowLogin(true)} />;

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden">
      {toast && (
        <div className="fixed top-20 right-4 left-4 md:left-auto md:w-[320px] z-[9000] bg-white border-2 border-blue-600 p-4 rounded-2xl shadow-2xl animate-reveal flex items-start gap-3">
           <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm shrink-0">🔔</div>
           <div className="flex-1 min-w-0">
              <h4 className="font-black text-slate-900 uppercase text-[10px] truncate">{toast.title}</h4>
              <p className="text-[9px] font-bold text-slate-500 mt-0.5 line-clamp-2">{toast.message}</p>
           </div>
           <button onClick={() => setToast(null)} className="text-slate-300 hover:text-red-500 text-lg">×</button>
        </div>
      )}

      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onLogout={handleLogout} 
        user={user} 
        selectedCompany={selectedCompany} 
        onCompanyChange={setSelectedCompany} 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
      />
      
      <main className="flex-1 flex flex-col md:ml-[320px] overflow-hidden relative">
        <header className="pt-[env(safe-area-inset-top)] bg-white border-b shrink-0 z-40 shadow-sm">
          <div className="h-14 flex justify-between items-center px-4 md:px-8">
            <div className="flex items-center gap-4">
              <button onClick={() => setIsSidebarOpen(true)} className="md:hidden w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-lg">☰</button>
              <div className="hidden sm:block">
                <h1 className="text-[11px] font-black text-slate-900 uppercase italic tracking-widest leading-none">IFZA ELECTRONICS</h1>
                <p className="text-[8px] font-black text-blue-600 uppercase mt-1 tracking-tighter italic">{activeTab.replace(/_/g, ' ')} Terminal</p>
              </div>
              <h1 className="sm:hidden text-[12px] font-black text-slate-900 uppercase italic tracking-widest">{activeTab.replace(/_/g, ' ')}</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right hidden xs:block">
                <p className="text-[9px] font-black uppercase italic leading-none">{user.name}</p>
                <p className="text-[7px] font-bold text-slate-400 mt-0.5 uppercase tracking-tighter">{selectedCompany}</p>
              </div>
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-[11px] font-black italic shadow-md">{user.name.charAt(0)}</div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scroll bg-[#f8fafc]">
          <div className="max-w-7xl mx-auto pt-2">
            {activeTab === 'dashboard' && <Dashboard company={selectedCompany} role={user.role} />}
            {activeTab === 'portal_dashboard' && <CustomerPortal type="DASHBOARD" user={user} />}
            {activeTab === 'portal_ledger' && <CustomerPortal type="LEDGER" user={user} />}
            {activeTab === 'portal_catalog' && <CustomerPortal type="CATALOG" user={user} />}
            {activeTab === 'portal_order' && <CustomerPortal type="ORDER" user={user} />}
            {activeTab === 'sales' && <Sales company={selectedCompany} role={user.role} user={user} />}
            {activeTab === 'collections' && <Collections company={selectedCompany} user={user} />}
            {activeTab === 'order_management' && <OrderManagement company={selectedCompany} user={user} />}
            {activeTab === 'inventory' && <Inventory company={selectedCompany} role={user.role} />}
            {activeTab === 'customers' && <Customers company={selectedCompany} role={user.role} userName={user.name} />}
            {activeTab === 'reports' && <Reports company={selectedCompany} userRole={user.role} userName={user.name} />}
            {activeTab === 'bookings' && <Bookings company={selectedCompany} role={user.role} user={user} />}
            {activeTab === 'replacements' && <Replacements company={selectedCompany} role={user.role} user={user} />}
            {activeTab === 'delivery_hub' && <DeliveryHub company={selectedCompany} user={user} />}
            {activeTab === 'ledger' && <CompanyLedger company={selectedCompany} role={user.role} />}
            {activeTab === 'team' && <Team />}
            {activeTab === 'showroom' && <Showroom />}
            {activeTab === 'ad_manager' && <AdManager />}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
