-- ====================================================
-- Granular Permissions & RLS Hardening
-- ====================================================

-- 1. Ensure Roles & Permissions tables exist (Dynamic RBAC)
CREATE TABLE IF NOT EXISTS public.roles (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    color TEXT,
    icon TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
    id BIGSERIAL PRIMARY KEY,
    role_id TEXT REFERENCES public.roles(id) ON DELETE CASCADE,
    permission TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role_id, permission)
);

-- 2. Seed default roles if empty
INSERT INTO public.roles (id, label, color, icon)
VALUES 
    ('owner', 'Owner', '#C9A84C', '👑'),
    ('manager', 'Manager', '#2ecc71', '🏠'),
    ('staff', 'Staff', '#3498db', '👤')
ON CONFLICT (id) DO NOTHING;

-- 3. Seed default permissions (Base mapping)
INSERT INTO public.role_permissions (role_id, permission)
VALUES
    -- Staff
    ('staff', 'view_orders'), ('staff', 'create_orders'), ('staff', 'view_customers'), ('staff', 'view_conversations'), ('staff', 'view_products'),
    ('staff', 'reveal_pii'),
    -- Manager
    ('manager', 'view_dashboard'), ('manager', 'edit_stock'), ('manager', 'view_orders'), ('manager', 'create_orders'), ('manager', 'view_customers'), 
    ('manager', 'edit_customers'), ('manager', 'view_conversations'), ('manager', 'manage_tags'), ('manager', 'view_stock'), ('manager', 'view_products'),
    ('manager', 'view_full_pii'), ('manager', 'manage_orders'), ('manager', 'reveal_pii')
ON CONFLICT DO NOTHING;

-- 4. Create Helper Function to check permissions in RLS
CREATE OR REPLACE FUNCTION public.auth_has_permission(required_permission TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- Get user role
    SELECT role INTO user_role FROM public.admin_profiles WHERE id = auth.uid();
    
    -- Owner bypass
    IF user_role = 'owner' THEN RETURN TRUE; END IF;
    
    -- Check role permissions
    RETURN EXISTS (
        SELECT 1 FROM public.role_permissions 
        WHERE role_id = user_role AND permission = required_permission
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Update RLS Policies for Customers
DROP POLICY IF EXISTS "Authenticated users can read customers" ON public.customers;
CREATE POLICY "Role-based read customers" ON public.customers 
FOR SELECT USING (public.auth_has_permission('view_customers'));

DROP POLICY IF EXISTS "Authenticated users can update customers" ON public.customers;
CREATE POLICY "Role-based update customers" ON public.customers 
FOR UPDATE USING (public.auth_has_permission('edit_customers'));

-- 6. Update RLS Policies for Orders
DROP POLICY IF EXISTS "Authenticated users can read orders" ON public.orders;
CREATE POLICY "Role-based read orders" ON public.orders 
FOR SELECT USING (public.auth_has_permission('view_orders'));

DROP POLICY IF EXISTS "Authenticated users can update orders" ON public.orders;
CREATE POLICY "Role-based update orders" ON public.orders 
FOR UPDATE USING (public.auth_has_permission('manage_orders'));
