-- ==============================================
-- FAST BOOKING SYSTEM (ISOLATED)
-- ==============================================

-- 1. Fast Booking Customers (Completely separate from regular customers)
CREATE TABLE IF NOT EXISTS fast_booking_customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    company TEXT NOT NULL,
    isActive BOOLEAN DEFAULT TRUE
);

-- 2. Fast Booking Orders (Memos)
CREATE TABLE IF NOT EXISTS fast_booking_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    customer_id UUID REFERENCES fast_booking_customers(id) ON DELETE CASCADE,
    company TEXT NOT NULL,
    total_bill NUMERIC DEFAULT 0,
    total_deposit NUMERIC DEFAULT 0,
    items JSONB DEFAULT '[]'::jsonb,
    status TEXT DEFAULT 'PENDING' -- PENDING, PARTIAL, COMPLETED
);

-- 3. Fast Booking Transactions (Tracking deposits & refunds)
CREATE TABLE IF NOT EXISTS fast_booking_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    order_id UUID REFERENCES fast_booking_orders(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES fast_booking_customers(id) ON DELETE CASCADE,
    company TEXT NOT NULL,
    amount NUMERIC DEFAULT 0,
    type TEXT NOT NULL, -- 'DEPOSIT' (Cash/Bank), 'REFUND'
    method TEXT, -- 'CASH', 'BANK'
    note TEXT
);

-- Enable RLS (Optional depending on your setup)
-- ALTER TABLE fast_booking_customers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE fast_booking_orders ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE fast_booking_transactions ENABLE ROW LEVEL SECURITY;

-- Realtime Enabler (Important for live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE fast_booking_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE fast_booking_customers;
ALTER PUBLICATION supabase_realtime ADD TABLE fast_booking_transactions;
