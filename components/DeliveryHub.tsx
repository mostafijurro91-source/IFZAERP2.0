
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Company, User, formatCurrency } from '../types';
import { supabase } from '../lib/supabase';

declare var L: any; // Leaflet global reference

// Haversine formula for distance in meters
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371e3; 
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// MiniMap Component
const MiniMap: React.FC<{ lat: number, lng: number, id: string }> = ({ lat, lng, id }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<any>(null);

  useEffect(() => {
    if (mapRef.current && !instanceRef.current) {
      instanceRef.current = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
        dragging: false,
        touchZoom: false
      }).setView([lat, lng], 16);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(instanceRef.current);
      
      const icon = L.divIcon({
        className: 'custom-user-icon',
        html: `<div class="w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-lg animate-pulse"></div>`,
        iconSize: [16, 16]
      });

      L.marker([lat, lng], { icon }).addTo(instanceRef.current);
    } else if (instanceRef.current) {
      instanceRef.current.setView([lat, lng]);
    }
  }, [lat, lng]);

  return <div ref={mapRef} className="w-full h-32 rounded-2xl border-2 border-slate-100 overflow-hidden shadow-inner mb-4" id={`mini-map-${id}`} />;
};

const getETA = (meters: number) => {
  const speed = 5.5; // m/s
  const seconds = meters / speed;
  const minutes = Math.ceil(seconds / 60);
  return minutes > 60 ? `${Math.floor(minutes/60)}h ${minutes%60}m` : `${minutes} min`;
};

interface DeliveryHubProps {
  company: Company;
  user: User;
}

