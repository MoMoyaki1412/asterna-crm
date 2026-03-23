-- ====================================================
-- Asterna CRM: Coupon System
-- Run in Supabase SQL Editor
-- ====================================================

-- 1. Create coupons table
CREATE TABLE IF NOT EXISTS coupons (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  discount_amount NUMERIC(10,2) DEFAULT NULL,
  discount_percent NUMERIC(5,2) DEFAULT NULL,
  max_uses INTEGER DEFAULT NULL,
  uses_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. RLS for coupons
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all coupons for authenticated" ON public.coupons;
CREATE POLICY "Allow all coupons for authenticated"
ON public.coupons FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Add coupon_id to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_id BIGINT REFERENCES coupons(id) ON DELETE SET NULL;

-- 4. Seed sample coupons
INSERT INTO coupons (code, name, discount_amount, discount_percent, max_uses, is_active) VALUES
  ('WELCOME100', 'ต้อนรับสมาชิกใหม่', 100, NULL, 50, true),
  ('VIP20', 'ลูกค้า VIP ลด 20%', NULL, 20, NULL, true),
  ('SAVE200', 'ลดพิเศษ 200 บาท', 200, NULL, 10, true)
ON CONFLICT (code) DO NOTHING;
