
import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Dashboard from './Dashboard';
import Sales from './Sales';
import Inventory from './Inventory';
import Customers from './Customers';
import Bookings from './Bookings';
import Replacements from './Replacements';
import Reports from './Reports';
import Team from './Team';
import CompanyLedger from './CompanyLedger';
import Collections from './Collections';
import DeliveryHub from './DeliveryHub';
import OrderManagement from './OrderManagement';
import AdManager from './AdManager';
import Login from './Login';
import MarketingPage from './MarketingPage';
import CustomerPortal from './CustomerPortal';
import Showroom from './Showroom';
import Tracking from './Tracking';
import { User, Company } from '../types';
import { checkSupabaseConnection } from '../lib/supabase';

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
        if (!isConnected) setDbError(true);

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
        setTimeout(() => setInitialized(true), 2000);
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
      <div className="h-screen flex flex-col items-center justify-center bg-[#05070a] text-white overflow-hidden">
        <div className="relative mb-8">
            <div className="w-24 h-24 border-[6px] border-blue-500/10 border-t-blue-600 rounded-full animate-spin shadow-2xl"></div>
            <div className="absolute inset-0 flex items-center justify-center font-black text-2xl italic text-blue-500">if</div>
        </div>
        <div className="text-center">
          <p className="font-black uppercase text-[12px] tracking-[0.8em] text-blue-500 animate-pulse">IFZA ELECTRONICS</p>
          <p className="text-[8px] font-medium text-slate-700 uppercase tracking-[0.4em] mt-2 italic">Enterprise Terminal v4.6.8</p>
        </div>
      </div>
    );
  }

  if (dbError) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#0a0f1d] text-white p-10 text-center">
        <h1 className="text-4xl font-black mb-4 uppercase italic tracking-tighter">Connection Lost</h1>
        <button onClick={() => window.location.reload()} className="bg-blue-600 px-12 py-5 rounded-2xl font-black uppercase text-xs">Reconnect 🔄</button>
      </div>
    );
  }

  if (!user) {
    return showLogin ? <Login onLogin={handleLogin} onBack={() => setShowLogin(false)} /> : <MarketingPage onEnterERP={() => setShowLogin(true)} />;
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
    <div className="flex h-screen bg-[#f1f5f9] overflow-hidden">
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
              <h1 className="text-sm font-black text-slate-900 uppercase italic tracking-widest leading-none">{activeTab.replace(/_/g, ' ')}</h1>
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
          <div className="max-w-7xl mx-auto">{renderContent()}</div>
        </div>
      </main>
    </div>
  );
};

export default App;
