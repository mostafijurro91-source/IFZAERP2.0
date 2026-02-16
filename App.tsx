
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

  // 🔔 Background & Real-time Notification Engine
  useEffect(() => {
    if (user && user.customer_id) {
      // 1. Request Browser Permission on Login
      if ("Notification" in window) {
        if (Notification.permission === "default") {
          Notification.requestPermission();
        }
      }

      // 2. Persistent Real-time Listener
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
            
            // Play sound if possible
            try { new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3').play(); } catch(e){}

            // Show In-App Toast
            setToast({ title, message });
            setTimeout(() => setToast(null), 8000);

            // Show Browser Push Notification (Works in background/PWA)
            if (Notification.permission === "granted") {
               if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.ready.then(registration => {
                    // Fix: Cast options to any to support 'vibrate' and 'badge' properties not included in standard NotificationOptions
                    registration.showNotification(title, {
                      body: message,
                      icon: 'https://r.jina.ai/i/0f7939be338446b5a32b904586927500',
                      vibrate: [200, 100, 200],
                      badge: 'https://r.jina.ai/i/0f7939be338446b5a32b904586927500',
                      tag: 'ifza-alert-' + Date.now()
                    } as any);
                  });
               } else {
                  new Notification(title, { body: message });
               }
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
          if (parsed?.id) {
            setUser(parsed);
          }
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

  if (!initialized) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#05070a] text-white">
        <div className="relative mb-8">
            <div className="w-24 h-24 border-[6px] border-blue-500/10 border-t-blue-600 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center font-black text-2xl italic text-blue-500">if</div>
        </div>
        <p className="font-black uppercase text-[12px] tracking-[0.8em] text-blue-500 animate-pulse">IFZA ELECTRONICS</p>
      </div>
    );
  }

  if (dbError) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#0a0f1d] text-white text-center">
        <h1 className="text-4xl font-black mb-4 uppercase italic">Connection Lost</h1>
        <button onClick={() => window.location.reload()} className="bg-blue-600 px-12 py-5 rounded-2xl font-black">Reconnect 🔄</button>
      </div>
    );
  }

  if (!user) {
    return showLogin ? <Login onLogin={handleLogin} onBack={() => setShowLogin(false)} /> : <MarketingPage onEnterERP={() => setShowLogin(true)} />;
  }

  return (
    <div className="flex h-screen bg-[#f1f5f9] overflow-hidden">
      {/* 🔔 In-App Toast Notification Bubble (Pop-up inside app) */}
      {toast && (
        <div className="fixed top-6 right-6 left-6 md:left-auto md:w-[420px] z-[9000] bg-white border-2 border-blue-600 p-8 rounded-[3rem] shadow-[0_30px_90px_rgba(37,99,235,0.3)] animate-reveal flex items-start gap-5 ring-[12px] ring-blue-50">
           <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-2xl shrink-0 shadow-lg animate-bounce">🔔</div>
           <div className="flex-1">
              <h4 className="font-black text-slate-900 uppercase italic text-sm tracking-tighter">{toast.title}</h4>
              <p className="text-[11px] font-bold text-slate-500 mt-2 leading-relaxed">{toast.message}</p>
              <div className="mt-4 flex gap-2">
                 <button onClick={() => { setActiveTab(user.role === 'CUSTOMER' ? 'portal_ledger' : 'collections'); setToast(null); }} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase">দেখুন ➔</button>
                 <button onClick={() => setToast(null)} className="text-slate-400 font-bold text-[9px] uppercase px-4 py-2">পরে</button>
              </div>
           </div>
           <button onClick={() => setToast(null)} className="text-slate-300 hover:text-red-500 text-2xl font-black">×</button>
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
            {activeTab === 'portal_ledger' && <CustomerPortal type="LEDGER" user={user} />}
            {activeTab === 'portal_catalog' && <CustomerPortal type="CATALOG" user={user} />}
            {activeTab === 'portal_booking' && <CustomerPortal type="BOOKING" user={user} />}
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
