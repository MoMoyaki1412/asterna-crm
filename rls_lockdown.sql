-- ====================================================
-- EMERGENCY RLS SECURITY PURGE & LOCKdown
-- ====================================================

-- 1. DROP INSECURE POLICIES (Identified during Audit)
-- We use a safe approach by dropping everything and re-creating only what is needed.

-- ORDERS
DROP POLICY IF EXISTS "Allow delete for anon" ON orders;
DROP POLICY IF EXISTS "Allow delete for auth orders" ON orders;
DROP POLICY IF EXISTS "Allow delete for authenticated users" ON orders;
DROP POLICY IF EXISTS "Admins can delete orders" ON orders;

-- CUSTOMERS
DROP POLICY IF EXISTS "Allow delete for anon" ON customers;
DROP POLICY IF EXISTS "Allow delete for anon customers" ON customers;
DROP POLICY IF EXISTS "Allow delete for auth customers" ON customers;
DROP POLICY IF EXISTS "Admins can delete customers" ON customers;

-- PRODUCTS
DROP POLICY IF EXISTS "Allow all for authenticated users" ON products;
DROP POLICY IF EXISTS "Admins can delete products" ON products;

-- ORDER_ITEMS
DROP POLICY IF EXISTS "Allow delete for anon order_items" ON order_items;
DROP POLICY IF EXISTS "Allow delete for auth order_items" ON order_items;
DROP POLICY IF EXISTS "Authenticated users can delete order_items" ON order_items;
DROP POLICY IF EXISTS "Admins can delete order_items" ON order_items;

-- COUPONS (Vouchers)
DROP POLICY IF EXISTS "Allow all coupons for authenticated" ON coupons;
DROP POLICY IF EXISTS "Admins can delete coupons" ON coupons;


-- 2. RE-CREATE STRICT PERMISSION-BASED DELETE POLICIES

-- ORDERS
CREATE POLICY "Admins with delete_orders permission can delete"
ON orders FOR DELETE
TO authenticated
USING (public.auth_has_permission('delete_orders', auth.uid()));

-- CUSTOMERS (Soft Delete handled by logic, but DB must be protected)
CREATE POLICY "Admins with delete_customers permission can delete"
ON customers FOR DELETE
TO authenticated
USING (public.auth_has_permission('delete_customers', auth.uid()));

-- PRODUCTS
CREATE POLICY "Admins with delete_products permission can delete"
ON products FOR DELETE
TO authenticated
USING (public.auth_has_permission('delete_products', auth.uid()));

-- ORDER_ITEMS
CREATE POLICY "Admins with delete_orders permission can delete order_items"
ON order_items FOR DELETE
TO authenticated
USING (public.auth_has_permission('delete_orders', auth.uid()));

-- COUPONS
CREATE POLICY "Admins with delete_vouchers permission can delete coupons"
ON coupons FOR DELETE
TO authenticated
USING (public.auth_has_permission('delete_vouchers', auth.uid()));


-- 3. ENSURE OTHER OPERATIONS ARE ALSO PROTECTED (Optional but recommended)
-- For Products, if "Allow all" was removed, we need to add back SELECT for viewing.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can view products') THEN
        CREATE POLICY "Anyone can view products" ON products FOR SELECT USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can view coupons') THEN
        CREATE POLICY "Anyone can view coupons" ON coupons FOR SELECT USING (true);
    END IF;
END $$;

-- 4. VERIFY NO "ANON" DELETE EXISTS
-- Supabase default for new tables is "No policies", but we explicitly revoke if needed.
-- (Supabase already handles this via 'anon' role permissions, but RLS 'true' overrides it).
