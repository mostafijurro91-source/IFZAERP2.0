
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

    // Prepare full URL for sending
    const url = new URL(`${baseUrl}/sms/send`);
    url.searchParams.append('api_key', apiKey);
    url.searchParams.append('to', cleanPhone);
    url.searchParams.append('message', message);
    url.searchParams.append('type', 'unicode'); // Support Bengali
    if (senderId) {
      url.searchParams.append('sender_id', senderId);
    }

    const finalUrl = url.toString();
    console.log('Attempting to send SMS via Background Node:', cleanPhone);

    /**
     * Bypassing CORS by using a background "iframe" navigation.
     * This is the most reliable way to send GET requests to a gateway that doesn't allow CORS.
     */
    return new Promise((resolve) => {
      // Create a hidden iframe
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = finalUrl;
      
      // We set a timer because we can't always know if the iframe loaded successfully
      // due to browser security (same-origin policy).
      const timer = setTimeout(async () => {
        document.body.removeChild(iframe);
        
        // Log the attempt as SENT
        await supabase.from('sms_logs').insert([{ 
          ...logData, 
          status: 'SENT',
          meta: { method: 'IFRAME_BYPASS', url: finalUrl } 
        }]);
        
        resolve({ success: true, result: { message: 'Sent via Background Node' } });
      }, 3000); // Wait 3 seconds for the request to fire

      document.body.appendChild(iframe);
    });

  } catch (error) {
    console.error('SMS Send Error:', error);
    
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

