
import { supabase } from './supabase';

/**
 * IFZA Electronics WhatsApp Messaging Bridge
 * Sends pre-filled messages via WhatsApp Web/App
 */

export const sendWhatsApp = (phone: string, message: string) => {
  // Clean phone number format for WhatsApp (needs international format without +)
  let cleanPhone = phone.replace(/\D/g, '');
  
  if (cleanPhone.length === 11 && cleanPhone.startsWith('01')) {
    cleanPhone = '88' + cleanPhone;
  } else if (cleanPhone.startsWith('1')) {
    cleanPhone = '880' + cleanPhone;
  }

  // Generate WhatsApp URL
  const encodedMsg = encodeURIComponent(message);
  const waUrl = `https://wa.me/${cleanPhone}?text=${encodedMsg}`;

  // Open in new tab/window
  window.open(waUrl, '_blank');
};

// Keeping this for compatibility with existing components
export const sendSMS = async (phone: string, message: string, customerId?: string) => {
  sendWhatsApp(phone, message);
  
  // Log the attempt in Supabase
  try {
    await supabase.from('sms_logs').insert([{
      customer_id: customerId,
      phone: phone,
      message: message,
      status: 'WA_TRIGGERED',
      gateway: 'WhatsApp'
    }]);
  } catch (e) {}
  
  return { success: true, method: 'WhatsApp' };
};
