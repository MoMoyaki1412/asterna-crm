-- Add bill_type column to orders table
-- Values: 'normal' (บิลปกติ) | 'cf' (บิลระบบ CF)

ALTER TABLE orders ADD COLUMN IF NOT EXISTS bill_type TEXT DEFAULT 'normal';

-- Update existing orders to have bill_type = 'normal'
UPDATE orders SET bill_type = 'normal' WHERE bill_type IS NULL;
