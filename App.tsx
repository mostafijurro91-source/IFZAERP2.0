
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
      if ("Notification" in window) {
        if (Notification.permission === "default") {
          Notification.requestPermission();
        }
      }

      const channel = supabase
        .channel(`cust_alerts_v2_${user.customer_id}`)
        .on(
          'postgres_changes',
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'notifications', 
            filter: `customer_id=eq.${user.customer_id}` 
          },
          (payload: any) => {
            const { title, message } = payload.new;
            try { new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3').play(); } catch(e){}
            setToast({ title, message });
            setTimeout(() => setToast(null), 8000);
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
        setTimeout(() => setInitialized(true), 2500);
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
    if(confirm("আপনি কি নিশ্চিতভাবে লগ-আউট করতে চান?")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  if (!initialized) return (
    <div className="h-screen flex flex-col items-center justify-between bg-[#05070a] text-white py-20">
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="relative mb-8">
            <div className="w-24 h-24 border-[6px] border-blue-500/10 border-t-blue-600 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center font-black text-2xl italic text-blue-500">if</div>
        </div>
        <p className="font-black uppercase text-[12px] tracking-[0.8em] text-blue-500 animate-pulse">IFZA ELECTRONICS</p>
      </div>
      <div className="animate-reveal">
         <p className="text-4xl font-black italic tracking-tighter text-white/20 uppercase">IFZA</p>
      </div>
    </div>
  );

  if (dbError) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#0a0f1d] text-white text-center">
      <h1 className="text-4xl font-black mb-4 uppercase italic">Connection Lost</h1>
      <button onClick={() => window.location.reload()} className="bg-blue-600 px-12 py-5 rounded-2xl font-black">Reconnect 🔄</button>
    </div>
  );

  if (!user) return showLogin ? <Login onLogin={handleLogin} onBack={() => setShowLogin(false)} /> : <MarketingPage onEnterERP={() => setShowLogin(true)} />;

  const isCustomer = user.role === 'CUSTOMER';

  return (
    <div className="flex h-screen bg-[#f1f5f9] overflow-hidden">
      {toast && (
        <div className="fixed top-6 right-6 left-6 md:left-auto md:w-[420px] z-[9000] bg-white border-2 border-blue-600 p-8 rounded-[3rem] shadow-2xl animate-reveal flex items-start gap-5">
           <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-2xl shrink-0">🔔</div>
           <div className="flex-1">
              <h4 className="font-black text-slate-900 uppercase italic text-sm">{toast.title}</h4>
              <p className="text-[11px] font-bold text-slate-500 mt-2">{toast.message}</p>
           </div>
           <button onClick={() => setToast(null)} className="text-slate-300 hover:text-red-500 text-2xl font-black">×</button>
        </div>
      )}

      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onLogout={handleLogout} user={user} selectedCompany={selectedCompany} onCompanyChange={setSelectedCompany} isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      
      <main className="flex-1 flex flex-col md:ml-[300px] overflow-hidden relative">
        <header className="h-20 bg-white border-b flex justify-between items-center px-6 md:px-10 shrink-0 z-40">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2.5 bg-slate-900 text-white rounded-xl">☰</button>
            <div>
              <h1 className="text-sm font-black text-slate-900 uppercase italic tracking-widest">{activeTab.replace(/_/g, ' ')}</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-[10px] font-black uppercase italic">{user.name}</p>
            </div>
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black italic shadow-lg">{user.name.charAt(0)}</div>
          </div>
        </header>

        {isCustomer && (
          <div className="bg-white border-b px-4 md:px-10 py-6 flex gap-4 overflow-x-auto no-scrollbar shrink-0 z-30 shadow-md">
             {[
               { id: 'portal_dashboard', label: '🏠 হোম', color: 'blue' },
               { id: 'portal_order', label: '🛒 অর্ডার', color: 'indigo' },
               { id: 'portal_ledger', label: '📒 লেজার', color: 'emerald' },
               { id: 'portal_catalog', label: '📢 অফার', color: 'amber' },
               { id: 'showroom', label: '💎 শোরুম', color: 'cyan' }
             ].map(nav => (
               <button 
                 key={nav.id} 
                 onClick={() => setActiveTab(nav.id)}
                 className={`px-10 py-8 rounded-[2.5rem] text-[18px] font-black uppercase tracking-wider transition-all whitespace-nowrap flex flex-col items-center justify-center gap-2 border-[3px] min-w-[150px] flex-1 ${
                   activeTab === nav.id 
                   ? 'bg-blue-600 text-white border-blue-600 shadow-2xl scale-105' 
                   : 'bg-white text-slate-400 border-slate-100 hover:border-blue-200'
                 }`}
               >
                 <span className="text-5xl mb-2">{nav.label.split(' ')[0]}</span>
                 <span className="text-[14px]">{nav.label.split(' ')[1]}</span>
               </button>
             ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scroll bg-[#f8fafc]">
          <div className="max-w-7xl mx-auto">
            {activeTab === 'dashboard' && <Dashboard company={selectedCompany} role={user.role} />}
            {activeTab === 'portal_dashboard' && <CustomerPortal type="DASHBOARD" user={user} />}
            {activeTab === 'portal_ledger' && <CustomerPortal type="LEDGER" user={user} />}
            {activeTab === 'portal_catalog' && <CustomerPortal type="CATALOG" user={user} />}
            {activeTab === 'portal_order' && <CustomerPortal type="ORDER" user={user} />}
            {activeTab === 'showroom' && <Showroom />}
            {activeTab === 'ad_manager' && <AdManager />}
            {activeTab === 'sales' && <Sales company={selectedCompany} role={user.role} user={user} />}
            {activeTab === 'collections' && <Collections company={selectedCompany} user={user} />}
            {activeTab === 'order_management' && <OrderManagement company={selectedCompany} user={user} />}
            {activeTab === 'bookings' && <Bookings company={selectedCompany} role={user.role} user={user} />}
            {activeTab === 'replacements' && <Replacements company={selectedCompany} role={user.role} />}
            {activeTab === 'delivery_hub' && <DeliveryHub company={selectedCompany} user={user} />}
            {activeTab === 'inventory' && <Inventory company={selectedCompany} role={user.role} />}
            {activeTab === 'customers' && <Customers company={selectedCompany} role={user.role} userName={user.name} />}
            {activeTab === 'ledger' && <CompanyLedger company={selectedCompany} role={user.role} />}
            {activeTab === 'reports' && <Reports company={selectedCompany} userRole={user.role} userName={user.name} />}
            {activeTab === 'team' && <Team />}
            {activeTab === 'github_sync' && <Tracking />}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
