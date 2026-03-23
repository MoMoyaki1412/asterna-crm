-- ====================================================
-- Asterna CRM: Add structured address & payment fields
-- Run in Supabase SQL Editor
-- ====================================================

-- 1. Add structured address fields to customers table
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS address_subdistrict TEXT,
ADD COLUMN IF NOT EXISTS address_district TEXT,
ADD COLUMN IF NOT EXISTS address_province TEXT,
ADD COLUMN IF NOT EXISTS address_zipcode TEXT;

-- 2. Add structured address and payment fields to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS address_subdistrict TEXT,
ADD COLUMN IF NOT EXISTS address_district TEXT,
ADD COLUMN IF NOT EXISTS address_province TEXT,
ADD COLUMN IF NOT EXISTS address_zipcode TEXT,
ADD COLUMN IF NOT EXISTS payment_method TEXT,
ADD COLUMN IF NOT EXISTS target_bank_id BIGINT REFERENCES bank_accounts(id) ON DELETE SET NULL;
