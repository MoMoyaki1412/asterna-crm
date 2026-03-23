-- ====================================================
-- Admin Performance Tracking (Sync)
-- Add admin_id to orders and messages
-- ====================================================

-- 1. Add admin_id to orders
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES admin_profiles(id) ON DELETE SET NULL;

-- 2. Add admin_id to messages
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES admin_profiles(id) ON DELETE SET NULL;

-- 3. (Optional) Backfill: If you want to assign existing orders to the owner
-- UPDATE orders SET admin_id = (SELECT id FROM admin_profiles WHERE role = 'owner' LIMIT 1) WHERE admin_id IS NULL;
