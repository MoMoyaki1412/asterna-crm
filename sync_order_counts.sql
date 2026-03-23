-- 1. Create a function to update the customer's total_orders count
CREATE OR REPLACE FUNCTION update_customer_total_orders()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE customers
        SET total_orders = (SELECT COUNT(*) FROM orders WHERE customer_id = NEW.customer_id)
        WHERE id = NEW.customer_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE customers
        SET total_orders = (SELECT COUNT(*) FROM orders WHERE customer_id = OLD.customer_id)
        WHERE id = OLD.customer_id;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        -- If an order is reassigned to a different customer (rare, but good to handle)
        IF OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
            -- Update old customer
            UPDATE customers
            SET total_orders = (SELECT COUNT(*) FROM orders WHERE customer_id = OLD.customer_id)
            WHERE id = OLD.customer_id;
            
            -- Update new customer
            UPDATE customers
            SET total_orders = (SELECT COUNT(*) FROM orders WHERE customer_id = NEW.customer_id)
            WHERE id = NEW.customer_id;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 2. Create the trigger on the orders table
-- Drop it first in case it already exists so we don't get errors
DROP TRIGGER IF EXISTS trg_update_customer_total_orders ON orders;

CREATE TRIGGER trg_update_customer_total_orders
AFTER INSERT OR UPDATE OR DELETE ON orders
FOR EACH ROW
EXECUTE FUNCTION update_customer_total_orders();

-- 3. One-time data correction: Update all current customers to have the strictly correct count
UPDATE customers c
SET total_orders = COALESCE((SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id), 0);
