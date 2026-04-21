
import { supabase } from './supabase';

/**
 * Ummah Host BD SMS Integration
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

/**
 * Sends SMS via Ummah Host BD API
 */
export const sendSMS = async (phone: string, message: string, customerId?: string) => {
  // Use localStorage OR default credentials if not set
  const apiKey = localStorage.getItem('sms_api_key') || '484d**********d6b4'; 
  const senderId = localStorage.getItem('sms_sender_id') || '8809617632427';
  const baseUrl = localStorage.getItem('sms_base_url') || 'https://sms.ummahhostbd.com/api/v1';

  // Log the attempt in Supabase
  const logData = {
    customer_id: customerId,
    phone: phone,
    message: message,
    status: 'PENDING',
    gateway: 'UmmahHostBD'
  };

  try {
    // If no API key provided at all (even default is masked or empty)
    if (!apiKey || apiKey.includes('***')) {
      console.warn('Valid SMS API Key not found. Falling back to WhatsApp.');
      sendWhatsApp(phone, message);
      await supabase.from('sms_logs').insert([{ ...logData, status: 'WA_FALLBACK', gateway: 'WhatsApp' }]);
      return { success: true, method: 'WhatsApp' };
    }

    // Clean phone number for SMS
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length === 11 && cleanPhone.startsWith('01')) {
      cleanPhone = '88' + cleanPhone;
    }

    // Build URL with query params (GET is often more reliable for SMS Gateways)
    const url = new URL(`${baseUrl}/sms/send`);
    url.searchParams.append('api_key', apiKey);
    url.searchParams.append('to', cleanPhone);
    url.searchParams.append('message', message);
    if (senderId) {
      url.searchParams.append('sender_id', senderId);
    }

    console.log('Sending SMS to:', cleanPhone);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    });

    const result = await response.json();
    console.log('SMS Gateway Response:', result);
    
    // Ummah Host BD typically returns { status: 'success', ... } or { status: 'error', ... }
    const isSuccess = result.status === 'success' || result.code === '200' || result.status === 'OK';

    // Update log with result
    await supabase.from('sms_logs').insert([{ 
      ...logData, 
      status: isSuccess ? 'SENT' : 'FAILED',
      meta: result 
    }]);

    if (!isSuccess) {
      throw new Error(result.message || 'Gateway returned error');
    }

    return { success: true, result };
  } catch (error) {
    console.error('SMS Send Error:', error);
    
    // Fallback to WhatsApp on error
    console.warn('Falling back to WhatsApp due to SMS error');
    sendWhatsApp(phone, message);
    
    await supabase.from('sms_logs').insert([{ 
      ...logData, 
      status: 'ERROR_WA_FALLBACK', 
      meta: { error: String(error) } 
    }]);
    
    return { success: false, error, method: 'WhatsApp_Fallback' };
  }
};

