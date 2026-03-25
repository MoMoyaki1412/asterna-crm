-- =================================================================
-- CRM SECURITY UPGRADE: PHASE 2 (CRITICAL FIXES)
-- 1. Invite-only Admin Creation (Fix Privilege Escalation)
-- 2. RLS Hardening (Fix Unrestricted DELETEs & SQL Errors)
-- =================================================================

-- -----------------------------------------------------------------
-- 1. ADMIN INVITATIONS (Prevent Open Registration Bypass)
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
  created_by UUID REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  used_at TIMESTAMPTZ
);

ALTER TABLE public.admin_invitations ENABLE ROW LEVEL SECURITY;

-- Managing users can view and create invitations
DROP POLICY IF EXISTS "Managing users can view and create invitations" ON public.admin_invitations;
CREATE POLICY "Managing users can view and create invitations" 
ON public.admin_invitations FOR ALL TO authenticated 
USING (public.auth_has_permission('create_admins'));

-- -----------------------------------------------------------------
-- 2. TRIGGER: AUTO-PROMOTE INVITED USERS
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_admin_user() 
RETURNS TRIGGER AS $$
DECLARE
  inv_record RECORD;
BEGIN
  -- Search for an active invitation
  SELECT * INTO inv_record 
  FROM public.admin_invitations 
  WHERE email = NEW.email 
    AND used_at IS NULL 
    AND expires_at > NOW();

  -- If found, auto-insert into admin_profiles with the approved role
  IF FOUND THEN
    INSERT INTO public.admin_profiles (id, email, display_name, role)
    VALUES (NEW.id, NEW.email, split_part(NEW.email, '@', 1), inv_record.role)
    ON CONFLICT (id) DO NOTHING;

    -- Mark invitation as used
    UPDATE public.admin_invitations
    SET used_at = NOW()
    WHERE id = inv_record.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the trigger to Supabase auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_admin_user();

-- -----------------------------------------------------------------
-- 3. REMOVE DANGEROUS RLS: admin_profiles
-- -----------------------------------------------------------------
-- Remove the policy that allows ANY authenticated user to insert themselves 
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.admin_profiles;

-- -----------------------------------------------------------------
-- 4. RLS HARDENING: orders, order_items, products, customers
-- -----------------------------------------------------------------

-- A. ORDERS
DROP POLICY IF EXISTS "Allow delete for authenticated users" ON public.orders;
DROP POLICY IF EXISTS "Managing users can update/delete orders" ON public.orders;

-- Recreate safely (No JSONB operator ? used on missing `permissions` column)
CREATE POLICY "Managing users can update/delete orders"
ON public.orders FOR ALL TO authenticated
USING (public.auth_has_permission('manage_orders') OR public.auth_has_permission('delete_orders'));

-- B. ORDER_ITEMS (Must mirror orders)
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can delete order_items" ON public.order_items;
DROP POLICY IF EXISTS "Authenticated users can insert order_items" ON public.order_items;
DROP POLICY IF EXISTS "Authenticated users can update order_items" ON public.order_items;

CREATE POLICY "Managing users can insert order_items"
ON public.order_items FOR INSERT WITH CHECK (public.auth_has_permission('create_orders'));

CREATE POLICY "Managing users can update order_items"
ON public.order_items FOR UPDATE USING (public.auth_has_permission('manage_orders'));

CREATE POLICY "Managing users can delete order_items"
ON public.order_items FOR DELETE USING (public.auth_has_permission('delete_orders'));

-- C. PRODUCTS
DROP POLICY IF EXISTS "Allow delete for authenticated users" ON public.products;
DROP POLICY IF EXISTS "Managing users can modify products" ON public.products;

CREATE POLICY "Managing users can modify products"
ON public.products FOR ALL TO authenticated
USING (public.auth_has_permission('manage_inventory') OR public.auth_has_permission('edit_products'));

-- D. CUSTOMERS
DROP POLICY IF EXISTS "Authenticated users can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can delete customers" ON public.customers;

-- Anyone with create_orders or edit_customers can insert a new customer
CREATE POLICY "Managing users can insert customers"
ON public.customers FOR INSERT WITH CHECK (
  public.auth_has_permission('edit_customers') OR public.auth_has_permission('create_orders')
);

-- Delete customer requires strong permission (or relies on soft-delete only)
CREATE POLICY "Managing users can delete customers"
ON public.customers FOR DELETE USING (public.auth_has_permission('edit_customers'));
