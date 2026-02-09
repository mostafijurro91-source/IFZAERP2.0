
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

declare var L: any; // Leaflet global

interface FleetMapProps {
  onExit?: () => void;
}

const FleetMap: React.FC<FleetMapProps> = ({ onExit }) => {
  const [staff, setStaff] = useState<any[]>([]);
  const [dailyDeliveries, setDailyDeliveries] = useState<any[]>([]);
  
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersGroupRef = useRef<any>(null);
  const shopMarkersGroupRef = useRef<any>(null);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); 
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current && mapContainerRef.current) {
      mapInstanceRef.current = L.map(mapContainerRef.current, { zoomControl: false }).setView([23.8103, 90.4125], 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapInstanceRef.current);
      L.control.zoom({ position: 'bottomright' }).addTo(mapInstanceRef.current);
      markersGroupRef.current = L.layerGroup().addTo(mapInstanceRef.current);
      shopMarkersGroupRef.current = L.layerGroup().addTo(mapInstanceRef.current);
    }
    if (mapInstanceRef.current) updateMarkers();
  }, [staff, dailyDeliveries]);

  const fetchData = async () => {
    try {
      const today = new Date(); today.setHours(0,0,0,0);
      const [staffRes, deliveryRes] = await Promise.all([
        supabase.from('users').select('*').in('role', ['STAFF', 'DELIVERY']),
        supabase.from('delivery_tasks').select('*, customers(*)').gte('created_at', today.toISOString())
      ]);
      setStaff(staffRes.data || []);
      setDailyDeliveries(deliveryRes.data || []);
    } catch (err) { console.error(err); }
  };

  const updateMarkers = () => {
    if (!markersGroupRef.current || !shopMarkersGroupRef.current) return;
    markersGroupRef.current.clearLayers();
    shopMarkersGroupRef.current.clearLayers();

    let bounds = L.latLngBounds([]);

    // 1. Staff Markers
    staff.forEach(s => {
      if (s.last_lat && s.last_lng) {
        const color = s.company === 'Transtec' ? '#eab308' : s.company === 'SQ Light' ? '#22d3ee' : '#ef4444';
        const isLive = (Date.now() - new Date(s.last_seen).getTime()) / 60000 < 5;
        
        const staffIcon = L.divIcon({
          className: 'custom-fleet-icon',
          html: `
            <div class="relative">
              <div style="background-color: ${color};" class="w-10 h-10 rounded-2xl shadow-2xl flex items-center justify-center border-4 border-white transform transition-transform scale-110">
                <span class="text-white font-black text-xs italic">${s.name.charAt(0)}</span>
              </div>
              ${isLive ? `<div class="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white animate-pulse"></div>` : ''}
            </div>
          `,
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        });

        L.marker([s.last_lat, s.last_lng], { icon: staffIcon }).bindPopup(`<p class="font-black text-[10px] uppercase italic">${s.name}<br/><span class="text-blue-500">${s.company}</span></p>`).addTo(markersGroupRef.current);
        bounds.extend([s.last_lat, s.last_lng]);
      }
    });

    // 2. Shop Delivery Task Markers
    dailyDeliveries.forEach(task => {
      const shop = task.customers;
      if (shop?.lat && shop?.lng) {
        const statusColor = task.status === 'COMPLETED' ? '#10b981' : '#f43f5e';
        const shopIcon = L.divIcon({
          className: 'custom-shop-icon',
          html: `
            <div style="background-color: ${statusColor};" class="w-4 h-4 rounded-full border-2 border-white shadow-lg ${task.status === 'PENDING' ? 'animate-bounce' : ''}"></div>
          `,
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });

        const popup = `
          <div class="p-4 font-sans text-black">
            <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">দোকান ডেলিভারি ট্র্যাকার</p>
            <h4 class="text-sm font-black uppercase italic">${shop.name}</h4>
            <p class="text-[9px] font-bold mt-2 text-slate-500 uppercase">অবস্থা: <span class="${task.status === 'COMPLETED' ? 'text-emerald-600' : 'text-red-500'}">${task.status}</span></p>
            ${task.status === 'COMPLETED' ? `<p class="text-[8px] font-black text-slate-400 mt-1 uppercase italic">সময়: ${new Date(task.completed_at).toLocaleTimeString()}</p>` : ''}
          </div>
        `;

        L.marker([shop.lat, shop.lng], { icon: shopIcon }).bindPopup(popup).addTo(shopMarkersGroupRef.current);
        bounds.extend([shop.lat, shop.lng]);
      }
    });

    if (bounds.isValid() && mapInstanceRef.current) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [80, 80], maxZoom: 14 });
    }
  };

  const stats = {
    total: dailyDeliveries.length,
    done: dailyDeliveries.filter(d => d.status === 'COMPLETED').length,
    pending: dailyDeliveries.filter(d => d.status === 'PENDING').length
  };

  return (
    <div className="fixed inset-0 md:ml-72 bg-slate-900 z-0">
      <div ref={mapContainerRef} className="w-full h-full"></div>
      
      {/* Real-time HUD */}
      <div className="absolute top-28 left-6 md:top-10 md:left-10 z-[1000] pointer-events-none w-[calc(100%-3rem)] md:w-auto">
         <div className="bg-slate-900/90 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white/10 shadow-2xl space-y-4 pointer-events-auto">
            <div className="flex items-center justify-between gap-8">
               <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-2xl animate-pulse">🛰️</div>
                  <div>
                     <h3 className="text-white font-black uppercase italic tracking-tighter leading-none">Fleet Control</h3>
                     <p className="text-[8px] text-blue-400 font-black uppercase tracking-widest mt-1.5 leading-none">Monitoring {staff.length} Active Logistics</p>
                  </div>
               </div>
               {onExit && <button onClick={onExit} className="bg-red-600 text-white px-6 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-90">Exit Viewer ×</button>}
            </div>
            
            <div className="flex gap-4 pt-2">
               <div className="text-center px-4">
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Today's Goal</p>
                  <p className="text-xl font-black italic text-white">{stats.total}</p>
               </div>
               <div className="w-px h-8 bg-white/10 mt-1"></div>
               <div className="text-center px-4">
                  <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mb-1">Delivered</p>
                  <p className="text-xl font-black italic text-emerald-500">{stats.done}</p>
               </div>
               <div className="w-px h-8 bg-white/10 mt-1"></div>
               <div className="text-center px-4">
                  <p className="text-[8px] font-black text-red-500 uppercase tracking-widest mb-1">Pending</p>
                  <p className="text-xl font-black italic text-red-500">{stats.pending}</p>
               </div>
            </div>
         </div>
      </div>

      <style>{`
        .custom-fleet-icon, .custom-shop-icon { background: none !important; border: none !important; }
        .leaflet-container { background: #0f172a !important; }
        .leaflet-popup-content-wrapper { border-radius: 1.5rem !important; overflow: hidden !important; padding: 0 !important; }
        .leaflet-popup-content { margin: 0 !important; }
      `}</style>
    </div>
  );
};

export default FleetMap;
