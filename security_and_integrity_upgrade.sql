-- =================================================================
-- CRM SECURITY & INTEGRITY UPGRADE
-- 1. Atomic Stock Updates (Fix 3: Prevent Race Conditions)
-- 2. Hardened RLS Policies (Fix 2: Granular Database Access)
-- =================================================================

-- -----------------------------------------------------------------
-- 1. FUNCTION: handle_stock_impact
-- Ensures stock updates are atomic and prevents overselling if needed.
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_stock_impact(
    p_id INTEGER,
    diff_res INTEGER,
    diff_tot INTEGER,
    diff_shp INTEGER
)
RETURNS VOID AS $$
BEGIN
    UPDATE public.products
    SET 
        stock_reserved = GREATEST(0, COALESCE(stock_reserved, 0) + diff_res),
        stock_total = COALESCE(stock_total, 0) + diff_tot,
        stock_shipped = GREATEST(0, COALESCE(stock_shipped, 0) + diff_shp)
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------
-- 2. RLS HARDENING: PRODUCTS
-- -----------------------------------------------------------------
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.products;
DROP POLICY IF EXISTS "Allow update for authenticated users" ON public.products;
DROP POLICY IF EXISTS "Allow delete for authenticated users" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can read products" ON public.products;

-- SELECT: Anyone authenticated can view products
CREATE POLICY "Authenticated users can view products"
ON public.products FOR SELECT
TO authenticated
USING (true);

-- INSERT/UPDATE/DELETE: Only those with 'manage_inventory' or 'manage_orders'
CREATE POLICY "Managing users can modify products"
ON public.products FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.admin_profiles
        WHERE id = auth.uid()
        AND (permissions ? 'manage_inventory' OR permissions ? 'manage_orders')
    )
);

-- -----------------------------------------------------------------
-- 3. RLS HARDENING: ORDERS
-- -----------------------------------------------------------------
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can update orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can delete orders" ON public.orders;

-- SELECT/INSERT: Authenticated can view/create (standard setup)
-- UPDATE/DELETE: Only those with 'manage_orders' or 'delete_orders'
CREATE POLICY "Managing users can update/delete orders"
ON public.orders FOR ALL 
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.admin_profiles
        WHERE id = auth.uid()
        AND (permissions ? 'manage_orders' OR permissions ? 'delete_orders')
    )
);
-- -----------------------------------------------------------------
-- 4. SOFT DELETE: PRODUCTS & CUSTOMERS (Fix 5)
-- -----------------------------------------------------------------
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Update existing SELECT policies to respect is_active if needed, 
-- or handle it in the application layer (preferred for historical views).
