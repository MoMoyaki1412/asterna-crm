-- ====================================================
-- Asterna CRM — Schema Update for Advanced Orders
-- ====================================================

-- 1. ADD INVENTORY TRACKING TO PRODUCTS
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0;

-- 2. CREATE ORDER_ITEMS TABLE (For Analytics and Inventory)
CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id) ON DELETE RESTRICT,
  qty INTEGER NOT NULL DEFAULT 1,
  price_at_time NUMERIC(10,2) NOT NULL, -- The price the customer paid
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. UPDATE ORDERS TABLE
-- We will keep the orders table mostly the same, but add payment tracking
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) DEFAULT 0;
-- 'total' will now be (Sum of items + shipping_cost - discount)

-- 4. ROW LEVEL SECURITY (RLS) FOR NEW TABLE
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read order_items"
  ON order_items FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert order_items"
  ON order_items FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update order_items"
  ON order_items FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can delete order_items"
  ON order_items FOR DELETE USING (auth.role() = 'authenticated');
