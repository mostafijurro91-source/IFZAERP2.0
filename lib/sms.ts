
import { supabase } from './supabase';

/**
 * IFZA Electronics SMS Service (GreenWeb Integration)
 */

// গ্রীনওয়েব থেকে টোকেন পাওয়ার পর নিচের "YOUR_API_TOKEN_HERE" লেখাটি মুছে আপনার টোকেনটি বসান
const GREENWEB_API_TOKEN = "YOUR_API_TOKEN_HERE"; 

export const sendSMS = async (phone: string, message: string, customerId?: string) => {
  // ফোন নম্বর ফরম্যাট ঠিক করা (যেমন: 017... থেকে 88017...)
  let cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '88' + cleanPhone;
  } else if (cleanPhone.length === 11 && cleanPhone.startsWith('01')) {
    cleanPhone = '88' + cleanPhone;
  }

  try {
    // যদি টোকেন আপডেট না করেন, তবে এসএমএস যাবে না, শুধু কনসোলে দেখাবে
    if (GREENWEB_API_TOKEN === "YOUR_API_TOKEN_HERE") {
      console.warn("SMS Alert: GreenWeb API Token missing. Please add it in lib/sms.ts");
      return { success: false, error: "Token Missing" };
    }

    // GreenWeb API URL
    const URL = `https://api.greenweb.com.bd/api.php?json&token=${GREENWEB_API_TOKEN}&to=${cleanPhone}&message=${encodeURIComponent(message)}`;

    const response = await fetch(URL);
    const result = await response.json();

    // ডাটাবেজে ট্র্যাকিং এর জন্য লগ রাখা
    await supabase.from('sms_logs').insert([{
      customer_id: customerId,
      phone: cleanPhone,
      message: message,
      status: (result[0]?.status === 'SENT' || result.status === 'SENT') ? 'SENT' : 'FAILED',
      gateway: 'GreenWeb'
    }]);

    return { success: true, result };
  } catch (error) {
    console.error("SMS Error:", error);
    return { success: false, error };
  }
};
