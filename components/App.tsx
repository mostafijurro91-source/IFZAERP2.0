
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
import Login from './components/Login';
import { User, Company } from './types';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('ifza_active_tab') || 'dashboard');
  const [selectedCompany, setSelectedCompany] = useState<Company>(() => (localStorage.getItem('ifza_company') as Company) || 'Transtec');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('ifza_user');
    if (savedUser) {
      try { setUser(JSON.parse(savedUser)); } catch (e) { localStorage.removeItem('ifza_user'); }
    }
    setInitialized(true);
  }, []);

  useEffect(() => { if (user) localStorage.setItem('ifza_active_tab', activeTab); }, [activeTab, user]);
  useEffect(() => { if (user) localStorage.setItem('ifza_company', selectedCompany); }, [selectedCompany, user]);

  const handleLogin = (u: User) => {
    setUser(u);
    setSelectedCompany(u.company);
    localStorage.setItem('ifza_user', JSON.stringify(u));
  };

  const handleLogout = () => {
    if(confirm("লগ-আউট করতে চান?")) {
        localStorage.clear();
        setUser(null);
        window.location.reload();
    }
  };

  if (!initialized) return null;
  if (!user) return <Login onLogin={handleLogin} />;

  const getTabLabel = () => {
    const labels: Record<string, string> = {
      dashboard: 'DASHBOARD',
      sales: 'SALES TERMINAL',
      collections: 'COLLECTIONS',
      bookings: 'BOOKINGS',
      order_management: 'MARKET ORDERS',
      replacements: 'REPLACEMENTS',
      delivery_hub: 'DELIVERY HUB',
      inventory: 'INVENTORY',
      customers: 'CUSTOMERS',
      ledger: 'COMPANY LEDGER',
      reports: 'REPORTS',
      team: 'TEAM MONITORING'
    };
    return labels[activeTab] || 'TERMINAL';
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard company={selectedCompany} role={user.role} />;
      case 'sales': return <Sales company={selectedCompany} role={user.role} />;
      case 'collections': return <Collections company={selectedCompany} user={user} />;
      case 'bookings': return <Bookings company={selectedCompany} role={user.role} />;
      case 'order_management': return <OrderManagement company={selectedCompany} user={user} />;
      case 'replacements': return <Replacements company={selectedCompany} role={user.role} />;
      case 'delivery_hub': return <DeliveryHub company={selectedCompany} user={user} />;
      case 'inventory': return <Inventory company={selectedCompany} role={user.role} />;
      case 'customers': return <Customers company={selectedCompany} role={user.role} userName={user.name} />;
      case 'ledger': return <CompanyLedger company={selectedCompany} role={user.role} />;
      case 'reports': return <Reports company={selectedCompany} userRole={user.role} />;
      case 'team': return <Team />;
      default: return <Dashboard company={selectedCompany} role={user.role} />;
    }
  };

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden font-sans">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onLogout={handleLogout} 
        user={user}
        selectedCompany={selectedCompany}
        onCompanyChange={setSelectedCompany}
      />
      
      <main className="flex-1 flex flex-col md:ml-[320px] overflow-hidden">
        <header className="h-28 bg-white flex justify-between items-center px-12 border-b border-slate-100 z-40 shrink-0">
          <div className="flex items-center gap-5">
             <div className="w-12 h-12 bg-[#ef4444] rounded-2xl flex items-center justify-center text-white text-xl font-black shadow-lg">S</div>
             <div>
                <h1 className="text-2xl font-black text-slate-800 uppercase italic leading-none tracking-tighter">
                   {getTabLabel()}
                </h1>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1.5">• {selectedCompany} Terminal</p>
             </div>
          </div>
          
          <div className="flex items-center gap-5">
             <div className="text-right hidden md:block">
                <p className="text-[11px] font-black text-slate-800 uppercase leading-none tracking-tighter">{user.name}</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">{user.role} TERMINAL</p>
             </div>
             <div className="w-14 h-14 bg-[#ef4444] rounded-full border-4 border-white shadow-2xl flex items-center justify-center text-white text-2xl font-black">
               {user.name.charAt(0)}
             </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-10 custom-scroll bg-[#f8fafc]">
          <div className="max-w-7xl mx-auto">{renderContent()}</div>
        </div>
      </main>
    </div>
  );
};

export default App;
