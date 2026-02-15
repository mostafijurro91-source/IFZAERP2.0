
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. COLLECTION REQUESTS (Fixes the 'meta' column missing error)
CREATE TABLE IF NOT EXISTS collection_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    company TEXT NOT NULL,
    amount NUMERIC DEFAULT 0,
    submitted_by TEXT,
    status TEXT DEFAULT 'PENDING',
    meta JSONB DEFAULT '{}'::jsonb
);

-- ... existing tables ...

-- 6. MARKET ORDERS
CREATE TABLE IF NOT EXISTS market_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    company TEXT NOT NULL,
    total_amount NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'PENDING',
    items JSONB DEFAULT '[]'::jsonb,
    created_by TEXT,
    area TEXT
);

-- Clean up and sync increment_stock function
DROP FUNCTION IF EXISTS increment_stock(UUID, INTEGER);
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
CREATE INDEX IF NOT EXISTS idx_products_co_name ON products (company, name);
CREATE INDEX IF NOT EXISTS idx_tx_co_date ON transactions (company, created_at DESC);
