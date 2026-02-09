
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
import { checkSupabaseConnection } from './lib/supabase';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('ifza_active_tab') || 'dashboard');
  const [selectedCompany, setSelectedCompany] = useState<Company>(() => (localStorage.getItem('ifza_company') as Company) || 'Transtec');
  const [initialized, setInitialized] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [dbError, setDbError] = useState(false);

  useEffect(() => {
    const boot = async () => {
      try {
        const isConnected = await checkSupabaseConnection();
        if (!isConnected) {
          setDbError(true);
        }

        const saved = localStorage.getItem('ifza_user');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.id) {
            setUser(parsed);
            if (parsed.role === 'CUSTOMER') setActiveTab('portal_dashboard');
          }
        }
      } catch (e) {
        console.error("Critical boot error:", e);
        setDbError(true);
      } finally {
        setTimeout(() => setInitialized(true), 1000);
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
    if (u.role === 'CUSTOMER') setActiveTab('portal_dashboard');
    setSelectedCompany(u.company);
    localStorage.setItem('ifza_user', JSON.stringify(u));
  };

  const handleLogout = () => {
    if(confirm("লগ-আউট করতে চান?")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  if (!initialized) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#0a0f1d] text-white">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-6 font-black uppercase text-[9px] tracking-[0.5em] text-blue-500/50 italic animate-pulse">Syncing with IFZA Cloud...</p>
      </div>
    );
  }

  if (dbError) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#1e1b4b] text-white p-10 text-center">
        <div className="text-6xl mb-6">🛰️</div>
        <h1 className="text-4xl font-black mb-4 uppercase italic tracking-tighter text-white leading-none">Database Connectivity Issue</h1>
        <p className="text-blue-300 mb-8 max-w-md mx-auto">সুপারবেস ক্লাউড সার্ভারের সাথে কানেক্ট করা যাচ্ছে না। দয়া করে আপনার ইন্টারনেট চেক করুন এবং ডাটাবেস টেবিলগুলো সঠিকভাবে তৈরি করা আছে কিনা নিশ্চিত করুন।</p>
        <button onClick={() => window.location.reload()} className="bg-white text-black px-12 py-5 rounded-2xl font-black uppercase text-xs shadow-2xl active:scale-95 transition-all">Retry Handshake 🔄</button>
      </div>
    );
  }

  if (!user) {
    if (showLogin) return <Login onLogin={handleLogin} onBack={() => setShowLogin(false)} />;
    return <MarketingPage onEnterERP={() => setShowLogin(true)} />;
  }

  const renderContent = () => {
    const props = { company: selectedCompany, role: user.role, user, userName: user.name };
    switch (activeTab) {
      case 'dashboard': return <Dashboard {...props} />;
      case 'portal_dashboard': return <CustomerPortal type="DASHBOARD" user={user} />;
      case 'portal_ledger': return <CustomerPortal type="LEDGER" user={user} />;
      case 'portal_catalog': return <CustomerPortal type="CATALOG" user={user} />;
      case 'showroom': return <Showroom />;
      case 'ad_manager': return <AdManager />;
      case 'sales': return <Sales company={selectedCompany} role={user.role} user={user} />;
      case 'collections': return <Collections company={selectedCompany} user={user} />;
      case 'order_management': return <OrderManagement company={selectedCompany} user={user} />;
      case 'bookings': return <Bookings {...props} />;
      case 'replacements': return <Replacements {...props} />;
      case 'delivery_hub': return <DeliveryHub company={selectedCompany} user={user} />;
      case 'inventory': return <Inventory {...props} />;
      case 'customers': return <Customers {...props} />;
      case 'ledger': return <CompanyLedger {...props} />;
      case 'reports': return <Reports company={selectedCompany} userRole={user.role} userName={user.name} />;
      case 'team': return <Team />;
      case 'github_sync': return <Tracking />;
      default: return <Dashboard {...props} />;
    }
  };

  return (
    <div className="flex h-screen bg-[#f1f5f9] overflow-hidden font-sans selection:bg-blue-600/20">
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
        <header className="h-24 bg-white/80 backdrop-blur-xl border-b border-slate-200 flex justify-between items-center px-8 md:px-12 shrink-0 z-40">
          <div className="flex items-center gap-6">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-3 bg-slate-950 text-white rounded-2xl shadow-lg">☰</button>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">{activeTab.replace(/_/g, ' ')}</h1>
              <div className="flex items-center gap-2 mt-2">
                 <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                 <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest">{selectedCompany} DIVISION</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-5">
            <div className="text-right hidden sm:block">
              <p className="text-[12px] font-black text-slate-900 leading-none">{user.name}</p>
              <p className="text-[8px] font-black text-slate-400 mt-1 uppercase tracking-widest">{user.role} ACCESS</p>
            </div>
            <div className="w-12 h-12 bg-slate-950 rounded-2xl flex items-center justify-center text-white font-black italic shadow-2xl border-4 border-white">{user.name.charAt(0)}</div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-12 custom-scroll bg-[#f8fafc]">
          <div className="max-w-7xl mx-auto">{renderContent()}</div>
        </div>
      </main>
    </div>
  );
};

export default App;
