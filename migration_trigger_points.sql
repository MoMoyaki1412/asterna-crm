-- 1. Create a function to sync customer reward points
CREATE OR REPLACE FUNCTION public.sync_customer_reward_points()
RETURNS TRIGGER AS $$
DECLARE
    target_customer_id INTEGER;
BEGIN
    -- Determine which customer ID to sync
    IF (TG_OP = 'DELETE') THEN
        target_customer_id := OLD.customer_id;
    ELSE
        target_customer_id := NEW.customer_id;
    END IF;

    -- Update the points by summing up all completed orders for that customer
    IF target_customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET reward_points = (
            SELECT COALESCE(SUM(FLOOR(total / 100)), 0)
            FROM public.orders
            WHERE customer_id = target_customer_id
              AND status = 'completed'
        )
        WHERE id = target_customer_id;
    END IF;

    -- If customer_id was changed in an UPDATE, sync the old customer too
    IF (TG_OP = 'UPDATE' AND OLD.customer_id IS NOT NULL AND OLD.customer_id <> NEW.customer_id) THEN
        UPDATE public.customers
        SET reward_points = (
            SELECT COALESCE(SUM(FLOOR(total / 100)), 0)
            FROM public.orders
            WHERE customer_id = OLD.customer_id
              AND status = 'completed'
        )
        WHERE id = OLD.customer_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 2. Create the trigger on the orders table
DROP TRIGGER IF EXISTS trg_sync_reward_points ON public.orders;
CREATE TRIGGER trg_sync_reward_points
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_customer_reward_points();

-- 3. Run a one-time sync for ALL customers now to fix existing mess
UPDATE public.customers c
SET reward_points = (
    SELECT COALESCE(SUM(FLOOR(total / 100)), 0)
    FROM public.orders o
    WHERE o.customer_id = c.id
      AND o.status = 'completed'
);
