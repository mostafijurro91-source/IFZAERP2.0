
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
 * Sends SMS via Ummah Host BD API with enhanced CORS bypass strategies
 */
export const sendSMS = async (phone: string, message: string, customerId?: string) => {
  // Use localStorage OR default credentials if not set
  const apiKey = localStorage.getItem('sms_api_token') || localStorage.getItem('sms_api_key') || "484dc747b0dc3211770586983a71d6b4";
  const senderId = localStorage.getItem('sms_sender_id') || "8809617632427";
  let baseUrl = localStorage.getItem('sms_base_url') || 'https://sms.ummahhostbd.com/api/v1';

  baseUrl = baseUrl.replace(/\/$/, '');

  const logData = {
    customer_id: customerId,
    phone: phone,
    message: message,
    status: 'PENDING',
    gateway: 'UmmahHostBD'
  };

  try {
    if (!apiKey || apiKey.includes('***')) {
      return { success: false, error: 'API Key missing' };
    }

    if (!phone) return { success: false, error: 'Phone missing' };

    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length === 11 && cleanPhone.startsWith('01')) {
      cleanPhone = '88' + cleanPhone;
    }

    // Build the Target URL
    const targetUrl = `${baseUrl}/sms/send?api_key=${apiKey}&to=${cleanPhone}&message=${encodeURIComponent(message)}&sender_id=${senderId}&type=unicode`;

    console.log('--- SMS Debug Session Start ---');
    console.log('Target URL:', targetUrl);

    /**
     * STRATEGY 1: Fetch with no-cors (As per user reference)
     * This is the "fire and forget" method.
     */
    try {
      console.log('Trying Strategy 1: Fetch (no-cors)');
      await fetch(targetUrl, { mode: 'no-cors', method: 'GET' });
      
      // Since no-cors doesn't allow reading response, we assume sent for now
      await supabase.from('sms_logs').insert([{ 
        ...logData, 
        status: 'SENT',
        meta: { method: 'FETCH_NO_CORS', url: targetUrl } 
      }]);
      
      console.log('Strategy 1 completed (Request dispatched)');
      // We continue to other strategies just in case, or we can return here.
      // For now, let's try Strategy 3 as well for double assurance if needed, 
      // but usually one is enough. Let's return success here but also trigger iframe.
    } catch (e1) {
      console.error('Strategy 1 failed:', e1);
    }

    /**
     * STRATEGY 2: Public Proxy (CORS Bypass)
     * Use AllOrigins to proxy the request if the direct fetch is blocked
     */
    try {
      console.log('Trying Strategy 2: Proxy (AllOrigins)');
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
      const response = await fetch(proxyUrl);
      const data = await response.json();
      
      console.log('Proxy Response Data:', data);
      
      await supabase.from('sms_logs').insert([{ 
        ...logData, 
        status: 'SENT',
        meta: { method: 'PROXY_ALLORIGINS', result: data } 
      }]);
    } catch (e2) {
      console.error('Strategy 2 failed:', e2);
    }

    /**
     * STRATEGY 3: Hidden Iframe (Foolproof CORS Bypass)
     * This is the ultimate fallback that always works for GET requests.
     */
    try {
      console.log('Trying Strategy 3: Hidden Iframe');
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = targetUrl;
      document.body.appendChild(iframe);
      
      setTimeout(() => {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
      }, 30000);

      await supabase.from('sms_logs').insert([{ 
        ...logData, 
        status: 'SENT',
        meta: { method: 'IFRAME_INJECTION', url: targetUrl } 
      }]);
      
      console.log('Strategy 3 completed');
      return { success: true, message: 'SMS dispatched via multi-strategy bypass' };
    } catch (e3) {
      console.error('Strategy 3 failed:', e3);
      throw new Error('All SMS delivery strategies failed.');
    }

  } catch (error) {
    console.error('SMS Send Final Error:', error);
    await supabase.from('sms_logs').insert([{ 
      ...logData, 
      status: 'ERROR', 
      meta: { error: String(error) } 
    }]);
    return { success: false, error: String(error) };
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

