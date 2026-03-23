-- ====================================================
-- Asterna CRM — Supabase SQL Schema
-- Run this in Supabase > SQL Editor > New Query
-- ====================================================

-- 1. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  note TEXT,
  tags TEXT,
  total_orders INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  size TEXT,
  cost NUMERIC(10,2) DEFAULT 0,
  price_retail NUMERIC(10,2) DEFAULT 0,
  price_dealer NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ORDERS TABLE
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT,      -- denormalized for quick display
  order_date TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',
  total NUMERIC(10,2) DEFAULT 0,
  items_summary TEXT,      -- e.g. "REJU x2, MILK x1"
  tracking TEXT,
  note TEXT,
  source TEXT,             -- e.g. Page365, Offline
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. SEED PRODUCTS (Asterna SKUs)
INSERT INTO products (sku, name, description, size, cost, price_retail, price_dealer) VALUES
  ('A02', 'REJU GOLD SERUM', 'เซรั่มช่วยลดเลือนริ้วรอย', '20g', 280, 500, 370),
  ('A01', 'ANTI-WRINKLE LIFTING CREAM', 'เปปไทด์ช่วยลดเลือนริ้วรอย', '15g', 200, 500, 370),
  ('A03', 'CLEANSING MILK', 'โลชั่นน้ำนมล้างหน้า', '100g', 100, 200, 150),
  ('A04', 'SUNSCREEN FOUNDATION CREAM', 'ครีมรองพื้น SPF กันแดด', '20g', 150, 300, 210)
ON CONFLICT (sku) DO NOTHING;

-- 5. ROW LEVEL SECURITY (RLS) — ต้อง login ถึงจะเข้าได้
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders    ENABLE ROW LEVEL SECURITY;
ALTER TABLE products  ENABLE ROW LEVEL SECURITY;

-- authenticated users only
CREATE POLICY "Authenticated users can read customers"
  ON customers FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert customers"
  ON customers FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update customers"
  ON customers FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read orders"
  ON orders FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert orders"
  ON orders FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can read products"
  ON products FOR SELECT USING (auth.role() = 'authenticated');
