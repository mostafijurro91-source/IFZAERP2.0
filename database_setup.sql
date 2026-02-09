
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'STAFF', -- ADMIN, STAFF, DELIVERY
    company TEXT NOT NULL DEFAULT 'Transtec',
    last_seen TIMESTAMPTZ,
    last_lat NUMERIC,
    last_lng NUMERIC
);

-- 2. USER LOCATION HISTORY
CREATE TABLE IF NOT EXISTS user_location_history (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    lat NUMERIC NOT NULL,
    lng NUMERIC NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_location_history' AND column_name='company') THEN
        ALTER TABLE user_location_history ADD COLUMN company TEXT;
    END IF;
END $$;

-- 3. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    address TEXT,
    lat NUMERIC,
    lng NUMERIC
);

-- 4. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    company TEXT NOT NULL,
    name TEXT NOT NULL,
    mrp NUMERIC DEFAULT 0,
    tp NUMERIC DEFAULT 0,
    stock INTEGER DEFAULT 0,
    category TEXT
);

-- 5. TRANSACTIONS
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    company TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    payment_type TEXT NOT NULL,
    items JSONB DEFAULT '[]'::jsonb
);

-- Clean up and sync increment_stock function
DROP FUNCTION IF EXISTS increment_stock(UUID, INTEGER);
DROP FUNCTION IF EXISTS increment_stock(TEXT, INTEGER);
DROP FUNCTION IF EXISTS increment_stock(UUID, NUMERIC);

CREATE OR REPLACE FUNCTION increment_stock(row_id UUID, amt INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE products
  SET stock = stock + amt
  WHERE id = row_id;
END;
$$ LANGUAGE plpgsql;

-- Optimization Indexes
CREATE INDEX IF NOT EXISTS idx_history_user_date ON user_location_history (user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_company ON user_location_history (company);
CREATE INDEX IF NOT EXISTS idx_products_co_name ON products (company, name);
CREATE INDEX IF NOT EXISTS idx_tx_co_date ON transactions (company, created_at DESC);
