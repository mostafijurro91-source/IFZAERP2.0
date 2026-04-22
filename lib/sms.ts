
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

    // Build URL for GET request (Restoring original logic)
    const url = new URL(`${baseUrl}/sms/send`);
    url.searchParams.append('api_key', apiKey);
    url.searchParams.append('to', cleanPhone);
    url.searchParams.append('message', message);
    if (senderId) {
      url.searchParams.append('sender_id', senderId);
    }

    console.log('Attempting to send SMS to:', cleanPhone, 'via', baseUrl);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000) 
    });

    if (!response.ok) {
      throw new Error(`Gateway returned HTTP ${response.status}`);
    }

    const result = await response.json();
    console.log('SMS Gateway Response:', result);
    
    const isSuccess = result.status === 'success' || result.code === '200' || result.status === 'OK' || result.msg === 'Success';

    // Update log with result
    await supabase.from('sms_logs').insert([{ 
      ...logData, 
      status: isSuccess ? 'SENT' : 'FAILED',
      meta: result 
    }]);

    if (!isSuccess) {
      return { success: false, error: result.message || 'Gateway returned error', result };
    }

    return { success: true, result };

  } catch (error) {
    console.error('SMS Send Error:', error);
    
    let errorMessage = String(error);
    if (errorMessage.includes('Failed to fetch')) {
      errorMessage = 'কানেক্ট করা যাচ্ছে না (Connection Failed)। অনুগ্রহ করে আপনার ইন্টারনেট এবং API URL চেক করুন।';
    }
    
    await supabase.from('sms_logs').insert([{ 
      ...logData, 
      status: 'ERROR', 
      meta: { error: errorMessage } 
    }]);
    
    return { success: false, error: errorMessage };
  }
};

/**
 * Internal helper to handle the API response
 */
async function handleResponse(response: Response, logData: any) {
  const result = await response.json();
  console.log('SMS Gateway Response:', result);
  
  // Ummah Host BD typically returns { status: 'success', ... } or { status: 'error', ... }
  const isSuccess = result.status === 'success' || 
                    result.code === '200' || 
                    result.status === 'OK' || 
                    result.msg === 'Success' ||
                    result.success === true;

  // Update log with result
  await supabase.from('sms_logs').insert([{ 
    ...logData, 
    status: isSuccess ? 'SENT' : 'FAILED',
    meta: { ...result, method: response.url.includes('?') ? 'GET' : 'POST' }
  }]);

  if (!isSuccess) {
    return { success: false, error: result.message || result.msg || 'Gateway returned error', result };
  }

  return { success: true, result };
}

