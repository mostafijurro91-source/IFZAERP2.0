-- ==============================================
-- FAST BOOKING SYSTEM (ISOLATED) - UPDATED
-- ==============================================

-- 1. Fast Booking Orders (Memos)
-- Drop existing tables if re-running
DROP TABLE IF EXISTS fast_booking_transactions;
DROP TABLE IF EXISTS fast_booking_orders;
DROP TABLE IF EXISTS fast_booking_customers; -- Not needed anymore

CREATE TABLE IF NOT EXISTS fast_booking_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    company TEXT NOT NULL,
    total_bill NUMERIC DEFAULT 0,
    total_deposit NUMERIC DEFAULT 0,
    items JSONB DEFAULT '[]'::jsonb,
    status TEXT DEFAULT 'PENDING' -- PENDING, PARTIAL, COMPLETED
);

-- 2. Fast Booking Transactions (Tracking deposits & refunds)
CREATE TABLE IF NOT EXISTS fast_booking_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    order_id UUID REFERENCES fast_booking_orders(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    company TEXT NOT NULL,
    amount NUMERIC DEFAULT 0,
    type TEXT NOT NULL, -- 'DEPOSIT' (Cash/Bank), 'REFUND'
    method TEXT, -- 'CASH', 'BANK'
    note TEXT
);

-- Realtime Enabler (Important for live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE fast_booking_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE fast_booking_transactions;
