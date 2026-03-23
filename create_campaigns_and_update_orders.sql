-- ====================================================
-- Asterna CRM: Campaigns Table + Orders Update
-- Run this in Supabase > SQL Editor
-- ====================================================

-- 1. Create campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select campaigns for authenticated" ON public.campaigns;
CREATE POLICY "Allow select campaigns for authenticated"
ON public.campaigns FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow all campaigns for authenticated" ON public.campaigns;
CREATE POLICY "Allow all campaigns for authenticated"
ON public.campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Seed sample campaigns
INSERT INTO campaigns (name, discount_amount, is_active) VALUES
  ('โปรโมชั่นซื้อ 2 ลด 100', 100, true),
  ('โปรเดือนเกิด ลด 200', 200, true),
  ('แคมเปญวันแม่ ลด 300', 300, true),
  ('สมาชิกใหม่ ลด 50', 50, true)
ON CONFLICT DO NOTHING;

-- 4. Add shipping_address to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address TEXT;

-- 5. Add campaign_id to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS campaign_id BIGINT REFERENCES campaigns(id) ON DELETE SET NULL;
