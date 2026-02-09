
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
    // Register Service Worker for PWA support
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW registration failed:', err));
      });
    }

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
            if (parsed.role === 'CUSTOMER' && (activeTab === 'dashboard' || activeTab === 'sales')) {
                setActiveTab('portal_dashboard');
            }
          }
        }
      } catch (e) {
        setDbError(true);
      } finally {
        // Aesthetic delay for the boot screen
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
    if (u.role === 'CUSTOMER') {
      setActiveTab('portal_dashboard');
    } else {
      setActiveTab('dashboard');
    }
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
        <div className="relative mb-10">
            <div className="w-24 h-24 border-[6px] border-blue-500/10 border-t-blue-600 rounded-full animate-spin shadow-[0_0_40px_rgba(37,99,235,0.2)]"></div>
            <div className="absolute inset-0 flex items-center justify-center font-black text-2xl italic text-blue-500">if</div>
        </div>
        <div className="text-center space-y-2">
          <p className="font-black uppercase text-[12px] tracking-[0.8em] text-blue-500 animate-pulse">IFZA CLOUD ERP</p>
          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Initialising Secure Terminal v4.6</p>
        </div>
      </div>
    );
  }

  if (dbError) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#0a0f1d] text-white p-10 text-center">
        <div className="text-8xl mb-8 animate-bounce">🛰️</div>
        <h1 className="text-4xl font-black mb-4 uppercase italic tracking-tighter text-white">Connection Lost</h1>
        <p className="text-slate-500 mb-10 max-w-sm mx-auto text-sm leading-relaxed font-medium">ক্লাউড সার্ভারের সাথে যোগাযোগ করা যাচ্ছে না। দয়া করে আপনার ইন্টারনেট চেক করুন অথবা আপনার হোস্টিং অ্যাডমিনকে জানান।</p>
        <button onClick={() => window.location.reload()} className="bg-blue-600 text-white px-16 py-6 rounded-[2rem] font-black uppercase text-xs shadow-2xl active:scale-95 transition-all hover:bg-blue-700">Try Reconnecting 🔄</button>
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
        <header className="h-24 bg-white/80 backdrop-blur-xl border-b border-slate-200 flex justify-between items-center px-6 md:px-12 shrink-0 z-40">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-3 bg-slate-900 text-white rounded-2xl shadow-lg active:scale-90 transition-transform">☰</button>
            <div className="hidden sm:block">
              <h1 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">{activeTab.replace(/_/g, ' ')}</h1>
              <p className="text-[9px] font-black text-blue-600 uppercase tracking-[0.3em] mt-2 italic">• {selectedCompany} Node Active</p>
            </div>
          </div>
          
          <div className="flex items-center gap-5">
            <div className="text-right hidden sm:block">
              <p className="text-[11px] font-black text-slate-900 leading-none truncate max-w-[150px] uppercase italic">{user.name}</p>
              <p className="text-[8px] font-black text-slate-400 mt-1 uppercase tracking-widest">{user.role} ACCESS</p>
            </div>
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black italic shadow-xl border-2 border-white ring-4 ring-blue-500/5">{user.name.charAt(0)}</div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scroll bg-[#f8fafc]">
          <div className="max-w-7xl mx-auto">{renderContent()}</div>
        </div>
      </main>
    </div>
  );
};

export default App;
