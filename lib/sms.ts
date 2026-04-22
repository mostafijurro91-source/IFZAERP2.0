
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
  const apiKey = localStorage.getItem('sms_api_key');
  const senderId = localStorage.getItem('sms_sender_id'); // This is what the user calls "Center ID"
  let baseUrl = localStorage.getItem('sms_base_url') || 'https://sms.ummahhostbd.com/api/v1';

  // Clean baseUrl: remove trailing slash
  baseUrl = baseUrl.replace(/\/$/, '');

  // Log the attempt in Supabase
  const logData = {
    customer_id: customerId,
    phone: phone,
    message: message,
    status: 'PENDING',
    gateway: 'UmmahHostBD'
  };

  try {
    if (!apiKey || apiKey.includes('***')) {
      console.warn('Valid SMS API Key not found. SMS will not be sent. Configure in Settings.');
      await supabase.from('sms_logs').insert([{ ...logData, status: 'CONFIG_MISSING', meta: { error: 'API Key missing' } }]);
      return { success: false, error: 'API Key missing' };
    }

    if (!phone) {
      return { success: false, error: 'Mobile number is missing' };
    }

    // Clean phone number for SMS
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length === 11 && cleanPhone.startsWith('01')) {
      cleanPhone = '88' + cleanPhone;
    }

    // Prepare parameters
    const params = new URLSearchParams();
    params.append('api_key', apiKey);
    params.append('to', cleanPhone);
    params.append('message', message);
    params.append('type', 'unicode'); // Required for Bengali support
    
    if (senderId) {
      params.append('sender_id', senderId);
    }

    // Using a CORS proxy because many SMS gateways don't allow direct browser calls
    const targetUrl = `${baseUrl}/sms/send?${params.toString()}`;
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
    
    console.log('Attempting to send SMS via CORS Proxy to:', cleanPhone);

    const response = await fetch(proxyUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(20000) // Increased timeout for proxy
    });

    if (!response.ok) {
      throw new Error(`Proxy or Gateway returned HTTP ${response.status}`);
    }

    // Try to parse JSON from the proxy's raw response
    const resultText = await response.text();
    let result;
    try {
      result = JSON.parse(resultText);
    } catch (e) {
      result = { raw_response: resultText };
    }
    
    console.log('SMS Gateway Response:', result);
    
    const isSuccess = result.status === 'success' || 
                      result.code === '200' || 
                      result.status === 'OK' || 
                      result.msg === 'Success' ||
                      result.success === true ||
                      (typeof resultText === 'string' && resultText.toLowerCase().includes('success'));

    // Update log with result
    await supabase.from('sms_logs').insert([{ 
      ...logData, 
      status: isSuccess ? 'SENT' : 'FAILED',
      meta: { ...result, proxy: true }
    }]);

    if (!isSuccess) {
      return { success: false, error: result.message || result.msg || 'Gateway returned error', result };
    }

    return { success: true, result };

  } catch (error) {
    console.error('SMS Send Error:', error);
    
    let errorMessage = String(error);
    if (errorMessage.includes('Failed to fetch')) {
      errorMessage = 'কানেক্ট করা যাচ্ছে না। আপনার ইন্টারনেট বা প্রক্সি সার্ভার চেক করুন।';
    }
    
    await supabase.from('sms_logs').insert([{ 
      ...logData, 
      status: 'ERROR', 
      meta: { error: errorMessage, type: 'CATCH_BLOCK' } 
    }]);
    
    return { success: false, error: errorMessage };
  }
};

