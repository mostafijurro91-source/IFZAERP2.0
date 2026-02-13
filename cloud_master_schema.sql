
-- ... (existing tables) ...

-- ১৪. নোটিফিকেশন টেবিল (For Real-time Alerts)
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL, -- MEMO, PAYMENT, ORDER, ANNOUNCEMENT
    is_read BOOLEAN DEFAULT FALSE
);

-- Realtime এনাবল করা (খুবই গুরুত্বপূর্ণ)
ALTER publication supabase_realtime ADD TABLE notifications;
