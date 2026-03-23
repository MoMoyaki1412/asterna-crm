-- ====================================================
-- Admin Profiles Table (RBAC System)
-- Run this in Supabase SQL Editor
-- ====================================================

-- Create admin_profiles table linked to Supabase auth
CREATE TABLE IF NOT EXISTS admin_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'manager', 'staff')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view all admin profiles (needed for the permissions page)
CREATE POLICY "Authenticated users can view admin_profiles"
  ON admin_profiles FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only owners can update roles
CREATE POLICY "Owners can update admin_profiles"
  ON admin_profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM admin_profiles
      WHERE id = auth.uid() AND role = 'owner'
    )
  );

-- Allow authenticated users to insert their own profile (on first login)
CREATE POLICY "Users can insert their own profile"
  ON admin_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ====================================================
-- Seed: Add the current logged-in user as Owner
-- Run AFTER creating the table. Replace the email.
-- ====================================================
-- INSERT INTO admin_profiles (id, email, display_name, role)
-- SELECT id, email, 'Asterna Owner', 'owner'
-- FROM auth.users
-- WHERE email = 'your-email@example.com'
-- ON CONFLICT (id) DO NOTHING;
