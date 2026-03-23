-- Asterna CRM 2.0 - Database Migration Script
-- Please run this SQL script in your Supabase SQL Editor.

-- ==========================================
-- 1. Dealer Flag in Customer Tiers
-- ==========================================
ALTER TABLE public.customer_tiers 
ADD COLUMN IF NOT EXISTS is_dealer BOOLEAN DEFAULT false;

-- ==========================================
-- 2. Loyalty Points in Customers
-- ==========================================
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS reward_points INTEGER DEFAULT 0;

-- ==========================================
-- 3. Activity Logs Table for Audit Trail
-- ==========================================
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL,
    action_type TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS (Row Level Security)
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Create Policies so that the frontend can read/write logs
CREATE POLICY "Enable read access for all users" 
ON public.activity_logs FOR SELECT USING (true);

CREATE POLICY "Enable insert for all users" 
ON public.activity_logs FOR INSERT WITH CHECK (true);
