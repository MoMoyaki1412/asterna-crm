-- Phase 5: FIX Admin Deletion Bug
-- 1. Allow DELETE on admin_profiles for users with 'create_admins' permission
DROP POLICY IF EXISTS "admin_profiles_delete" ON admin_profiles;
CREATE POLICY "admin_profiles_delete" ON admin_profiles FOR DELETE
USING (auth_has_permission('create_admins'));

-- 2. Update orders foreign key to allow SET NULL instead of blocking deletion
-- Find the constraint name first (it was likely orders_admin_id_fkey)
ALTER TABLE public.orders 
DROP CONSTRAINT IF EXISTS orders_admin_id_fkey;

ALTER TABLE public.orders
ADD CONSTRAINT orders_admin_id_fkey 
FOREIGN KEY (admin_id) 
REFERENCES admin_profiles(id) 
ON DELETE SET NULL;

-- 3. Verify
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_profiles_delete') THEN
        RAISE EXCEPTION 'admin_profiles_delete policy missing';
    END IF;
END $$;
