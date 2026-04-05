import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// 🚀 Service Worker Registration for PWA Support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('✅ Service Worker Registered:', reg.scope))
      .catch(err => console.log('❌ Service Worker Registration Failed:', err));
  });
}

const rootElement = document.getElementById('root');
if (rootElement) {
  try {
    const root = createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (err: any) {
    console.error("Critical mount error:", err);
    // This will trigger the window.onerror in index.html
    throw err;
  }
}
