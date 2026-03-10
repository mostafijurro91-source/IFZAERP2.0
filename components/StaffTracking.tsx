
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Company, User } from '../types';

interface StaffTrackingProps {
  company: Company;
}

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

const StaffTracking: React.FC<StaffTrackingProps> = ({ company }) => {
  const [staffLocations, setStaffLocations] = useState<any[]>([]);
  const [shops, setShops] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTimer, setRefreshTimer] = useState(0);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData();
      setRefreshTimer(0);
    }, 600000); // 10 minutes refresh for staff tracking

    const timer = setInterval(() => {
      setRefreshTimer(prev => prev + 1);
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(timer);
    };
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [staffRes, shopRes] = await Promise.all([
        supabase.from('users').select('*').in('role', ['STAFF', 'DELIVERY']),
        supabase.from('customers').select('*')
      ]);
      setStaffLocations(staffRes.data || []);
      setShops(shopRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-reveal">
      <div className="bg-slate-900 p-10 md:p-14 rounded-[4rem] text-white shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 blur-[120px] rounded-full"></div>
        <div className="relative z-10">
           <h3 className="text-3xl md:text-4xl font-black uppercase italic tracking-tighter leading-none">লাইভ স্টাফ ট্র্যাকিং</h3>
           <p className="text-[10px] text-blue-400 font-black uppercase mt-4 tracking-[0.4em] italic leading-none">Real-time Movement Monitor</p>
           <div className="mt-8 flex items-center gap-4">
              <div className="px-5 py-2 bg-white/10 rounded-full border border-white/10 backdrop-blur-md">
                 <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">পরবর্তী আপডেট: {600 - refreshTimer % 600}s</p>
              </div>
              <button onClick={fetchData} className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-xl flex items-center justify-center transition-all">🔄</button>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading && staffLocations.length === 0 ? (
          <div className="col-span-full py-40 text-center animate-pulse text-slate-300 font-black uppercase italic tracking-[0.4em]">লোকেশন ডাটা লোড হচ্ছে...</div>
        ) : staffLocations.length === 0 ? (
          <div className="col-span-full py-40 text-center bg-white rounded-[4rem] border-2 border-dashed border-slate-200">
             <p className="text-sm font-black uppercase text-slate-300 tracking-widest italic">কোনো স্টাফ এই মুহূর্তে অনলাইনে নেই</p>
          </div>
        ) : staffLocations.map(s => {
          const isLive = s.last_seen && (Date.now() - new Date(s.last_seen).getTime()) / 60000 < 10;
          
          let nearestShop: any = null;
          let minDistance = 500; 

          if (s.last_lat && s.last_lng) {
            shops.forEach(shop => {
              if (shop.lat && shop.lng) {
                const dist = calculateDistance(s.last_lat, s.last_lng, shop.lat, shop.lng);
                if (dist < minDistance) {
                  minDistance = dist;
                  nearestShop = shop;
                }
              }
            });
          }

          const currentArea = nearestShop ? `${nearestShop.name} (${nearestShop.address || 'এরিয়া নেই'})` : "রাস্তায় আছেন";
          const lastSeenTime = s.last_seen ? new Date(s.last_seen).toLocaleTimeString('bn-BD') : 'অজানা সময়';

          return (
            <div key={s.id} className="bg-white p-8 rounded-[3.5rem] border border-slate-100 shadow-sm hover:shadow-2xl transition-all group relative overflow-hidden">
               <div className="flex justify-between items-start mb-8">
                  <span className={`px-5 py-2 rounded-2xl text-[9px] font-black uppercase tracking-widest italic shadow-sm ${
                    isLive ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-50 text-slate-400 border border-slate-100'
                  }`}>
                    {isLive ? 'Live Now 🛰️' : 'Offline'}
                  </span>
                  <p className="text-[10px] font-black text-slate-300 italic">{lastSeenTime}</p>
               </div>
               
               <div className="flex items-center gap-6">
                  <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center text-2xl font-black italic shadow-xl transition-all group-hover:scale-110 ${
                    isLive ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-300'
                  }`}>
                    {s.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-black text-slate-800 text-xl uppercase italic leading-tight mb-1">{s.name}</h4>
                    <p className="text-[9px] text-blue-600 font-black uppercase tracking-widest italic">{s.company}</p>
                  </div>
               </div>
               
               <div className="mt-8 pt-6 border-t border-slate-50">
                  <p className="text-[8px] font-black text-slate-300 uppercase mb-2 tracking-widest">বর্তমান অবস্থান:</p>
                  <p className="text-[13px] font-black italic text-slate-900 leading-tight">📍 এখন {currentArea}</p>
               </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StaffTracking;
