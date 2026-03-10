import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../types';

// দূরত্ব মাপার ফর্মুলা (Haversine formula)
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; // মিটারে
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const DeliveryHub: React.FC<{ user: any }> = ({ user }) => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [currentStatus, setCurrentStatus] = useState("অবস্থান চেক করা হচ্ছে...");
  const [loading, setLoading] = useState(true);
  const lastSyncRef = useRef<number>(0);

  useEffect(() => {
    fetchTasks();
    const watchId = startLiveTracking();
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const fetchTasks = async () => {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('delivery_tasks')
      .select('*, customers(*)')
      .eq('delivery_date', today)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    
    setTasks(data || []);
    setLoading(false);
  };

  const startLiveTracking = () => {
    return navigator.geolocation.watchPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      const now = Date.now();

      // ১. অটো-ডেলিভারি লজিক (দোকানের ৩০ মিটারের মধ্যে থাকলে)
      tasks.forEach(async (task) => {
        if (task.status === 'PENDING' && task.customers.lat && task.customers.lng) {
          const dist = calculateDistance(latitude, longitude, task.customers.lat, task.customers.lng);
          if (dist < 30) {
            await handleAutoDelivery(task);
          }
        }
      });

      // ২. ১০ মিনিট (৬০০,০০০ মি.সে.) পর পর লাইভ স্ট্যাটাস ক্লাউডে পাঠানো
      if (now - lastSyncRef.current > 600000) {
        updateCloudLocation(latitude, longitude);
        lastSyncRef.current = now;
      }
    }, (err) => console.error(err), { enableHighAccuracy: true });
  };

  const handleAutoDelivery = async (task: any) => {
    // A. টাস্ক স্ট্যাটাস আপডেট
    const { error } = await supabase
      .from('delivery_tasks')
      .update({ status: 'COMPLETED', completed_at: new Date().toISOString() })
      .eq('id', task.id);

    if (!error) {
      // B. ইনভেন্টরি থেকে স্টক কমানো (SQL Function Call)
      if (task.items && Array.isArray(task.items)) {
        for (const item of task.items) {
          await supabase.rpc('increment_stock', { 
            row_id: item.id, 
            amt: -item.qty 
          });
        }
      }
      setCurrentStatus(`${task.customers.name} - এ ডেলিভারি সম্পন্ন ✅`);
      fetchTasks(); // লিস্ট রিফ্রেশ
    }
  };

  const updateCloudLocation = async (lat: number, lng: number) => {
    await supabase.from('users').update({
      last_lat: lat,
      last_lng: lng,
      live_status: "বর্তমানে ডেলিভারি রুটে সক্রিয় আছে",
      last_seen: new Date().toISOString()
    }).eq('id', user.id);
  };

  if (loading) return <div className="p-10 text-center font-black animate-pulse">লোড হচ্ছে...</div>;

  return (
    <div className="min-h-screen bg-slate-50 pb-24 font-sans">
      {/* হেডার কার্ড */}
      <div className="bg-slate-900 p-8 rounded-b-[3rem] text-white shadow-2xl relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-xl font-black uppercase italic tracking-tighter">Delivery Monitor</h2>
          <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mt-2">
            Status: {currentStatus}
          </p>
        </div>
        <div className="absolute right-[-10px] bottom-[-10px] text-7xl opacity-10">🚚</div>
      </div>

      <div className="p-4 space-y-4">
        {tasks.length === 0 ? (
          <div className="text-center p-20 opacity-20 font-black uppercase italic">আজ কোনো ডেলিভারি নেই</div>
        ) : (
          tasks.map(task => (
            <div key={task.id} className={`bg-white p-6 rounded-[2.5rem] border-2 transition-all ${task.status === 'COMPLETED' ? 'border-emerald-100 bg-emerald-50/20' : 'border-white shadow-sm'}`}>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h4 className="text-lg font-black uppercase italic text-slate-900 leading-none mb-1">{task.customers?.name}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">📍 {task.customers?.address}</p>
                  
                  <div className="mt-4 flex gap-2">
                    <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black italic">
                      বিল: {formatCurrency(task.amount || 0)}
                    </span>
                  </div>
                </div>

                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-lg ${task.status === 'COMPLETED' ? 'bg-emerald-500 text-white' : 'bg-white border text-blue-600 animate-pulse'}`}>
                  {task.status === 'COMPLETED' ? '✓' : '🚚'}
                </div>
              </div>

              {task.status === 'COMPLETED' && (
                <p className="mt-4 text-[9px] font-black text-emerald-600 uppercase tracking-[0.2em] text-center border-t pt-4">
                  অটোমেটিক ডেলিভারি সফল ও স্টক আপডেট হয়েছে
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Vercel এরর সমাধান করতে অবশ্যই এটি থাকতে হবে
export default DeliveryHub;
