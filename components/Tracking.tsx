
import React, { useState, useEffect, useRef } from 'react';
import { supabase, mapToDbCompany } from '../lib/supabase';
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

    return () => {
      supabase.removeChannel(staffChannel);
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
      // Normalize comparison
      const dbCo = mapToDbCompany(s.company);
      if (activeFilter !== 'ALL' && dbCo !== activeFilter) return;
      
      if (s.last_lat && s.last_lng) {
        const lastSeen = s.last_seen ? new Date(s.last_seen).getTime() : 0;
        const diffMinutes = (Date.now() - lastSeen) / 60000;
        const isLive = diffMinutes < 2;

        const color = dbCo === 'Transtec' ? '#fbbf24' : dbCo === 'SQ Light' ? '#06b6d4' : '#f43f5e';
        
        const staffIcon = L.divIcon({
          className: 'custom-fleet-icon',
          html: `
            <div class="relative transition-all duration-1000 ${!isLive ? 'opacity-40 grayscale' : ''}">
              ${isLive ? `<div class="absolute -inset-2 bg-white/20 rounded-full animate-ping"></div>` : ''}
              <div style="background-color: ${color};" class="w-10 h-10 rounded-2xl shadow-[0_0_20px_rgba(0,0,0,0.5)] flex items-center justify-center border-2 border-white/50">
                <span class="text-white font-black text-xs italic">${s.name?.charAt(0) || '?'}</span>
              </div>
            </div>
          `,
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        });

        L.marker([s.last_lat, s.last_lng], { icon: staffIcon }).addTo(staffLayerRef.current);
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
                  <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-2xl animate-pulse">🛰️</div>
                  <div>
                     <h3 className="text-white font-black uppercase italic tracking-tighter leading-none">Fleet Monitor</h3>
                     <p className="text-[8px] text-blue-400 font-black uppercase mt-2 tracking-[0.3em]">Real-time Satellite Link</p>
                  </div>
               </div>
               <div className={`w-2.5 h-2.5 rounded-full ${connStatus === 'CONNECTED' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
            </div>
            <div className="flex gap-2 p-1.5 bg-black/40 rounded-2xl">
               {['ALL', 'Transtec', 'SQ Light', 'SQ Cables'].map(co => (
                 <button key={co} onClick={() => setActiveFilter(co)} className={`flex-1 py-3 rounded-xl text-[8px] font-black uppercase tracking-tighter transition-all ${activeFilter === co ? 'bg-white text-slate-900' : 'text-slate-500'}`}>{co}</button>
               ))}
            </div>
         </div>
      </div>
    </div>
  );
};

export default Tracking;
