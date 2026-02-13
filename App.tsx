
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

  // 🔔 Background & Real-time Notification Engine (v4.0)
  useEffect(() => {
    if (user && user.customer_id) {
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }

      // Main Alerts Channel
      const channel = supabase
        .channel(`global_alerts_active_${user.customer_id}`)
        .on(
          'postgres_changes',
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'notifications', 
            filter: `customer_id=eq.${user.customer_id}` 
          },
          (payload: any) => {
            const { title, message, type } = payload.new;
            
            // Audio Alert
            try { 
              const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
              audio.play(); 
            } catch(e){}

            // Show Custom App Toast
            setToast({ title, message, type });
            setTimeout(() => setToast(null), 12000);

            // Browser Native Push
            if (Notification.permission === "granted") {
               if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.ready.then(registration => {
                    (registration as any).showNotification(title, {
                      body: message,
                      icon: 'https://r.jina.ai/i/0f7939be338446b5a32b904586927500',
                      vibrate: [200, 100, 200],
                      badge: 'https://r.jina.ai/i/0f7939be338446b5a32b904586927500',
                    });
                  });
               }
            }
          }
        )
        .subscribe((status) => {
          if (status !== 'SUBSCRIBED') console.warn("Realtime Status:", status);
        });

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
      
      {/* 🔔 Premium Pop-up Toast */}
      {toast && (
        <div className="fixed top-6 right-6 left-6 md:left-auto md:w-[480px] z-[9999] bg-white p-10 rounded-[3.5rem] shadow-[0_50px_150px_rgba(0,0,0,0.3)] animate-reveal flex items-start gap-8 ring-[20px] ring-blue-50 border-2 border-blue-600 overflow-hidden group">
           <div className={`w-20 h-20 rounded-[2rem] flex items-center justify-center text-4xl shrink-0 shadow-2xl animate-bounce ${toast.type === 'PAYMENT' ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white'}`}>
             {toast.type === 'PAYMENT' ? '💰' : '📄'}
           </div>
           <div className="flex-1 min-w-0">
              <h4 className="font-black text-slate-900 uppercase italic text-lg tracking-tighter leading-none mb-3 truncate">{toast.title}</h4>
              <p className="text-[13px] font-bold text-slate-500 leading-relaxed mb-8 line-clamp-2">{toast.message}</p>
              <div className="flex gap-3">
                 <button onClick={() => { setActiveTab(user.role === 'CUSTOMER' ? 'portal_alerts' : 'dashboard'); setToast(null); }} className="bg-slate-900 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-blue-600 transition-all active:scale-95">বিস্তারিত দেখুন ➔</button>
                 <button onClick={() => setToast(null)} className="text-slate-400 font-black text-[10px] uppercase px-4 py-2 hover:text-slate-600">বন্ধ করুন</button>
              </div>
           </div>
           <button onClick={() => setToast(null)} className="text-slate-300 hover:text-red-500 text-5xl font-light leading-none self-start transition-colors">×</button>
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
