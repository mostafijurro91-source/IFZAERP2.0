
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
  const [toast, setToast] = useState<{title: string, message: string, type?: string} | null>(null);

  // 🔔 Universal Real-time Notification Engine (Staff & Customer)
  useEffect(() => {
    if (user) {
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }

      const filter = user.role === 'CUSTOMER' ? `customer_id=eq.${user.customer_id}` : undefined;

      const channel = supabase
        .channel(`ifza_global_alerts_${user.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: filter },
          (payload: any) => {
            const { title, message, type } = payload.new;
            try { new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3').play(); } catch(e){}
            setToast({ title, message, type });
            setTimeout(() => setToast(null), 10000);
            if (Notification.permission === "granted") {
              new Notification(title, { body: message, icon: 'https://r.jina.ai/i/0f7939be338446b5a32b904586927500' });
            }
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
      } catch (e) { setDbError(true); } finally { setTimeout(() => setInitialized(true), 1500); }
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
    <div className="h-screen flex flex-col items-center justify-center bg-[#05070a] text-white">
      <div className="relative mb-8">
          <div className="w-24 h-24 border-[6px] border-blue-500/10 border-t-blue-600 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center font-black text-2xl italic text-blue-500">if</div>
      </div>
      <p className="font-black uppercase text-[12px] tracking-[0.8em] text-blue-500 animate-pulse">IFZA ELECTRONICS</p>
    </div>
  );

  if (dbError) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#0a0f1d] text-white text-center">
      <h1 className="text-4xl font-black mb-4 uppercase italic">Connection Lost</h1>
      <button onClick={() => window.location.reload()} className="bg-blue-600 px-12 py-5 rounded-2xl font-black">Reconnect 🔄</button>
    </div>
  );

  if (!user) return showLogin ? <Login onLogin={handleLogin} onBack={() => setShowLogin(false)} /> : <MarketingPage onEnterERP={() => setShowLogin(true)} />;

  return (
    <div className="flex h-screen bg-[#f1f5f9] overflow-hidden">
      
      {/* 🔔 Premium Alert Pop-up */}
      {toast && (
        <div className="fixed top-6 right-6 left-6 md:left-auto md:w-[460px] z-[9999] bg-white p-8 rounded-[3rem] shadow-[0_40px_120px_rgba(0,0,0,0.25)] animate-reveal flex items-start gap-6 ring-[15px] ring-blue-50 border-2 border-blue-600">
           <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center text-3xl shrink-0 shadow-lg animate-bounce ${toast.type === 'PAYMENT' ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white'}`}>
             {toast.type === 'PAYMENT' ? '💰' : '📄'}
           </div>
           <div className="flex-1">
              <h4 className="font-black text-slate-900 uppercase italic text-base tracking-tighter leading-none mb-3">{toast.title}</h4>
              <p className="text-[12px] font-bold text-slate-500 leading-relaxed mb-6">{toast.message}</p>
              <div className="flex gap-2">
                 <button onClick={() => { setActiveTab(user.role === 'CUSTOMER' ? 'portal_dashboard' : 'dashboard'); setToast(null); }} className="bg-slate-900 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl">বিস্তারিত ➔</button>
                 <button onClick={() => setToast(null)} className="text-slate-400 font-black text-[10px] uppercase px-4 py-2 hover:text-slate-600">বন্ধ করুন</button>
              </div>
           </div>
           <button onClick={() => setToast(null)} className="text-slate-300 hover:text-red-500 text-4xl font-black leading-none">×</button>
        </div>
      )}

      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onLogout={handleLogout} user={user} selectedCompany={selectedCompany} onCompanyChange={setSelectedCompany} isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      
      <main className="flex-1 flex flex-col md:ml-[300px] overflow-hidden relative">
        <header className="h-20 bg-white border-b border-slate-200 flex justify-between items-center px-6 md:px-10 shrink-0 z-40 shadow-sm">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2.5 bg-slate-900 text-white rounded-xl shadow-lg">☰</button>
            <div>
              <h1 className="text-sm font-black text-slate-900 uppercase italic tracking-widest">{activeTab.replace(/_/g, ' ')}</h1>
              <p className="text-[8px] font-black text-blue-600 uppercase tracking-[0.2em] mt-1.5 italic">• Node: {selectedCompany}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-[10px] font-black text-slate-900 uppercase italic leading-none">{user.name}</p>
              <p className="text-[7px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{user.role} ACCESS</p>
            </div>
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black italic shadow-lg">
              {user.name.charAt(0)}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scroll bg-[#f8fafc]">
          <div className="max-w-7xl mx-auto">
            {activeTab === 'dashboard' && <Dashboard company={selectedCompany} role={user.role} />}
            {activeTab === 'portal_dashboard' && <CustomerPortal type="DASHBOARD" user={user} />}
            {activeTab === 'portal_alerts' && <CustomerPortal type="ALERTS" user={user} />}
            {activeTab === 'portal_ledger' && <CustomerPortal type="LEDGER" user={user} />}
            {activeTab === 'portal_catalog' && <CustomerPortal type="CATALOG" user={user} />}
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
