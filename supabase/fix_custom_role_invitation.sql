-- Phase 6: FIX Custom Role Invitation Bug
-- 1. Drop the restrictive check constraint on admin_invitations
ALTER TABLE IF EXISTS public.admin_invitations 
DROP CONSTRAINT IF EXISTS admin_invitations_role_check;

-- 2. Add a foreign key to ensure the role exists in the roles table
-- This allows any dynamic role created in the 'roles' table to be used for invitations.
ALTER TABLE IF EXISTS public.admin_invitations
ADD CONSTRAINT admin_invitations_role_fkey 
FOREIGN KEY (role) 
REFERENCES public.roles(id) 
ON UPDATE CASCADE;

-- 3. Verify
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'admin_invitations_role_fkey'
    ) THEN
        RAISE EXCEPTION 'admin_invitations_role_fkey missing';
    END IF;
END $$;
