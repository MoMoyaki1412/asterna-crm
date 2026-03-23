-- =============================================
-- Asterna CRM: Tags & Tiers Comprehensive Setup
-- Run this SQL in your Supabase SQL Editor
-- =============================================

-- 1. Create Tables
CREATE TABLE IF NOT EXISTS customer_tiers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  discount_percent NUMERIC NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  product_discounts JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_tags (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#ecf0f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Basic Default Data
INSERT INTO customer_tiers (name, discount_percent) VALUES
  ('NORMAL', 0),
  ('VIP10', 10),
  ('DEALER', 20)
ON CONFLICT (name) DO NOTHING;

INSERT INTO customer_tags (name, color) VALUES
  ('จ่ายเร็ว', '#2ecc71'),
  ('เรื่องมาก', '#e74c3c'),
  ('รอเช็คของ', '#f1c40f')
ON CONFLICT (name) DO NOTHING;

-- 3. Row Level Security (RLS)
ALTER TABLE customer_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tags ENABLE ROW LEVEL SECURITY;

-- 4. Policies (Allow all for testing/admin)
DROP POLICY IF EXISTS "Allow all on tiers" ON customer_tiers;
DROP POLICY IF EXISTS "Allow all on tags" ON customer_tags;

CREATE POLICY "Allow all on tiers" ON customer_tiers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on tags" ON customer_tags FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Also allow public for easier initial development if needed (Optional)
-- CREATE POLICY "Public read tiers" ON customer_tiers FOR SELECT TO anon USING (true);
