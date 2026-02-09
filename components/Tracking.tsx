
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrency, Company } from '../types';

declare var L: any;

const Tracking: React.FC = () => {
  const [staff, setStaff] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [connStatus, setConnStatus] = useState<'CONNECTED' | 'RECONNECTING' | 'OFFLINE'>('CONNECTED');
  
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const staffLayerRef = useRef<any>(null);
  const shopLayerRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});

  useEffect(() => {
    fetchLiveLogistics();

    const staffChannel = supabase.channel('staff-location-sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, (payload) => {
        setStaff(prev => prev.map(s => s.id === payload.new.id ? { ...s, ...payload.new } : s));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnStatus('CONNECTED');
        else if (status === 'TIMED_OUT') setConnStatus('RECONNECTING');
      });

    const taskChannel = supabase.channel('task-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_tasks' }, () => {
        fetchLiveLogistics();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(staffChannel);
      supabase.removeChannel(taskChannel);
    };
  }, []);

  useEffect(() => {
    if (typeof L === 'undefined') return;

    if (!mapInstanceRef.current && mapContainerRef.current) {
      mapInstanceRef.current = L.map(mapContainerRef.current, { 
        zoomControl: false,
        attributionControl: false 
      }).setView([23.8103, 90.4125], 11);
      
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(mapInstanceRef.current);
      L.control.zoom({ position: 'bottomright' }).addTo(mapInstanceRef.current);
      
      staffLayerRef.current = L.layerGroup().addTo(mapInstanceRef.current);
      shopLayerRef.current = L.layerGroup().addTo(mapInstanceRef.current);
    }
    
    if (mapInstanceRef.current) {
      updateMapUI();
    }
  }, [staff, tasks, activeFilter]);

  const fetchLiveLogistics = async () => {
    try {
      const today = new Date(); today.setHours(0,0,0,0);
      const [staffRes, tasksRes] = await Promise.all([
        supabase.from('users').select('*').in('role', ['DELIVERY', 'STAFF', 'ADMIN']),
        supabase.from('delivery_tasks').select('*, customers(*)').gte('created_at', today.toISOString())
      ]);
      
      setStaff(staffRes.data || []);
      setTasks(tasksRes.data || []);
    } catch (err) {
      console.error("Tracking error:", err);
    } finally {
      setLoading(false);
    }
  };

  const updateMapUI = () => {
    if (!staffLayerRef.current || !shopLayerRef.current || typeof L === 'undefined') return;
    
    staffLayerRef.current.clearLayers();
    shopLayerRef.current.clearLayers();

    staff.forEach(s => {
      if (activeFilter !== 'ALL' && s.company !== activeFilter) return;
      if (s.last_lat && s.last_lng) {
        const lastSeen = s.last_seen ? new Date(s.last_seen).getTime() : 0;
        const diffMinutes = (Date.now() - lastSeen) / 60000;
        const isLive = diffMinutes < 2;

        const color = s.company === 'Transtec' ? '#fbbf24' : s.company === 'SQ Light' ? '#06b6d4' : '#f43f5e';
        
        const staffIcon = L.divIcon({
          className: 'custom-fleet-icon',
          html: `
            <div class="relative transition-all duration-1000 ${!isLive ? 'opacity-40 grayscale' : ''}">
              ${isLive ? `<div class="absolute -inset-2 bg-white/20 rounded-full animate-ping"></div>` : ''}
              <div style="background-color: ${color};" class="w-10 h-10 rounded-2xl shadow-[0_0_20px_rgba(0,0,0,0.5)] flex items-center justify-center border-2 border-white/50">
                <span class="text-white font-black text-xs italic">${s.name?.charAt(0) || '?'}</span>
              </div>
              <div class="absolute -top-1 -right-1 w-3 h-3 ${isLive ? 'bg-emerald-500' : 'bg-slate-500'} rounded-full border-2 border-slate-900"></div>
            </div>
          `,
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        });

        const popup = `
          <div class="p-3 bg-slate-900 text-white rounded-xl min-w-[160px] border border-white/10">
             <h4 class="text-xs font-black uppercase italic">${s.name}</h4>
             <div class="h-px bg-white/10 my-2"></div>
             <p class="text-[9px] font-bold text-blue-400 uppercase tracking-widest">${s.company} • ${s.role}</p>
             <p class="text-[8px] font-black uppercase text-slate-500 mt-2">Update: ${diffMinutes < 1 ? 'REALTIME' : Math.floor(diffMinutes) + 'm ago'}</p>
          </div>
        `;

        L.marker([s.last_lat, s.last_lng], { icon: staffIcon }).bindPopup(popup, { className: 'custom-popup' }).addTo(staffLayerRef.current);
      }
    });

    tasks.forEach(task => {
      const shop = task.customers;
      if (shop?.lat && shop?.lng) {
        const isCompleted = task.status === 'COMPLETED';
        const shopIcon = L.divIcon({
          className: 'custom-shop-icon',
          html: `<div style="background-color: ${isCompleted ? '#10b981' : '#475569'}; shadow: 0 0 10px ${isCompleted ? '#10b981' : '#000'}" class="w-3 h-3 rounded-full border border-white/20"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6]
        });

        L.marker([shop.lat, shop.lng], { icon: shopIcon }).addTo(shopLayerRef.current);
      }
    });
  };

  return (
    <div className="relative w-full h-[75vh] md:h-[85vh] rounded-[4rem] overflow-hidden border-[8px] border-white shadow-2xl bg-slate-950 animate-reveal">
      <div ref={mapContainerRef} className="w-full h-full z-0"></div>

      <div className="absolute top-8 left-8 z-[1000] w-full max-w-sm pointer-events-none">
         <div className="bg-slate-900/80 backdrop-blur-3xl p-8 rounded-[3.5rem] border border-white/10 shadow-2xl space-y-6 pointer-events-auto">
            <div className="flex items-center justify-between">
               <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-blue-600/30 animate-pulse">🛰️</div>
                  <div>
                     <h3 className="text-white font-black uppercase italic tracking-tighter leading-none">Live Fleet Monitor</h3>
                     <p className="text-[8px] text-blue-400 font-black uppercase mt-2 tracking-[0.3em]">
                        {connStatus === 'CONNECTED' ? 'Real-time Link Active' : 'Connecting Satellite...'}
                     </p>
                  </div>
               </div>
               <div className={`w-2.5 h-2.5 rounded-full ${connStatus === 'CONNECTED' ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-red-500 animate-ping'}`}></div>
            </div>

            <div className="flex gap-2 p-1.5 bg-black/40 rounded-2xl border border-white/5">
               {/* Fix: Changed 'SQ Cable' to 'SQ Cables' */}
               {(['ALL', 'Transtec', 'SQ Light', 'SQ Cables'] as string[]).map(co => (
                 <button 
                  key={co}
                  onClick={() => setActiveFilter(co)}
                  className={`flex-1 py-3 rounded-xl text-[8px] font-black uppercase tracking-tighter transition-all ${
                    activeFilter === co ? 'bg-white text-slate-900 shadow-xl scale-[1.02]' : 'text-slate-500 hover:text-slate-300'
                  }`}
                 >
                   {co}
                 </button>
               ))}
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
               <div className="bg-white/5 p-4 rounded-3xl border border-white/5">
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Active Now</p>
                  <p className="text-xl font-black italic text-white">{staff.filter(s => (Date.now() - new Date(s.last_seen).getTime())/60000 < 5).length}</p>
               </div>
               <div className="bg-white/5 p-4 rounded-3xl border border-white/5">
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Targets Met</p>
                  <p className="text-xl font-black italic text-emerald-500">{tasks.filter(t => t.status === 'COMPLETED').length}</p>
               </div>
            </div>
         </div>
      </div>

      <div className="absolute bottom-8 right-8 z-[1000]">
         <div className="bg-slate-900/90 backdrop-blur-xl px-6 py-4 rounded-full border border-white/10 flex items-center gap-4 shadow-2xl">
            <span className="flex items-center gap-2"><div className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_#10b981]"></div><span className="text-[9px] font-black text-white uppercase italic">Active Personnel</span></span>
            <div className="w-px h-3 bg-white/10"></div>
            <span className="flex items-center gap-2"><div className="w-2 h-2 bg-slate-600 rounded-full"></div><span className="text-[9px] font-black text-slate-500 uppercase italic">Offline</span></span>
         </div>
      </div>

      <style>{`
        .custom-fleet-icon, .custom-shop-icon { background: none !important; border: none !important; transition: all 1s ease-in-out; }
        .leaflet-container { background: #020617 !important; }
        .custom-popup .leaflet-popup-content-wrapper { background: #0f172a !important; color: white !important; border-radius: 1.5rem !important; border: 1px solid rgba(255,255,255,0.1) !important; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5) !important; padding: 0 !important; }
        .custom-popup .leaflet-popup-tip { background: #0f172a !important; }
        .leaflet-popup-content { margin: 0 !important; }
      `}</style>
    </div>
  );
};

export default Tracking;
