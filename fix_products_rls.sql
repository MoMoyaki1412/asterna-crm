-- =============================================
-- Asterna CRM: Fix Products Table RLS Policies
-- Run this SQL in your Supabase SQL Editor
-- =============================================

-- 1. Enable INSERT for authenticated users
-- This allows the "Add Product" modal to work.
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.products;
CREATE POLICY "Allow insert for authenticated users" 
ON public.products 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- 2. Enable UPDATE for authenticated users
-- This allows for image uploads and future product updates.
DROP POLICY IF EXISTS "Allow update for authenticated users" ON public.products;
CREATE POLICY "Allow update for authenticated users" 
ON public.products 
FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- 3. Enable DELETE for authenticated users
DROP POLICY IF EXISTS "Allow delete for authenticated users" ON public.products;
CREATE POLICY "Allow delete for authenticated users" 
ON public.products 
FOR DELETE 
TO authenticated 
USING (true);

-- 4. Double check SELECT policy
DROP POLICY IF EXISTS "Authenticated users can read products" ON public.products;
CREATE POLICY "Authenticated users can read products"
ON public.products 
FOR SELECT 
TO authenticated 
USING (true);