const DeliveryHub: React.FC<DeliveryHubProps> = ({ company, user }) => {
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState<'PERSONAL' | 'ADMIN_CONSOLE'>(user.role === 'ADMIN' ? 'ADMIN_CONSOLE' : 'PERSONAL');
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  
  const [shops, setShops] = useState<any[]>([]);
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [allCollections, setAllCollections] = useState<any[]>([]);
  const [allDues, setAllDues] = useState<Record<string, any>>({});
  const [activeTripId, setActiveTripId] = useState<string | null>(localStorage.getItem('ifza_active_trip'));

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRoute, setSelectedRoute] = useState("");
  const [filterMode, setFilterMode] = useState<'ALL' | 'UNMAPPED'>('ALL');
  
  const [arrivalTimes, setArrivalTimes] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('ifza_arrival_times');
    return saved ? JSON.parse(saved) : {};
  });
  
  const lastSyncRef = useRef<number>(0);

  const isAdmin = user.role === 'ADMIN';

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [activeView, company]);

  const fetchData = async () => {
    try {
      const today = new Date(); today.setHours(0,0,0,0);
      const [custRes, taskRes, txRes, collRes] = await Promise.all([
        supabase.from('customers').select('*').order('name'),
        supabase.from('delivery_tasks').select('*, customers(*), users(name)').gte('created_at', today.toISOString()),
        supabase.from('transactions').select('customer_id, amount, payment_type, company'),
        supabase.from('collection_requests').select('*, customers(name)').gte('created_at', today.toISOString())
      ]);

      const duesMap: Record<string, any> = {};
      txRes.data?.forEach(tx => {
        const cid = tx.customer_id;
        const co = tx.company;
        const amt = Number(tx.amount) || 0;
        // Fix: Changed 'SQ Cable' to 'SQ Cables'
        if (!duesMap[cid]) duesMap[cid] = { Transtec: 0, 'SQ Light': 0, 'SQ Cables': 0 };
        if (duesMap[cid][co] !== undefined) {
          duesMap[cid][co] += (tx.payment_type === 'COLLECTION' ? -amt : amt);
        }
      });

      setAllCollections(collRes.data || []);
      setAllDues(duesMap);
      setAllTasks(taskRes.data || []);
      setShops(custRes.data || []);
    } catch (err) {}
  };

  // SYNC GPS POSITION TO CLOUD FOR LIVE MAP
  const syncLocationToCloud = async (lat: number, lng: number) => {
    const now = Date.now();
    // Throttle to every 5 seconds to save battery/data but still look "live"
    if (now - lastSyncRef.current < 5000) return;
    lastSyncRef.current = now;

    try {
      await supabase.from('users').update({
        last_lat: lat,
        last_lng: lng,
        last_seen: new Date().toISOString()
      }).eq('id', user.id);
    } catch (err) {
      console.error("Sync Error:", err);
    }
  };

  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const currentLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(currentLoc);
        
        // Push to cloud for admin to see live on map
        syncLocationToCloud(currentLoc.lat, currentLoc.lng);

        const todayTasks = allTasks.filter(t => t.user_id === user.id && t.status === 'PENDING');
        todayTasks.forEach(task => {
          const shop = task.customers;
          if (shop?.lat && shop?.lng) {
            const dist = calculateDistance(currentLoc.lat, currentLoc.lng, shop.lat, shop.lng);
            if (dist < 30) { 
              setArrivalTimes(prev => {
                if (!prev[shop.id]) return { ...prev, [shop.id]: Date.now() };
                const timeSpent = (Date.now() - prev[shop.id]) / 60000;
                if (timeSpent >= 5) handleConfirmDelivery(shop);
                return prev;
              });
            } else {
              setArrivalTimes(prev => {
                if (prev[shop.id]) {
                  const next = {...prev};
                  delete next[shop.id];
                  return next;
                }
                return prev;
              });
            }
          }
        });
      },
      () => {}, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [allTasks, user.id]);

  const handleConfirmDelivery = async (shop: any) => {
    if (!userLocation) return;
    setLoading(true);
    try {
      await supabase.from('delivery_tasks').update({
        status: 'COMPLETED',
        completed_at: new Date().toISOString(),
        lat: userLocation.lat,
        lng: userLocation.lng
      }).eq('customer_id', shop.id).eq('user_id', user.id).gte('created_at', new Date().toISOString().split('T')[0]);
      
      setActiveTripId(null);
      localStorage.removeItem('ifza_active_trip');
      setArrivalTimes(prev => { const n = {...prev}; delete n[shop.id]; return n; });
      fetchData();
    } finally { setLoading(false); }
  };

  const addToRoute = async (shopId: string) => {
    setLoading(true);
    try {
      await supabase.from('delivery_tasks').insert([{ user_id: user.id, customer_id: shopId, company: company, status: 'PENDING' }]);
      fetchData();
    } finally { setLoading(false); }
  };

  const handleSetShopLocation = async (shopId: string) => {
    if (!userLocation) return alert("লোকেশন পাওয়া যাচ্ছে না!");
    if (!confirm("দোকানের সামনে দাঁড়িয়ে আছেন? লোকেশন সেভ করুন।")) return;
    try {
      await supabase.from('customers').update({ lat: userLocation.lat, lng: userLocation.lng }).eq('id', shopId);
      fetchData();
    } catch (err) {}
  };

  const uniqueRoutes = useMemo(() => Array.from(new Set(shops.map(s => s.address?.trim()).filter(Boolean))).sort(), [shops]);

  const filteredShops = useMemo(() => {
    return shops.filter(s => {
      const ms = s.name.toLowerCase().includes(searchTerm.toLowerCase());
      const mr = selectedRoute ? s.address?.trim() === selectedRoute : true;
      const mu = filterMode === 'UNMAPPED' ? (!s.lat || !s.lng) : true;
      return ms && mr && mu;
    });
  }, [shops, searchTerm, selectedRoute, filterMode]);

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-32 font-sans text-slate-900">
      <header className="bg-white/95 backdrop-blur-md sticky top-0 z-[100] border-b px-6 py-6 flex justify-between items-end shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white text-2xl shadow-xl italic font-black">if<span className="text-blue-500">.</span></div>
          <div>
            <h2 className="text-xl font-black uppercase italic tracking-tighter leading-none">Logistics Terminal</h2>
            <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest mt-2">{user.name} • {activeView.replace('_', ' ')}</p>
          </div>
        </div>
        <div className="flex gap-2">
           {isAdmin && (
             <div className="bg-slate-100 p-1.5 rounded-2xl flex gap-1">
                <button onClick={() => setActiveView('PERSONAL')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${activeView === 'PERSONAL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>My Jobs</button>
                <button onClick={() => setActiveView('ADMIN_CONSOLE')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${activeView === 'ADMIN_CONSOLE' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400'}`}>Admin Console</button>
             </div>
           )}
        </div>
      </header>

      <div className="p-4 space-y-6">
          <div className="bg-slate-900 p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
             <div className="absolute right-[-20px] bottom-[-20px] text-6xl opacity-10 rotate-12">🏢</div>
             <div className="relative z-10 flex justify-between items-end">
                <div>
                   <h3 className="text-xl font-black uppercase italic tracking-tighter">Daily Dispatch Route</h3>
                   <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Select shops for today's collection</p>
                </div>
                <div className="bg-white/10 p-1 rounded-2xl flex gap-1">
                   <button onClick={() => setFilterMode('ALL')} className={`px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all ${filterMode === 'ALL' ? 'bg-white text-slate-900' : 'text-white/40'}`}>All Shops</button>
                   <button onClick={() => setFilterMode('UNMAPPED')} className={`px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all ${filterMode === 'UNMAPPED' ? 'bg-red-500 text-white' : 'text-white/40'}`}>Missing GPS 📍</button>
                </div>
             </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="bg-white p-2 rounded-[2rem] border shadow-sm flex gap-2">
                <select className="p-4 bg-slate-50 border-r rounded-l-[1.8rem] font-black text-[10px] uppercase outline-none min-w-[120px]" value={selectedRoute} onChange={e => setSelectedRoute(e.target.value)}>
                  <option value="">সকল এরিয়া</option>
                  {uniqueRoutes.map(route => <option key={route} value={route}>{route}</option>)}
                </select>
                <input type="text" placeholder="দোকানের নাম খুঁজুন..." className="flex-1 p-4 bg-transparent font-black text-xs uppercase outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
             </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {filteredShops.map(shop => {
              const shopDues = allDues[shop.id] || { Transtec: 0, 'SQ Light': 0, 'SQ Cables': 0 };
              const task = allTasks.find(t => t.customer_id === shop.id && t.user_id === user.id);
              const isGoing = activeTripId === shop.id;
              const hasGPS = shop.lat && shop.lng;
              const distance = userLocation && hasGPS ? calculateDistance(userLocation.lat, userLocation.lng, shop.lat, shop.lng) : null;
              
              const arrivalTime = arrivalTimes[shop.id];
              const minutesSpent = arrivalTime ? (Date.now() - arrivalTime) / 60000 : 0;
              const isAtLocation = distance !== null && distance < 30;

              return (
                <div key={shop.id} className={`bg-white rounded-[3.5rem] border-2 p-8 transition-all shadow-xl relative overflow-hidden ${isGoing ? 'border-blue-500 ring-8 ring-blue-50' : 'border-white'}`}>
                  <div className="absolute top-6 right-8 flex gap-2">
                     {!hasGPS && <span className="px-4 py-1.5 bg-red-100 text-red-600 rounded-full font-black text-[9px] uppercase italic animate-pulse">Missing GPS 📍</span>}
                     {task?.status === 'COMPLETED' ? <span className="px-4 py-1.5 bg-emerald-100 text-emerald-600 rounded-full font-black text-[9px] uppercase italic">Delivered ✅</span> : task?.status === 'PENDING' ? <span className="px-4 py-1.5 bg-orange-100 text-orange-600 rounded-full font-black text-[9px] uppercase italic animate-pulse">Pending 🚚</span> : null}
                  </div>

                  <div className="flex flex-col md:flex-row justify-between gap-6 mb-8">
                    <div className="flex-1">
                      <h4 className="text-2xl font-black uppercase italic tracking-tighter text-slate-900 leading-none mb-2">{shop.name}</h4>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic ml-1.5">📍 {shop.address} {distance ? `• ${distance.toFixed(0)}m away` : ''}</p>
                    </div>
                  </div>

                  {!hasGPS && (
                    <div className="mb-8 p-6 bg-red-50/50 rounded-[2.5rem] border-2 border-dashed border-red-200">
                       {userLocation && <MiniMap lat={userLocation.lat} lng={userLocation.lng} id={shop.id} />}
                       <button onClick={() => handleSetShopLocation(shop.id)} className="w-full bg-slate-900 text-white px-10 py-5 rounded-[1.8rem] font-black uppercase text-[10px] tracking-widest shadow-2xl active:scale-95">🎯 Confirm & Set Location</button>
                    </div>
                  )}

                  {isGoing && (
                    <div className="mb-8 p-6 bg-slate-900 rounded-[2.5rem]">
                       <div className="flex justify-between items-center mb-4">
                          <div className="flex items-center gap-3">
                             <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-black shadow-lg ${isAtLocation ? 'bg-emerald-600 animate-bounce' : 'bg-blue-600'}`}>{isAtLocation ? '🎯' : '🚚'}</div>
                             <div><p className="text-[9px] font-black text-white uppercase italic">{isAtLocation ? 'Reached' : 'Traveling'}</p></div>
                          </div>
                          <p className={`text-sm font-black italic ${isAtLocation ? 'text-emerald-400' : 'text-blue-400'}`}>{isAtLocation ? `${Math.max(0, 5 - Math.floor(minutesSpent))}m left` : '...'}</p>
                       </div>
                       <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                          <div className={`h-full transition-all duration-1000 ${isAtLocation ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: isAtLocation ? `${(minutesSpent / 5) * 100}%` : '100%' }}></div>
                       </div>
                    </div>
                  )}

                  <div className="flex flex-col md:flex-row gap-3">
                    {!task ? (
                      <button onClick={() => addToRoute(shop.id)} className="flex-1 py-5 bg-slate-900 text-white rounded-[2.5rem] font-black uppercase text-xs">➕ Add to Route</button>
                    ) : task.status === 'COMPLETED' ? (
                      <div className="flex-1 py-5 text-center bg-emerald-50 text-emerald-600 font-black uppercase text-[10px] rounded-[2.5rem]">✅ Delivered</div>
                    ) : !isGoing ? (
                      <button disabled={!hasGPS} onClick={() => { setActiveTripId(shop.id); localStorage.setItem('ifza_active_trip', shop.id); }} className="flex-1 py-5 bg-blue-600 text-white rounded-[2.5rem] font-black uppercase text-xs">🚀 Start Trip</button>
                    ) : (
                      <div className="flex-1 flex gap-2">
                         <button onClick={() => setActiveTripId(null)} className="flex-1 bg-slate-100 text-slate-400 py-5 rounded-[2.5rem] font-black text-[10px]">Abort</button>
                         <button onClick={() => handleConfirmDelivery(shop)} className="flex-[2] bg-emerald-600 text-white py-5 rounded-[2.5rem] font-black text-xs">Complete ✅</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      <style>{`.custom-user-icon { background: none !important; border: none !important; }`}</style>
    </div>
  );
};

export default DeliveryHub;
