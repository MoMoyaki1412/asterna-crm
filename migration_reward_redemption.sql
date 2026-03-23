-- ==============================================================================
-- MIGRATION: SUPPORT REWARD POINTS REDEMPTION
-- ==============================================================================

-- 1. Add reward_points_spent column to customers if it doesn't exist
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS reward_points_spent INTEGER DEFAULT 0;

-- 2. Update the sync trigger function to include reward_points_spent in calculation
CREATE OR REPLACE FUNCTION public.sync_customer_reward_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  target_id INTEGER;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    target_id := OLD.customer_id;
  ELSE
    target_id := NEW.customer_id;
  END IF;

  IF target_id IS NOT NULL THEN
    UPDATE public.customers AS c
    SET reward_points = (
      SELECT COALESCE(SUM(FLOOR(total / 100)), 0)
      FROM public.orders
      WHERE customer_id = target_id
        AND status = 'completed'
    ) - COALESCE(c.reward_points_spent, 0)
    WHERE id = target_id;
  END IF;

  RETURN NULL; -- AFTER trigger
END;
$function$
;

-- 3. Recalibrate all existing customers based on the new logic
UPDATE public.customers AS c
SET reward_points = (
  SELECT COALESCE(SUM(FLOOR(total / 100)), 0)
  FROM public.orders
  WHERE customer_id = c.id
    AND status = 'completed'
) - COALESCE(c.reward_points_spent, 0);
