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
import GitHubSync from './components/GitHubSync';
import Login from './components/Login';
import { User, Company } from './types';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('ifza_active_tab') || 'dashboard');
  const [selectedCompany, setSelectedCompany] = useState<Company>(() => (localStorage.getItem('ifza_company') as Company) || 'Transtec');
  const [initialized, setInitialized] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('ifza_user');
    if (savedUser) { try { setUser(JSON.parse(savedUser)); } catch (e) { localStorage.removeItem('ifza_user'); } }
    setInitialized(true);
  }, []);

  const handleLogin = (u: User) => { setUser(u); setSelectedCompany(u.company); localStorage.setItem('ifza_user', JSON.stringify(u)); };
  const handleLogout = () => { if(confirm("Logout?")) { localStorage.clear(); setUser(null); window.location.reload(); } };

  if (!initialized) return null;
  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden font-sans">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onLogout={handleLogout} user={user} selectedCompany={selectedCompany} onCompanyChange={setSelectedCompany} isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <main className="flex-1 flex flex-col md:ml-[320px] overflow-hidden">
        <div className="flex-1 overflow-y-auto p-10 custom-scroll">
           {/* Render Tab Logic */}
        </div>
      </main>
    </div>
  );
};
export default App;