# IFZA ERP - cPanel Deployment गाइड / Deployment Guide

## সংক্ষিপ্ত পদক্ষেপ (Quick Steps):

### ১. অ্যাপ্লিকেশন বিল্ড করুন (Build the Application)
```bash
npm install
npm run build
```

এটি একটি `dist` ফোল্ডার তৈরি করবে সব স্ট্যাটিক ফাইল সহ।

### ২. cPanel-এ আপলোড করুন (Upload to cPanel)

**ধাপ ১:** cPanel এ লগইন করুন → File Manager খুলুন
**ধাপ ২:** `public_html` ফোল্ডার খুলুন
**ধাপ ৩:** `dist` ফোল্ডারের সব কন্টেন্ট `public_html` এ কপি করুন

```
public_html/
├── index.html
├── assets/
│   ├── index-xxxx.js
│   └── index-xxxx.css
└── manifest.json
```

### ३. .htaccess ফাইল তৈরি করুন (Create .htaccess for SPA routing)

`public_html/.htaccess` ফাইল তৈরি করুন এই কন্টেন্ট দিয়ে:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  
  # Skip rewrite for actual files and directories
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  
  # Rewrite all requests to index.html for SPA routing
  RewriteRule ^(.*)$ index.html [L]
</IfModule>
```

এটি নিশ্চিত করবে যে সব রুট `index.html` এ রিডাইরেক্ট হয়।

### ४. Domain Setup (If using ifzaerp.com)

**cPanel → Addon Domains:**
- Domain: `ifzaerp.com`
- Document Root: `public_html` (or create specific folder)

### ५. Supabase Configuration

আপনার Supabase API key এবং URL ইতিমধ্যে অ্যাপে কনফিগার করা আছে। তবে নিম্নলিখিত নিশ্চিত করুন:

**CORS Settings (supabase.com এ):**
- Project Settings → API
- Add allowed origins: `https://ifzaerp.com`

### ६. SSL Certificate (HTTPS)

cPanel এ **AutoSSL** চালু করুন:
- cPanel → SSL/TLS Status
- আপনার domain select করুন → Install

## সম্ভাব্য সমস্যা এবং সমাধান

### ❌ "Cannot GET /dashboard" error
✅ **সমাধান:** `.htaccess` ফাইল সঠিকভাবে যোগ করেছেন কিনা চেক করুন

### ❌ Supabase Connection Error
✅ **সমাধান:** 
- CORS settings চেক করুন Supabase Dashboard এ
- Browser console (F12) দেখুন error details জন্য
- Domain URL সঠিক কিনা নিশ্চিত করুন

### ❌ Assets not loading
✅ **সমাধান:** Vite config এ `base: './'` সেট আছে, তাই relative paths ব্যবহার হচ্ছে

## পরীক্ষা করুন

1. Browser এ `https://ifzaerp.com` খুলুন
2. Console (F12) দেখুন কোন error আছে কিনা
3. Login করার চেষ্টা করুন
4. Dashboard এ navigation test করুন

## স্টেপস Summary:

```bash
# Step 1: Build
npm install
npm run build

# Step 2: Upload dist/ folder contents to public_html/

# Step 3: Create .htaccess in public_html/

# Step 4: Configure CORS in Supabase

# Step 5: Enable SSL

# Step 6: Test at https://ifzaerp.com
```

---

**সমস্যা হলে cPanel Support বা আমাকে জানান!**
