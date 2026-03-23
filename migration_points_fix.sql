-- Asterna CRM - Loyalty Point Fix
-- 1. Add reward_points_earned to orders to track points granted per order
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS reward_points_earned INTEGER DEFAULT 0;

-- 2. Update existing completed orders with calculated points based on 100 Baht = 1 Point
UPDATE public.orders 
SET reward_points_earned = FLOOR(total / 100) 
WHERE status = 'completed';

-- 3. Recalculate customer points for everyone to fix discrepancies (like the 57 vs 45 issue)
UPDATE public.customers c
SET reward_points = COALESCE((
    SELECT SUM(reward_points_earned) 
    FROM public.orders o 
    WHERE o.customer_id = c.id
), 0);
