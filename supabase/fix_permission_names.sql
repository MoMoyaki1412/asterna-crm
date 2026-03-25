-- Phase 4.1: Correcting Permission Names in RLS
-- Some policies were created with 'create_products' or 'edit_orders' which are not in the Permission union.

-- 1. Table: products
DROP POLICY IF EXISTS "Admins can insert products" ON products;
CREATE POLICY "products_insert" ON products FOR INSERT 
WITH CHECK (auth_has_permission('edit_products')); -- Use edit_products for both creation/editing for simplicity or add create_products to type

-- 2. Table: orders (Update)
DROP POLICY IF EXISTS "Admins can update orders" ON orders;
CREATE POLICY "orders_update" ON orders FOR UPDATE 
USING (auth_has_permission('manage_orders'));

-- 3. Table: bank_accounts (Final Sync)
DROP POLICY IF EXISTS "bank_select" ON bank_accounts;
CREATE POLICY "bank_select" ON bank_accounts FOR SELECT
USING (
    auth_has_permission('manage_bank') OR 
    auth_has_permission('create_orders')
);

-- 4. Table: activity_logs (Ownership Fix)
DROP POLICY IF EXISTS "logs_select" ON activity_logs;
CREATE POLICY "logs_select" ON activity_logs FOR SELECT
USING (auth_has_permission('reveal_pii') OR auth.uid() = admin_id);

-- Ensure all are present
DO $$
BEGIN
    -- Check for products_insert
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'products_insert') THEN
        RAISE EXCEPTION 'products_insert policy missing';
    END IF;
END $$;
