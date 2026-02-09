
-- IFZA Electronics ERP - Fresh Start Master Script
-- এই স্ক্রিপ্টটি আপনার নতুন Supabase SQL Editor-এ রান করুন।

-- ১. এক্সটেনশন সেটআপ
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ২. ইউজার টেবিল (এডমিন, স্টাফ, ডেলিভারি)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'STAFF', -- ADMIN, STAFF, DELIVERY
    company TEXT NOT NULL DEFAULT 'Transtec', -- Transtec, SQ Light, SQ Cables
    last_seen TIMESTAMPTZ,
    last_lat NUMERIC,
    last_lng NUMERIC
);

-- ৩. কাস্টমার/দোকান টেবিল
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    proprietor_phone TEXT,
    address TEXT,
    lat NUMERIC,
    lng NUMERIC
);

-- ৪. প্রোডাক্ট ইনভেন্টরি
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    company TEXT NOT NULL, 
    name TEXT NOT NULL,
    mrp NUMERIC DEFAULT 0,
    tp NUMERIC DEFAULT 0,
    etp NUMERIC DEFAULT 0,
    stock INTEGER DEFAULT 0
);

-- ৫. ট্রানজ্যাকশন (সেলস ও কালেকশন)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    company TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    payment_type TEXT NOT NULL, -- DUE (বাকি/সেল), COLLECTION (জমা/নগদ)
    items JSONB DEFAULT '[]'::jsonb,
    submitted_by TEXT
);

-- ৬. কালেকশন রিকোয়েস্ট (অনুমোদনের জন্য)
CREATE TABLE IF NOT EXISTS collection_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    company TEXT NOT NULL,
    submitted_by TEXT,
    status TEXT DEFAULT 'PENDING'
);

-- ৭. ডেলিভারি ও লজিস্টিক ট্র্যাকিং
CREATE TABLE IF NOT EXISTS delivery_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID REFERENCES users(id),
    customer_id UUID REFERENCES customers(id),
    company TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING',
    completed_at TIMESTAMPTZ,
    lat NUMERIC,
    lng NUMERIC
);

-- ৮. কোম্পানি লেজার (পারচেজ ও পেমেন্ট)
CREATE TABLE IF NOT EXISTS company_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    company TEXT NOT NULL,
    type TEXT NOT NULL, -- PURCHASE, PAYMENT, EXPENSE
    amount NUMERIC NOT NULL,
    note TEXT,
    date DATE DEFAULT CURRENT_DATE,
    items_json JSONB DEFAULT '[]'::jsonb
);

-- ৯. বুকিং অর্ডার টেবিল
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    customer_id UUID REFERENCES customers(id),
    company TEXT NOT NULL,
    product_name TEXT,
    qty INTEGER,
    items JSONB DEFAULT '[]'::jsonb,
    advance_amount NUMERIC DEFAULT 0,
    total_amount NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'PENDING'
);

-- ১০. রিপ্লেসমেন্ট ও ওয়ারেন্টি টেবিল
CREATE TABLE IF NOT EXISTS replacements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    customer_id UUID REFERENCES customers(id),
    product_id UUID REFERENCES products(id),
    company TEXT NOT NULL,
    product_name TEXT,
    qty INTEGER DEFAULT 1,
    status TEXT DEFAULT 'RECEIVED' -- RECEIVED, SENT_TO_COMPANY
);

-- ১১. মার্কেট অর্ডার টেবিল
CREATE TABLE IF NOT EXISTS market_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    customer_id UUID REFERENCES customers(id),
    company TEXT NOT NULL,
    total_amount NUMERIC NOT NULL,
    status TEXT DEFAULT 'PENDING',
    items JSONB DEFAULT '[]'::jsonb,
    created_by TEXT
);

-- ১২. স্টক ম্যানেজমেন্ট ফাংশন (RPC)
CREATE OR REPLACE FUNCTION increment_stock(row_id UUID, amt INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE products
  SET stock = stock + amt
  WHERE id = row_id;
END;
$$ LANGUAGE plpgsql;

-- ১৩. ডিফল্ট এডমিন ইউজার (Password: admin123)
-- নতুন ডাটাবেস খোলার পর এটি দিয়ে লগইন করবেন।
INSERT INTO users (username, password, name, role, company)
VALUES ('admin', 'admin123', 'Super Admin', 'ADMIN', 'Transtec')
ON CONFLICT (username) DO NOTHING;
