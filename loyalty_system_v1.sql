-- ==============================================================================
-- MIGRATION: LOYALTY & REWARDS MANAGEMENT SYSTEM (PHASE 11)
-- ==============================================================================

-- 1. Create loyalty_settings table (Singleton pattern)
CREATE TABLE IF NOT EXISTS public.loyalty_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    earn_rate_thb NUMERIC NOT NULL DEFAULT 100, -- Amount of THB per X points
    earn_points INTEGER NOT NULL DEFAULT 1,      -- Points earned per earn_rate_thb
    redeem_rate_thb NUMERIC NOT NULL DEFAULT 1,  -- THB discount per 1 point
    min_redeem_points INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default settings if not exists
INSERT INTO public.loyalty_settings (id, earn_rate_thb, earn_points, redeem_rate_thb)
VALUES (1, 100, 1, 1)
ON CONFLICT (id) DO NOTHING;

-- 2. Create loyalty_transactions table for auditing
CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    order_id BIGINT REFERENCES public.orders(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('earn', 'spend', 'adjust_add', 'adjust_sub')),
    points INTEGER NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- 3. Enable RLS on new tables
ALTER TABLE public.loyalty_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

-- 4. Create Policies
-- Settings: Only admins can view/update
DROP POLICY IF EXISTS "Admins can view loyalty settings" ON public.loyalty_settings;
CREATE POLICY "Admins can view loyalty settings" ON public.loyalty_settings
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Owners can update loyalty settings" ON public.loyalty_settings;
CREATE POLICY "Owners can update loyalty settings" ON public.loyalty_settings
    FOR UPDATE USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role_id IN (SELECT id FROM public.roles WHERE name IN ('Owner', 'Manager'))));

-- Transactions: Admins can view all, Customers can view theirs (if we had customer auth)
-- For now, focused on Admin management
DROP POLICY IF EXISTS "Admins can view all loyalty transactions" ON public.loyalty_transactions;
CREATE POLICY "Admins can view all loyalty transactions" ON public.loyalty_transactions
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can insert loyalty transactions" ON public.loyalty_transactions;
CREATE POLICY "Admins can insert loyalty transactions" ON public.loyalty_transactions
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()));

-- 5. Add reward_points_spent to customers if somehow missing (safety check)
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS reward_points_spent INTEGER DEFAULT 0;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS reward_points_earned INTEGER DEFAULT 0;

-- 6. Grant Permissions (for the new tables if using custom role logic)
GRANT ALL ON public.loyalty_settings TO postgres, service_role;
GRANT ALL ON public.loyalty_transactions TO postgres, service_role;
GRANT SELECT ON public.loyalty_settings TO authenticated;
GRANT SELECT, INSERT ON public.loyalty_transactions TO authenticated;
