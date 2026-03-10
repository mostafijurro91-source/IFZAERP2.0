const processAutoDelivery = async (task: any) => {
  try {
    // ১. ডাটাবেজে টাস্ক সম্পন্ন করা
    const { error: taskError } = await supabase.from('delivery_tasks')
      .update({ 
        status: 'COMPLETED', 
        completed_at: new Date().toISOString() 
      })
      .eq('id', task.id);

    if (taskError) throw taskError;

    // ২. মেমোর প্রতিটি আইটেমের জন্য স্টক কমানো
    if (task.items && Array.isArray(task.items)) {
      const stockUpdates = task.items.map(item => 
        supabase.rpc('increment_stock', { 
          row_id: item.id, // প্রোডাক্টের আইডি
          amt: -item.qty   // পরিমাণ বিয়োগ করা
        })
      );
      
      await Promise.all(stockUpdates);
    }

    console.log(`${task.customers.name} এর ডেলিভারি ও স্টক আপডেট সফল!`);
  } catch (err) {
    console.error("অটো-ডেলিভারি এরর:", err);
  }
};
// ফাইলের একদম শেষে এটি যোগ করুন
export default DeliveryHub;
