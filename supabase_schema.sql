
-- ৬. অ্যাডভার্টাইজমেন্ট টেবিল (Customer Feed)
CREATE TABLE IF NOT EXISTS advertisements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    company TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'NEW_PRODUCT', -- NEW_PRODUCT, OFFER, NOTICE
    image_url TEXT
);

-- কাস্টমার ইউজারদের জন্য পারমিশন (Optional Security)
CREATE INDEX IF NOT EXISTS idx_ads_date ON advertisements (created_at DESC);
